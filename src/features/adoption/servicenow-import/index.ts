import {identityMatcher} from '../../history/identity';
import { Buffer } from 'node:buffer';
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../../../platform/types';
import { ApiError, requiredString } from '../../../platform/http';
import { importBody } from '../body';
import { canonicalJson, planD1Import, createD1ImportJob, readD1ImportJob, readD1ImportOriginals, resumeD1Import, undoD1Import, rollbackD1Import, sha256 } from '../../../modules/import-kit/src/d1/index';
import { parseExport, requireInput, type ImportInput } from './format';
import { mapping } from './mapping';
import { requestContext, jobContext } from './context';
export { servicenowErasurePort } from './privacy';

async function review(c:Context<AppEnv>, body:Record<string,unknown>) {
  const input = body.input as ImportInput, parsed = parseExport(input,c.get('principal').workspaceId);
  const namespace = parsed.source.records[0].namespace, context = await requestContext(c,namespace);
  if(parsed.departmentId)requireInput(await c.env.DB.prepare('SELECT 1 FROM work_departments WHERE workspace_id=? AND id=? AND active=1').bind(context.destination,parsed.departmentId).first(),'Destination department must be currently active');
  const priorDepartmentPredicate=context.authorization.predicate;
  context.authorization.predicate=(action,destination)=>{const prior=priorDepartmentPredicate(action,destination);return {sql:`(${prior.sql}) AND (? IS NULL OR EXISTS(SELECT 1 FROM work_departments WHERE workspace_id=? AND id=? AND active=1))`,params:[...prior.params??[],parsed.departmentId,destination,parsed.departmentId]};};
  const values=new Set<string>();
  const visit=(value:unknown):void=>{if(typeof value==='string'){values.add(value);values.add(value.trim().toLowerCase());}else if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){if(['requester_id','user_id'].includes(key))values.add(`user:${child}`);visit(child);}};
  parsed.source.records.forEach(record=>visit(record.payload));
  const privacy={history:(await c.env.DB.prepare('SELECT digest FROM history_identity_tombstones WHERE workspace_id=? ORDER BY digest').bind(context.destination).all<{digest:string}>()).results.map(r=>r.digest),legacy:(await c.env.DB.prepare('SELECT identity_hash FROM adoption_tombstones WHERE workspace_id=? ORDER BY identity_hash').bind(context.destination).all<{identity_hash:string}>()).results.map(r=>r.identity_hash)};
  const matches=await identityMatcher(c.env,context.destination);
  for(const value of values)requireInput(!await matches(value),'Source includes an erased identity; reconcile and supply a sanitized export');
  const hashes=JSON.stringify([...values].map(value=>sha256(value))), priorPredicate=context.authorization.predicate;
  context.authorization.predicate=(action,destination)=>{const prior=priorPredicate(action,destination);return {sql:`(${prior.sql}) AND NOT EXISTS(SELECT 1 FROM adoption_tombstones WHERE workspace_id=? AND identity_hash IN (SELECT value FROM json_each(?)))`,params:[...prior.params??[],destination,hashes]};};

  const plan = await planD1Import(parsed.source,mapping(parsed,context.destination,namespace,privacy),context);
  for(const entry of plan.entries)for(const effect of entry.effects) {
    const value=effect.value as {audits?:{id:string;detail_json:string;created_at:string;actor_id:string;target:string}[]};
    for(const audit of value.audits??[]) {
      const prior=await c.env.DB.prepare('SELECT detail_json,created_at,actor_id,target FROM audit_events WHERE workspace_id=? AND id=?').bind(context.destination,audit.id).first<{detail_json:string;created_at:string;actor_id:string;target:string}>();
      if(prior&&(immutableAudit(prior.detail_json)!==immutableAudit(audit.detail_json)||prior.created_at!==audit.created_at||prior.actor_id!==audit.actor_id||prior.target!==audit.target))throw new ApiError(409,'source_audit_conflict','An original source audit identity already has different or redacted values; source history cannot be rewritten');
    }
  }
  return {plan,context};
}
function immutableAudit(value:string){const payload=JSON.parse(value);delete payload.pendingErasure;return canonicalJson(payload);}
const report = (plan:Awaited<ReturnType<typeof planD1Import>>) => ({fingerprint:plan.fingerprint,counts:plan.counts,diagnostics:plan.diagnostics,artifacts:plan.source.artifacts.map(({original,...metadata})=>({...metadata,status:original?.status})),records:plan.entries.map(entry=>({sourceId:entry.source.sourceId,targets:entry.effects.map(e=>({kind:e.targetKind,id:e.targetId})),omissions:entry.unmapped,rejection:entry.rejection}))});
/** Mount behind Linen authenticated/CSRF middleware, alongside native adoption. */
export function registerServiceNowImportRoutes(parent:Hono<AppEnv>) {
  const app=new Hono<AppEnv>();
  const base='/adoption/servicenow-imports';
  app.use('*',async(c,next)=>{c.header('Cache-Control','private, no-store');await next();});
  app.onError((error,c)=>{
    if(error instanceof ApiError)return c.json({error:{code:error.code,message:error.message}},error.status as 400);
    const message=error instanceof Error?error.message:'';
    const code=/^[A-Z][A-Z0-9_]+$/.test(message)?message:message.includes('IMPORT_ATOMIC_GUARD')?'IMPORT_ATOMIC_GUARD':'servicenow_import_failed';
    return c.json({error:{code,message:'Import refused; refresh the review or resolve the recorded conflict'}},code==='servicenow_import_failed'?422:409);
  });
  app.post(`${base}/dry-run`,async c=>{const {plan}=await review(c,await importBody(c.req.raw));return c.json(report(plan));});
  app.post(base,async c=>{
    const body=await importBody(c.req.raw),{plan,context}=await review(c,body);
    requireInput(body.acceptOmissions===true,'Review and explicitly accept the listed omissions');
    return c.json(await createD1ImportJob(plan,{...context,reviewedFingerprint:requiredString(body.reviewedFingerprint,'reviewedFingerprint'),operationKey:requiredString(body.operationKey,'operationKey',100)}),201);
  });
  app.get(`${base}/:id`,async c=>{
    const context=await jobContext(c,c.req.param('id')),job=await readD1ImportJob(c.req.param('id'),context);
    const journal=(await c.env.DB.prepare('SELECT action,position,end_position,fence FROM ik_batches WHERE job_id=? ORDER BY fence,position').bind(job.id).all()).results;
    const current=await readD1ImportJob(job.id,context);
    if(current.fence!==job.fence)throw new ApiError(409,'import_changed','The import moved on while you were reading it. Reload and try again');
    return c.json({...job,journal});
  });
  for(const command of ['apply','resume','undo','rollback'] as const) app.post(`${base}/:id/${command}`,async c=>{
    const context=await jobContext(c,c.req.param('id'));
    const operation=command==='undo'?undoD1Import:command==='rollback'?rollbackD1Import:resumeD1Import;
    return c.json(await operation(c.req.param('id'),context));
  });
  app.get(`${base}/:id/history`,async c=>{
    const context=await jobContext(c,c.req.param('id')); await readD1ImportJob(c.req.param('id'),context);
    const records=(await c.env.DB.prepare('SELECT record_json FROM ik_provenance WHERE job_id=? AND destination=? ORDER BY ordinal,effect_ordinal').bind(c.req.param('id'),context.destination).all<{record_json:string}>()).results.map(row=>JSON.parse(row.record_json));
    await readD1ImportJob(c.req.param('id'),context); return c.json({records});
  });
  app.get(`${base}/:id/artifacts`,async c=>{const originals=await readD1ImportOriginals(c.req.param('id'),await jobContext(c,c.req.param('id')));return c.json({artifacts:originals.map(({original,...item})=>({...item,status:original.status}))});});
  app.get(`${base}/:id/artifacts/:ordinal`,async c=>{
    const originals=await readD1ImportOriginals(c.req.param('id'),await jobContext(c,c.req.param('id'))),ordinal=Number(c.req.param('ordinal'));
    const artifact=Number.isSafeInteger(ordinal)&&ordinal>=0?originals[ordinal]:undefined;
    if(!artifact)throw new ApiError(404,'not_found','Artifact not found');
    if(artifact.original.status!=='retained')throw new ApiError(410,'artifact_unavailable','The original file was not supplied, or was removed when someone’s data was erased');
    return new Response(Buffer.from(artifact.original.base64,'base64'),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(artifact.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  });
  parent.route('/',app);
}

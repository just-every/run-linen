import type { Context, Hono } from 'hono';
import {sandboxSlas, editSandboxSla, slaDifferences, slaPromotion, slaFields, type Sla} from './sandbox-slas';
import type { AppEnv } from './types';
import { ApiError, auditStatement, id, jsonBody, now, requiredString } from './http';
import { normalizeCatalogForm, validateCatalogAnswers, type CatalogForm } from '../features/work/catalog-form-schema';
import { checkTaskPlan, type CatalogTask } from '../features/work/catalog-task-plan';

export type Item = { id: string; name: string; revision: number; sourceForm: string; sourceTasks: string; form: CatalogForm; tasks: CatalogTask[] };
export type Sandbox = { id: string; name: string; created_by: string; contributors_json: string; baseline_json: string; draft_json: string; revision: number; state: string; approved_by: string | null; runs_json: string; sla_baseline_json:string; sla_draft_json:string };
type C = Context<AppEnv>;
const currentOwnerSql = `EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')`;
export const ownerSql = `EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner' AND NOT EXISTS(SELECT 1 FROM adoption_imports i WHERE i.workspace_id=m.workspace_id AND i.state IN ('applying','erasure_pending','reconciling')))`;
async function owner(c: C) {
 const p=c.get('principal');
 if(!p.roles.includes('owner') || !await c.env.DB.prepare(`SELECT 1 WHERE ${currentOwnerSql}`).bind(p.workspaceId,p.userId).first())
  throw new ApiError(403,'forbidden','A current workspace owner is required');
 if(await c.env.DB.prepare("SELECT 1 FROM adoption_imports WHERE workspace_id=? AND state IN ('applying','erasure_pending','reconciling') LIMIT 1").bind(p.workspaceId).first())
  throw new ApiError(409,'sandbox_restore_in_progress','Finish restoring the workspace before creating or using a fresh sandbox');
 return p;
}
async function read(c:C, sandboxId:string) {
 const p=await owner(c);
 const row=await c.env.DB.prepare('SELECT * FROM configuration_sandboxes WHERE workspace_id=? AND id=?').bind(p.workspaceId,sandboxId).first<Sandbox>();
 if(!row)throw new ApiError(404,'not_found','Sandbox unavailable');
 return row;
}
async function catalogs(c:C):Promise<Item[]> {
 const p=c.get('principal');
 const rows=(await c.env.DB.prepare('SELECT id,name,revision,form_json,tasks_json FROM work_catalog WHERE workspace_id=? ORDER BY id').bind(p.workspaceId).all<{id:string;name:string;revision:number;form_json:string;tasks_json:string}>()).results;
 return rows.map(r=>({id:r.id,name:r.name,revision:r.revision,sourceForm:r.form_json,sourceTasks:r.tasks_json,form:normalizeCatalogForm(JSON.parse(r.form_json)),tasks:checkTaskPlan(JSON.parse(r.tasks_json))}));
}
function differences(row:Sandbox) {
 const baseline=JSON.parse(row.baseline_json) as Item[],draft=JSON.parse(row.draft_json) as Item[];
 return [...slaDifferences(JSON.parse(row.sla_baseline_json),JSON.parse(row.sla_draft_json)),...draft.flatMap(item=>{
  const before=baseline.find(x=>x.id===item.id)!;
  return (['name','form','tasks'] as const).filter(field=>JSON.stringify(before[field])!==JSON.stringify(item[field])).map(field=>({catalogId:item.id,field,before:before[field],after:item[field]}));
 })];
}
function view(row:Sandbox) {return {id:row.id,name:row.name,revision:row.revision,state:row.state,approvedBy:row.approved_by,items:JSON.parse(row.draft_json),slas:JSON.parse(row.sla_draft_json),differences:differences(row),limits:'Catalog metadata, forms, team task plans and existing SLA policy targets only. Form validation and isolated team task rehearsals are available. SLA scope, ordering, calendars and requester groups remain unchanged. Connector execution and other configuration families are not available.'};}
function configurationBody(body:Record<string,unknown>, allowed:string[]) {
 if(Object.keys(body).some(key=>!allowed.includes(key)))
  throw new ApiError(422,'sandbox_config_only','Only the named configuration fields are accepted; records and credentials cannot be included');
}
function revision(row:Sandbox,b:Record<string,unknown>,state:string) {
 if(b.revision!==row.revision||row.state!==state)throw new ApiError(409,'sandbox_changed','Sandbox state or revision changed; reload');
}
async function write(c:C,row:Sandbox,sql:string,args:(string|number|null)[],action:string,detail:unknown) {
 const p=c.get('principal');
 const result=await c.env.DB.batch([
  c.env.DB.prepare(`UPDATE configuration_sandboxes SET ${sql} WHERE workspace_id=? AND id=? AND revision=? AND state=? AND ${ownerSql}`).bind(...args,p.workspaceId,row.id,row.revision,row.state,p.workspaceId,p.userId),
  c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'),
  auditStatement(c,action,row.id,detail),c.env.DB.prepare('DELETE FROM platform_auth_guard'),
 ]).catch(e=>{if(String(e).includes('CHECK constraint'))throw new ApiError(409,'sandbox_changed','Sandbox or current authority changed; reload');throw e;});
 return result;
}
export function registerSandboxRoutes(app:Hono<AppEnv>) {
 app.get('/sandboxes',async c=>{
  const p=await owner(c);c.header('Cache-Control','private, no-store');
  return c.json({items:(await c.env.DB.prepare('SELECT id,name,revision,state FROM configuration_sandboxes WHERE workspace_id=? ORDER BY created_at,id').bind(p.workspaceId).all()).results});
 });
 app.post('/sandboxes',async c=>{
  const p=await owner(c),b=await jsonBody(c),name=requiredString(b.name,'name',120);
  configurationBody(b,['name']);
  const items=await catalogs(c),sandboxId=id(),snapshot=JSON.stringify(items),slas=JSON.stringify(await sandboxSlas(c));
  await c.env.DB.batch([
   c.env.DB.prepare(`INSERT INTO configuration_sandboxes(id,workspace_id,name,created_by,contributors_json,baseline_json,draft_json,sla_baseline_json,sla_draft_json,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${ownerSql}`).bind(sandboxId,p.workspaceId,name,p.userId,JSON.stringify([p.userId]),snapshot,snapshot,slas,slas,now(),p.workspaceId,p.userId),
   c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'),
   auditStatement(c,'sandbox.created',sandboxId,{configurationOnly:true}),c.env.DB.prepare('DELETE FROM platform_auth_guard'),
  ]);
  return c.json(view(await read(c,sandboxId)),201);
 });
 app.get('/sandboxes/:id',async c=>{c.header('Cache-Control','private, no-store');return c.json(view(await read(c,c.req.param('id'))));});
 app.put('/sandboxes/:id/catalog/:catalogId',async c=>{
  const row=await read(c,c.req.param('id')),b=await jsonBody(c);revision(row,b,'draft');
  configurationBody(b,['revision','name','form','tasks']);
  const items=JSON.parse(row.draft_json) as Item[],item=items.find(x=>x.id===c.req.param('catalogId'));
  if(!item)throw new ApiError(404,'not_found','Catalog item unavailable in this sandbox');
  item.name=requiredString(b.name,'name',200);item.form=normalizeCatalogForm(b.form);item.tasks=checkTaskPlan(b.tasks??[]);
  const groups=new Set((await c.env.DB.prepare('SELECT id FROM work_groups WHERE workspace_id=?').bind(c.get('principal').workspaceId).all<{id:string}>()).results.map(r=>r.id));
  if(item.tasks.some(t=>!groups.has(t.groupId)))throw new ApiError(422,'catalog_tasks_invalid','Task groups must exist in this workspace');
  const contributors=[...new Set([...JSON.parse(row.contributors_json),c.get('principal').userId])];
  await write(c,row,'draft_json=?,contributors_json=?,revision=revision+1',[JSON.stringify(items),JSON.stringify(contributors)],'sandbox.edited',{fromRevision:row.revision});
  return c.json(view(await read(c,row.id)));
 });
 app.put('/sandboxes/:id/slas/:slaId',async c=>{
  const row=await read(c,c.req.param('id')),b=await jsonBody(c);revision(row,b,'draft');
  configurationBody(b,['revision','name','first_response_minutes','next_response_minutes','resolution_minutes','pauseOn']);
  const slas=JSON.parse(row.sla_draft_json) as Sla[],item=slas.find(x=>x.id===c.req.param('slaId'));
  if(!item)throw new ApiError(404,'not_found','SLA policy unavailable in this sandbox');
  editSandboxSla(item,b);
  const contributors=[...new Set([...JSON.parse(row.contributors_json),c.get('principal').userId])];
  await write(c,row,'sla_draft_json=?,contributors_json=?,revision=revision+1',[JSON.stringify(slas),JSON.stringify(contributors)],'sandbox.edited',{family:'sla',fromRevision:row.revision});
  return c.json(view(await read(c,row.id)));
 });
 app.post('/sandboxes/:id/test-form',async c=>{
  const row=await read(c,c.req.param('id')),b=await jsonBody(c);if(b.revision!==row.revision)throw new ApiError(409,'sandbox_changed','Reload the current sandbox');
  configurationBody(b,['revision','catalogId','answers']);
  const item=(JSON.parse(row.draft_json) as Item[]).find(x=>x.id===b.catalogId);
  if(!item)throw new ApiError(404,'not_found','Catalog item unavailable in this sandbox');
  const answers=validateCatalogAnswers(item.form,b.answers??{});
  return c.json({revision:row.revision,answers,taskPlan:checkTaskPlan(item.tasks),executed:false});
 });
 app.post('/sandboxes/:id/package',async c=>{
  const row=await read(c,c.req.param('id')),b=await jsonBody(c);revision(row,b,'draft');configurationBody(b,['revision']);
  if(!differences(row).length)throw new ApiError(422,'sandbox_no_changes','Edit configuration before requesting review');
  await write(c,row,"state='review',revision=revision+1",[],'sandbox.review_requested',{fromRevision:row.revision});
  return c.json(view(await read(c,row.id)));
 });
 app.post('/sandboxes/:id/approve',async c=>{
  const row=await read(c,c.req.param('id')),b=await jsonBody(c);revision(row,b,'review');configurationBody(b,['revision']);
  const p=c.get('principal');
  if((JSON.parse(row.contributors_json) as string[]).includes(p.userId))throw new ApiError(403,'sandbox_separate_approver','A separate owner who did not edit this sandbox must approve');
  await write(c,row,"state='approved',approved_by=?,revision=revision+1",[p.userId],'sandbox.approved',{fromRevision:row.revision});
  return c.json(view(await read(c,row.id)));
 });
 app.post('/sandboxes/:id/rollback-package',async c=>{
  const prior=await read(c,c.req.param('id')),b=await jsonBody(c);revision(prior,b,'promoted');configurationBody(b,['revision']);
  const p=c.get('principal'),baseline=await catalogs(c),draft=structuredClone(baseline),before=JSON.parse(prior.baseline_json) as Item[],after=JSON.parse(prior.draft_json) as Item[];
  const changed=new Set(differences(prior).flatMap(d=>'catalogId' in d?[d.catalogId]:[]));
  const slaBaseline=await sandboxSlas(c),slaDraft=structuredClone(slaBaseline),slaBefore=JSON.parse(prior.sla_baseline_json) as Sla[],slaAfter=JSON.parse(prior.sla_draft_json) as Sla[];
  for(const original of slaBefore) {
   const applied=slaAfter.find(x=>x.id===original.id)!;
   if(!slaFields.some(f=>original[f]!==applied[f]))continue;
   const current=slaDraft.find(x=>x.id===original.id);
   if(!current||current.revision!==original.revision+1||JSON.stringify({...current,revision:applied.revision})!==JSON.stringify(applied))throw new ApiError(409,'production_changed','Later SLA configuration changes prevent this rollback');
   for(const field of slaFields)Object.assign(current,{[field]:original[field]});
  }
  for(const catalogId of changed) {
   const current=draft.find(x=>x.id===catalogId),applied=after.find(x=>x.id===catalogId)!,original=before.find(x=>x.id===catalogId)!;
   if(!current||current.revision!==original.revision+1||(['name','form','tasks'] as const).some(k=>JSON.stringify(current[k])!==JSON.stringify(applied[k])))throw new ApiError(409,'production_changed','Later configuration changes prevent this rollback');
   current.name=original.name;current.form=original.form;current.tasks=original.tasks;
  }
  const sandboxId=id();
  await c.env.DB.batch([
   c.env.DB.prepare(`INSERT INTO configuration_sandboxes(id,workspace_id,name,created_by,contributors_json,baseline_json,draft_json,sla_baseline_json,sla_draft_json,state,created_at) SELECT ?,?,?,?,?,?,?,?,?,'review',? WHERE ${ownerSql}`).bind(sandboxId,p.workspaceId,('Rollback '+prior.name).slice(0,120),p.userId,JSON.stringify([p.userId]),JSON.stringify(baseline),JSON.stringify(draft),JSON.stringify(slaBaseline),JSON.stringify(slaDraft),now(),p.workspaceId,p.userId),
   c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'),
   auditStatement(c,'sandbox.rollback_requested',sandboxId,{priorSandboxId:prior.id}),c.env.DB.prepare('DELETE FROM platform_auth_guard'),
  ]);
  return c.json(view(await read(c,sandboxId)),201);
 });
 app.post('/sandboxes/:id/promote',async c=>{
  const row=await read(c,c.req.param('id')),b=await jsonBody(c);revision(row,b,'approved');configurationBody(b,['revision']);
  const p=c.get('principal'),baseline=JSON.parse(row.baseline_json) as Item[],draft=JSON.parse(row.draft_json) as Item[],changed=new Set(differences(row).flatMap(d=>'catalogId' in d?[d.catalogId]:[]));
  if(JSON.stringify(await catalogs(c))!==row.baseline_json||JSON.stringify(await sandboxSlas(c))!==row.sla_baseline_json)throw new ApiError(409,'production_changed','Production configuration changed; create and review a fresh sandbox');
  const statements:D1PreparedStatement[]=[
   c.env.DB.prepare(`UPDATE configuration_sandboxes SET state='promoted',promoted_at=?,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=? AND state='approved' AND ${ownerSql} AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=configuration_sandboxes.approved_by AND m.active=1 AND r.value='owner')`).bind(now(),p.workspaceId,row.id,row.revision,p.workspaceId,p.userId,p.workspaceId),
   c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'),
   c.env.DB.prepare(`INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN COUNT(*)=? THEN 1 ELSE 0 END FROM work_catalog WHERE workspace_id=?`).bind(baseline.length,p.workspaceId),
  ];
  for(const item of baseline) {
   const next=draft.find(x=>x.id===item.id)!;
   statements.push(c.env.DB.prepare(`INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM work_catalog WHERE workspace_id=? AND id=? AND revision=? AND name=? AND form_json=? AND tasks_json=?) THEN 1 ELSE 0 END`).bind(p.workspaceId,item.id,item.revision,item.name,item.sourceForm,item.sourceTasks));
   for(const task of next.tasks)statements.push(c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM work_groups WHERE workspace_id=? AND id=?) THEN 1 ELSE 0 END').bind(p.workspaceId,task.groupId));
   if(changed.has(item.id))statements.push(c.env.DB.prepare('UPDATE work_catalog SET name=?,form_json=?,tasks_json=?,revision=revision+1 WHERE workspace_id=? AND id=?').bind(next.name,JSON.stringify(next.form),JSON.stringify(next.tasks),p.workspaceId,item.id));
  }
  statements.push(...slaPromotion(c,JSON.parse(row.sla_baseline_json),JSON.parse(row.sla_draft_json)));
  statements.push(auditStatement(c,'sandbox.promoted',row.id,{version:row.revision+1,approvedBy:row.approved_by,catalogIds:[...changed],slaIds:slaDifferences(JSON.parse(row.sla_baseline_json),JSON.parse(row.sla_draft_json)).map(d=>d.slaId)}),c.env.DB.prepare('DELETE FROM platform_auth_guard'));
  try{await c.env.DB.batch(statements);}catch(e){if(String(e).includes('CHECK constraint'))throw new ApiError(409,'production_changed','Production or current approval changed; nothing was promoted');throw e;}
  return c.json(view(await read(c,row.id)));
 });
}

export { read as readSandbox };

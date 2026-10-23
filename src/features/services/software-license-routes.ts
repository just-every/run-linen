import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { now, jsonBody } from '../../platform/http';
import { list } from './store';
import { check, count, softwarePrincipal, softwareRecord, type SoftwareContext } from './software-license-core';
import { newSoftwareLicense, editSoftwareLicense, presentSoftwareLicense, syncSoftwareLicense } from './software-licenses';
import { registerSoftwareConnection } from './software-license-connections';
import { executeSoftwareEffect, grantSoftwareEffect, reconcileSoftwareEffect, revokeSoftwareGrant } from './software-license-effects';
import { processSoftwareRenewals, queueSoftwareRenewals, softwareLicenseNotices } from './software-license-work';
import { softwareCommit } from './software-license-store';
export { processSoftwareRenewals };

async function softwareOptions(ctx:SoftwareContext) {
  await softwarePrincipal(ctx);
  const people=(await ctx.env.DB.prepare('SELECT u.id,u.name,m.roles_json FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND m.active=1').bind(ctx.principal.workspaceId).all<any>()).results
    .map(p=>({id:p.id,name:p.name,roles:JSON.parse(p.roles_json)})).filter(p=>p.roles.some((r:string)=>['owner','operator'].includes(r)));
  const connections=(await ctx.env.DB.prepare("SELECT id,name,provider,revision,status,config_json FROM connections WHERE workspace_id=? AND provider IN ('zoom','jamf','microsoft-graph')").bind(ctx.principal.workspaceId).all<any>()).results
    .map(({config_json,...c})=>{const cfg=JSON.parse(config_json);return {...c,config:{...(cfg.origin?{origin:cfg.origin}:{}),...(cfg.accountId?{accountId:cfg.accountId}:{}),...(cfg.tenantId?{tenantId:cfg.tenantId}:{})}};});
  const services=(await list(ctx.env.DB,ctx.principal,'service')).map(s=>({id:s.id,name:s.data.name}));
  return {people,connections,services,currentUserId:ctx.principal.userId};
}
export function registerSoftwareLicenseRoutes(app:Hono<AppEnv>) {
  const ctx=(c:any):SoftwareContext=>({env:c.env,principal:c.get('principal')});
  app.get('/software-license-options',async c=>c.json(await softwareOptions(ctx(c))));
  app.get('/software-license-connections',async c=>c.json({items:(await softwareOptions(ctx(c))).connections}));
  app.post('/software-license-connections',async c=>c.json(await registerSoftwareConnection(ctx(c),await jsonBody(c)),201));
  app.get('/software-license-notices',async c=>c.json(await softwareLicenseNotices(ctx(c))));
  app.get('/software-licenses',async c=>{
    const context=ctx(c);await softwarePrincipal(context);
    const records=(await list(c.env.DB,context.principal,'asset')).filter(r=>r.data.softwareLicense&&!r.data.adoption?.historical);
    return c.json({items:await Promise.all(records.map(r=>presentSoftwareLicense(context,r.id)))});
  });
  app.post('/software-licenses',async c=>c.json(await newSoftwareLicense(ctx(c),await jsonBody(c)),201));
  app.get('/software-licenses/:id',async c=>c.json(await presentSoftwareLicense(ctx(c),c.req.param('id'))));
  app.patch('/software-licenses/:id',async c=>c.json(await editSoftwareLicense(ctx(c),c.req.param('id'),await jsonBody(c))));
  for(const [path,fn] of [['sync',syncSoftwareLicense],['grants',grantSoftwareEffect],['revoke-grant',revokeSoftwareGrant],['renewal-reminders',async(context:SoftwareContext,key:string,b:any)=>{
    const result=await queueSoftwareRenewals(context,key,b.revision);return {...await presentSoftwareLicense(context,key),queued:result.queued};
  }]] as const)app.post(`/software-licenses/:id/${path}`,async c=>c.json(await fn(ctx(c),c.req.param('id'),await jsonBody(c))));
  app.post('/software-licenses/:id/reclaim',async c=>c.json(await executeSoftwareEffect(ctx(c),c.req.param('id'),await jsonBody(c),'reclaim')));
  app.post('/software-licenses/:id/removals',async c=>c.json(await executeSoftwareEffect(ctx(c),c.req.param('id'),await jsonBody(c),'remove-app')));
  app.post('/software-licenses/:id/effects/:operationId/reconcile',async c=>c.json(await reconcileSoftwareEffect(ctx(c),c.req.param('id'),c.req.param('operationId'),await jsonBody(c))));
  app.post('/software-licenses/:id/concurrency-observations',async c=>{
    const context=ctx(c),b=await jsonBody(c),r=await softwareRecord(context,c.req.param('id'),b.revision,true);
    check(r.data.metric==='concurrent'&&r.data.observation,'software_concurrent_observation_required',422);
    check(typeof b.source==='string'&&b.source.trim()&&typeof b.evidence==='string'&&b.evidence.trim()&&typeof b.observedAt==='string'&&Date.parse(b.observedAt)<=Date.now()&&Date.parse(b.observedAt)+r.data.freshnessMs>Date.now(),'software_concurrent_evidence_required',422);
    await softwareCommit(context,r,{...r.data,observation:{...r.data.observation,concurrency:{peak:count(b.peak,'peak'),source:b.source,evidence:b.evidence,observedAt:new Date(b.observedAt).toISOString(),recordedBy:context.principal.userId,provenance:'owner-recorded',recordedAt:now()}},grant:null,grantVersion:r.data.grantVersion+1},'software-concurrency-observed');
    return c.json(await presentSoftwareLicense(context,r.id));
  });
}

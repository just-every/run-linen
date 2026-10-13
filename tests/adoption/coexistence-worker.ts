import { Hono } from 'hono';
import { encryptSecret } from '../../src/platform/crypto';
import { id, now } from '../../src/platform/http';
import { createWork } from '../../src/features/work/core';
import { proposePlan, dispatchPlan } from '../../src/features/execution/plans';
import { runOperation } from '../../src/features/execution/runner';
import { establishOwnership } from '../../src/features/adoption/coexistence';
import type { AppEnv } from '../../src/platform/types';

// All provider responses and mutations exist exclusively in this test worker.
export function registerCoexistenceFixture(api:Hono<AppEnv>) {
 api.post('/fixtures/execution-coexistence',async c=>{
  const ctx={env:c.env,principal:c.get('principal')}, w=ctx.principal.workspaceId, p=ctx.principal.userId;
  const outcomes:any[]=[];
  for(const mode of ['valid','stale','changed','revoked','dual','cutover','during-validation']) {
   const graph=id(), sourceConnection=id(), source=id(), grant=id(), issuer=id(), t=now();
   let revision=t, approved=true, oauth=0, writes=0, present=false, ownership:any, mutated=false;
   const original=globalThis.fetch;
   globalThis.fetch=async(input:any,init:any={})=>{
    const url=new URL(String(input));
    if(url.hostname==='fixture.freshservice.com') {
     if(mode==='during-validation' && oauth===2 && !mutated) {
      mutated=true;
      await c.env.DB.prepare("UPDATE adoption_ownership SET executor='incumbent',fence=fence+1 WHERE id=?").bind(ownership.id).run();
     }
     if(url.pathname.endsWith('/approval-groups')) return Response.json({approval_groups:[{id:7,approval_status:{id:approved?1:2,name:approved?'approved':'rejected'}}]});
     if(url.pathname==='/api/v2/tickets/42')return Response.json({ticket:{id:42,workspace_id:1,updated_at:revision}});
     throw Error('Unexpected source fixture request '+url.pathname);
    }
    if(url.hostname==='login.microsoftonline.com') {
     oauth++;
     // OAuth for the write is the second token call, after pre-admission passed.
     if(oauth===2) {
      if(mode==='stale')await c.env.DB.prepare('UPDATE adoption_ownership SET fence=fence+1 WHERE id=?').bind(ownership.id).run();
      if(mode==='changed')revision=new Date(Date.parse(t)+1000).toISOString();
      if(mode==='revoked')approved=false;
      if(mode==='dual')await c.env.DB.prepare("UPDATE adoption_ownership SET executor='incumbent',state='active',fence=fence+1 WHERE id=?").bind(ownership.id).run();
      if(mode==='cutover')await c.env.DB.prepare("UPDATE adoption_ownership SET source_id=NULL,fence=fence+1 WHERE id=?").bind(ownership.id).run();
     }
     return Response.json({access_token:'fixture-token'});
    }
    if(url.hostname==='graph.microsoft.com') {
     if(init.method==='POST'){writes++;present=true;return new Response(null,{status:204});}
     return present?Response.json({id:p}):new Response(null,{status:404});
    }
    throw Error('No network permitted by coexistence fixture: '+url.hostname);
   };
   try {
    await c.env.DB.batch([
     c.env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(issuer,issuer+'@test.invalid','Independent fixture issuer','!fixture',t),
     c.env.DB.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind(w,issuer,'["owner"]'),
     c.env.DB.prepare("INSERT INTO connections VALUES(?,?,'microsoft-graph','Fixture',?,?, 'active',1,?,?)").bind(graph,w,JSON.stringify({tenantId:'fixture-tenant'}),await encryptSecret(c.env.ENCRYPTION_KEY,JSON.stringify({clientId:'fixture',clientSecret:'fixture'})),t,t),
     c.env.DB.prepare("INSERT INTO connections VALUES(?,?,'freshservice','Fixture',?,?,'active',1,?,?)").bind(sourceConnection,w,JSON.stringify({domain:'fixture.freshservice.com'}),await encryptSecret(c.env.ENCRYPTION_KEY,'fixture-key'),t,t),
     c.env.DB.prepare("INSERT INTO adoption_sources(id,workspace_id,connection_id,provider,source_workspace,state,checkpoint) VALUES(?,?,?,'freshservice',1,'current',?)").bind(source,w,sourceConnection,t),
     c.env.DB.prepare('INSERT INTO execution_grants(id,workspace_id,version,issuer_id,principal_id,action,action_version,target,beneficiary_id,connection_id,valid_from,valid_until,max_uses,conditions_json,created_at,connection_revision) VALUES(?,?,1,?,?,?,1,?,?,?,?,?,10,?,?,1)').bind(grant,w,issuer,p,'group.add','group',p,graph,t,'2099-01-01T00:00:00.000Z','{}',t)
    ]);
    const work=await createWork(ctx,{title:'Bound '+mode,body:'Execution fixture',deduplicationKey:source});
    ownership=await establishOwnership(ctx,{resource:`${graph}:group:${p}`,action:'group.add',sourceId:source,sourceTicketId:42,approvalId:7,incumbentDisabledEvidence:'Fixture incumbent automation disabled'});
    const step={action:'group.add' as const,actionVersion:1 as const,connectionId:graph,target:'group',beneficiaryId:p,grantId:grant,grantVersion:1};
    const plan=await proposePlan(ctx,{workId:work.id,revision:work.revision,idempotencyKey:source,steps:[step]});
    let forged=false;try{await proposePlan(ctx,{workId:work.id,revision:work.revision,idempotencyKey:source+'forged',steps:[{...step,sourceFence:ownership.fence+1}]})}catch{forged=true}
    const operations:any[]=await dispatchPlan(ctx,{planId:plan.id,expectedRevision:plan.revision});
    const result:any=await runOperation(ctx,operations[0].id);
    outcomes.push({mode,writes,oauth,forged,state:result.state,error:result.last_error,step:JSON.parse(operations[0].step_json),source,sourceRevision:ownership.sourceRevision,sourceFence:ownership.fence});
   }finally{globalThis.fetch=original;await c.env.DB.prepare('DELETE FROM memberships WHERE workspace_id=? AND user_id=?').bind(w,issuer).run()}
  }
  return c.json(outcomes);
 });
}

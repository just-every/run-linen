import {erasePersonData} from '../../src/features/adoption/retention';
import {createWork} from '../../src/features/work/core';
import {storeAttachment} from '../../src/features/work/attachments';
import type {Hono} from 'hono';
import type {AppEnv} from '../../src/platform/types';
import {id,now} from '../../src/platform/http';
import {decryptSecret} from '../../src/platform/crypto';
export function registerPrivacyFixture(api:Hono<AppEnv>){
 api.post('/fixtures/ghost-work',async c=>{
  const ctx={env:c.env,principal:c.get('principal')},ghost=id();
  const work=await createWork(ctx,{title:'Historical ghost private name',body:'Historical ghost private content',deduplicationKey:ghost});
  const attachment=await storeAttachment(ctx,work.id,{name:'ghost.txt',contentType:'text/plain',visibility:'private',bytes:new TextEncoder().encode('Ghost private bytes').buffer});
  await c.env.DB.prepare('UPDATE work_records SET requester_id=?,beneficiary_id=? WHERE workspace_id=? AND id=?').bind(ghost,ghost,ctx.principal.workspaceId,work.id).run();
  const result=await erasePersonData(ctx,ghost);
  const row=await c.env.DB.prepare('SELECT title FROM work_records WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,work.id).first<any>();
  return c.json({result,title:row.title,bytesRemain:!!await c.env.ATTACHMENTS.head(`${ctx.principal.workspaceId}/${work.id}/${attachment.id}`)});
 });
 api.post('/fixtures/unknown-erasure',async c=>{
  const {userId,email}=await c.req.json<{userId:string;email:string}>(),p=c.get('principal'),plan=id(),op=id(),grant=id(),t=now();
  await c.env.DB.batch([
   c.env.DB.prepare("INSERT INTO execution_plans(id,workspace_id,work_id,work_revision,actor_id,steps_json,idempotency_key,created_at) VALUES(?,?,?,1,?,'[]',?,?)").bind(plan,p.workspaceId,id(),p.userId,plan,t),
   c.env.DB.prepare("INSERT INTO execution_operations(id,workspace_id,plan_id,step_json,state,resource,actor_id,created_at) VALUES(?,?,?,?,'unknown',?,?,?)").bind(op,p.workspaceId,plan,JSON.stringify({beneficiaryId:email,action:'group.add',grantId:grant}),email,p.userId,t),
   c.env.DB.prepare("INSERT INTO execution_grants(id,workspace_id,version,issuer_id,principal_id,action,action_version,target,beneficiary_id,connection_id,valid_from,valid_until,max_uses,conditions_json,created_at) VALUES(?,?,1,?,?,?,1,?,?,?,?,?,10,?,?)").bind(grant,p.workspaceId,p.userId,p.userId,'group.add','fixture-group',email,id(),t,'2099-01-01T00:00:00.000Z','{}',t)
  ]);return c.json({op,grant,userId});
 });
 api.post('/fixtures/profile-redact',async c=>{const {userId}=await c.req.json<{userId:string}>();await c.env.DB.prepare("UPDATE users SET email=?,name='[erased]' WHERE id=? AND EXISTS(SELECT 1 FROM memberships WHERE user_id=users.id AND workspace_id=?)").bind('redacted-'+userId+'@test.invalid',userId,c.get('principal').workspaceId).run();return c.json({redacted:true})});
 api.post('/fixtures/reconcile-absent',async c=>{const {operationId}=await c.req.json<{operationId:string}>();await c.env.DB.prepare("UPDATE execution_operations SET state='failed' WHERE workspace_id=? AND id=? AND state='unknown'").bind(c.get('principal').workspaceId,operationId).run();return c.json({state:'failed',evidence:'TEST ONLY provider absence reconciliation'})});
 api.get('/fixtures/erasure-state/:run',async c=>{const w=c.get('principal').workspaceId,run=c.req.param('run');const jobs=(await c.env.DB.prepare('SELECT j.* FROM adoption_erasure_jobs j JOIN adoption_import_erasures i ON i.workspace_id=j.workspace_id AND i.job_id=j.id WHERE i.workspace_id=? AND i.import_id=?').bind(w,run).all<any>()).results;return c.json({artifacts:(await c.env.DB.prepare('SELECT COUNT(*) n FROM adoption_artifacts WHERE workspace_id=?').bind(w).first<any>()).n,jobs:await Promise.all(jobs.map(async j=>({id:j.id,state:j.state,done:JSON.parse(j.ports_json),aliases:j.aliases_ciphertext?JSON.parse(await decryptSecret(c.env.ENCRYPTION_KEY,j.aliases_ciphertext)):null}))),revocations:(await c.env.DB.prepare('SELECT COUNT(*) n FROM execution_grant_revocations WHERE workspace_id=?').bind(w).first<any>()).n,chunks:(await c.env.DB.prepare('SELECT COUNT(*) n FROM adoption_chunks WHERE workspace_id=? AND run_id=?').bind(w,run).first<any>()).n,objects:(await c.env.ATTACHMENTS.list({prefix:`${w}/adoption/imports/${run}/`})).objects.length})});
}

import type { Hono } from 'hono';
import type { AppEnv, Env, Principal } from '../../platform/types';
import { ApiError, id, jsonBody, now, requiredString } from '../../platform/http';
import { encryptSecret } from '../../platform/crypto';
import { currentPrincipal } from '../work/identity';
import { getWork } from '../work/core';
import { historyProtection } from '../work/work-history';
import { approvedTemplate } from './change-templates';
export interface DevelopmentBinding {
 id:string; workspace_id:string; owner_id:string; repository_id:number; repository_name:string;
 kind:'issue'|'deployment'; target_id:string; issue_number:number|null; template_version:number|null;
 secret_ciphertext:string|null; active:number; revision:number; last_observed_at:string|null; created_at:string;
}
export async function developmentOwner(env:Env,p:Principal) {
 p=await currentPrincipal(env.DB,p);
 if(!p.roles.includes('owner'))throw new ApiError(403,'owner','Current owner required');
 return p;
}
export async function normalDevelopmentTicket(env:Env,p:Principal,key:string) {
 const work=await getWork({env,principal:p},key);
 if(await env.DB.prepare('SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id IN (?,?)').bind(p.workspaceId,work.requester_id,work.beneficiary_id).first())throw new ApiError(409,'development_erased','Erased tickets cannot accept development events');
 if(historyProtection(work)!=='normal'||work.pending_person_id||['closed','cancelled'].includes(work.state))
  throw new ApiError(409,'development_ticket','An open normal-sensitivity ticket is required');
 return work;
}
export function positiveId(value:unknown,name:string):number {
 if(!Number.isSafeInteger(value)||Number(value)<=0)throw new ApiError(422,'development_id',`${name} must be a positive integer`);
 return Number(value);
}
export function registerDevelopmentRoutes(app:Hono<AppEnv>) {
 app.post('/development-bindings',async c=>{
  const p=await developmentOwner(c.env,c.get('principal')),b=await jsonBody(c);
  if(b.consent!==true)throw new ApiError(422,'development_consent','Explicit consent to this inbound binding is required');
  const repositoryId=positiveId(b.repositoryId,'repositoryId'),repositoryName=requiredString(b.repositoryName,'repositoryName');
  if(!/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(repositoryName))throw new ApiError(422,'repository_name','A GitHub repository name is required');
  const targetId=requiredString(b.targetId,'targetId'),kind=b.kind;
  let issueNumber=null,templateVersion=null;
  if(kind==='issue'){await normalDevelopmentTicket(c.env,p,targetId);issueNumber=positiveId(b.issueNumber,'issueNumber');}
  else if(kind==='deployment'){templateVersion=positiveId(b.templateVersion,'templateVersion');await approvedTemplate(c.env.DB,p,targetId,templateVersion);}
  else throw new ApiError(422,'development_kind','Choose issue or deployment');
  const secret=requiredString(b.signingSecret,'signingSecret');
  if(secret.length<16||secret.length>1024)throw new ApiError(422,'signing_secret','Use a signing secret of 16 to 1024 characters');
  const key=id(),at=now();
  await c.env.DB.batch([
   c.env.DB.prepare('INSERT INTO svc_development_bindings(id,workspace_id,owner_id,repository_id,repository_name,kind,target_id,issue_number,template_version,secret_ciphertext,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(key,p.workspaceId,p.userId,repositoryId,repositoryName,kind,targetId,issueNumber,templateVersion,await encryptSecret(c.env.ENCRYPTION_KEY,secret),at),
   c.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),p.workspaceId,p.userId,'development.binding_consented',key,JSON.stringify({kind,targetId,repositoryId}),at),
  ]);
  return c.json({id:key,kind,targetId,repositoryId,repositoryName,active:true},201);
 });
 app.get('/development-bindings',async c=>{
  const p=await developmentOwner(c.env,c.get('principal'));
  return c.json({items:(await c.env.DB.prepare('SELECT id,repository_id,repository_name,kind,target_id,issue_number,template_version,active,revision FROM svc_development_bindings WHERE workspace_id=?').bind(p.workspaceId).all()).results});
 });
 app.post('/development-bindings/:id'+'/revoke',async c=>{
  const p=await developmentOwner(c.env,c.get('principal')),key=c.req.param('id'),at=now();
  const results=await c.env.DB.batch([
   c.env.DB.prepare('UPDATE svc_development_bindings SET active=0,secret_ciphertext=NULL,revision=revision+1 WHERE workspace_id=? AND id=? AND active=1').bind(p.workspaceId,key),
   c.env.DB.prepare('INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(id(),p.workspaceId,p.userId,'development.binding_revoked',key,'{}',at),
  ]);
  if(!results[0].meta.changes)throw new ApiError(404,'not_found','Active binding not found');
  return c.json({revoked:true});
 });
}

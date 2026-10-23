import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, id, jsonBody, now, requiredString } from '../../platform/http';
import { hashToken } from '../../platform/crypto';
import { authenticateRest, restPredicate, type RestCredential } from './authority';
import { ticketHistory } from '../work/work-history';
export { registerRestCredentialRoutes } from './credentials';

function guard(db:D1Database,credentialId:string,guardId:string){
  return db.prepare(`INSERT INTO work_fulfilment_link_guards SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM rest_credentials c WHERE c.id=? AND ${restPredicate('c')} AND EXISTS(SELECT 1 FROM json_each(c.scopes_json) WHERE value='work.create')) THEN 1 ELSE 0 END`).bind(guardId,credentialId);
}
async function createTicket(c:Parameters<MiddlewareHandler<AppEnv>>[0],credential:RestCredential){
  const b=await jsonBody(c);
  if(Object.keys(b).some(k=>!['title','body','deduplicationKey','kind'].includes(k)))
    throw new ApiError(422,'rest_field','Only ordinary ticket fields are available');
  const title=requiredString(b.title,'title',1000),body=requiredString(b.body,'body',20000),key=requiredString(b.deduplicationKey,'deduplicationKey',200);
  const kind=b.kind??'request';
  if(typeof kind!=='string'||!['request','service_request','incident','question'].includes(kind))throw new ApiError(422,'invalid_kind','Ordinary ticket type required');
  const db=c.env.DB,workId=id(),at=now(),before=id(),after=id(),conflict=id();
  const fingerprint=await hashToken(JSON.stringify(['rest',title,body,kind]));
  const p={userId:credential.principal_id,workspaceId:credential.workspace_id,roles:['integration'] as const};
  const prior=await db.prepare('SELECT id,request_hash FROM work_records WHERE workspace_id=? AND requester_id=? AND dedup_key=?').bind(p.workspaceId,p.userId,key).first<{id:string;request_hash:string}>();
  if(prior&&prior.request_hash!==fingerprint)throw new ApiError(409,'idempotency_conflict','Material request changed');
  try{
    await db.batch([
      guard(db,credential.id,before),
      db.prepare(`INSERT OR IGNORE INTO work_records(id,workspace_id,requester_id,beneficiary_id,kind,title,sensitivity,created_at,updated_at,dedup_key,request_hash) VALUES(?,?,?,?,?,?,'normal',?,?,?,?)`).bind(workId,p.workspaceId,p.userId,p.userId,kind,title,at,at,key,fingerprint),
      ticketHistory({env:c.env,principal:{...p,roles:['integration']}},{id:workId,requester_id:p.userId,beneficiary_id:p.userId,sensitivity:'normal'},'work.created',null,{state:'open',type:kind,title,assignee:null,department:null},at,{conditional:true}),
      db.prepare(`INSERT INTO work_fulfilment_link_guards SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND requester_id=? AND dedup_key=? AND request_hash=?) THEN 1 ELSE 0 END`).bind(conflict,p.workspaceId,p.userId,key,fingerprint),
      db.prepare(`INSERT OR IGNORE INTO work_messages SELECT ?,workspace_id,id,requester_id,'public',?,'initial',? FROM work_records WHERE workspace_id=? AND requester_id=? AND dedup_key=?`).bind(id(),body,at,p.workspaceId,p.userId,key),
      db.prepare(`INSERT INTO audit_events SELECT ?,workspace_id,requester_id,'rest.call',?,json_object('credentialId',?,'workId',id,'outcome','success'),? FROM work_records WHERE workspace_id=? AND requester_id=? AND dedup_key=?`).bind(id(),credential.id,credential.id,at,p.workspaceId,p.userId,key),
      guard(db,credential.id,after),
      db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id IN(?,?,?)').bind(before,after,conflict),
    ]);
  }catch(error){if(String(error).includes('CHECK constraint failed'))throw new ApiError(409,'rest_commit_conflict','Authority or request changed');throw error;}
  const saved=await db.prepare('SELECT id,kind,title,state,revision FROM work_records WHERE workspace_id=? AND requester_id=? AND dedup_key=?').bind(p.workspaceId,p.userId,key).first();
  return c.json(saved,201);
}
/** A bearer is never a session fallback; only explicitly admitted REST doors run. */
export const restBearer:MiddlewareHandler<AppEnv>=async(c,next)=>{
  if(!c.req.header('Authorization'))return next();
  c.header('Cache-Control','no-store');
  const credential=await authenticateRest(c);
  try{
    if(c.req.path!=='/api/v1/work'||c.req.method!=='POST'||!JSON.parse(credential.scopes_json).includes('work.create'))
      throw new ApiError(403,'rest_scope','Credential does not authorize this route');
    return await createTicket(c,credential);
  }catch(error){
    await c.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),credential.workspace_id,credential.principal_id,'rest.call',credential.id,JSON.stringify({credentialId:credential.id,outcome:error instanceof ApiError?error.code:'internal_error'}),now()).run();
    throw error;
  }
};

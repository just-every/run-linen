import {workReadSql} from '../features/work/department-spaces';
import {workReadable,workPrivateReadable} from '../features/work/scope';
import type {WorkRecord} from '../features/work/core';
import type {Context} from 'hono';
import type {AppEnv,Env} from './types';
import {ApiError,auditStatement,id,now} from './http';

type C=Context<AppEnv>;
type Draft={id:string;revision:number;state:string};
/** All scalar source values are replaced before the first database write.
 * No source identifier, free text, attachment, credential or authority is retained. */
const mask=(row:Record<string,unknown>)=>Object.fromEntries(Object.keys(row).sort().map(key=>[key,'[masked]']));
export async function maskedRecords(c:C,sandboxId:string) {
 const w=c.get('principal').workspaceId;
 await expireMaskedRecords(c.env);
 c.header('Cache-Control','private, no-store');
 return {items:(await c.env.DB.prepare('SELECT id,kind,masked_json FROM configuration_masked_records WHERE workspace_id=? AND sandbox_id=? ORDER BY rowid').bind(w,sandboxId).all<{id:string;kind:string;masked_json:string}>()).results.map(row=>({id:row.id,kind:row.kind,fields:JSON.parse(row.masked_json)}))};
}
export async function copyMaskedRecords(c:C,draft:Draft,b:Record<string,unknown>,ownerSql:string) {
 if(draft.state!=='draft'||b.revision!==draft.revision)throw new ApiError(409,'sandbox_changed','Reload the current draft before copying');
 if(Object.keys(b).some(key=>!['revision','records','consent'].includes(key))||b.consent!==true||!Array.isArray(b.records)||b.records.length<1||b.records.length>25)
  throw new ApiError(422,'masked_copy_selection','Explicit consent and 1 to 25 reviewed ticket records are required');
 const selected=b.records as {id:string;revision:number;kind?:string;workId?:string}[];
 if(selected.some(row=>!row||Object.keys(row).some(key=>!['id','revision','kind','workId'].includes(key))||typeof row.id!=='string'||!Number.isInteger(row.revision)||!['ticket','message','attachment','person'].includes(row.kind??'ticket')||(['message','attachment'].includes(row.kind??'ticket')&&typeof row.workId!=='string'))||new Set(selected.map(row=>(row.kind??'ticket')+':'+row.id)).size!==selected.length)
  throw new ApiError(422,'masked_copy_selection','Choose distinct current ticket revisions');
 const p=c.get('principal'),w=p.workspaceId,t=now();
 const policy=await c.env.DB.prepare('SELECT closed_ticket_days,attachment_days,revision FROM work_retention WHERE workspace_id=?').bind(w).first<{closed_ticket_days:number|null;attachment_days:number|null;revision:number}>();
 const epoch=(await c.env.DB.prepare('SELECT generation FROM configuration_masked_epochs WHERE workspace_id=?').bind(w).first<{generation:number}>())?.generation??0;
 const statements:D1PreparedStatement[]=[];
 for(const selectedRow of selected){
  const kind=selectedRow.kind??'ticket';
  const table={ticket:'work_records',message:'work_messages',attachment:'work_attachments',person:'work_people'}[kind]!;
  const child=kind==='message'||kind==='attachment';
  const row=await c.env.DB.prepare(`SELECT * FROM ${table} WHERE workspace_id=? AND id=?${child?' AND work_id=?':' AND revision=?'}`).bind(w,selectedRow.id,child?selectedRow.workId!:selectedRow.revision).first<Record<string,unknown>>();
  if(!row)throw new ApiError(404,'not_found','Selected current record unavailable');
  const ticket=child?await c.env.DB.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=? AND revision=?').bind(w,selectedRow.workId!,selectedRow.revision).first<Record<string,unknown>>():kind==='ticket'?row:null;
  if(child&&!ticket)throw new ApiError(404,'not_found','Selected current ticket unavailable');
  // Match the product ticket scope without logging a source identity into a sandbox audit.
  if(ticket){
   const scope=await c.env.DB.prepare(`SELECT 1 FROM work_records w WHERE w.workspace_id=? AND w.id=? AND EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=w.workspace_id AND m.user_id=? AND m.active=1 AND ${workReadSql()})`).bind(w,ticket.id,p.userId).first();
   if(!scope||!workReadable(p,ticket as unknown as WorkRecord)||child&&row.visibility==='private'&&!workPrivateReadable(p,ticket as unknown as WorkRecord))throw new ApiError(404,'not_found','Selected record unavailable in current scope');
  }
  const personIds=ticket?[ticket.requester_id,ticket.beneficiary_id]:[row.id,row.member_id];
  for(const person of personIds)if(person&&await c.env.DB.prepare('SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id=?').bind(w,person).first())throw new ApiError(409,'masked_copy_erased','Selected record is erased');
  const deadlines:number[]=[];
  if(ticket?.state==='closed'&&ticket.closed_at){
   if(policy?.closed_ticket_days)deadlines.push(Date.parse(String(ticket.closed_at))+policy.closed_ticket_days*86400000);
   if(kind==='attachment'&&policy?.attachment_days)deadlines.push(Date.parse(String(ticket.closed_at))+policy.attachment_days*86400000);
  }
  const expires=deadlines.length?new Date(Math.min(...deadlines)).toISOString():null;
  if(expires&&expires<=t)throw new ApiError(409,'masked_copy_retention_due','Selected record is already due for retention');
  const masked=JSON.stringify(mask(row));
  statements.push(c.env.DB.prepare(`INSERT INTO configuration_masked_records(id,sandbox_id,workspace_id,masked_json,expires_at,kind) SELECT ?,s.id,s.workspace_id,?,?,? FROM configuration_sandboxes s WHERE s.workspace_id=? AND s.id=? AND s.revision=? AND s.state='draft' AND ${ownerSql} AND COALESCE((SELECT generation FROM configuration_masked_epochs WHERE workspace_id=s.workspace_id),0)=?`).bind(id(),masked,expires,kind,w,draft.id,draft.revision,w,p.userId,epoch),c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'));

 }
 statements.push(auditStatement(c,'sandbox.masked_copy',draft.id,{count:selected.length,masking:'all-source-values',revision:draft.revision}),c.env.DB.prepare('DELETE FROM platform_auth_guard'));
 try{await c.env.DB.batch(statements);}catch(error){if(String(error).includes('CHECK constraint'))throw new ApiError(409,'sandbox_changed','Source, scope, retention or sandbox changed; review again');throw error;}
 return maskedRecords(c,draft.id);
}

/** Use the source ticket's existing policy deadline; never introduce a copy default. */
export async function expireMaskedRecords(env:Env,at=Date.now()) {
 const t=new Date(at).toISOString();
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO audit_events(id,workspace_id,actor_id,action,target,detail_json,created_at) SELECT lower(hex(randomblob(16))),workspace_id,'retention-policy','sandbox.masked_expired',workspace_id,json_object('copies',count(*)),? FROM configuration_masked_records WHERE workspace_id IN (SELECT workspace_id FROM configuration_masked_records WHERE expires_at IS NOT NULL AND expires_at<=?) GROUP BY workspace_id`).bind(t,t),
  env.DB.prepare('DELETE FROM configuration_masked_records WHERE workspace_id IN (SELECT workspace_id FROM configuration_masked_records WHERE expires_at IS NOT NULL AND expires_at<=?)').bind(t),
 ]);
}

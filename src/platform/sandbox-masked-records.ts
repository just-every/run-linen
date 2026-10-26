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
 return {items:(await c.env.DB.prepare('SELECT id,masked_json FROM configuration_masked_records WHERE workspace_id=? AND sandbox_id=? ORDER BY rowid').bind(w,sandboxId).all<{id:string;masked_json:string}>()).results.map(row=>({id:row.id,kind:'ticket',fields:JSON.parse(row.masked_json)}))};
}
export async function copyMaskedRecords(c:C,draft:Draft,b:Record<string,unknown>,ownerSql:string) {
 if(draft.state!=='draft'||b.revision!==draft.revision)throw new ApiError(409,'sandbox_changed','Reload the current draft before copying');
 if(Object.keys(b).some(key=>!['revision','records','consent'].includes(key))||b.consent!==true||!Array.isArray(b.records)||b.records.length<1||b.records.length>25)
  throw new ApiError(422,'masked_copy_selection','Explicit consent and 1 to 25 reviewed ticket records are required');
 const selected=b.records as {id:string;revision:number}[];
 if(selected.some(row=>!row||Object.keys(row).some(key=>!['id','revision'].includes(key))||typeof row.id!=='string'||!Number.isInteger(row.revision))||new Set(selected.map(row=>row.id)).size!==selected.length)
  throw new ApiError(422,'masked_copy_selection','Choose distinct current ticket revisions');
 const p=c.get('principal'),w=p.workspaceId,t=now();
 const policy=await c.env.DB.prepare('SELECT closed_ticket_days,revision FROM work_retention WHERE workspace_id=?').bind(w).first<{closed_ticket_days:number|null;revision:number}>();
 const statements:D1PreparedStatement[]=[];
 for(const selectedRow of selected){
  // A current owner already has this ticket scope. Foreign and stale rows refuse the whole selection.
  const row=await c.env.DB.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=? AND revision=?').bind(w,selectedRow.id,selectedRow.revision).first<Record<string,unknown>>();
  if(!row)throw new ApiError(404,'not_found','Selected current ticket unavailable');
  const expires=policy?.closed_ticket_days&&row.state==='closed'&&row.closed_at?new Date(Date.parse(String(row.closed_at))+policy.closed_ticket_days*86400000).toISOString():null;
  if(expires&&expires<=t)throw new ApiError(409,'masked_copy_retention_due','Selected ticket is already due for retention');
  const masked=JSON.stringify(mask(row));
  statements.push(c.env.DB.prepare(`INSERT INTO configuration_masked_records(id,sandbox_id,workspace_id,masked_json,expires_at) SELECT ?,s.id,w.workspace_id,?,? FROM work_records w JOIN configuration_sandboxes s ON s.workspace_id=w.workspace_id WHERE w.workspace_id=? AND w.id=? AND w.revision=? AND s.id=? AND s.revision=? AND s.state='draft' AND ${ownerSql} AND COALESCE((SELECT revision FROM work_retention WHERE workspace_id=w.workspace_id),0)=? AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=w.workspace_id AND e.person_id IN (w.requester_id,w.beneficiary_id))`).bind(id(),masked,expires,w,selectedRow.id,selectedRow.revision,draft.id,draft.revision,w,p.userId,policy?.revision??0),c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'));
 }
 statements.push(auditStatement(c,'sandbox.masked_copy',draft.id,{count:selected.length,masking:'all-source-values',revision:draft.revision}),c.env.DB.prepare('DELETE FROM platform_auth_guard'));
 try{await c.env.DB.batch(statements);}catch(error){if(String(error).includes('CHECK constraint'))throw new ApiError(409,'sandbox_changed','Source, scope, retention or sandbox changed; review again');throw error;}
 return maskedRecords(c,draft.id);
}

/** Use the source ticket's existing policy deadline; never introduce a copy default. */
export async function expireMaskedRecords(env:Env,at=Date.now()) {
 const t=new Date(at).toISOString();
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO audit_events(id,workspace_id,actor_id,action,target,detail_json,created_at) SELECT lower(hex(randomblob(16))),workspace_id,'retention-policy','sandbox.masked_expired',workspace_id,json_object('copies',count(*)),? FROM configuration_masked_records WHERE expires_at IS NOT NULL AND expires_at<=? GROUP BY workspace_id`).bind(t,t),
  env.DB.prepare('DELETE FROM configuration_masked_records WHERE expires_at IS NOT NULL AND expires_at<=?').bind(t),
 ]);
}

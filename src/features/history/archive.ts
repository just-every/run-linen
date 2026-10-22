import { serviceHistoryRewrite } from './service-erasure';
import { captureKnownArchiveAliasStatements } from './archive-identities.mjs';
import { ApiError, id } from '../../platform/http';
import type { Env } from '../../platform/types';
import { decodeHistory,fieldClass } from './registry';
import { identityMatcher } from './identity';
import { historyEventKey, intersectRedaction, redactHistory } from './redact';
import { projectHistoryEvent } from './event';

interface Context {env:Pick<Env,'DB'|'ENCRYPTION_KEY'>;principal:{workspaceId:string}}
/** The archive boundary uses precisely the live history policy. Unknown row
 * schemas remain subject to adoption's existing refusal/clearing rules. */
export async function historyArchiveRow(ctx:Context,table:string,row:Record<string,any>,ingress=false) {
  if(!['audit_events','svc_events'].includes(table))return {row,typed:false};
  const store=table==='audit_events'?'audit':'service',column=store==='audit'?'detail_json':'data_json';
  let e=decodeHistory(row[column]);
  if(e && table==='audit_events' && typeof row.action==='string' && row.action!==e.action)throw new ApiError(409,'history_action_conflict','History action does not match its original event');
  const foreign=ingress&&typeof row.workspace_id==='string'&&row.workspace_id!==ctx.principal.workspaceId;
  const key=(foreign?'import:linen:'+row.workspace_id+':':'')+historyEventKey(store,String(row.id),e);
  const prior=await ctx.env.DB.prepare('SELECT envelope_json FROM history_redactions WHERE workspace_id=? AND event_key=?').bind(ctx.principal.workspaceId,key).first<{envelope_json:string}>();
  if(ingress && e && !prior){
    e=structuredClone(e);
    for(const c of e.changes)if(c.field.startsWith('custom:')||['group','groupId','group_id'].includes(c.field)){delete c.evidence;delete c.beforeEvidence;delete c.afterEvidence;}
    row={...row,[column]:JSON.stringify(e)};
  }
  const matches=await identityMatcher(ctx.env,ctx.principal.workspaceId);
  const count=await ctx.env.DB.prepare('SELECT 1 FROM adoption_tombstones WHERE workspace_id=? UNION ALL SELECT 1 FROM history_identity_tombstones WHERE workspace_id=? LIMIT 1').bind(ctx.principal.workspaceId,ctx.principal.workspaceId).first();
  if(!prior&&!count&&!(ingress&&e?.redacted))return {row,typed:!!e};
  const at=new Date().toISOString(),result=await redactHistory(ingress&&prior?prior.envelope_json:row[column],at,matches,row.actor_id,ingress&&!prior&&!!e?.redacted);
  const payload=prior?intersectRedaction(result.payload,JSON.parse(prior.envelope_json)):result.payload;
  if(payload && typeof payload==='object')delete (payload as any).pendingErasure;
  return {row:{...row,[column]:JSON.stringify(payload),...(result.actorErased?{actor_id:'[erased]'}:{})},typed:!!e||!!prior};
}

/** Call only after the caller's current record/transport authority check. The
 * same policy covers events written after the original erasure checkpoint. */
export async function readHistoryEvent(ctx:Context,action:string,payload:unknown,actorId?:string,eventId?:string,store:'audit'|'service'='audit') {
  const column=store==='audit'?'detail_json':'data_json';
  const row={id:eventId??'',actor_id:actorId??'',action, [column]:typeof payload==='string'?payload:JSON.stringify(payload)};
  const safe=await historyArchiveRow(ctx,store==='audit'?'audit_events':'svc_events',row);
  if(eventId && safe.row[column]!==row[column]) {
    const table=store==='audit'?'audit_events':'svc_events',w=ctx.principal.workspaceId;
    const original=decodeHistory(row[column]),guard=id();
    const aliases=original?await captureKnownArchiveAliasStatements(ctx,{eventId,store,payload:original,redactedPayload:JSON.parse(safe.row[column]),personFields:original.changes.filter(c=>fieldClass(original.action,c.field)==='person').map(c=>c.field),actorId:row.actor_id,redactedActorId:safe.row.actor_id,at:new Date().toISOString()}):[];
    const rewrites=store==='service'?serviceHistoryRewrite(ctx.env.DB,{workspaceId:w,eventId,beforeActor:row.actor_id,beforePayload:row[column],afterActor:safe.row.actor_id,afterPayload:safe.row[column]}):[ctx.env.DB.prepare(`UPDATE ${table} SET ${column}=?,actor_id=? WHERE workspace_id=? AND id=? AND ${column}=? AND actor_id=?`).bind(safe.row[column],safe.row.actor_id,w,eventId,row[column],row.actor_id)];
    const statements=[ctx.env.DB.prepare(`INSERT INTO history_write_guards SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM ${table} WHERE workspace_id=? AND id=? AND ${column}=? AND actor_id=?) THEN 1 ELSE 0 END`).bind(guard,w,eventId,row[column],row.actor_id),...aliases,...rewrites];
    const envelope=decodeHistory(safe.row[column]);
    if(envelope?.redacted || JSON.parse(safe.row[column])?.redacted==='erasure')statements.push(ctx.env.DB.prepare(`INSERT OR IGNORE INTO history_redactions SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${table} WHERE workspace_id=? AND id=? AND ${column}=?)`).bind(w,historyEventKey(store,eventId,envelope),eventId,store,envelope?.redactedAt??new Date().toISOString(),safe.row[column],'{}',w,eventId,safe.row[column]));
    statements.push(ctx.env.DB.prepare('DELETE FROM history_write_guards WHERE id=?').bind(guard));
    try {await ctx.env.DB.batch(statements);}catch(error){if(/CHECK constraint failed/i.test(String(error)))throw new ApiError(409,'history_changed','History changed; reload before reading');throw error;}
  }
  return projectHistoryEvent(action,safe.row[column]);
}

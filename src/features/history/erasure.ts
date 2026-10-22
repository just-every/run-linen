import { legacySubjectMatcher } from './legacy-scope';
import { serviceHistoryRewrite } from './service-erasure';
import { captureArchiveAliasStatements } from './archive-identities.mjs';
import type { Env } from '../../platform/types';
import { id } from '../../platform/http';
import { decodeHistory,fieldClass } from './registry';
import { historyIdentityDigest, identityMatcher } from './identity';
import { historyEventKey, intersectRedaction, redactHistory, type HistoryCounts } from './redact';

interface Context {env:Pick<Env,'DB'|'ENCRYPTION_KEY'>;principal:{workspaceId:string}}
export async function prepareHistoryErasure(ctx:Context,identities:string[],at:string) {
  const db=ctx.env.DB,w=ctx.principal.workspaceId,values=new Set(identities.filter(Boolean));
  for(const identity of identities){
    const users=(await db.prepare('SELECT id,email,name FROM users WHERE id=? AND EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=users.id)').bind(identity,w).all<{id:string;email:string;name:string}>()).results;
    const people=(await db.prepare('SELECT id,name,attributes_json FROM work_people WHERE workspace_id=? AND id=?').bind(w,identity).all<{id:string;name:string;attributes_json:string}>()).results;
    for(const u of users)for(const v of [u.id,u.email,u.name])if(v&&v!=='[erased]')values.add(v);
    for(const p of people){if(p.name&&p.name!=='[erased]')values.add(p.name);try{const a=JSON.parse(p.attributes_json);if(typeof a.email==='string')values.add(a.email);}catch{}}
  }
  const matches=await identityMatcher(ctx.env,w,[...values]);
  const statements:D1PreparedStatement[]=[],counts:HistoryCounts={},subjectAffected=legacySubjectMatcher(ctx,matches);
  for(const value of values)statements.push(db.prepare('INSERT OR IGNORE INTO history_identity_tombstones VALUES(?,?,?)').bind(w,await historyIdentityDigest(ctx.env,w,value),at));
  for(const email of [...values].filter(v=>v.includes('@')))statements.push(db.prepare("UPDATE audit_events SET target='[erased]' WHERE workspace_id=? AND instr(lower(target),lower(?))>0").bind(w,email));
  for(const store of ['audit','service'] as const){
    const table=store==='audit'?'audit_events':'svc_events',column=store==='audit'?'detail_json':'data_json';
    const events=(await db.prepare(`SELECT id,actor_id,${store==='audit'?'target':'record_id'} target,${column} payload FROM ${table} WHERE workspace_id=?`).bind(w).all<{id:string;actor_id:string;target:string;payload:string}>()).results;
    for(const event of events){
      const result=await redactHistory(event.payload,at,matches,event.actor_id,!decodeHistory(event.payload)&&await subjectAffected(event.target));if(!result.affected)continue;
      const key=historyEventKey(store,event.id,decodeHistory(event.payload));
      const prior=await db.prepare('SELECT envelope_json FROM history_redactions WHERE workspace_id=? AND event_key=?').bind(w,key).first<{envelope_json:string}>();
      const payload=JSON.stringify(prior?intersectRedaction(result.payload,JSON.parse(prior.envelope_json)):result.payload);
      const original=decodeHistory(event.payload);
      const aliasStatements=original&&identities.length?await captureArchiveAliasStatements(ctx,{eventId:event.id,store,payload:original,redactedPayload:JSON.parse(payload),identities:[...values],canonicalPersonKey:identities[0],actorId:event.actor_id,redactedActorId:result.actorErased?'[erased]':event.actor_id,personFields:original.changes.filter(c=>fieldClass(original.action,c.field)==='person').map(c=>c.field),at}):[];
      const guard=id();
      statements.push(db.prepare(`INSERT INTO history_write_guards SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM ${table} WHERE workspace_id=? AND id=? AND ${column}=? AND actor_id=?) THEN 1 ELSE 0 END`).bind(guard,w,event.id,event.payload,event.actor_id),...aliasStatements,
        ...(store==='service'?serviceHistoryRewrite(db,{workspaceId:w,eventId:event.id,beforeActor:event.actor_id,beforePayload:event.payload,afterActor:result.actorErased?'[erased]':event.actor_id,afterPayload:payload}):[db.prepare(`UPDATE ${table} SET ${column}=?,actor_id=CASE WHEN ? THEN '[erased]' ELSE actor_id END WHERE workspace_id=? AND id=?`).bind(payload,Number(result.actorErased),w,event.id)]),
        db.prepare(`INSERT INTO history_redactions VALUES(?,?,?,?,?,?,?) ON CONFLICT(workspace_id,event_key) DO UPDATE SET envelope_json=excluded.envelope_json,redacted_at=MIN(history_redactions.redacted_at,excluded.redacted_at),counts_json=excluded.counts_json`).bind(w,key,event.id,store,at,payload,JSON.stringify(result.counts)),
        db.prepare('DELETE FROM history_write_guards WHERE id=?').bind(guard));
      for(const [kind,n] of Object.entries(result.counts))counts[kind]=(counts[kind]||0)+n;
    }
  }
  return {statements,counts};
}

import { archiveMutationRun } from '../adoption/archive-fence';
import { ApiError } from '../../platform/http';
import type { AdoptionContext, Row } from '../adoption/core';
import { historyArchiveRow } from './archive';
import { decodeHistory } from './registry';
import { historyEventKey,intersectRedaction } from './redact';
import { isArchiveAlias } from './archive-identities.mjs';

export const historyRestoreTables=['history_archive_aliases','history_archive_identity_digests','history_archive_slots','history_redactions','history_identity_tombstones'] as const;
const check=(value:unknown)=>{if(!value)throw new ApiError(422,'history_restore','Typed, scoped history metadata is required');};
/** These rows preserve only historical removals and opaque associations. They
 * never create a principal, membership, classification or provider authority. */
export async function restoreHistoryMetadata(ctx:AdoptionContext,table:string,row:Row,sourceId:string) {
  const db=ctx.env.DB,w=ctx.principal.workspaceId;
  if(table==='history_archive_aliases'){
    check(typeof row.origin==='string'&&/^[a-f0-9]{32}$/.test(row.origin)&&isArchiveAlias(row.alias)&&['person','unattributed'].includes(String(row.kind)));
    await archiveMutationRun(ctx, db.prepare('INSERT OR IGNORE INTO history_archive_aliases VALUES(?,?,?,?,?)').bind(w,row.origin,row.alias,row.kind,row.created_at));
  }else if(table==='history_archive_identity_digests'){
    check(typeof row.digest==='string'&&/^ai1:[a-f0-9]{64}$/.test(row.digest)&&isArchiveAlias(row.alias));
    check(await db.prepare('SELECT 1 FROM history_archive_aliases WHERE workspace_id=? AND origin=? AND alias=?').bind(w,row.origin,row.alias).first());
    const old=await db.prepare('SELECT alias FROM history_archive_identity_digests WHERE workspace_id=? AND origin=? AND digest=?').bind(w,row.origin,row.digest).first<{alias:string}>();
    if(old&&old.alias!==row.alias)throw new ApiError(409,'history_alias_conflict','An archived identity association cannot be reassigned');
    await archiveMutationRun(ctx, db.prepare('INSERT OR IGNORE INTO history_archive_identity_digests VALUES(?,?,?,?,?)').bind(w,row.origin,row.digest,row.alias,row.created_at));
  }else if(table==='history_archive_slots'){
    check(['audit','service'].includes(String(row.store))&&typeof row.event_id==='string'&&row.event_id&&typeof row.path==='string'&&(['actor','rowActor','initiatedBy'].includes(row.path)||/^change:.+:(before|after)$/.test(row.path))&&isArchiveAlias(row.alias));
    check(await db.prepare('SELECT 1 FROM history_archive_aliases WHERE workspace_id=? AND origin=? AND alias=?').bind(w,row.origin,row.alias).first());
    const old=await db.prepare('SELECT origin,alias FROM history_archive_slots WHERE workspace_id=? AND store=? AND event_id=? AND path=?').bind(w,row.store,row.event_id,row.path).first<{origin:string;alias:string}>();
    if(old&&(old.origin!==row.origin||old.alias!==row.alias))throw new ApiError(409,'history_alias_conflict','An archived event slot cannot be reassigned');
    await archiveMutationRun(ctx, db.prepare('INSERT OR IGNORE INTO history_archive_slots VALUES(?,?,?,?,?,?,?)').bind(w,row.store,row.event_id,row.path,row.origin,row.alias,row.created_at));
  }else if(table==='history_identity_tombstones'){
    check(typeof row.digest==='string'&&/^h1:[a-f0-9]{64}$/.test(row.digest));
    // Foreign keyed values are opaque: no identity matching or live grant is inferred.
    await archiveMutationRun(ctx, db.prepare('INSERT OR IGNORE INTO history_identity_tombstones VALUES(?,?,?)').bind(w,row.digest,row.created_at));
  }else if(table==='history_redactions'){
    check(['audit','service','import'].includes(String(row.store))&&typeof row.event_key==='string'&&typeof row.event_id==='string');
    let envelope:any,counts:any;try{envelope=JSON.parse(String(row.envelope_json));counts=JSON.parse(String(row.counts_json));}catch{check(false);}
    check(envelope?.redacted==='erasure'&&typeof envelope.redactedAt==='string'&&Number.isFinite(Date.parse(envelope.redactedAt))&&counts&&typeof counts==='object'&&!Array.isArray(counts)&&Object.values(counts).every(v=>Number.isInteger(v)&&Number(v)>=0));
    const original=decodeHistory(envelope);
    if(original && row.store!=='import'){
      const safe=await historyArchiveRow(ctx,row.store==='audit'?'audit_events':'svc_events',{id:row.event_id,workspace_id:row.workspace_id,actor_id:original.actor.id,action:original.action,[row.store==='audit'?'detail_json':'data_json']:row.envelope_json},true);
      envelope=JSON.parse(safe.row[row.store==='audit'?'detail_json':'data_json']);
    }else if(!original)envelope={redacted:'erasure',redactedAt:envelope.redactedAt};
    const key='import:'+sourceId+':'+row.event_key;
    const old=await db.prepare('SELECT envelope_json FROM history_redactions WHERE workspace_id=? AND event_key=?').bind(w,key).first<{envelope_json:string}>();
    const payload=JSON.stringify(old?intersectRedaction(envelope,JSON.parse(old.envelope_json)):envelope);
    await archiveMutationRun(ctx, db.prepare('INSERT INTO history_redactions VALUES(?,?,?,?,?,?,?) ON CONFLICT(workspace_id,event_key) DO UPDATE SET envelope_json=excluded.envelope_json,redacted_at=MIN(history_redactions.redacted_at,excluded.redacted_at)').bind(w,key,row.event_id,row.store,envelope.redactedAt,payload,JSON.stringify(counts)));
  }else check(false);
  return {state:'restored' as const,reason:'inert typed history metadata'};
}

import type { Principal, Env } from '../../platform/types';
import { historyEventStatement, registeredHistory, readHistoryEvent } from '../history/event';
import type { ServiceRecord } from './store';

/** Original snapshots only. The shared registry decides which values survive erasure. */
export function serviceSnapshot(r: Pick<ServiceRecord, 'data' | 'ownerId' | 'visibility' | 'participants'>) {
  const { lifecycle, status, changeType, ...data }=r.data;
  return { ...data, ...(lifecycle!==undefined || status!==undefined ? {state:lifecycle ?? status} : {}),
    ...(changeType!==undefined ? {type:changeType} : {}), ownerId:r.ownerId,visibility:r.visibility,participants:r.participants };
}
function personSubjects(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(personSubjects);
  return Object.entries(value).flatMap(([key, item]) =>
    ['personId', 'requesterId', 'beneficiaryId', 'holderId', 'recipientId'].includes(key) && typeof item === 'string' ? [item] : personSubjects(item));
}
export function serviceEvent(db: D1Database, p: Principal, r: Pick<ServiceRecord, 'id' | 'kind' | 'visibility' | 'ownerId' | 'participants'>,
  before: Record<string, unknown>, after: Record<string, unknown>, event: string, at: string, eventId?: string) {
  const action = Object.keys(before).length ? 'service.record_changed' : 'service.record_created';
  const kind = (['change', 'problem', 'asset'].includes(r.kind) ? r.kind : 'service') as 'change' | 'problem' | 'asset' | 'service';
  const completeAfter={...Object.fromEntries(Object.keys(before).map(key=>[key,null])),...after};
  const envelope = registeredHistory(action, { kind, id: r.id }, before, completeAfter,
    { kind: p.roles.includes('integration') && !p.roles.some(role=>['owner','operator'].includes(role)) ? 'integration' : 'person', id: p.userId }, [...new Set([...personSubjects(before), ...personSubjects(after)])],
    r.visibility === 'restricted' ? 'restricted' : 'normal', at);
  return historyEventStatement({ env: { DB: db }, principal: p }, {
    ...(eventId ? { id: eventId } : {}), action, storedAction: event, target: r.id, envelope, at, conditional: true, store: 'service',
  });
}

/** Readers never expose the event payload or reconstruct erased historical values. */
export async function serviceHistory(env: Env, p: Principal, r: ServiceRecord) {
  const db=env.DB;
  const rows = (await db.prepare('SELECT id,actor_id,kind,data_json,created_at FROM svc_events WHERE workspace_id=? AND record_id=? ORDER BY created_at,rowid')
    .bind(p.workspaceId, r.id).all<{ id: string; actor_id: string; kind: string; data_json: string; created_at: string }>()).results;
  return { items: await Promise.all(rows.map(async row => {
    const projected=await readHistoryEvent({env,principal:p},'service.record_changed',row.data_json,row.actor_id,row.id,'service');
    const delivery=projected.changes.find(change=>change.field==='deliveryState');
    return { id: row.id, at: row.created_at, kind: row.kind==='notification-state-changed' ? 'notification' as const : 'change' as const, action: row.kind, visibility: 'private',
      ...(delivery ? {body:`Delivery state: ${delivery.after}`,delivery:{state:delivery.after}} : {}),
      actor: (projected.actor ? projected.actor.name ?? projected.actor.id : row.actor_id), actorKind: (projected.actor ? projected.actor.kind : 'person'),
      changes: projected.changes, ...('source' in projected && projected.source ? {source:projected.source} : {}), ...(projected.redacted ? { redacted: projected.redacted, redactedAt: projected.redactedAt,
        redaction: { reason: 'erasure', at: projected.redactedAt, cleared: projected.changes.length === 0 } } : {}) };
  })) };
}

/** Canonical comparison keeps key order from turning an unchanged command into a mutation. */
export function sameServiceValues(a: unknown, b: unknown): boolean {
  if (Object.is(a,b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const left=Object.entries(a), right=Object.entries(b);
  return left.length===right.length && left.every(([key,value])=>Object.hasOwn(b,key) && sameServiceValues(value,(b as Record<string,unknown>)[key]));
}

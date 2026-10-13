import type { Principal } from '../../platform/types';
import { ApiError, requiredString } from '../../platform/http';
import { create, date, getService, list, number, type ServiceRecord } from './store';
export function factFresh(data: Record<string, any>, at = Date.now()) { return Number.isFinite(Date.parse(data.observedAt)) && Date.parse(data.observedAt) <= at && at - Date.parse(data.observedAt) <= data.freshnessMs; }
export async function addEdge(db: D1Database, p: Principal, b: Record<string, any>) {
    const from = await getService(db, p, requiredString(b.from, 'from')), to = await getService(db, p, requiredString(b.to, 'to'));
    if (!['observed', 'asserted', 'inferred'].includes(b.provenance))
        throw new ApiError(400, 'provenance', 'Observed, asserted or inferred provenance required');
    const data = { from: from.id, to: to.id, relationship: requiredString(b.relationship, 'relationship'), provenance: b.provenance, source: requiredString(b.source, 'source'), sourceRevision: requiredString(b.sourceRevision, 'sourceRevision'), observedAt: date(b.observedAt, 'observedAt'), effectiveAt: date(b.effectiveAt, 'effectiveAt'), freshnessMs: number(b.freshnessMs, 'freshnessMs', 1), value: b.value ?? true, ingestedAt: new Date().toISOString() };
    return create(db, p, 'edge', data, { visibility: from.visibility === 'restricted' || to.visibility === 'restricted' ? 'restricted' : 'operators', participants: [p.userId] });
}
export async function serviceGraph(db: D1Database, p: Principal) { const nodes = (await Promise.all(['service', 'supplier', 'asset', 'person'].map(k => list(db, p, k as any)))).flat(); const visible = new Set(nodes.map(n => n.id)); const edges = (await list(db, p, 'edge')).filter(e => visible.has(e.data.from) && visible.has(e.data.to)); const conflicts = (a: ServiceRecord) => edges.filter(b => a.id !== b.id && a.data.from === b.data.from && a.data.to === b.data.to && a.data.relationship === b.data.relationship && JSON.stringify(a.data.value) !== JSON.stringify(b.data.value)).map(x => x.id); return { nodes, edges: edges.map(e => ({ ...e, fresh: factFresh(e.data), conflicts: conflicts(e) })), coverage: 'Only recorded relationships are known; absent dependencies are unknown.' }; }

import { id, now, requiredString } from '../../platform/http';
import { hashToken } from '../../platform/crypto';
import { assert, current, iso } from './access';
import { getCommitment } from './commitments';
import type { IntelligenceContext } from './types';
export function canonical(value: unknown): string {
    if (Array.isArray(value))
        return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object')
        return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
    return JSON.stringify(value);
}
export async function ingestEvent(ctx: IntelligenceContext, b: any) {
    ctx = await current(ctx, ['owner', 'operator', 'integration']);
    const c = await getCommitment(ctx, b.commitmentId);
    assert(c.data.observations.some(s => s.step.verifierConnectionId === b.sourceId), 'event_source_denied', 403);
    const eventId = requiredString(b.eventId, 'eventId', 200), sourceRevision = requiredString(b.sourceRevision, 'sourceRevision', 200), observedAt = iso(b.observedAt);
    assert(Date.parse(observedAt) <= Date.now() + 1000, 'future_event');
    const payload = canonical(b.payload);
    assert(payload && payload.length <= 16000, 'event_too_large');
    const fingerprint = await hashToken(canonical({ revision: sourceRevision, payload: b.payload }));
    const existing = await ctx.env.DB.prepare('SELECT id,fingerprint FROM intelligence_events WHERE workspace_id=? AND source_id=? AND event_id=?').bind(ctx.principal.workspaceId, b.sourceId, eventId).first<any>();
    if (existing) {
        assert(existing.fingerprint === fingerprint, 'event_id_conflict', 409);
        return { id: existing.id, state: 'duplicate' };
    }
    const last = await ctx.env.DB.prepare('SELECT fingerprint FROM intelligence_events WHERE workspace_id=? AND commitment_id=? AND source_id=? ORDER BY created_at DESC LIMIT 1').bind(ctx.principal.workspaceId, c.id, b.sourceId).first<any>();
    const state = last?.fingerprint === fingerprint ? 'unchanged' : 'pending', eid = id();
    await ctx.env.DB.prepare('INSERT INTO intelligence_events VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(eid, ctx.principal.workspaceId, c.id, b.sourceId, eventId, sourceRevision, fingerprint, payload, observedAt, state, now()).run();
    if (state === 'pending')
        await ctx.env.DB.prepare('UPDATE intelligence_commitments SET due_at=? WHERE workspace_id=? AND id=?').bind(now(), ctx.principal.workspaceId, c.id).run();
    return { id: eid, state };
}

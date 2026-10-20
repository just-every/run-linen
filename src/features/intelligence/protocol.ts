import { id, now } from '../../platform/http';
import { assert, current } from './access';
import type { IntelligenceContext } from './types';
export interface ProtocolEvent {
    kind: 'claim' | 'dispatch' | 'timeout' | 'reconcile' | 'revoke' | 'admit' | 'takeover';
    actor: string;
    fence: number;
    effect?: 'absent' | 'present';
}
export interface Assumptions {
    singleAtomicStore: boolean;
    monotonicFences: boolean;
    independentReadback: boolean;
    currentAuthorityAtAdmission: boolean;
}
export function replayProtocol(assumptions: Assumptions, events: ProtocolEvent[], mutation = false) {
    assert(assumptions && Object.values(assumptions).every(v => v === true) && ['singleAtomicStore', 'monotonicFences', 'independentReadback', 'currentAuthorityAtAdmission'].every(k => (assumptions as any)[k] === true), 'model_assumptions_invalid');
    assert(Array.isArray(events) && events.length <= 1000, 'protocol_bounds');
    let owner: string | null = null, fence = 0, unknown = false, effect = 'absent', revoked = false;
    const trace: any[] = [];
    for (const [i, e] of events.entries()) {
        assert(['claim', 'dispatch', 'timeout', 'reconcile', 'revoke', 'admit', 'takeover'].includes(e.kind) && typeof e.actor === 'string' && Number.isSafeInteger(e.fence) && e.fence >= 0, 'protocol_event_invalid');
        let violation: string | null = null;
        if (e.kind === 'claim' || e.kind === 'takeover') {
            if (unknown)
                violation = 'unknown_effect_requires_reconciliation';
            else if (e.fence <= fence)
                violation = 'nonmonotonic_fence';
            else {
                owner = e.actor;
                fence = e.fence;
            }
        }
        if (e.kind === 'dispatch') {
            if (revoked)
                violation = 'revoked_dispatch';
            else if (e.actor !== owner || e.fence !== fence)
                violation = 'stale_coordinator';
            else if (unknown)
                violation = 'duplicate_uncertain_effect';
            else
                unknown = true;
        }
        if (e.kind === 'timeout')
            unknown = true;
        if (e.kind === 'reconcile') {
            if (e.actor !== owner || e.fence !== fence)
                violation = 'stale_reconciler';
            else if (!['absent', 'present'].includes(e.effect || ''))
                violation = 'missing_readback';
            else {
                effect = e.effect!;
                unknown = false;
            }
        }
        if (e.kind === 'revoke')
            revoked = true;
        if (e.kind === 'admit') {
            if (mutation) { /* Deliberate mutant bypasses current authority; independent invariant below catches it. */
            }
            else if (revoked || e.actor !== owner || e.fence !== fence || unknown || effect !== 'present')
                violation = 'unsafe_admission';
            if (!violation && (revoked || unknown || e.actor !== owner || e.fence !== fence || effect !== 'present'))
                violation = 'invariant_broken_by_mutation';
        }
        trace.push({ index: i, event: e, state: { owner, fence, unknown, effect, revoked }, violation });
        if (violation)
            return { valid: false, counterexample: trace, assumptions, version: 1, scope: 'bounded local protocol only' };
    }
    return { valid: true, trace, assumptions, version: 1, scope: 'bounded local protocol only' };
}
export async function recordProtocol(ctx: IntelligenceContext, b: any) {
    ctx = await current(ctx, ['owner', 'operator', 'auditor']);
    const result = replayProtocol(b.assumptions, b.events, b.mutation === true), key = id();
    await ctx.env.DB.prepare('INSERT INTO intelligence_protocol_runs VALUES(?,?,?,?,?,?)').bind(key, ctx.principal.workspaceId, ctx.principal.userId, JSON.stringify(b), JSON.stringify(result), now()).run();
    return { id: key, ...result };
}

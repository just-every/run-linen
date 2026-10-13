import { getCommitment, observationFacts } from './commitments';
import { current } from './access';
import type { IntelligenceContext } from './types';
export async function measuredTotals(ctx: IntelligenceContext, commitmentId: string, from: string, to: string) {
    ctx = await current(ctx);
    const c = await getCommitment(ctx, commitmentId);
    const observations = (await observationFacts(ctx, c)).filter(f => f.observedAt >= from && f.observedAt <= to);
    const attempts = await ctx.env.DB.prepare('SELECT cost_usd,elapsed_ms,charge_status FROM intelligence_attempts WHERE workspace_id=? AND commitment_id=? AND created_at>=? AND created_at<=?').bind(ctx.principal.workspaceId, commitmentId, from, to).all<any>();
    return { totals: { exposure: observations.reduce((n, f) => n + f.cohort.length, 0), failures: observations.filter(f => f.state === 'failed').reduce((n, f) => n + f.cohort.length, 0), costUsd: attempts.results.reduce((n, r) => n + (r.cost_usd || 0), 0), workMinutes: attempts.results.reduce((n, r) => n + (r.elapsed_ms || 0), 0) / 60000, adverseEffects: observations.filter(f => f.state === 'failed').length }, coverage: { sampleLimit:500,sampleMayBeTruncated:observations.length===500,costBasis:'sum of known configured estimates, not full invoiced total',exposureUnit: 'scoped workflow probe cohort observations', workUnit: 'recorded machine attempt elapsed minutes; not employee minutes', unknownObservationCount: observations.filter(f => f.state === 'uncertain').length, unknownChargeCount: attempts.results.filter(r => r.charge_status === 'unknown').length, excluded: ['unobserved business transactions', 'human effort', 'external supplier spend', 'unobserved adverse effects'] }, evidenceIds: observations.map(f => f.id), from, to };
}

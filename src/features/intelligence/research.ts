import { id, now, requiredString } from '../../platform/http';
import { verifyOutcome, getOperation } from '../execution/engine';
import { assert, current, errorCode } from './access';
import { getCommitment, runProbe, observationFacts } from './commitments';
import { callModel, objectSchema, textSchema, textsSchema } from './models';
import { queueEngineeringNeed } from './engineering';
import type { IntelligenceContext, Research } from './types';
export const researchSchema = objectSchema({ hypotheses: { type: 'array', minItems: 2, maxItems: 8, items: objectSchema({ id: textSchema, explanation: textSchema, prediction: textSchema, evidenceIds: textsSchema, status: { type: 'string', enum: ['open', 'rejected', 'supported'] } }) }, probes: { type: 'array', maxItems: 8, items: objectSchema({ probeId: textSchema, hypothesisIds: textsSchema, predictedObservation: textSchema, discriminatesBecause: textSchema }) }, rejectedExplanations: textsSchema, missingEngineering: textsSchema, conclusion: textSchema, next: { type: 'string', enum: ['probe', 'engineering', 'unresolved', 'ready_for_repair'] }, evidenceIds: textsSchema });
export async function startResearch(ctx: IntelligenceContext, b: any, stableId?: string) {
    ctx = await current(ctx, ['owner', 'operator', 'hr', 'integration']);
    const c = await getCommitment(ctx, b.commitmentId), rid = stableId || id();
    if (stableId) {
        const prior = await ctx.env.DB.prepare('SELECT id FROM intelligence_research WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,stableId).first();
        if (prior) {
            const existing = await getResearch(ctx,stableId);
            assert(existing.commitment_id === c.id && existing.actor_id === ctx.principal.userId && existing.data.commitmentRevision === c.revision,'research_identity_conflict',409);
            return existing;
        }
    }
    await ctx.env.DB.prepare("INSERT INTO intelligence_research VALUES(?,?,?,?,?,?,'pending',0,?,NULL,?,?)").bind(rid, ctx.principal.workspaceId, c.id, ctx.principal.userId, requiredString(b.connectionId || c.data.modelConnectionId, 'connectionId'), requiredString(b.question, 'question', 4000), JSON.stringify({ commitmentRevision: c.revision, rounds: [], verifiedOperationId: null }), now(), now()).run();
    return getResearch(ctx, rid);
}
export async function getResearch(ctx: IntelligenceContext, key: string) {
    ctx = await current(ctx);
    const row = await ctx.env.DB.prepare('SELECT * FROM intelligence_research WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, key).first<Research>();
    assert(row, 'research_not_found', 404);
    await getCommitment(ctx, row.commitment_id);
    return { ...row, data: JSON.parse(row.data_json) };
}
export async function advanceResearch(ctx: IntelligenceContext, key: string) {
    ctx = await current(ctx, ['owner', 'operator', 'hr', 'integration']);
    const r = await getResearch(ctx, key), c = await getCommitment(ctx, r.commitment_id);
    assert(!['verified', 'cancelled'].includes(r.state), 'research_terminal', 409);
    assert(r.data.commitmentRevision === c.revision, 'research_context_changed', 409);
    const lease = new Date(Date.now() + 180000).toISOString();
    const claim = await ctx.env.DB.prepare("UPDATE intelligence_research SET lease_until=?,state='researching' WHERE workspace_id=? AND id=? AND (lease_until IS NULL OR lease_until<?)").bind(lease, ctx.principal.workspaceId, key, now()).run();
    assert(claim.meta.changes === 1, 'research_busy', 409);
    try {
        const result = await callModel(ctx, { connectionId: r.connection_id, commitmentId: c.id, runId: key, purpose: 'rival_hypothesis_research', prompt: r.question, schema: researchSchema, extra: r.data.rounds.slice(-3) });
        const d: any = result.value;
        assert(new Set(d.hypotheses.map((h: any) => h.id)).size === d.hypotheses.length, 'duplicate_hypothesis', 502);
        const known = new Set(c.data.observations.map(s => s.id));
        const missing = d.probes.filter((p: any) => !known.has(p.probeId)).map((p: any) => `Missing diagnostic ${p.probeId}: ${p.discriminatesBecause}`);
        for (const p of d.probes)
            assert(p.hypothesisIds.length >= 2 && p.hypothesisIds.every((h: string) => d.hypotheses.some((v: any) => v.id === h)), 'probe_not_discriminating', 502);
        const unique = [...new Set<string>(d.probes.filter((p: any) => known.has(p.probeId)).map((p: any) => p.probeId))];
        const probes = await Promise.allSettled(unique.map(k => runProbe(ctx, c, c.data.observations.find(s => s.id === k)!, key)));
        const probeResults = probes.map((p, i) => p.status === 'fulfilled' ? p.value : { specId: unique[i], state: 'uncertain', error: errorCode(p.reason) });
        const jobs = [];
        for (const need of [...d.missingEngineering, ...missing, ...(d.next === 'ready_for_repair' ? [d.conclusion] : [])])
            jobs.push(await queueEngineeringNeed(ctx, { commitmentId: c.id, researchId: key, description: need }));
        const round = { number: r.round + 1, modelAttemptId: result.attemptId, decision: d, probes: probeResults, engineeringJobIds: jobs.map(j => j.id), at: now() };
        const state = jobs.length ? 'engineering_required' : d.next === 'ready_for_repair' ? 'repair_required' : unique.length ? 'pending' : 'unresolved';
        await ctx.env.DB.prepare('UPDATE intelligence_research SET state=?,round=round+1,data_json=?,lease_until=NULL,updated_at=? WHERE id=? AND workspace_id=? AND lease_until=?').bind(state, JSON.stringify({ ...r.data, rounds: [...r.data.rounds, round] }), now(), key, ctx.principal.workspaceId, lease).run();
        return getResearch(ctx, key);
    }
    catch (e) {
        await ctx.env.DB.prepare('UPDATE intelligence_research SET state=?,lease_until=NULL,updated_at=?,data_json=? WHERE id=? AND workspace_id=? AND lease_until=?').bind(errorCode(e).includes('budget') ? 'budget_held' : 'failed', now(), JSON.stringify({ ...r.data, lastError: errorCode(e) }), key, ctx.principal.workspaceId, lease).run();
        throw e;
    }
}
export async function verifyResearch(ctx: IntelligenceContext, key: string, operationId: string) {
    ctx = await current(ctx, ['owner', 'operator']);
    const r = await getResearch(ctx, key);
    const scope = await getCommitment(ctx, r.commitment_id), op = await getOperation(ctx, operationId), step = JSON.parse(op.step_json);
    assert(scope.data.observations.some(s => s.step.target === step.target && s.step.beneficiaryId === step.beneficiaryId && s.step.verifierConnectionId === step.verifierConnectionId), 'research_operation_scope_mismatch', 409);
    const result: any = await verifyOutcome(ctx, { operationId, verifierVersion: 1 });
    assert(result.state === 'verified' || result.state === 'outcome_verified', 'research_recovery_unverified', 409);
    const c = await getCommitment(ctx, r.commitment_id);
    const outcomes = await Promise.all(c.data.observations.map(s => runProbe(ctx, c, s, key)));
    assert(outcomes.length > 0 && outcomes.every(o => o.state === 'verified') && c.data.cohort.every(p => outcomes.some(o => o.cohort.includes(p))), 'research_cohort_unverified', 409);
    await ctx.env.DB.prepare("UPDATE intelligence_research SET state='verified',data_json=?,updated_at=? WHERE workspace_id=? AND id=?").bind(JSON.stringify({ ...r.data, verifiedOperationId: operationId, verification: result, evidenceIds: outcomes.map(o => o.id), verifiedAt: now() }), now(), ctx.principal.workspaceId, key).run();
    return getResearch(ctx, key);
}

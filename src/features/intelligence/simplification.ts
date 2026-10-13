import { id, now, requiredString } from '../../platform/http';
import { getService } from '../services/store';
import { dispatchChange, verifyChange } from '../services/changes';
import { getCommitment, observeCommitment, observationFacts } from './commitments';
import { assert, current, num } from './access';
import { measuredTotals } from './measurement';
import type { IntelligenceContext } from './types';
export function compareRedesign(repair: {
    exposure: number;
    failures: number;
    costUsd: number;
    workMinutes: number;
    adverseEffects: number;
}, redesign: typeof repair) {
    for (const point of [repair, redesign]){assert(point&&['exposure','failures','costUsd','workMinutes','adverseEffects'].every(k=>typeof (point as any)[k]==='number'),'complete_measurement_required');}
    for (const point of [repair, redesign])
        for (const [k, v] of Object.entries(point))
            num(v, k === 'exposure' ? 1 : 0, 1e15);
    return { repair: { failureRate: repair.failures / repair.exposure, costPerExposure: repair.costUsd / repair.exposure, workPerExposure: repair.workMinutes / repair.exposure, adversePerExposure: repair.adverseEffects / repair.exposure }, redesign: { failureRate: redesign.failures / redesign.exposure, costPerExposure: redesign.costUsd / redesign.exposure, workPerExposure: redesign.workMinutes / redesign.exposure, adversePerExposure: redesign.adverseEffects / redesign.exposure }, avoidedCostUsd: null, reason: 'Rates use recorded exposure; no counterfactual avoided cost inferred' };
}
export async function proposeSimplification(ctx: IntelligenceContext, b: any) {
    ctx = await current(ctx, ['owner', 'operator']);
    const c = await getCommitment(ctx, b.commitmentId);
    const measured = await measuredTotals(ctx, c.id, b.baselineFrom || c.createdAt, now());
    const machineBaseline=!b.baseline;
    if (!b.baseline) {
        b = { ...b, baseline: measured.totals, baselineEvidenceIds: measured.evidenceIds };
    }
    await getService(ctx.env.DB, ctx.principal, b.changeId, 'change');
    assert(Array.isArray(b.baselineEvidenceIds) && b.baselineEvidenceIds.length, 'baseline_evidence_required');
    const facts = await observationFacts(ctx, c);
    assert(b.baselineEvidenceIds.every((e: string) => facts.some(f => f.id === e)), 'unknown_baseline_evidence');
    compareRedesign(b.baseline, b.baseline);
    const key = id(), data = { redesign: requiredString(b.redesign, 'redesign', 8000), continuedRepair: requiredString(b.continuedRepair, 'continuedRepair', 8000), baseline: b.baseline, baselineEvidenceIds: b.baselineEvidenceIds, baselineBasis: machineBaseline ? 'machine_observed' : 'owner_recorded', baselineMeasurement: measured, commitmentRevision: c.revision, measurements: [], comparison: null };
    await ctx.env.DB.prepare("INSERT INTO intelligence_simplifications VALUES(?,?,?,?,?,'proposed',?,?)").bind(key, ctx.principal.workspaceId, c.id, b.changeId, JSON.stringify(data), now(), now()).run();
    return { id: key, state: 'proposed', data };
}
export async function getSimplification(ctx: IntelligenceContext, key: string) {
    ctx = await current(ctx);
    const r: any = await ctx.env.DB.prepare('SELECT * FROM intelligence_simplifications WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, key).first();
    assert(r, 'simplification_not_found', 404);
    await getCommitment(ctx, r.commitment_id);
    return { ...r, data: JSON.parse(r.data_json) };
}
export async function executeSimplification(ctx: IntelligenceContext, key: string, b: any) {
    ctx = await current(ctx, ['owner', 'operator']);
    const s = await getSimplification(ctx, key), change = await getService(ctx.env.DB, ctx.principal, s.change_id, 'change');
    const result = await dispatchChange(ctx.env, ctx.principal, change, { revision: change.revision, phase: b.phase, idempotencyKey: requiredString(b.idempotencyKey, 'idempotencyKey') });
    await ctx.env.DB.prepare('UPDATE intelligence_simplifications SET state=?,updated_at=?,data_json=? WHERE workspace_id=? AND id=?').bind(result.data.state, now(), JSON.stringify({ ...s.data, interventionAt: s.data.interventionAt || now() }), ctx.principal.workspaceId, key).run();
    return result;
}
export async function measureSimplification(ctx: IntelligenceContext, key: string, b: any) {
    ctx = await current(ctx, ['owner', 'operator']);
    const s = await getSimplification(ctx, key);
    let change = await getService(ctx.env.DB, ctx.principal, s.change_id, 'change');
    if (b.invocationId)
        change = await verifyChange(ctx.env, ctx.principal, change, { revision: change.revision, invocationId: b.invocationId });
    assert(change.data.state === 'verified', 'redesign_not_verified', 409);
    const cov = await observeCommitment(ctx, s.commitment_id), facts = await observationFacts(ctx, await getCommitment(ctx, s.commitment_id));
    const measurements = [...s.data.measurements, { at: now(), coverage: cov, evidenceIds: facts.slice(0, 20).map(f => f.id) }];
    const measured = await measuredTotals(ctx, s.commitment_id, s.data.interventionAt || s.created_at, now());
    let comparison = measured.totals.exposure > 0 ? compareRedesign(s.data.baseline, measured.totals) : null;
    if (b.observedTotals) {
        assert(b.observedTotalsBasis === 'owner_measured', 'measured_totals_basis_required');
        comparison = compareRedesign(s.data.baseline, b.observedTotals);
    }
    await ctx.env.DB.prepare("UPDATE intelligence_simplifications SET state='measuring',data_json=?,updated_at=? WHERE workspace_id=? AND id=?").bind(JSON.stringify({ ...s.data, measurements, comparison, machineMeasurement: measured, observedTotals: b.observedTotals || null, observedTotalsBasis: b.observedTotals ? 'owner_measured' : null }), now(), ctx.principal.workspaceId, key).run();
    return getSimplification(ctx, key);
}

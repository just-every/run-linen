import { id, now } from '../../platform/http';
import { proposePlan, dispatchPlan } from '../execution/plans';
import { runOperation, getOperation } from '../execution/engine';
import { assert, current, strings } from './access';
import { getCommitment, observationFacts } from './commitments';
import { getResearch, startResearch } from './research';
import { canonical } from './events';
import type { IntelligenceContext } from './types';
export interface Versions {
    provider: string;
    model: string;
    action: number;
    context: number;
    verifier: number;
}
export function applicability(pkg: any, versions: Versions, facts: any[], at = Date.now()) {
    const reasons = [];
    if (canonical(pkg.versions) !== canonical(versions))
        reasons.push('version_drift');
    for (const cond of pkg.conditions) {
        const f = facts.find(f => f.specId === cond.specId && f.cohort.includes(cond.cohort));
        if (!f || f.state !== cond.state || !Number.isFinite(Date.parse(f.observedAt)) || Date.parse(f.observedAt)>at+1000 || at - Date.parse(f.observedAt) > pkg.freshnessSeconds * 1000)
            reasons.push('missing_stale_or_different_evidence');
    }
    for (const counter of pkg.counterexamples) {
        if (counter.conditions.every((c: any) => (()=>{const f=facts.find(f=>f.specId===c.specId&&f.cohort.includes(c.cohort));return f?.state===c.state&&Number.isFinite(Date.parse(f.observedAt))&&at-Date.parse(f.observedAt)<=pkg.freshnessSeconds*1000})()))
            reasons.push('known_counterexample');
    }
    return { matches: reasons.length === 0, reasons };
}
export async function currentVersions(ctx: IntelligenceContext, commitmentId: string): Promise<Versions> {
    const c = await getCommitment(ctx, commitmentId);
    const ids = [...new Set(c.data.observations.flatMap(s => [s.step.connectionId, s.step.verifierConnectionId]).filter((id): id is string => typeof id === 'string'))].sort();
    const providers = [];
    for (const id of ids) {
        const r: any = await ctx.env.DB.prepare('SELECT id,provider,revision FROM connections WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, id).first();
        providers.push(r || { id, missing: true });
    }
    const model: any = c.data.modelConnectionId ? await ctx.env.DB.prepare('SELECT id,revision,config_json FROM connections WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, c.data.modelConnectionId).first() : null;
    return { provider: canonical(providers), model: canonical(model ? { id: model.id, revision: model.revision, model: JSON.parse(model.config_json).model } : null), action: 1, context: c.revision, verifier: 1 };
}
export async function publishCapability(ctx: IntelligenceContext, b: any) {
    ctx = await current(ctx, ['owner', 'operator']);
    const r = await getResearch(ctx, b.researchId);
    assert(r.state === 'verified' && r.data.verifiedOperationId && r.data.evidenceIds.length, 'verified_case_required', 409);
    const c = await getCommitment(ctx, r.commitment_id);
    assert(c.revision === r.data.commitmentRevision, 'case_context_drift', 409);
    const actualVersions = await currentVersions(ctx, c.id);
    assert(canonical(b.versions) === canonical(actualVersions), 'capability_version_mismatch', 409);
    assert(b.versions && typeof b.versions.provider === 'string' && typeof b.versions.model === 'string' && b.versions.action === 1 && b.versions.verifier === 1 && b.versions.context === c.revision, 'capability_versions_required');
    assert(Array.isArray(b.conditions) && b.conditions.length > 0 && b.conditions.every((x: any) => c.data.observations.some(s => s.id === x.specId) && c.data.cohort.includes(x.cohort) && ['verified', 'failed'].includes(x.state)), 'detector_conditions_required');
    assert(c.data.observations.every(spec=>(spec.step.cohort||[spec.step.beneficiaryId]).every(cohort=>b.conditions.some((condition:any)=>condition.specId===spec.id&&condition.cohort===cohort))),'incomplete_detector_signature');
    assert(Array.isArray(b.counterexamples) && b.counterexamples.length > 0 && b.counterexamples.every((x: any) => typeof x.description === 'string' && Array.isArray(x.conditions) && x.conditions.length), 'counterexamples_required');
    const operation = await getOperation(ctx, r.data.verifiedOperationId);
    const verifiedStep = JSON.parse(operation.step_json);
    assert(Array.isArray(b.steps) && b.steps.length === 1 && canonical(b.steps[0]) === canonical(verifiedStep), 'verified_action_required');
    const facts = await observationFacts(ctx, c);
    assert(r.data.evidenceIds.every((key: string) => facts.some(f => f.id === key && f.state === 'verified')), 'verified_provenance_missing');
    const key = id(), data = { conditions: b.conditions, counterexamples: b.counterexamples, steps: b.steps, versions: b.versions, freshnessSeconds: c.data.freshnessSeconds, provenance: { researchId: r.id, operationId: r.data.verifiedOperationId, evidenceIds: r.data.evidenceIds }, diagnosticQuestions: strings(b.diagnosticQuestions), verifierSpecs: c.data.observations };
    await ctx.env.DB.prepare("INSERT INTO intelligence_capabilities VALUES(?,?,?,?,1,?,'active',?)").bind(key, ctx.principal.workspaceId, c.id, r.id, JSON.stringify(data), now()).run();
    return { id: key, version: 1, data };
}
export async function getCapability(ctx: IntelligenceContext, key: string) {
    ctx = await current(ctx);
    const row: any = await ctx.env.DB.prepare('SELECT * FROM intelligence_capabilities WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, key).first();
    assert(row, 'capability_not_found', 404);
    await getCommitment(ctx, row.commitment_id);
    return { ...row, data: JSON.parse(row.data_json) };
}
export async function applyCapability(ctx: IntelligenceContext, key: string, b: any) {
    ctx = await current(ctx, ['owner', 'operator']);
    const pkg = await getCapability(ctx, key), c = await getCommitment(ctx, b.commitmentId), facts = await observationFacts(ctx, c), admission = applicability(pkg.data, await currentVersions(ctx, c.id), facts);
    const reuseId = id();
    if (pkg.state !== 'active' || !admission.matches) {
        if (admission.reasons.includes('version_drift'))
            await ctx.env.DB.prepare("UPDATE intelligence_capabilities SET state='invalidated' WHERE id=? AND workspace_id=?").bind(key, ctx.principal.workspaceId).run();
        const research = await startResearch(ctx, { commitmentId: c.id, connectionId: c.data.modelConnectionId, question: 'Capability near-match or drift: ' + admission.reasons.join(', ') });
        await ctx.env.DB.prepare("INSERT INTO intelligence_reuse VALUES(?,?,?,?,'fresh_research',?,?)").bind(reuseId, ctx.principal.workspaceId, key, c.id, JSON.stringify({ admission, researchId: research.id }), now()).run();
        return { id: reuseId, state: 'fresh_research', researchId: research.id, admission };
    }
    assert(b.plan && canonical(b.plan.steps) === canonical(pkg.data.steps), 'capability_action_mismatch', 409);
    const plan = await proposePlan(ctx, { ...b.plan, workId: c.id, revision: c.revision, contextType: 'commitment' as any, idempotencyKey: 'capability:' + reuseId });
    const operations: any[] = await dispatchPlan(ctx, { planId: plan.id, expectedRevision: plan.revision });
    const results = await Promise.allSettled(operations.map(o => runOperation(ctx, o.id)));
    await ctx.env.DB.prepare("INSERT INTO intelligence_reuse VALUES(?,?,?,?,'executing',?,?)").bind(reuseId, ctx.principal.workspaceId, key, c.id, JSON.stringify({ admission, planId: plan.id, operationIds: operations.map(o => o.id), results: results.map(r => r.status === 'fulfilled' ? r.value : { state: 'unknown' }) }), now()).run();
    return { id: reuseId, state: 'executing', planId: plan.id, operations: results };
}
/** Compile actual diagnosis/recovery evidence; refuse when no discriminating evidence exists. */
export async function compileVerifiedCase(ctx: IntelligenceContext, researchId: string) {
    const r = await getResearch(ctx, researchId);
    assert(r.state === 'verified', 'verified_case_required', 409);
    const existing: any = await ctx.env.DB.prepare('SELECT id FROM intelligence_capabilities WHERE workspace_id=? AND research_id=? ORDER BY version DESC LIMIT 1').bind(ctx.principal.workspaceId, researchId).first();
    if (existing)
        return getCapability(ctx, existing.id);
    const c = await getCommitment(ctx, r.commitment_id), facts = await observationFacts(ctx, c);
    const admitted = (f:any) => facts.some(p => p.id===f.id && p.specId===f.specId && p.state===f.state && ['verified','failed'].includes(p.state) && Number.isFinite(Date.parse(p.observedAt)) && p.observedAt===f.observedAt && !(p.evidence as any)?.error);
    const diagnosis = (r.data.rounds || []).flatMap((round: any) => round.probes || []).filter((f: any) => f.id && f.state === 'failed' && admitted(f));
    assert(diagnosis.length > 0, 'discriminating_failure_evidence_required', 409);
    const observed=(r.data.rounds||[]).slice().reverse().flatMap((round:any)=>round.probes||[]);const signature=c.data.observations.map(spec=>observed.find((f:any)=>f.specId===spec.id));assert(signature.every((f:any)=>f&&admitted(f)),'complete_discriminating_signature_required',409);const conditions=signature.flatMap((f:any)=>f.cohort.map((cohort:string)=>({specId:f.specId,cohort,state:f.state})));
    const recovery = facts.filter(f => r.data.evidenceIds.includes(f.id) && f.state === 'verified');
    assert(recovery.length > 0, 'independent_recovery_required', 409);
    const operation = await getOperation(ctx, r.data.verifiedOperationId);
    return publishCapability(ctx, { researchId, versions: await currentVersions(ctx, c.id), steps: [JSON.parse(operation.step_json)], conditions, counterexamples: [{ description: 'Observed restored workflow must not receive the repair again', conditions: recovery.flatMap(f => f.cohort.map(cohort => ({ specId: f.specId, cohort, state: 'verified' }))) }], diagnosticQuestions: (r.data.rounds || []).at(-1)?.decision?.hypotheses.map((h: any) => h.prediction) || ['Recheck discriminating workflow observations'] });
}
export async function processCapabilityReuse(ctx: IntelligenceContext, commitmentId: string) {
    const c = await getCommitment(ctx, commitmentId), facts = await observationFacts(ctx, c);
    const latest = [...new Map(facts.map(f => f.specId + ':' + f.cohort.join(',')).map(key => [key, facts.find(f => f.specId + ':' + f.cohort.join(',') === key)!])).values()];
    const rows = await ctx.env.DB.prepare("SELECT id,data_json FROM intelligence_capabilities WHERE workspace_id=? AND commitment_id=? AND state='active' ORDER BY created_at DESC").bind(ctx.principal.workspaceId, c.id).all<any>();
    const active = await ctx.env.DB.prepare("SELECT 1 FROM intelligence_reuse WHERE workspace_id=? AND commitment_id=? AND state='executing'").bind(ctx.principal.workspaceId, c.id).first();
    if (active)
        return { state: 'existing_repair_pending' };
    for (const pkg of rows.results) {
        const data = JSON.parse(pkg.data_json), match = applicability(data, await currentVersions(ctx, c.id), latest);
        if (match.matches)
            return applyCapability(ctx, pkg.id, { commitmentId: c.id, plan: { steps: data.steps } });
        if (match.reasons.includes('version_drift'))
            await ctx.env.DB.prepare("UPDATE intelligence_capabilities SET state='invalidated' WHERE id=?").bind(pkg.id).run();
    }
    return { state: rows.results.length ? 'fresh_research_required' : 'no_verified_capability' };
}

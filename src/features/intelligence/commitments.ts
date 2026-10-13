import { id, now, requiredString } from '../../platform/http';
import { observeProbe } from './probe';
import { getService } from '../services/store';
import { actions } from '../execution/types';
import { assert, audit, current, errorCode, iso, num, strings, visible } from './access';
import type { Commitment, CommitmentData, IntelligenceContext, ObservationSpec, Fact } from './types';
function dto(r: any): Commitment {
    return { id: r.id, workspaceId: r.workspace_id, ownerId: r.owner_id, participants: JSON.parse(r.participants_json), sensitivity: r.sensitivity, data: JSON.parse(r.data_json), revision: r.revision, dueAt: r.due_at, createdAt: r.created_at, updatedAt: r.updated_at };
}
export async function getCommitment(ctx: IntelligenceContext, key: string) {
    ctx = await current(ctx);
    const r = await ctx.env.DB.prepare('SELECT * FROM intelligence_commitments WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, key).first();
    assert(r, 'commitment_not_found', 404);
    const c = dto(r);
    assert(visible(ctx, c), 'commitment_not_found', 404);
    return c;
}
export async function listCommitments(ctx: IntelligenceContext) {
    ctx = await current(ctx);
    const r = await ctx.env.DB.prepare('SELECT * FROM intelligence_commitments WHERE workspace_id=? ORDER BY updated_at DESC LIMIT 500').bind(ctx.principal.workspaceId).all();
    await audit(ctx, 'intelligence.read', 'commitments');
    return r.results.map(dto).filter(c => visible(ctx, c));
}
async function validate(ctx: IntelligenceContext, b: any): Promise<CommitmentData> {
    const cohort = strings(b.cohort);
    assert(Array.isArray(b.observations) && b.observations.length > 0 && b.observations.length <= 20, 'observation_specs_required');
    const specs: ObservationSpec[] = [];
    for (const o of b.observations) {
        const step = o.step;
        assert(step && actions.includes(step.action) && step.actionVersion === 1 && typeof step.target === 'string' && typeof step.beneficiaryId === 'string' && step.verifierConnectionId && step.connectionId !== step.verifierConnectionId, 'invalid_observation_step');
        assert(cohort.includes(step.beneficiaryId) && (!step.cohort || strings(step.cohort).every(c => cohort.includes(c))), 'observation_cohort_mismatch');
        const conn: any = await ctx.env.DB.prepare("SELECT provider,config_json FROM connections WHERE workspace_id=? AND id=?").bind(ctx.principal.workspaceId, step.verifierConnectionId).first();
        assert(conn && conn.provider === 'workflow-probe', 'probe_connection_required');
        specs.push({ id: requiredString(o.id, 'id', 100), description: requiredString(o.description, 'description'), step: { ...step, cohort: step.cohort || [step.beneficiaryId] } });
    }
    assert(new Set(specs.map(s => s.id)).size === specs.length, 'duplicate_observation');
    const dependencies = strings(b.dependencies || [], true);
    for (const dep of dependencies)
        await getCommitment(ctx, dep);
    const effectiveAt = iso(b.effectiveAt), expiresAt = b.expiresAt ? iso(b.expiresAt) : null;
    assert(!expiresAt || expiresAt > effectiveAt, 'invalid_effective_window');
    if (b.modelConnectionId)
        assert(await ctx.env.DB.prepare("SELECT id FROM connections WHERE workspace_id=? AND id=? AND provider='openai'").bind(ctx.principal.workspaceId, b.modelConnectionId).first(), 'model_connection_required');
    return { outcome: requiredString(b.outcome, 'outcome', 4000), cohort, observations: specs, freshnessSeconds: num(b.freshnessSeconds, 1, 86400 * 30), dependencies, effectiveAt, expiresAt, intervalSeconds: num(b.intervalSeconds, 10, 86400 * 30), modelConnectionId: b.modelConnectionId || null };
}
export async function saveCommitment(ctx: IntelligenceContext, b: any, key?: string) {
    ctx = await current(ctx, ['owner', 'operator', 'hr']);
    const old = key ? await getCommitment(ctx, key) : null;
    assert(!old || old.ownerId === ctx.principal.userId || ctx.principal.roles.includes('owner'), 'commitment_owner_required', 403);
    const owner = b.ownerId || old?.ownerId || ctx.principal.userId;
    assert(owner === ctx.principal.userId || ctx.principal.roles.includes('owner'), 'owner_assignment_denied', 403);
    const participants = strings(b.participants || old?.participants || [], true), sensitivity = b.sensitivity || old?.sensitivity || 'internal';
    assert(['internal', 'restricted', 'hr'].includes(sensitivity), 'invalid_sensitivity');
    assert(sensitivity !== 'hr' || ctx.principal.roles.some(r => ['owner', 'hr'].includes(r)), 'hr_required', 403);
    for (const uid of [owner, ...participants])
        assert(await ctx.env.DB.prepare('SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(ctx.principal.workspaceId, uid).first(), 'participant_not_active');
    const data = await validate(ctx, { ...old?.data, ...b });
    const serviceId = b.serviceId === undefined ? old?.data.serviceId : b.serviceId;
    if (serviceId) {
        const service = await getService(ctx.env.DB, ctx.principal, requiredString(serviceId, 'serviceId'), 'service');
        assert(service.ownerId === owner && (ctx.principal.userId === owner || ctx.principal.roles.includes('owner')), 'service_policy_owner_required', 403);
        data.serviceId = service.id;
    }
    const cid = key || id(), t = now(), rev = old ? old.revision + 1 : 1;
    assert(!old || b.revision === old.revision, 'revision_conflict', 409);
    assert(!data.dependencies.includes(cid), 'dependency_cycle');
    const seen = new Set<string>();
    const pending = [...data.dependencies];
    while (pending.length) {
        const dependency = pending.pop()!;
        assert(dependency !== cid, 'dependency_cycle');
        if (seen.has(dependency))
            continue;
        seen.add(dependency);
        assert(seen.size <= 100, 'dependency_graph_limit');
        pending.push(...(await getCommitment(ctx, dependency)).data.dependencies);
    }
    if (old) {
        const result = await ctx.env.DB.batch([ctx.env.DB.prepare('UPDATE intelligence_commitments SET owner_id=?,participants_json=?,sensitivity=?,data_json=?,revision=revision+1,due_at=?,updated_at=? WHERE workspace_id=? AND id=? AND revision=?').bind(owner, JSON.stringify(participants), sensitivity, JSON.stringify(data), t, t, ctx.principal.workspaceId, cid, old.revision), ctx.env.DB.prepare('INSERT INTO intelligence_versions SELECT id,revision,workspace_id,data_json,?,? FROM intelligence_commitments WHERE id=? AND revision=? AND updated_at=?').bind(ctx.principal.userId, t, cid, rev, t)]);
        assert(result[0].meta.changes === 1, 'revision_conflict', 409);
    }
    else
        await ctx.env.DB.batch([ctx.env.DB.prepare('INSERT INTO intelligence_commitments VALUES(?,?,?,?,?,?,1,?,NULL,?,?)').bind(cid, ctx.principal.workspaceId, owner, JSON.stringify(participants), sensitivity, JSON.stringify(data), t, t, t), ctx.env.DB.prepare('INSERT INTO intelligence_versions VALUES(?,?,?,?,?,?)').bind(cid, 1, ctx.principal.workspaceId, JSON.stringify(data), ctx.principal.userId, t)]);
    await audit(ctx, 'commitment.saved', cid, { revision: rev });
    return getCommitment(ctx, cid);
}
export async function observationFacts(ctx: IntelligenceContext, c: Commitment): Promise<Fact[]> {
    await getCommitment(ctx, c.id);
    const rows = await ctx.env.DB.prepare('SELECT * FROM intelligence_observations WHERE workspace_id=? AND commitment_id=? AND revision=? ORDER BY created_at DESC LIMIT 500').bind(ctx.principal.workspaceId, c.id, c.revision).all<any>();
    return rows.results.map(r => ({ id: r.id, specId: r.spec_id, state: r.state, observedAt: r.observed_at, cohort: JSON.parse(r.cohort_json), evidence: JSON.parse(r.evidence_json) }));
}
export async function coverage(ctx: IntelligenceContext, key: string) {
    const c = await getCommitment(ctx, key), facts = await observationFacts(ctx, c);
    const at = Date.now();
    const dependencies = await Promise.all(c.data.dependencies.map(async (dependencyId) => {
        try {
            const dependency = await getCommitment(ctx, dependencyId), evidence = await observationFacts(ctx, dependency);
            return { id: dependencyId, state: dependency.data.observations.every(s => {
                    const f = evidence.find(f => f.specId === s.id);
                    return f?.state === 'verified' && at - Date.parse(f.observedAt) <= dependency.data.freshnessSeconds * 1000;
                }) ? 'verified' : 'unknown' };
        }
        catch {
            return { id: dependencyId, state: 'unknown' };
        }
    }));
    return { dependencies, commitmentId: key, revision: c.revision, outcome: c.data.outcome, coverage: c.data.observations.flatMap(spec => (spec.step.cohort || [spec.step.beneficiaryId]).map(cohort => {
            const f = facts.find(f => f.specId === spec.id && f.cohort.includes(cohort));
            return { specId: spec.id, cohort, state: !f ? 'absent' : at - Date.parse(f.observedAt) > c.data.freshnessSeconds * 1000 ? 'stale' : f.state, evidenceId: f?.id || null, observedAt: f?.observedAt || null };
        })), uncoveredCohorts: c.data.cohort.filter(person => !c.data.observations.some(s => (s.step.cohort || [s.step.beneficiaryId]).includes(person))) };
}
export async function runProbe(ctx: IntelligenceContext, c: Commitment, spec: ObservationSpec, runId?: string) {
    ctx = await current(ctx, ['owner', 'operator', 'hr', 'integration']);
    const hold: any = await ctx.env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id=?').bind(ctx.principal.workspaceId).first();
    assert(!JSON.parse(hold?.settings_json || '{}').executionHeld, 'execution_held', 409);
    const fresh = await getCommitment(ctx, c.id);
    assert(fresh.revision === c.revision, 'commitment_changed', 409);
    assert(fresh.data.observations.some(s => JSON.stringify(s) === JSON.stringify(spec)), 'unconfigured_probe_denied', 403);
    const attempt = id(), start = Date.now();
    await ctx.env.DB.prepare("INSERT INTO intelligence_attempts(id,workspace_id,actor_id,commitment_id,run_id,kind,state,charge_status,created_at) VALUES(?,?,?,?,?,'probe','running','unknown',?)").bind(attempt, ctx.principal.workspaceId, ctx.principal.userId, c.id, runId || null, now()).run();
    let state = 'uncertain', evidence: unknown, observedAt = '', code: string | null = null;
    try {
        const observation = await observeProbe(ctx, spec);
        ctx = await current(ctx, ['owner', 'operator', 'hr', 'integration']);
        assert((await getCommitment(ctx, c.id)).revision === c.revision, 'commitment_changed', 409);
        evidence = observation;
        observedAt = observation.observedAt;
        state = observation.usableWorkflow ? 'verified' : 'failed';
    }
    catch (e) {
        code = errorCode(e);
        state = 'uncertain';
        evidence = { error: code };
    }
    const oid = id(), at = now();
    await ctx.env.DB.batch([ctx.env.DB.prepare('INSERT INTO intelligence_observations VALUES(?,?,?,?,?,?,?,?,?,?)').bind(oid, ctx.principal.workspaceId, c.id, c.revision, spec.id, JSON.stringify(spec.step.cohort || [spec.step.beneficiaryId]), state, JSON.stringify(evidence), observedAt, at), ctx.env.DB.prepare('UPDATE intelligence_attempts SET state=?,elapsed_ms=?,error_code=?,finished_at=? WHERE id=?').bind(state, Date.now() - start, code, at, attempt)]);
    return { id: oid, specId: spec.id, state, evidence, observedAt, cohort: spec.step.cohort || [spec.step.beneficiaryId] };
}
export async function observeCommitment(ctx: IntelligenceContext, key: string) {
    const c = await getCommitment(ctx, key);
    assert(c.data.effectiveAt <= now() && (!c.data.expiresAt || c.data.expiresAt > now()), 'commitment_inactive', 409);
    await Promise.allSettled(c.data.observations.map(s => runProbe(ctx, c, s)));
    await ctx.env.DB.prepare('UPDATE intelligence_commitments SET due_at=? WHERE id=? AND workspace_id=? AND revision=?').bind(new Date(Date.now() + c.data.intervalSeconds * 1000).toISOString(), key, ctx.principal.workspaceId, c.revision).run();
    return coverage(ctx, key);
}

import { currentPrincipal } from '../work/identity';
import { assertCalendarSchedule, emergencySchedulingActor } from './calendar';
import type { Env, Principal } from '../../platform/types';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { create, date, getService, list, mutate, strings, type ServiceRecord, dto, type RecordRow } from './store';
export interface ChangeInvocation {
    id: string;
    changeId: string;
    changeRevision: number;
    implementationRevision: number;
    phase: 'canary' | 'rollout' | 'compensate';
    implementation: unknown;
    cohorts: string[];
    grantReferences: unknown[];
    idempotencyKey: string;
}
export interface ChangeExecutionPort {
    invoke(env: Env, p: Principal, input: ChangeInvocation): Promise<{
        executionId: string;
        state: string;
    }>;
    inspect(env: Env, p: Principal, executionId: string): Promise<{
        state: string;
        independent: boolean;
        verifiedCohorts: string[];
        failedCohorts: string[];
        unknownCohorts: string[];
        evidenceIds: string[];
    }>;
    authorize(env: Env, p: Principal, change: ServiceRecord, phase: string): Promise<void>;
}
let execution: ChangeExecutionPort | undefined;
export function setChangeExecutionPort(port: ChangeExecutionPort) { execution = port; }
export function windowsOverlap(a: {
    start: string;
    end: string;
}, b: {
    start: string;
    end: string;
}) { return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end); }
export async function validateChange(db: D1Database, p: Principal, b: Record<string, any>) {
    const services = strings(b.services, 'services');
    for (const s of services)
        await getService(db, p, s, 'service');
    const window = { start: date(b.window?.start, 'window.start'), end: date(b.window?.end, 'window.end') };
    if (Date.parse(window.start) >= Date.parse(window.end))
        throw new ApiError(400, 'window', 'Change window must have positive duration');
    const cohorts = strings(b.cohorts, 'cohorts'), canary = strings(b.canaryCohorts, 'canaryCohorts');
    if (canary.some(c => !cohorts.includes(c)))
        throw new ApiError(400, 'cohort', 'Canary must be within affected cohorts');
    if (!b.implementation || typeof b.implementation !== 'object' || !b.compensation || typeof b.compensation !== 'object')
        throw new ApiError(400, 'implementation', 'Exact implementation and compensation plans required');
    const dependencies = Array.isArray(b.dependencies) ? b.dependencies : [];
    for (const d of dependencies)
        await getService(db, p, d, 'change');
    return { title: requiredString(b.title, 'title'), risk: requiredString(b.risk, 'risk'), impact: requiredString(b.impact, 'impact'), services, window, cohorts, canaryCohorts: canary, dependencies, implementation: b.implementation, compensation: b.compensation, emergency: b.emergency === true, emergencyReason: b.emergency ? requiredString(b.emergencyReason, 'emergencyReason') : null, emergencySchedulingActor: emergencySchedulingActor(p,b) };
}
export async function newChange(db: D1Database, p: Principal, b: Record<string, any>) {
    p=await currentPrincipal(db,p);
    const data={...await validateChange(db,p,b),implementationRevision:1,state:'draft',authorizations:[],invocations:[]};
    await assertCalendarSchedule(db,p,data);
    try { return await create(db,p,'change',data,{visibility:b.visibility,participants:b.participants}); }
    catch(error) { throw calendarError(error); }
}
function calendarError(error:unknown) {
    if(String(error).includes('calendar_frozen'))return new ApiError(409,'calendar_frozen','Scheduling is blocked by calendar policy; current owner emergency authority and a reason are required');
    if(String(error).includes('calendar_schedule_invalid'))return new ApiError(422,'calendar_schedule_invalid','A valid scheduled window and configuration items are required');
    return error;
}
export async function editChange(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    p=await currentPrincipal(db,p);
    if ((r.data.invocations || []).some((i: any) => !['verified', 'failed', 'cancelled'].includes(i.state)))
        throw new ApiError(409, 'in_flight', 'Reconcile active effects before changing implementation');
    const data={...r.data,...await validateChange(db,p,{...r.data,...b}),emergencySchedulingActor:emergencySchedulingActor(p,b),implementationRevision:r.data.implementationRevision+1,state:'draft',authorizations:[],priorAuthorizations:[...(r.data.priorAuthorizations||[]),...(r.data.authorizations||[])]};
    await assertCalendarSchedule(db,p,data);
    try { return await mutate(db,p,r,b.revision,data,'implementation-amended'); }
    catch(error) { throw calendarError(error); }
}
export async function authorizeChange(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    if (!p.roles.some(x => ['owner', 'approver'].includes(x)))
        throw new ApiError(403, 'authority', 'Approver required');
    if (r.ownerId === p.userId && !p.roles.includes('owner'))
        throw new ApiError(403, 'separation', 'Independent approver required');
    const refs = b.grantReferences;
    if (!Array.isArray(refs) || !refs.length || refs.some((x: any) => !x.id || !Number.isInteger(x.version)))
        throw new ApiError(400, 'grants', 'Versioned grant references required');
    const decision = { id: id(), actor: p.userId, implementationRevision: r.data.implementationRevision, grantReferences: refs, emergency: r.data.emergency, reason: requiredString(b.reason, 'reason'), at: now() };
    return mutate(db, p, r, b.revision, { ...r.data, state: 'authorized', authorizations: [...(r.data.authorizations || []), decision] }, 'change-decision');
}
export async function changeGate(db: D1Database, p: Principal, r: ServiceRecord, phase: string, at = Date.now()) {
    const d = r.data;
    if(phase!=='compensate')await assertCalendarSchedule(db,p,d);
    if (!d.authorizations?.some((a: any) => a.implementationRevision === d.implementationRevision))
        throw new ApiError(409, 'authorization', 'Current implementation requires a decision');
    if (phase !== 'compensate' && (at < Date.parse(d.window.start) || at >= Date.parse(d.window.end)))
        throw new ApiError(409, 'window', 'Outside authorized change window');
    for (const dependency of d.dependencies) {
        const dep = await getService(db, p, dependency, 'change');
        if (dep.data.state !== 'verified')
            throw new ApiError(409, 'dependency', 'Dependency is not independently verified');
    }
    const all = (await db.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind='change'").bind(p.workspaceId).all<RecordRow>()).results.map(dto);
    const conflicts = all.filter(c => c.id !== r.id && c.data.services.some((s: string) => d.services.includes(s)) && windowsOverlap(c.data.window, d.window) && !['draft', 'cancelled', 'verified', 'compensated'].includes(c.data.state));
    if (conflicts.length && phase !== 'compensate')
        throw new ApiError(409, 'conflicting_change', 'An affected service has another active change window');
    if (phase === 'rollout' && !d.invocations.some((i: any) => i.phase === 'canary' && i.state === 'verified' && i.implementationRevision === d.implementationRevision))
        throw new ApiError(409, 'canary', 'Verified current canary required');
    if (phase === 'compensate' && !d.invocations.some((i: any) => ['canary', 'rollout'].includes(i.phase)))
        throw new ApiError(409, 'effects', 'No implementation attempt to compensate');
    return true;
}
export async function dispatchChange(env: Env, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    const phase = b.phase;
    if (!['canary', 'rollout', 'compensate'].includes(phase))
        throw new ApiError(400, 'phase', 'Choose canary, rollout or compensate');
    const key = requiredString(b.idempotencyKey, 'idempotencyKey');
    const existing = r.data.invocations.find((i: any) => i.idempotencyKey === key);
    if (existing) {
        if (existing.phase !== phase || existing.implementationRevision !== r.data.implementationRevision)
            throw new ApiError(409, 'idempotency_conflict', 'Command key belongs to another phase or implementation');
        return r;
    }
    if (r.data.invocations.some((i: any) => ['dispatching', 'unknown', 'queued', 'running'].includes(i.state)))
        throw new ApiError(409, 'pending_effects', 'Reconcile outstanding effects before another dispatch');
    if (phase !== 'compensate' && r.data.invocations.some((i: any) => i.phase === phase && i.implementationRevision === r.data.implementationRevision))
        throw new ApiError(409, 'phase_already_attempted', 'Reconcile or amend the previous phase attempt');
    await changeGate(env.DB, p, r, phase);
    if (!execution)
        return mutate(env.DB, p, r, b.revision, { ...r.data, state: 'needs_configuration', exception: 'Controlled execution adapter is not configured' }, 'execution-unavailable');
    await execution.authorize(env, p, r, phase);
    const invocation: ChangeInvocation = { id: id(), changeId: r.id, changeRevision: r.revision + 1, implementationRevision: r.data.implementationRevision, phase, implementation: phase === 'compensate' ? r.data.compensation : r.data.implementation, cohorts: phase === 'canary' ? r.data.canaryCohorts : r.data.cohorts, grantReferences: r.data.authorizations.at(-1).grantReferences, idempotencyKey: key };
    await env.DB.batch(r.data.services.map((service: string) => env.DB.prepare('INSERT INTO svc_change_locks(workspace_id,service_id,change_id) VALUES(?,?,?) ON CONFLICT(workspace_id,service_id) DO UPDATE SET change_id=excluded.change_id WHERE svc_change_locks.change_id=excluded.change_id').bind(p.workspaceId, service, r.id)));
    for (const service of r.data.services) {
        const lock = await env.DB.prepare('SELECT change_id FROM svc_change_locks WHERE workspace_id=? AND service_id=?').bind(p.workspaceId, service).first<{
            change_id: string;
        }>();
        if (lock?.change_id !== r.id)
            throw new ApiError(409, 'resource_busy', 'Affected service is fenced by another change');
    }
    let next:ServiceRecord;
    try {next=await mutate(env.DB,p,r,b.revision,{...r.data,state:'dispatching',invocations:[...r.data.invocations,{...invocation,state:'dispatching'}]},'execution-intent');}
    catch(error) {
        if(String(error).includes('calendar_frozen'))await env.DB.prepare(`DELETE FROM svc_change_locks WHERE workspace_id=? AND change_id=?
          AND EXISTS(SELECT 1 FROM svc_records r WHERE r.workspace_id=svc_change_locks.workspace_id AND r.id=svc_change_locks.change_id
            AND json_array_length(r.data_json,'$.invocations')=0)`)
          .bind(p.workspaceId,r.id).run();
        throw calendarError(error);
    }
    try {
        const result = await execution.invoke(env, p, invocation);
        next = await mutate(env.DB, p, next, next.revision, { ...next.data, state: result.state, invocations: next.data.invocations.map((i: any) => i.id === invocation.id ? { ...i, ...result } : i) }, 'execution-dispatched');
    }
    catch (e) {
        next = await mutate(env.DB, p, next, next.revision, { ...next.data, state: 'unknown', invocations: next.data.invocations.map((i: any) => i.id === invocation.id ? { ...i, state: 'unknown', error: 'Dispatch outcome requires reconciliation' } : i) }, 'execution-unknown');
    }
    return next;
}
export async function verifyChange(env: Env, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    if (!execution)
        throw new ApiError(503, 'configuration', 'Execution adapter not configured');
    const invocation = r.data.invocations.find((i: any) => i.id === b.invocationId);
    if (!invocation?.executionId)
        throw new ApiError(409, 'execution', 'No admitted execution reference');
    const result = await execution.inspect(env, p, invocation.executionId);
    const complete = result.independent && result.evidenceIds.length > 0 && result.failedCohorts.length === 0 && result.unknownCohorts.length === 0 && invocation.cohorts.every((c: string) => result.verifiedCohorts.includes(c));
    const state = complete ? 'verified' : result.failedCohorts.length ? 'failed' : 'unresolved';
    const invocations = r.data.invocations.map((i: any) => i.id === invocation.id ? { ...i, state, evidenceIds: result.evidenceIds, verifiedCohorts: result.verifiedCohorts, failedCohorts: result.failedCohorts, unknownCohorts: result.unknownCohorts } : i);
    const updated = await mutate(env.DB, p, r, b.revision, { ...r.data, invocations, state: complete ? (invocation.phase === 'rollout' ? 'verified' : invocation.phase === 'compensate' ? 'compensated' : 'canary-verified') : invocation.phase === 'compensate' ? 'compensation-incomplete' : state }, 'execution-verification');
    if (complete && ['rollout', 'compensate'].includes(invocation.phase))
        await env.DB.prepare('DELETE FROM svc_change_locks WHERE workspace_id=? AND change_id=?').bind(p.workspaceId, r.id).run();
    return updated;
}

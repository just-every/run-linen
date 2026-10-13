import type { Principal } from '../../platform/types';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { create, getService, list, mutate, number, strings, type ServiceRecord } from './store';
export interface RecoveryEvidence {
    evidenceId: string;
    incidentId: string;
    serviceId: string;
    cohort: string;
    observedAt: string;
    expiresAt: string;
    verifierVersion: string;
    independent: boolean;
    usable: boolean;
    negativeChecksPassed: boolean;
    executionId: string;
    source: string;
}
export async function newIncident(db: D1Database, p: Principal, b: Record<string, any>) { const service = await getService(db, p, requiredString(b.serviceId, 'serviceId'), 'service'); return create(db, p, 'incident', { title: requiredString(b.title, 'title'), serviceId: service.id, impact: requiredString(b.impact, 'impact'), cohorts: strings(b.cohorts, 'cohorts'), status: 'investigating', followupWindowMs: number(b.followupWindowMs ?? 604800000, 'followupWindowMs', 60000), monitorEventKey: b.monitorEventKey || null, commander: p.userId, cadenceMs: number(b.cadenceMs ?? 1800000, 'cadenceMs', 60000), nextUpdateAt: now(), links: [], diagnostics: [], recoveries: [], updates: [] }, { visibility: b.visibility || service.visibility, participants: b.participants }); }
export async function linkIncident(db: D1Database, p: Principal, incidentId: string, revision: number, employeeIncidentId: string, correction = false) {
    const r = await getService(db, p, incidentId, 'incident');
    const work = await db.prepare('SELECT requester_id,beneficiary_id,sensitivity,kind FROM work_records WHERE workspace_id=? AND id=?').bind(p.workspaceId, employeeIncidentId).first<any>();
    if (!work || work.kind !== 'incident' || (work.sensitivity === 'hr' && !p.roles.some(x => ['owner', 'hr'].includes(x))) || (!p.roles.some(x => ['owner', 'operator'].includes(x)) && work.requester_id !== p.userId && work.beneficiary_id !== p.userId))
        throw new ApiError(404, 'work_scope', 'Accessible employee incident required');
    const links = (r.data.links || []).filter((x: any) => x.employeeIncidentId !== employeeIncidentId);
    if (!correction)
        links.push({ employeeIncidentId, linkedBy: p.userId, linkedAt: now(), recovery: 'unverified' });
    return mutate(db, p, r, revision, { ...r.data, links }, correction ? 'link-corrected' : 'incident-linked', true);
}
export async function recordVerifiedRecovery(db: D1Database, p: Principal, r: ServiceRecord, evidence: RecoveryEvidence[], trustedAdmission: (e: RecoveryEvidence) => Promise<boolean>) {
    if (r.kind !== 'incident')
        throw new ApiError(400, 'kind', 'Incident required');
    const admitted: RecoveryEvidence[] = [];
    for (const e of evidence) {
        if (e.incidentId !== r.id || e.serviceId !== r.data.serviceId || !r.data.cohorts.includes(e.cohort) || !e.independent || !e.usable || !e.negativeChecksPassed || Date.parse(e.observedAt) > Date.now() || (!Number.isFinite(Date.parse(e.expiresAt)) || Date.parse(e.expiresAt) <= Date.now() || Date.parse(e.expiresAt) <= Date.parse(e.observedAt)) || !Number.isFinite(Date.parse(e.observedAt)) || !e.verifierVersion || !await trustedAdmission(e))
            throw new ApiError(422, 'unverified_recovery', 'Fresh independent execution-admitted usable-work evidence required');
        admitted.push(e);
    }
    const recoveries = [...(r.data.recoveries || []), ...admitted];
    const missing = r.data.cohorts.filter((cohort: string) => !recoveries.some((e: RecoveryEvidence) => e.cohort === cohort && Date.parse(e.expiresAt) > Date.now()));
    return mutate(db, p, r, r.revision, { ...r.data, recoveries, status: missing.length ? 'partially-restored' : 'restored', restoredAt: missing.length ? null : now(), unresolvedCohorts: missing }, 'recovery-observed');
}
export async function updateIncident(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    const message = requiredString(b.message, 'message', 10000);
    const audience = strings(b.recipientIds, 'recipientIds');
    for (const user of audience) {
        const member = await db.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(p.workspaceId, user).first<{
            roles_json: string;
        }>();
        if (!member)
            throw new ApiError(400, 'recipient', 'Active recipient required');
        if (r.visibility === 'restricted' && user !== r.ownerId && !r.participants.includes(user) && !JSON.parse(member.roles_json).includes('owner'))
            throw new ApiError(403, 'audience', 'Recipient cannot read this incident');
    }
    const next = await mutate(db, p, r, b.revision, { ...r.data, updates: [...(r.data.updates || []), { id: id(), message, audience, at: now(), author: p.userId }], nextUpdateAt: new Date(Date.now() + r.data.cadenceMs).toISOString() }, 'update-published');
    await db.batch(audience.map(user => db.prepare('INSERT OR IGNORE INTO svc_outbox(id,workspace_id,record_id,recipient_id,kind,payload_json,next_at) VALUES(?,?,?,?,?,?,?)').bind(id(), p.workspaceId, r.id, user, 'incident-update:' + next.data.updates.at(-1).id, JSON.stringify({ message, revision: next.revision }), next.data.updates.at(-1).at)));
    return next;
}
export async function assignDiagnostic(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    const assignee = requiredString(b.assignee, 'assignee');
    const member = await db.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(p.workspaceId, assignee).first<{
        roles_json: string;
    }>();
    if (!member || !JSON.parse(member.roles_json).some((x: string) => ['owner', 'operator'].includes(x)))
        throw new ApiError(400, 'assignee', 'Active operator required');
    if (r.visibility === 'restricted' && assignee !== r.ownerId && !r.participants.includes(assignee))
        throw new ApiError(403, 'scope', 'Diagnostic assignee lacks incident access');
    const task = { id: id(), assignee, scope: requiredString(b.scope, 'scope'), hypothesis: requiredString(b.hypothesis, 'hypothesis'), budget: number(b.budget, 'budget'), readOnly: true, status: 'assigned', createdAt: now() };
    return mutate(db, p, r, b.revision, { ...r.data, diagnostics: [...(r.data.diagnostics || []), task] }, 'diagnostic-assigned');
}
export async function incidentCandidates(db: D1Database, p: Principal, serviceId: string) { return (await list(db, p, 'incident')).filter(r => r.data.serviceId === serviceId && !['restored', 'closed'].includes(r.data.status)).map(r => ({ id: r.id, title: r.data.title, impact: r.data.impact, reason: 'Same recorded service; correlation is a candidate, not a confirmed link' })); }
export async function diagnosticFinding(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    const task = r.data.diagnostics.find((d: any) => d.id === b.diagnosticId);
    if (!task || task.assignee !== p.userId && !p.roles.includes('owner'))
        throw new ApiError(403, 'diagnostic_owner', 'Assigned diagnostic owner required');
    const finding = { id: id(), source: requiredString(b.source, 'source'), finding: requiredString(b.finding, 'finding'), evidenceIds: strings(b.evidenceIds, 'evidenceIds'), hypothesisResult: requiredString(b.hypothesisResult, 'hypothesisResult'), remainingUncertainty: requiredString(b.remainingUncertainty, 'remainingUncertainty'), observedAt: now(), cost: number(b.cost, 'cost') };
    return mutate(db, p, r, b.revision, { ...r.data, diagnostics: r.data.diagnostics.map((d: any) => d.id === task.id ? { ...d, status: 'reported', findings: [...(d.findings || []), finding] } : d) }, 'diagnostic-finding');
}
export async function incidentFollowup(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    if (r.data.status !== 'restored')
        throw new ApiError(409, 'recovery', 'Verified restored incident required');
    const completeThrough = requiredString(b.completeThrough, 'completeThrough');
    if (!Number.isFinite(Date.parse(completeThrough)) || Date.parse(completeThrough) > Date.now() || Date.parse(completeThrough) < Date.parse(r.data.restoredAt))
        throw new ApiError(400, 'followup', 'Follow-up must cover an observed past period');
    const recurrenceIds = Array.isArray(b.recurrenceIncidentIds) ? b.recurrenceIncidentIds : [];
    for (const key of recurrenceIds) {
        const next = await getService(db, p, key, 'incident');
        if (next.data.serviceId !== r.data.serviceId || next.id === r.id)
            throw new ApiError(400, 'recurrence', 'Recurrence must be a later incident on the same service');
    }
    ;
    return mutate(db, p, r, b.revision, { ...r.data, followup: { completeThrough, source: requiredString(b.source, 'source'), exposureHours: number(b.exposureHours, 'exposureHours'), recurrenceIncidentIds: recurrenceIds, causeEvidence: requiredString(b.causeEvidence, 'causeEvidence'), recordedBy: p.userId, recordedAt: now() } }, 'followup-observed');
}

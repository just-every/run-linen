import type { Principal } from '../../platform/types';
import { ApiError, now, requiredString } from '../../platform/http';
import { dto, getService, mutate, type RecordRow, type ServiceRecord } from './store';

/** Temporal correlation is a suspected cause only; it never establishes causation. */
export async function suspectedChanges(db: D1Database, p: Principal, serviceId: string, at: string) {
    const rows = await db.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind='change' AND visibility='operators'").bind(p.workspaceId).all<RecordRow>();
    return rows.results.map(dto).filter(r => r.data.state !== 'imported-review' && r.data.services.includes(serviceId)
        && r.data.implementationStartedAt && Date.parse(at) >= Date.parse(r.data.implementationStartedAt)
        && Date.parse(at) <= Date.parse(r.data.implementationStartedAt) + (r.data.observationWindowMs ?? 86400000))
        .map(r => ({ changeId: r.id, implementationRevision: r.data.implementationRevision, state: 'suspected', detectedAt: now() }));
}
export async function reviewChangeCause(db: D1Database, p: Principal, incident: ServiceRecord, b: Record<string, any>) {
    const candidate = (incident.data.suspectedChanges || []).find((c: any) => c.changeId === b.changeId);
    if (!candidate || !['confirmed', 'rejected'].includes(b.decision)) throw new ApiError(422, 'change_cause', 'Choose a suspected change and confirm or reject its cause');
    if (b.decision === 'confirmed' && incident.data.changeCause && incident.data.changeCause.changeId !== b.changeId) throw new ApiError(409, 'cause_conflict', 'Review the current confirmed cause before confirming another change');
    const change = await getService(db, p, candidate.changeId, 'change');
    if (change.data.implementationRevision !== candidate.implementationRevision) throw new ApiError(409, 'implementation_changed', 'Review the recorded implementation before assessing its cause');
    const evidenceIds = Array.isArray(b.evidenceIds) ? [...new Set(b.evidenceIds)] : [];
    if (!evidenceIds.length || evidenceIds.some(id => typeof id !== 'string' || !id)) throw new ApiError(422, 'cause_evidence', 'Causal evidence references required');
    const assessment = { ...candidate, state: b.decision, evidenceIds, reason: requiredString(b.reason, 'reason'), reviewedBy: p.userId, reviewedAt: now() };
    return mutate(db, p, incident, b.revision, { ...incident.data,
        suspectedChanges: incident.data.suspectedChanges.map((c: any) => c.changeId === candidate.changeId ? assessment : c),
        ...(b.decision === 'confirmed' ? { changeCause: assessment } : incident.data.changeCause?.changeId === candidate.changeId ? { changeCause: null } : {}) }, 'change-cause-reviewed');
}

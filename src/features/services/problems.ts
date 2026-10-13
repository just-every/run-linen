import type { Principal } from '../../platform/types';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { create, date, getService, mutate, strings, type ServiceRecord } from './store';
export async function newProblem(db: D1Database, p: Principal, b: Record<string, any>) {
    const service = await getService(db, p, requiredString(b.serviceId, 'serviceId'), 'service');
    const incidents = strings(b.incidentIds, 'incidentIds');
    for (const key of incidents) {
        const incident = await getService(db, p, key, 'incident');
        if (incident.data.serviceId !== service.id)
            throw new ApiError(400, 'scope', 'Problem incidents must belong to the service');
        if (incident.visibility === 'restricted' && b.visibility !== 'restricted')
            throw new ApiError(403, 'privacy', 'Restricted incident requires restricted problem');
    }
    ;
    return create(db, p, 'problem', { title: requiredString(b.title, 'title'), serviceId: service.id, incidentIds: incidents, cause: null, causeState: 'unknown', workarounds: [], preventionChangeId: null, preventionState: 'unverified' }, { visibility: b.visibility || service.visibility, participants: b.participants });
}
export async function knownError(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) { return mutate(db, p, r, b.revision, { ...r.data, cause: requiredString(b.cause, 'cause'), causeEvidence: strings(b.evidenceIds, 'evidenceIds'), causeState: 'known-error', reviewedBy: p.userId, reviewedAt: now() }, 'known-error-reviewed'); }
export async function addWorkaround(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    const w = { id: id(), text: requiredString(b.text, 'text', 10000), cohorts: strings(b.cohorts, 'cohorts'), contraindications: requiredString(b.contraindications, 'contraindications'), source: requiredString(b.source, 'source'), reviewedBy: p.userId, reviewedAt: now(), expiresAt: date(b.expiresAt, 'expiresAt') };
    if (Date.parse(w.expiresAt) <= Date.now())
        throw new ApiError(400, 'expiry', 'Future review expiry required');
    return mutate(db, p, r, b.revision, { ...r.data, workarounds: [...r.data.workarounds, w] }, 'workaround-reviewed');
}
export async function linkPrevention(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    const change = await getService(db, p, requiredString(b.changeId, 'changeId'), 'change');
    if (!change.data.services.includes(r.data.serviceId))
        throw new ApiError(400, 'scope', 'Preventive change must cover this service');
    return mutate(db, p, r, b.revision, { ...r.data, preventionChangeId: change.id, preventionState: change.data.state === 'verified' ? 'implemented-effectiveness-pending' : 'pending' }, 'prevention-linked');
}
export function visibleWorkarounds(r: ServiceRecord, at = Date.now()) { return r.data.workarounds.map((w: any) => ({ ...w, stale: Date.parse(w.expiresAt) <= at, usable: Date.parse(w.expiresAt) > at })); }

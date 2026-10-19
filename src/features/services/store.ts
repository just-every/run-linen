import { assertProblemSources } from './problem-source-access';
import type { Principal } from '../../platform/types';
import { ApiError, id, now } from '../../platform/http';
export type Kind = 'application' | 'calendar-window' | 'problem-proposal' | 'service' | 'edge' | 'incident' | 'problem' | 'change' | 'supplier' | 'asset' | 'monitor' | 'oncall' | 'decision' | 'person';
export interface RecordRow {
    id: string;
    workspace_id: string;
    kind: Kind;
    owner_id: string;
    visibility: string;
    participants_json: string;
    data_json: string;
    revision: number;
    created_at: string;
    updated_at: string;
}
export interface ServiceRecord {
    id: string;
    kind: Kind;
    ownerId: string;
    visibility: string;
    participants: string[];
    data: Record<string, any>;
    revision: number;
    createdAt: string;
    updatedAt: string;
}
export const dto = (r: RecordRow): ServiceRecord => ({ id: r.id, kind: r.kind, ownerId: r.owner_id, visibility: r.visibility, participants: JSON.parse(r.participants_json), data: JSON.parse(r.data_json), revision: r.revision, createdAt: r.created_at, updatedAt: r.updated_at });
export const staff = (p: Principal) => p.roles.some(r => ['owner', 'operator'].includes(r));
export function readable(p: Principal, r: ServiceRecord) { if (r.visibility==='restricted' && (r.kind==='problem-proposal' || (r.kind==='problem' && r.data.sourceProposalId))) return r.ownerId===p.userId; return p.roles.includes('owner') || r.ownerId === p.userId || r.participants.includes(p.userId) || (r.visibility === 'workspace') || (r.visibility === 'operators' && p.roles.some(x => ['operator', 'auditor'].includes(x))); }
export function writable(p: Principal, r: ServiceRecord) { return p.roles.includes('owner') || ((staff(p) || p.roles.includes('approver')) && readable(p, r)) || (r.kind === 'decision' && r.data.holderId === p.userId) || r.ownerId === p.userId; }
export async function getService(db: D1Database, p: Principal, id: string, kind?: Kind) {
    const raw = await db.prepare('SELECT * FROM svc_records WHERE workspace_id=? AND id=?').bind(p.workspaceId, id).first<RecordRow>();
    if (!raw)
        throw new ApiError(404, 'not_found', 'Record not found');
    const r = dto(raw);
    if (!readable(p, r) || kind && r.kind !== kind)
        throw new ApiError(404, 'not_found', 'Record not found');
    if (r.kind === 'problem' && r.data.sourceProposalId) await assertProblemSources(db,p,r);
    return r;
}
export async function list(db: D1Database, p: Principal, kind: Kind) {
    const rows = await db.prepare('SELECT * FROM svc_records WHERE workspace_id=? AND kind=? ORDER BY updated_at DESC LIMIT 1000').bind(p.workspaceId, kind).all<RecordRow>();
    const visible = [];
    for (const record of rows.results.map(dto).filter(r=>readable(p,r))) {
        try { if (record.kind==='problem' && record.data.sourceProposalId) await assertProblemSources(db,p,record); visible.push(record); }
        catch (error) { if (!(error instanceof ApiError) || ![403,404].includes(error.status)) throw error; }
    }
    return visible;
}

export async function create(db: D1Database, p: Principal, kind: Kind, data: Record<string, any>, scope: {
    visibility?: string;
    participants?: string[];
    ownerId?: string;
} = {}) {
    if (!staff(p))
        throw new ApiError(403, 'forbidden', 'Service operator required');
    const t = now(), key = id();
    const visibility = scope.visibility || 'operators';
    if (!['workspace', 'operators', 'restricted'].includes(visibility))
        throw new ApiError(400, 'visibility', 'Invalid visibility');
    const owner = scope.ownerId || p.userId;
    const participants = scope.participants || [];
    if (!Array.isArray(participants) || participants.length > 1000 || participants.some(x => typeof x !== 'string'))
        throw new ApiError(400, 'participants', 'Member ID list required');
    for (const user of [owner, ...participants])
        if (!await db.prepare('SELECT user_id FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(p.workspaceId, user).first())
            throw new ApiError(400, 'member', 'Active workspace member required');
    await db.batch([db.prepare('INSERT INTO svc_records VALUES(?,?,?,?,?,?,?,1,?,?)').bind(key, p.workspaceId, kind, owner, visibility, JSON.stringify(participants), JSON.stringify(data), t, t), db.prepare('INSERT INTO svc_events VALUES(?,?,?,?,?,?,?)').bind(id(), p.workspaceId, key, p.userId, 'created', JSON.stringify({ kind }), t)]);
    return getService(db, p, key);
}
export async function mutate(db: D1Database, p: Principal, r: ServiceRecord, revision: unknown, data: Record<string, any>, event: string, domainAuthorized = false) {
    if (!domainAuthorized && !writable(p, r))
        throw new ApiError(403, 'forbidden', 'Record owner or scoped operator required');
    if (revision !== r.revision)
        throw new ApiError(409, 'revision_conflict', 'Reload the current revision');
    const t = now();
    const result = await db.batch([db.prepare('UPDATE svc_records SET data_json=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?').bind(JSON.stringify(data), t, p.workspaceId, r.id, r.revision), db.prepare('INSERT INTO svc_events SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(id(), p.workspaceId, r.id, p.userId, event, JSON.stringify({ from: r.revision, to: r.revision + 1 }), t)]);
    if (result[0].meta.changes !== 1)
        throw new ApiError(409, 'revision_conflict', 'Concurrent update');
    return getService(db, p, r.id);
}
export function date(value: unknown, name: string) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
        throw new ApiError(400, 'date', `${name} requires an ISO date`);
    return new Date(value).toISOString();
}
export function strings(value: unknown, name: string) {
    if (!Array.isArray(value) || !value.length || value.length > 1000 || value.some(x => typeof x !== 'string' || !x))
        throw new ApiError(400, 'field', `${name} requires nonempty string list`);
    return [...new Set(value)] as string[];
}
export function number(value: unknown, name: string, min = 0) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min)
        throw new ApiError(400, 'field', `${name} must be at least ${min}`);
    return value;
}

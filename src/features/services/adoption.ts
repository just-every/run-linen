import type { Env, Principal } from '../../platform/types';
import { ApiError, id, now } from '../../platform/http';
import { type Kind } from './store';
const kinds: Kind[] = ['calendar-window','problem-proposal', 'service', 'edge', 'incident', 'problem', 'change', 'supplier', 'asset', 'monitor', 'oncall', 'decision', 'person'];
export async function restoreAdoptionRecord(ctx: {
    env: Env;
    principal: Principal;
}, input: {
    table: string;
    row: Record<string, any>;
    sourceId: string;
    sourceKey: string;
}) {
    const { env, principal: p } = ctx;
    if (!p.roles.includes('owner'))
        throw new ApiError(403, 'owner', 'Owner restore required');
    const member = await env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(p.workspaceId, p.userId).first<{
        roles_json: string;
    }>();
    if (!member || !JSON.parse(member.roles_json).includes('owner'))
        throw new ApiError(403, 'owner', 'Active owner required');
    const setting = await env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id=?').bind(p.workspaceId).first<{
        settings_json: string;
    }>();
    if (!setting || JSON.parse(setting.settings_json).executionHeld !== true)
        throw new ApiError(409, 'restore_hold', 'Execution hold must precede restore');
    const row = input.row;
    if (!input.sourceId || !input.sourceKey || typeof row.id !== 'string')
        throw new ApiError(422, 'restore_identity', 'Source and stable record identity required');
    if (input.table === 'svc_events') {
        const existing=await env.DB.prepare('SELECT workspace_id,record_id,data_json FROM svc_events WHERE id=?').bind(row.id).first<any>();if(existing&&(existing.workspace_id!==p.workspaceId||existing.record_id!==row.record_id||existing.data_json!==row.data_json))throw new ApiError(409,'restore_collision','History identity must not overwrite another record');
        const record = await env.DB.prepare('SELECT id FROM svc_records WHERE workspace_id=? AND id=?').bind(p.workspaceId, row.record_id).first();
        if (!record)
            throw new ApiError(409, 'restore_dependency', 'Restore parent record first');
        await env.DB.prepare('INSERT OR IGNORE INTO svc_events VALUES(?,?,?,?,?,?,?)').bind(row.id, p.workspaceId, row.record_id, row.actor_id || p.userId, row.kind || 'imported', typeof row.data_json === 'string' ? row.data_json : JSON.stringify(row.data || {}), row.created_at || now()).run();
        return { id: row.id, restored: true, inert: true };
    }
    if (input.table !== 'svc_records')
        throw new ApiError(422, 'restore_table', 'Only service records and history can be restored; notifications and execution locks are not imported');
    if (!kinds.includes(row.kind) || !['workspace', 'operators', 'restricted'].includes(row.visibility) || !Number.isInteger(row.revision) || row.revision < 1)
        throw new ApiError(422, 'restore_record', 'Valid kind, privacy and revision required');
    let data: Record<string, any>, participants: string[];
    try {
        data = JSON.parse(row.data_json);
        participants = JSON.parse(row.participants_json);
    }
    catch {
        throw new ApiError(422, 'restore_json', 'Invalid record JSON');
    }
    ;
    if (!data || typeof data !== 'object' || !Array.isArray(participants) || participants.some(v => typeof v !== 'string'))
        throw new ApiError(422, 'restore_shape', 'Invalid record data or participants');
    const duplicate = await env.DB.prepare('SELECT workspace_id,data_json FROM svc_records WHERE id=?').bind(row.id).first<{
        workspace_id: string;
        data_json: string;
    }>();
    if (duplicate) {
        if (duplicate.workspace_id !== p.workspaceId)
            throw new ApiError(409, 'identity_collision', 'Record identity belongs to another workspace');
        const prior = JSON.parse(duplicate.data_json).adoption;
        if (prior?.sourceId === input.sourceId && prior?.sourceKey === input.sourceKey)
            return { id: row.id, restored: true, duplicate: true, inert: true };
        throw new ApiError(409, 'restore_collision', 'Existing owner record must not be overwritten');
    }
    data.adoption = { sourceId: input.sourceId, sourceKey: input.sourceKey, restoredAt: now(), historical: true };
    if(row.kind==='calendar-window')data.active=false;
    if (row.kind === 'change') {
        data.emergencySchedulingActor=null;
        data.priorAuthorizations = [...(data.priorAuthorizations || []), ...(data.authorizations || [])];
        data.authorizations = [];
        data.importedState = data.state;
        data.state = 'imported-review';
        data.invocations = (data.invocations || []).map((i: any) => ({ ...i, imported: true }));
    }
    if (row.kind === 'monitor') {
        data.status = 'unknown';
        data.connectionId = null;
        data.exception = 'Restored monitoring requires current connection validation';
    }
    if (row.kind === 'decision') {
        data.importedState = data.state;
        data.state = 'needs-review';
        data.nextDueAt = null;
    }
    await env.DB.batch([env.DB.prepare('INSERT INTO svc_records VALUES(?,?,?,?,?,?,?,?,?,?)').bind(row.id, p.workspaceId, row.kind, row.owner_id, row.visibility, JSON.stringify(participants), JSON.stringify(data), row.revision, row.created_at, row.updated_at), env.DB.prepare('INSERT INTO svc_events VALUES(?,?,?,?,?,?,?)').bind(id(), p.workspaceId, row.id, p.userId, 'restored-history', JSON.stringify({ sourceId: input.sourceId, sourceKey: input.sourceKey, inert: true }), now())]);
    return { id: row.id, restored: true, inert: true };
}

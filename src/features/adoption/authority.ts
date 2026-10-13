import { check, owner, type AdoptionContext, statement } from './core';
import type { Freshservice } from './freshservice';
import { now } from '../../platform/http';
export async function assertAdoptionEffectAllowed(ctx: AdoptionContext, input: {
    resource: string;
    action: string;
    sourceId?: string;
    sourceRevision?: string;
    fence?: number;
}, adapter?: Freshservice) {
    const w = ctx.principal.workspaceId;
    check(await ctx.env.DB.prepare('SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(w, ctx.principal.userId).first(), 'membership_required', 403);
    const settings = await ctx.env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id=?').bind(w).first<{
        settings_json: string;
    }>();
    check(JSON.parse(settings?.settings_json || '{}').executionHeld !== true, 'restore_execution_held', 409);
    check(!await ctx.env.DB.prepare("SELECT 1 FROM adoption_holds WHERE workspace_id=? AND state='held'").bind(w).first(), 'restore_execution_held', 409);
    const row = await ctx.env.DB.prepare('SELECT * FROM adoption_ownership WHERE workspace_id=? AND resource=? AND action=?').bind(w, input.resource, input.action).first<any>();
    const supplied = input.sourceId !== undefined || input.sourceRevision !== undefined || input.fence !== undefined;
    if (!row) {
        check(!supplied, 'ownership_required', 409);
        return;
    }
    check(row.executor === 'linen' && row.state === 'active', 'executor_not_owned', 409);
    if(!row.source_id)check(!supplied,'coexistence_mapping_changed',409);
    if (row.source_id) {
        const fresh = await (await import('./coexistence')).validateSourceAuthority(ctx, row.id, adapter);
        check(row.source_id === input.sourceId && row.source_revision === input.sourceRevision && row.fence === input.fence, 'stale_source_fence', 409);
        const current = await ctx.env.DB.prepare('SELECT * FROM adoption_ownership WHERE workspace_id=? AND id=?').bind(w,row.id).first<any>();
        check(current && current.executor === 'linen' && current.state === 'active' && current.source_id === input.sourceId && current.source_revision === input.sourceRevision && current.fence === input.fence && current.approval_revision === fresh.approval_revision, 'stale_source_fence', 409);
        check(fresh.feed_expires > now() && fresh.approval_expires > now(), 'approval_feed_stale', 409);
        const source = await ctx.env.DB.prepare('SELECT state FROM adoption_sources WHERE workspace_id=? AND id=?').bind(w, row.source_id).first<any>();
        check(source?.state === 'current', 'source_unavailable', 409);
    }
}
export async function releaseHold(ctx: AdoptionContext, holdId: string, revision: number) {
    await owner(ctx);
    const h = await ctx.env.DB.prepare('SELECT * FROM adoption_holds WHERE workspace_id=? AND id=? AND state=? AND revision=?').bind(ctx.principal.workspaceId, holdId, 'held', revision).first<any>();
    check(h, 'hold_changed', 409);
    const unresolved = await ctx.env.DB.prepare("SELECT COUNT(*) n FROM adoption_history h WHERE h.workspace_id=? AND h.id IN (SELECT history_id FROM adoption_import_records WHERE import_id=?) AND h.table_name='execution_operations' AND json_extract(h.row_json,'$.state') NOT IN ('cancelled','failed') AND NOT EXISTS (SELECT 1 FROM adoption_reconciliations r WHERE r.workspace_id=h.workspace_id AND r.hold_id=? AND r.history_id=h.id)").bind(ctx.principal.workspaceId, h.import_id, holdId).first<{
        n: number;
    }>();
    check(!unresolved?.n, 'remote_effects_unreconciled', 409);
    const run = await ctx.env.DB.prepare('SELECT state FROM adoption_imports WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, h.import_id).first<any>();
    check(run?.state === 'restored', 'domain_restore_incomplete', 409);
    await ctx.env.DB.batch([ctx.env.DB.prepare("UPDATE adoption_holds SET state='released',revision=revision+1,released_at=? WHERE workspace_id=? AND id=? AND revision=?").bind(now(), ctx.principal.workspaceId, holdId, revision), ctx.env.DB.prepare("UPDATE workspace_settings SET settings_json=json_set(settings_json,'$.executionHeld',json('false')),revision=revision+1 WHERE workspace_id=? AND NOT EXISTS(SELECT 1 FROM adoption_holds WHERE workspace_id=? AND state='held')").bind(ctx.principal.workspaceId, ctx.principal.workspaceId), statement(ctx, 'adoption.hold.release', holdId)]);
    return { state: 'released' };
}

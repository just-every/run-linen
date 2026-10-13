import { now } from '../../platform/http';
import { assert, current } from './access';
import type { IntelligenceContext } from './types';
export const restoreTables = new Set(['intelligence_commitments', 'intelligence_versions', 'intelligence_observations', 'intelligence_events', 'intelligence_attempts', 'intelligence_research', 'intelligence_protocol_runs', 'intelligence_capabilities', 'intelligence_reuse', 'intelligence_simplifications', 'intelligence_engineering_jobs', 'intelligence_fulfilment_runs', 'intelligence_investigations', 'intelligence_pending_fulfilments']);
export async function restoreAdoptionRecord(ctx: IntelligenceContext, input: {
    table: string;
    row: Record<string, unknown>;
    sourceId: string;
    sourceKey: string;
}) {
    ctx = await current(ctx, ['owner']);
    assert(restoreTables.has(input.table) && input.sourceId && input.sourceKey, 'restore_table_denied', 422);
    const settings: any = await ctx.env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id=?').bind(ctx.principal.workspaceId).first();
    assert(JSON.parse(settings?.settings_json || '{}').executionHeld === true, 'restore_execution_hold_required', 409);
    const prior: any = await ctx.env.DB.prepare('SELECT record_id FROM intelligence_restore_records WHERE workspace_id=? AND source_id=? AND source_key=?').bind(ctx.principal.workspaceId, input.sourceId, input.sourceKey).first();
    if (prior)
        return { id: prior.record_id, state: 'already_restored' };
    const columns = (await ctx.env.DB.prepare(`PRAGMA table_info(${input.table})`).all<{
        name: string;
    }>()).results.map(c => c.name);
    const row = { ...input.row, workspace_id: ctx.principal.workspaceId };
    assert(Object.keys(row).every(k => columns.includes(k)), 'restore_unknown_column', 422);
    assert(Object.values(row).every(v => v === null || typeof v === 'string' || typeof v === 'number'), 'restore_scalar_required', 422);
    for (const [k, v] of Object.entries(row))
        if (k.endsWith('_json') && v !== null)
            try {
                JSON.parse(v as string);
            }
            catch {
                assert(false, 'restore_invalid_json', 422);
            }
    if (input.table === 'intelligence_commitments') {
        assert(['internal', 'restricted', 'hr'].includes(String((row as any).sensitivity)), 'restore_scope_invalid', 422);
        assert(Array.isArray(JSON.parse(String((row as any).participants_json))), 'restore_scope_invalid', 422);
        (row as any).lease_until = null;
    }
    if (input.table === 'intelligence_engineering_jobs') {
        (row as any).grant_id = null;
        (row as any).grant_version = null;
        (row as any).claim_token_hash = null;
        (row as any).lease_until = null;
        if (!['adopted', 'failed'].includes(String((row as any).state)))
            (row as any).state = 'unknown';
    }
    if (input.table === 'intelligence_research') {
        (row as any).lease_until = null;
        if (['researching', 'interpreting'].includes(String((row as any).state)))
            (row as any).state = 'unknown';
    }
    if (['intelligence_investigations','intelligence_pending_fulfilments'].includes(input.table)) {
        (row as any).state = 'unknown';
        (row as any).lease_until = null;
    }
    if (input.table === 'intelligence_fulfilment_runs')
        (row as any).state = 'unknown';
    if (input.table === 'intelligence_capabilities')
        (row as any).state = 'invalidated';
    if (input.table === 'intelligence_attempts' && ['preparing', 'dispatching', 'running'].includes(String((row as any).state))) {
        (row as any).state = 'unknown';
        (row as any).charge_status = 'unknown';
    }
    if ((row as any).commitment_id)
        assert(await ctx.env.DB.prepare('SELECT 1 FROM intelligence_commitments WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, (row as any).commitment_id).first(), 'restore_parent_required', 422);
    const keys = Object.keys(row), recordId = String((row as any).id || (row as any).commitment_id || input.sourceKey);
    await ctx.env.DB.batch([ctx.env.DB.prepare(`INSERT INTO ${input.table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).bind(...keys.map(k => (row as any)[k])), ctx.env.DB.prepare('INSERT INTO intelligence_restore_records VALUES(?,?,?,?,?,?)').bind(ctx.principal.workspaceId, input.sourceId, input.sourceKey, input.table, recordId, now())]);
    return { id: recordId, state: 'restored_held' };
}

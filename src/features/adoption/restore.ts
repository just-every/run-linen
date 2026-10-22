import { restoreAdoptionRecord as restoreWork } from '../work/restore';
import { ApiError, now } from '../../platform/http';
import { check, sha, encode, type AdoptionContext, type Row } from './core';
import type { NativeRecord } from './import';
export const workRestoreTables = new Set(['work_approval_stages','work_knowledge_drafts', 'work_canned_responses', 'work_time_entries', 'work_records', 'work_messages', 'work_attachments', 'work_people', 'work_pending_people', 'work_pending_services', 'work_assets', 'work_recurring_plans', 'work_recurring_occurrences', 'work_recurring_tasks', 'work_asset_financials', 'work_custody', 'work_asset_contracts', 'work_asset_repairs', 'work_classifications', 'work_lifecycle', 'work_obligations', 'work_knowledge', 'work_article_versions', 'work_catalog_values', 'work_catalog', 'work_fulfilments', 'work_calendars', 'work_commitments']);
export async function mapId(ctx: AdoptionContext, source: string, old: string, kind = 'record') {
    const prior = await ctx.env.DB.prepare('SELECT target_id FROM adoption_identity_map WHERE workspace_id=? AND source_id=? AND source_key=?').bind(ctx.principal.workspaceId, source, old).first<{
        target_id: string;
    }>();
    if (prior)
        return prior.target_id;
    const digest = await sha(encode([ctx.principal.workspaceId, source, old]));
    const uuid = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    await ctx.env.DB.prepare('INSERT OR IGNORE INTO adoption_identity_map VALUES(?,?,?,?,?,NULL,?)').bind(ctx.principal.workspaceId, source, old, uuid, kind, now()).run();
    return uuid;
}
export async function mapRow(ctx: AdoptionContext, source: string, row: Row) {
    const mapped: Row = { ...row };
    const mappings = (await ctx.env.DB.prepare('SELECT source_key,target_id FROM adoption_identity_map WHERE workspace_id=? AND source_id=?').bind(ctx.principal.workspaceId, source).all<{
        source_key: string;
        target_id: string;
    }>()).results;
    const map = new Map(mappings.map(x => [x.source_key, x.target_id]));
    function replace(value: unknown): unknown {
        if (typeof value === 'string')
            return map.get(value) || value;
        if (Array.isArray(value))
            return value.map(replace);
        if (value && typeof value === 'object')
            return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)]));
        return value;
    }
    for (const [k, v] of Object.entries(mapped)) {
        if (k === 'workspace_id') {
            mapped[k] = ctx.principal.workspaceId;
            continue;
        }
        if (typeof v === 'string') {
            if (k === 'metadata_json' || k === 'manifest_json')
                continue;
            if (k.endsWith('_json')) {
                try {
                    mapped[k] = JSON.stringify(replace(JSON.parse(v)));
                }
                catch {
                    throw new ApiError(422, 'invalid_json_column', 'A stored record is damaged');
                }
            }
            else
                mapped[k] = map.get(v) || v;
        }
    }
    return mapped;
}
export async function restoreNativeWork(ctx: AdoptionContext, r: NativeRecord, source: string) { check(workRestoreTables.has(r.table), 'unsupported_work_restore'); const result = await restoreWork(ctx, { table: r.table, row: r.row, sourceId: source, sourceKey: `${r.table}:${r.key}` }); return { state: 'restored' as const, reason: result.state }; }

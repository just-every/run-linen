import { ApiError, id, now } from '../../platform/http';
import { check, owner, statement, getRun, sha, encode, erased, identityHash, type AdoptionContext, type Row } from './core';
import { supported, historyOnly, MAX_CHUNK, type Manifest, type Chunk } from './schema';
import { restoreAdoptionRecord as restoreServices } from '../services/adoption';
import { restoreExecutionRecord } from '../execution/restore';
import { restoreAdoptionRecord as restoreIntelligence, restoreTables as intelligenceRestoreTables } from '../intelligence/restore';
import {preflightImportedTombstone,reconcileImportedTombstones} from './import-erasure';
import {queueDelete} from './core';
import { references, type Reference } from './references';
import { workRestoreTables, restoreNativeWork, mapId, mapRow } from './restore';
export interface NativeRecord {
    table: string;
    key: string;
    row: Row;
}
export interface RestorePort {
    table: string;
    restore(ctx: AdoptionContext, record: NativeRecord, provenance: {
        sourceId: string;
        revision: string;
    }): Promise<{
        state: 'restored' | 'quarantined';
        reason?: string;
    }>;
}
const ports = new Map<string, RestorePort>();
ports.set('adoption_artifacts', { table: 'adoption_artifacts', restore: async (ctx, r) => { check(String(r.row.blob_key).startsWith(ctx.principal.workspaceId + '/'), 'artifact_scope_invalid'); await ctx.env.DB.prepare('INSERT OR IGNORE INTO adoption_artifacts VALUES(?,?,?,?,?,?,?,?,?,?)').bind(r.row.id, ctx.principal.workspaceId, r.row.run_id, r.row.ordinal, r.row.kind, r.row.blob_key, r.row.size, r.row.sha256, r.row.metadata_json, r.row.created_at).run(); return { state: 'restored' }; } });
for (const table of workRestoreTables)
    ports.set(table, { table, restore: async (ctx, r, p) => restoreNativeWork(ctx, r, p.sourceId) });
for (const table of ['svc_records', 'svc_events'])
    ports.set(table, { table, restore: async (ctx, r, p) => { await restoreServices(ctx, { table: r.table, row: r.row, sourceId: p.sourceId, sourceKey: `${r.table}:${r.key}` }); return { state: 'restored' }; } });
for (const table of ['execution_plans', 'execution_operations', 'execution_attempts', 'execution_receipts', 'execution_verifications', 'execution_decisions'])
    ports.set(table, { table, restore: async (ctx, r, p) => { await restoreExecutionRecord(ctx, { table: r.table, row: r.row, sourceId: p.sourceId, sourceKey: `${r.table}:${r.key}` }); return { state: 'restored' }; } });
for (const table of intelligenceRestoreTables)
    ports.set(table, { table, restore: async (ctx, r, p) => { await restoreIntelligence(ctx, { table: r.table, row: r.row, sourceId: p.sourceId, sourceKey: `${r.table}:${r.key}` }); return { state: 'restored' }; } });
export function registerAdoptionRestorePort(port: RestorePort) { check(supported(port.table) && !historyOnly.has(port.table), 'unsafe_restore_port'); check(!ports.has(port.table), 'duplicate_restore_port'); ports.set(port.table, port); }
export function validateManifest(value: unknown): Manifest {
    const m = value as Manifest;
    check(m && m.format === 'linen-native' && m.version === 1 && m.state === 'ready', 'unsupported_archive');
    check(typeof m.sourceWorkspace === 'string' && typeof m.exportId === 'string' && Number.isFinite(Date.parse(m.snapshotAt)), 'invalid_manifest_identity');
    check(Array.isArray(m.chunks) && m.chunks.length <= 100000 && m.tables && typeof m.tables === 'object', 'invalid_manifest');
    const ordinals = new Set<number>();
    for (const c of m.chunks) {
        check(Number.isSafeInteger(c.ordinal) && c.ordinal >= 0 && !ordinals.has(c.ordinal), 'duplicate_chunk');
        ordinals.add(c.ordinal);
        check(['records', 'attachment'].includes(c.kind) && /^[a-f0-9]{64}$/.test(c.sha256) && Number.isInteger(c.size) && c.size >= 0 && c.size <= MAX_CHUNK, 'invalid_chunk');
        if (c.kind === 'attachment')
            check(typeof c.attachmentId === 'string' && Number.isInteger(c.offset) && Number.isInteger(c.totalSize) && c.totalSize! >= 0 && c.totalSize! <= 64 * 1024 * 1024 && /^[a-f0-9]{64}$/.test(c.fullSha256 || ''), 'invalid_attachment_chunk');
    }
    return m;
}
export async function createImport(ctx: AdoptionContext, input: {
    manifest: unknown;
    idempotencyKey: string;
}) {
    await owner(ctx);
    const m = validateManifest(input.manifest);
    check(input.idempotencyKey && input.idempotencyKey.length <= 200, 'idempotency_key_required');
    const existing = await ctx.env.DB.prepare('SELECT id,manifest_json FROM adoption_imports WHERE workspace_id=? AND idempotency_key=?').bind(ctx.principal.workspaceId, input.idempotencyKey).first<any>();
    if (existing) {
        check(existing.manifest_json === JSON.stringify(m), 'idempotency_conflict', 409);
        return getRun(ctx, 'imports', existing.id);
    }
    const run = id();
    await ctx.env.DB.batch([ctx.env.DB.prepare("INSERT INTO adoption_imports(id,workspace_id,actor_id,idempotency_key,source_id,state,manifest_json,created_at) VALUES(?,?,?,?,?,'uploading',?,?)").bind(run, ctx.principal.workspaceId, ctx.principal.userId, input.idempotencyKey, `linen:${m.sourceWorkspace}`, JSON.stringify(m), now()), statement(ctx, 'adoption.import.create', run)]);
    return getRun(ctx, 'imports', run);
}
export async function uploadChunk(ctx: AdoptionContext, runId: string, ordinal: number, bytes: ArrayBuffer) { const run = await getRun(ctx, 'imports', runId); check(run.state === 'uploading', 'import_locked', 409); const manifest = validateManifest(JSON.parse(String(run.manifest_json))), chunk = manifest.chunks.find(x => x.ordinal === ordinal); check(chunk, 'unexpected_chunk'); check(bytes.byteLength === chunk.size && await sha(bytes) === chunk.sha256, 'chunk_hash_mismatch'); const key = `${ctx.principal.workspaceId}/adoption/imports/${runId}/${ordinal}`; await ctx.env.ATTACHMENTS.put(key, bytes); await ctx.env.DB.prepare('INSERT OR REPLACE INTO adoption_chunks VALUES(?,?,?,?,?,?,?,?)').bind(ctx.principal.workspaceId, runId, ordinal, chunk.kind, key, chunk.sha256, chunk.size, JSON.stringify(chunk)).run(); return { ordinal, sha256: chunk.sha256 }; }
async function bytesFor(ctx: AdoptionContext, runId: string, chunk: Chunk) { const object = await ctx.env.ATTACHMENTS.get(`${ctx.principal.workspaceId}/adoption/imports/${runId}/${chunk.ordinal}`); check(object, 'missing_chunk', 409); check(object.size === chunk.size, 'chunk_size_mismatch'); const bytes = await object.arrayBuffer(); check(await sha(bytes) === chunk.sha256, 'chunk_hash_mismatch'); return bytes; }
export async function recordsFor(ctx: AdoptionContext, runId: string, chunk: Chunk): Promise<NativeRecord[]> {
    const bytes = await bytesFor(ctx, runId, chunk);
    let records: NativeRecord[];
    try {
        records = JSON.parse(new TextDecoder().decode(bytes));
    }
    catch {
        check(false, 'invalid_record_json');
    }
    check(Array.isArray(records) && records.length === chunk.count && records.length <= 100, 'invalid_record_chunk');
    for (const r of records) {
        check(r && typeof r.table === 'string' && typeof r.key === 'string' && r.row && typeof r.row === 'object' && !Array.isArray(r.row), 'invalid_record');
        check(Object.values(r.row).every(v => v === null || typeof v === 'string' || typeof v === 'number'), 'invalid_record_value');
        check(!Object.keys(r.row).some(k => /password|secret|token|encryption_key/i.test(k) && r.row[k] !== null), 'credential_data_forbidden');
    }
    return records;
}
export async function attachmentBytes(ctx: AdoptionContext, runId: string, manifest: Manifest, attachmentId: string) {
    const chunks = manifest.chunks.filter(x => x.kind === 'attachment' && x.attachmentId === attachmentId).sort((a, b) => a.offset! - b.offset!);
    check(chunks.length, 'attachment_bytes_missing', 409);
    let cursor = 0;
    const total = chunks[0].totalSize!;
    check(total >= 0 && total <= 64 * 1024 * 1024, 'invalid_attachment_size');
    const data = new Uint8Array(total);
    for (const c of chunks) {
        check(c.offset === cursor && c.totalSize === total && c.fullSha256 === chunks[0].fullSha256, 'attachment_segments_invalid');
        const bytes = new Uint8Array(await bytesFor(ctx, runId, c));
        data.set(bytes, cursor);
        cursor += bytes.length;
    }
    check(cursor === total && await sha(data) === chunks[0].fullSha256, 'attachment_hash_mismatch');
    return data;
}
export interface DryReport {
    counts: Record<string, number>;
    privacy: Record<string, number>;
    unknownMappings: number;
    identityCollisions: number;
    sourceRevisionConflicts: number; liveIdentityErasures:number;
    unresolvedReferences: number;
    unresolvedRecords: {
        table: string;
        key: string;
        field: string;
    }[];
    erasedRecords: number;
    historyOnly: number;
    attachmentBytes: number;
    sourceCounts: Record<string, number>;
    targetCounts: Record<string, number>;
    samples: {
        table: string;
        key: string;
        privacy: string;
    }[];
}
async function reasonFor(ctx: AdoptionContext, r: NativeRecord) {
    if (!supported(r.table))
        return 'unknown_mapping';
    if (await erased(ctx, r.row))
        return 'erased_identity';
    if (r.table !== 'identities' && r.table !== 'workspace') {
        const columns = (await ctx.env.DB.prepare(`PRAGMA table_info(${r.table})`).all<{
            name: string;
        }>()).results.map(x => x.name);
        if (!columns.length || Object.keys(r.row).some(k => !columns.includes(k)))
            return 'unknown_schema';
    }
    if (r.table === 'work_messages' || r.table === 'work_attachments') {
        if (!['public', 'private'].includes(String(r.row.visibility)))
            return 'unknown_privacy';
    }
    if (r.table === 'work_pending_people' && !['pending', 'bound', 'withdrawn'].includes(String(r.row.state)))
        return 'unknown_state';
    if (r.table === 'work_pending_services' && !['held', 'released', 'cancelled'].includes(String(r.row.state)))
        return 'unknown_state';
    if (r.table === 'work_records' && !['open', 'paused', 'closed', 'cancelled'].includes(String(r.row.state)))
        return 'unknown_state';
    return null;
}
export async function dryRun(ctx: AdoptionContext, runId: string) {
    const run = await getRun(ctx, 'imports', runId);
    check(['uploading', 'validated'].includes(String(run.state)), 'import_locked', 409);
    const m = validateManifest(JSON.parse(String(run.manifest_json)));
    const report: DryReport = { counts: {}, privacy: {}, unknownMappings: 0, identityCollisions: 0, sourceRevisionConflicts: 0, liveIdentityErasures:0, unresolvedReferences: 0, unresolvedRecords: [], erasedRecords: 0, historyOnly: 0, attachmentBytes: 0, sourceCounts: m.tables, targetCounts: {}, samples: [] };
    const keys = new Set<string>(), refs: Reference[] = [];
    for (const chunk of m.chunks) {
        if (chunk.kind !== 'records') {
            await bytesFor(ctx, runId, chunk);
            continue;
        }
        for (const r of await recordsFor(ctx, runId, chunk)) {
            check(!keys.has(`${r.table}:${r.key}`), 'duplicate_source_identity');
            keys.add(`${r.table}:${r.key}`);
            report.counts[r.table] = (report.counts[r.table] || 0) + 1;
            const privacy = String(r.row.visibility || r.row.sensitivity || r.row.scope || 'restricted');
            report.privacy[privacy] = (report.privacy[privacy] || 0) + 1;
            const reason = await reasonFor(ctx, r);
            if (reason === 'erased_identity')
                report.erasedRecords++;
            else if (reason)
                report.unknownMappings++;
            if (historyOnly.has(r.table) || !ports.has(r.table))
                report.historyOnly++;
            if (report.samples.length < 20 && (privacy === 'private' || privacy === 'hr' || r.table === 'execution_operations'))
                report.samples.push({ table: r.table, key: r.key, privacy });
            const previous = await ctx.env.DB.prepare('SELECT revision FROM adoption_history WHERE workspace_id=? AND source_id=? AND table_name=? AND source_key=? AND revision<>? LIMIT 1').bind(ctx.principal.workspaceId, run.source_id, r.table, r.key, await sha(encode(r.row))).first();
            if (previous)
                report.sourceRevisionConflicts++;
            if (r.table === 'identities') {
                const collision = await ctx.env.DB.prepare('SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND (u.id=? OR lower(u.email)=lower(?))').bind(ctx.principal.workspaceId, r.row.id, r.row.email).first();
                if (collision)
                    report.identityCollisions++;
            }
            if(r.table==='work_erasure'&&typeof r.row.person_id==='string')report.liveIdentityErasures+=(await preflightImportedTombstone(ctx,await identityHash(r.row.person_id))).length;
            if(r.table==='adoption_tombstones')report.liveIdentityErasures+=(await preflightImportedTombstone(ctx,String(r.row.identity_hash))).length;refs.push(...references(r));
            if (r.table === 'work_attachments' || r.table === 'adoption_artifacts') {
                const data = await attachmentBytes(ctx, runId, m, String(r.row.id));
                check(data.byteLength === r.row.size && await sha(data) === r.row.sha256, 'attachment_metadata_mismatch');
                report.attachmentBytes += data.byteLength;
            }
        }
    }
    for (const ref of refs)
        if (!ref.targets.some(table => keys.has(`${table}:${ref.key}`))) {
            report.unresolvedReferences++;
            check(report.unresolvedRecords.length < 10000, 'unresolved_reference_report_limit');
            report.unresolvedRecords.push({ table: ref.fromTable, key: ref.fromKey, field: ref.field });
        }
    check(Object.keys(m.tables).length === Object.keys(report.counts).length && Object.entries(m.tables).every(([k, v]) => report.counts[k] === v), 'source_counts_mismatch');
    for (const table of Object.keys(report.counts)) {
        const count = await ctx.env.DB.prepare('SELECT COUNT(*) n FROM adoption_history WHERE workspace_id=? AND source_id=? AND table_name=?').bind(ctx.principal.workspaceId, run.source_id, table).first<{
            n: number;
        }>();
        report.targetCounts[table] = count?.n || 0;
    }
    await ctx.env.DB.batch([ctx.env.DB.prepare("UPDATE adoption_imports SET state='validated',report_json=? WHERE workspace_id=? AND id=? AND state IN ('uploading','validated')").bind(JSON.stringify(report), ctx.principal.workspaceId, runId), statement(ctx, 'adoption.import.inspect', runId, { counts: report.counts, unknownMappings: report.unknownMappings })]);
    return report;
}
export async function applyImport(ctx: AdoptionContext, runId: string, acceptSemanticLoss = false) {
    const run = await getRun(ctx, 'imports', runId);
    if (run.state === 'restored')
        return importStatus(ctx, runId);
    check(['validated', 'applying', 'history_only','erasure_pending'].includes(String(run.state)), 'dry_run_required', 409);
    const report = JSON.parse(String(run.report_json)) as DryReport;
    check(acceptSemanticLoss || (!report.liveIdentityErasures&&!report.sourceRevisionConflicts && !report.unknownMappings && !report.identityCollisions && !report.unresolvedReferences && !report.historyOnly), 'semantic_loss_review_required', 409);
    // Recheck the entire incoming erasure set before any mutation: destination
    // identities/mappings may have changed since the review or prior checkpoint.
    const m = validateManifest(JSON.parse(String(run.manifest_json)));
    for (const chunk of (m.tables.adoption_tombstones || m.tables.work_erasure ? m.chunks.filter(c=>c.kind==='records') : [])) {
        for (const r of await recordsFor(ctx,runId,chunk)) {
            if(r.table==='adoption_tombstones')await preflightImportedTombstone(ctx,String(r.row.identity_hash));
            if(r.table==='work_erasure'&&typeof r.row.person_id==='string')await preflightImportedTombstone(ctx,await identityHash(r.row.person_id));
        }
    }
    const w = ctx.principal.workspaceId;
    await ctx.env.DB.batch([ctx.env.DB.prepare("UPDATE workspace_settings SET settings_json=json_set(settings_json,'$.executionHeld',json('true')),revision=revision+1 WHERE workspace_id=?").bind(w), ctx.env.DB.prepare("INSERT INTO adoption_holds(id,workspace_id,import_id,state,reason,created_at) SELECT ?,?,?,'held','restore requires remote reconciliation and current authority',? WHERE NOT EXISTS(SELECT 1 FROM adoption_holds WHERE workspace_id=? AND import_id=?)").bind(id(), w, runId, now(), w, runId), ctx.env.DB.prepare("UPDATE adoption_imports SET state='applying' WHERE workspace_id=? AND id=? AND state='validated'").bind(w, runId), statement(ctx, 'adoption.import.apply', runId)]);
    const chunks = m.chunks.filter(c => c.kind === 'records').sort((a, b) => a.ordinal - b.ordinal).filter(c => c.ordinal > Number(run.checkpoint)).slice(0, 25);
    for (const chunk of chunks) {
        for (const r of await recordsFor(ctx, runId, chunk)) {
            const revision = await sha(encode(r.row));
            const existing = await ctx.env.DB.prepare('SELECT id FROM adoption_history WHERE workspace_id=? AND source_id=? AND table_name=? AND source_key=? AND revision=?').bind(w, run.source_id, r.table, r.key, revision).first();
            if (existing) {
                await ctx.env.DB.prepare('INSERT OR IGNORE INTO adoption_import_records VALUES(?,?,?)').bind(w, runId, (existing as {
                    id: string;
                }).id).run();
                continue;
            }
            const conflict = await ctx.env.DB.prepare('SELECT 1 FROM adoption_history WHERE workspace_id=? AND source_id=? AND table_name=? AND source_key=? AND revision<>? LIMIT 1').bind(w, run.source_id, r.table, r.key, revision).first();
            if (r.row.id)
                await mapId(ctx, String(run.source_id), String(r.row.id), r.table === 'identities' ? 'principal' : 'record');
            const reason = await reasonFor(ctx, r) || ((report.unresolvedRecords || []).some(x => x.table === r.table && x.key === r.key) ? 'unresolved_reference' : null);
            if (reason === 'erased_identity') {
                if (r.row.id)
                    await ctx.env.DB.prepare('INSERT OR IGNORE INTO adoption_tombstones VALUES(?,?,?)').bind(w, await identityHash(String(r.row.id)), now()).run();
                continue;
            }
            let state = reason || conflict ? 'quarantined' : 'history_only';
            let why = reason || (conflict ? 'source_revision_conflict' : null);
            // Records are persisted as restricted history BEFORE domain materialization. Ports must be idempotent.
            const historyId = id();
            await ctx.env.DB.prepare('INSERT OR IGNORE INTO adoption_history VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(historyId, w, runId, run.source_id, r.table, r.key, revision, JSON.stringify(r.row), state, why, now()).run();
            await ctx.env.DB.prepare('INSERT OR IGNORE INTO adoption_import_records SELECT workspace_id,?,id FROM adoption_history WHERE workspace_id=? AND source_id=? AND table_name=? AND source_key=? AND revision=?').bind(runId, w, run.source_id, r.table, r.key, revision).run();
            if (r.table === 'work_erasure' && typeof r.row.person_id === 'string') {
                await preflightImportedTombstone(ctx,await identityHash(r.row.person_id));
                await ctx.env.DB.prepare('INSERT OR IGNORE INTO adoption_tombstones VALUES(?,?,?)').bind(w, await identityHash(r.row.person_id), now()).run();
            }
            if (r.table === 'adoption_tombstones') {
                await preflightImportedTombstone(ctx,String(r.row.identity_hash));
                await ctx.env.DB.prepare('INSERT OR IGNORE INTO adoption_tombstones VALUES(?,?,?)').bind(w, r.row.identity_hash, now()).run();
            }
        }
        await ctx.env.DB.prepare('UPDATE adoption_imports SET checkpoint=MAX(checkpoint,?) WHERE workspace_id=? AND id=?').bind(chunk.ordinal, w, runId).run();
    }
    if (chunks.length)
        return { id: runId, state: 'applying', processedChunks: chunks.length };
    const privacy=await reconcileImportedTombstones(ctx,runId);if(privacy.pending.length){await ctx.env.DB.prepare("UPDATE adoption_imports SET state='erasure_pending' WHERE workspace_id=? AND id=?").bind(w,runId).run();return {id:runId,state:'erasure_pending',pendingErasures:privacy.pending}}
    // Each supported domain port owns its own authority and invariants; grants are permanently excluded.
    const pending = (await ctx.env.DB.prepare("SELECT * FROM adoption_history WHERE workspace_id=? AND id IN (SELECT history_id FROM adoption_import_records WHERE import_id=?) AND state='history_only' ORDER BY created_at,id").bind(w, runId).all<any>()).results;
    const priority = ['work_canned_responses', 'work_people', 'work_pending_people', 'work_records', 'work_calendars', 'work_catalog', 'work_assets', 'work_recurring_plans', 'work_recurring_occurrences', 'work_recurring_tasks', 'work_asset_financials', 'work_knowledge', 'work_messages', 'work_attachments', 'work_custody', 'work_lifecycle', 'work_fulfilments', 'work_commitments', 'work_obligations', 'work_time_entries', 'work_pending_services', 'work_article_versions', 'svc_records', 'work_knowledge_drafts', 'svc_events', 'work_asset_contracts', 'work_asset_repairs', 'work_classifications', 'execution_plans', 'execution_operations', 'execution_attempts', 'execution_receipts', 'execution_verifications', 'execution_decisions', 'intelligence_commitments', 'intelligence_versions', 'intelligence_observations', 'intelligence_events', 'intelligence_research', 'intelligence_attempts', 'intelligence_engineering_jobs', 'intelligence_capabilities', 'intelligence_reuse', 'intelligence_simplifications'];
    pending.sort((a, b) => (priority.indexOf(a.table_name) < 0 ? 999 : priority.indexOf(a.table_name)) - (priority.indexOf(b.table_name) < 0 ? 999 : priority.indexOf(b.table_name)));
    for (const h of pending) {
        // Prior import blobs are opaque nested archives. They cannot be certified
        // free of an incoming erased identity by inspecting scalar metadata.
        if (privacy.containsTombstones && h.table_name === 'adoption_artifacts') {
            await ctx.env.DB.prepare("UPDATE adoption_history SET row_json='{}',state='erased',reason='opaque archive retired for incoming erasure' WHERE workspace_id=? AND id=?").bind(w,h.id).run();
            continue;
        }
        const port = ports.get(h.table_name);
        const original = JSON.parse(h.row_json) as Row;
        if (await erased(ctx, original)) {
            if (original.id)
                await ctx.env.DB.prepare('INSERT OR IGNORE INTO adoption_tombstones VALUES(?,?,?)').bind(w, await identityHash(String(original.id)), now()).run();
            await ctx.env.DB.prepare("UPDATE adoption_history SET row_json='{}',state='erased',reason='erasure tombstone' WHERE workspace_id=? AND id=?").bind(w, h.id).run();
            continue;
        }
        if (!port)
            continue;
        const r = { table: h.table_name, key: h.source_key, row: await mapRow(ctx, h.source_id, original) };
        if (r.table === 'work_attachments' || r.table === 'adoption_artifacts') {
            const data = await attachmentBytes(ctx, runId, m, String(original.id));
            const key = `${w}/adoption/restored/${String(r.row.id)}`;
            await ctx.env.ATTACHMENTS.put(key, data);
            r.row.blob_key = key;
        }
        let result: {
            state: 'restored' | 'quarantined';
            reason?: string;
        };
        try {
            result = await port.restore(ctx, r, { sourceId: h.source_id, revision: h.revision });
        }
        catch (e) {
            if (!(e instanceof ApiError))
                throw e;
            result = { state: 'quarantined', reason: e.code };
        }
        ;
        await ctx.env.DB.prepare('UPDATE adoption_history SET state=?,reason=? WHERE workspace_id=? AND id=?').bind(result.state, result.reason || null, w, h.id).run();
    }
    // Account bindings never survive workspace import. Keep source 'bound' only
    // while historical fulfilments materialize under the hold triggers, then show
    // these people as pending until a fresh authenticated account proves its email.
    await ctx.env.DB.prepare(`UPDATE work_pending_people SET state='pending',bound_at=NULL WHERE workspace_id=? AND state='bound'
      AND EXISTS(SELECT 1 FROM work_restore_records restored WHERE restored.workspace_id=work_pending_people.workspace_id
        AND restored.table_name='work_pending_people' AND restored.record_id=work_pending_people.id)
      AND EXISTS(SELECT 1 FROM work_people p WHERE p.workspace_id=work_pending_people.workspace_id AND p.id=work_pending_people.id AND p.member_id IS NULL)`)
      .bind(w).run();
    const permittedHistory = [...historyOnly, 'identities', 'workspace'];
    const remaining = await ctx.env.DB.prepare(`SELECT COUNT(*) n FROM adoption_history WHERE workspace_id=? AND id IN (SELECT history_id FROM adoption_import_records WHERE import_id=?) AND state NOT IN ('restored','erased') AND table_name NOT IN (${permittedHistory.map(()=>'?').join(',')})`).bind(w, runId,...permittedHistory).first<{n:number}>();
    const state = remaining?.n ? 'history_only' : 'restored';
    await ctx.env.DB.batch([ctx.env.DB.prepare('UPDATE adoption_imports SET state=? WHERE workspace_id=? AND id=?').bind(state, w, runId), statement(ctx, 'adoption.import.checkpoint', runId, { state })]);
    if(privacy.containsTombstones){const chunks=(await ctx.env.DB.prepare('SELECT object_key FROM adoption_chunks WHERE workspace_id=? AND run_id=?').bind(w,runId).all<{object_key:string}>()).results;for(const chunk of chunks)await queueDelete(ctx,chunk.object_key);await ctx.env.DB.batch([ctx.env.DB.prepare('DELETE FROM adoption_chunks WHERE workspace_id=? AND run_id=?').bind(w,runId),ctx.env.DB.prepare('UPDATE adoption_imports SET manifest_json=? WHERE workspace_id=? AND id=?').bind(JSON.stringify({...m,chunks:[],retiredForPrivacy:true}),w,runId)]);}
    return importStatus(ctx, runId);
}
export async function importStatus(ctx: AdoptionContext, runId: string) { const run = await getRun(ctx, 'imports', runId); const target = (await ctx.env.DB.prepare('SELECT table_name,state,COUNT(*) count FROM adoption_history WHERE workspace_id=? AND id IN (SELECT history_id FROM adoption_import_records WHERE import_id=?) GROUP BY table_name,state').bind(ctx.principal.workspaceId, runId).all()).results; return { ...run, report: JSON.parse(String(run.report_json)), target }; }

import { prepareArchiveIdentityProjection } from '../history/archive-identities.mjs';
import { archivePrivacyRevision,archiveProjector,assertExportPrivacy } from './archive-privacy';
import { id, now } from '../../platform/http';
import { check, owner, statement, getRun, sha, encode, type AdoptionContext } from './core';
import { nativeTables, excludedTables, type Manifest, type Chunk, MAX_CHUNK } from './schema';
const excluded = [...Object.entries(excludedTables).map(([table,reason])=>`${table}: ${reason}`), 'sessions', 'password_hash', 'connection credentials and config', 'encryption keys', 'live membership authority', 'work execution bindings require current reauthorization', 'execution secret payloads', 'active provider connections require reconfiguration'];
export async function createExport(ctx: AdoptionContext, key: string) {
    await owner(ctx);
    check(key && key.length <= 200, 'idempotency_key_required');
    const db = ctx.env.DB, w = ctx.principal.workspaceId;
    const existing = await db.prepare('SELECT id FROM adoption_exports WHERE workspace_id=? AND idempotency_key=?').bind(w, key).first<{
        id: string;
    }>();
    if (existing)
        return getRun(ctx, 'exports', existing.id);
    await prepareArchiveIdentityProjection(ctx.env);
    const privacyRevision=await archivePrivacyRevision(ctx);
    const run = id(), at = now(), statements: D1PreparedStatement[] = [db.prepare("INSERT INTO adoption_exports(id,workspace_id,actor_id,idempotency_key,state,created_at,manifest_json) VALUES(?,?,?,?,'snapshot',?,?)").bind(run, w, ctx.principal.userId, key, at,JSON.stringify({privacyRevision}))];
    const present = (await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{
        name: string;
    }>()).results.map(x => x.name);
    for (const table of nativeTables) {
        if (!present.includes(table))
            continue;
        const info = (await db.prepare(`PRAGMA table_info(${table})`).all<{
            name: string;
            pk: number;
        }>()).results;
        const columns = info.map(x => x.name);
        check(columns.includes('workspace_id'), 'unsupported_schema');
        check(columns.every(c => /^[a-z_][a-z0-9_]*$/.test(c)), 'unsupported_schema');
        const roleMetadata = table==='work_department_roles'||table==='work_department_role_members';
        const object = `json_object(${columns.map(c => `'${c}',${/password|secret|token|encryption_key/i.test(c) || table==='work_department_role_members'&&c==='granted_by' ? 'NULL' : roleMetadata&&c==='active' ? '0' : c}`).join(',')})`;
        const primary = info.filter(x => x.pk > 0).sort((a, b) => a.pk - b.pk).map(x => x.name);
        const sourceKey = primary.length === 1 ? `CAST(${primary[0]} AS TEXT)` : primary.length ? `json_array(${primary.join(',')})` : object;
        statements.push(db.prepare(`INSERT INTO adoption_snapshot(export_id,workspace_id,table_name,source_key,row_json) SELECT ?,workspace_id,?,${sourceKey},${object} FROM ${table} WHERE workspace_id=?`).bind(run, table, w));
    }
    statements.push(db.prepare("INSERT INTO adoption_snapshot(export_id,workspace_id,table_name,source_key,row_json) SELECT ?,m.workspace_id,'identities',u.id,json_object('id',u.id,'email',u.email,'name',u.name) FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=?").bind(run, w));
    statements.push(db.prepare("INSERT INTO adoption_snapshot(export_id,workspace_id,table_name,source_key,row_json) SELECT ?,m.workspace_id,'identities',m.target_id,json_object('id',m.target_id,'email',json_extract(h.row_json,'$.email'),'name',json_extract(h.row_json,'$.name'),'source',h.source_id,'source_id',h.source_key) FROM adoption_identity_map m JOIN adoption_history h ON h.workspace_id=m.workspace_id AND h.source_id=m.source_id AND h.source_key=m.source_key AND h.table_name='identities' WHERE m.workspace_id=? AND h.state='history_only' AND NOT EXISTS(SELECT 1 FROM memberships member WHERE member.workspace_id=m.workspace_id AND member.user_id=m.target_id) GROUP BY m.target_id").bind(run, w));
    statements.push(db.prepare("INSERT INTO adoption_snapshot(export_id,workspace_id,table_name,source_key,row_json) SELECT ?,id,'workspace',id,json_object('id',id,'name',name,'created_at',created_at) FROM workspaces WHERE id=?").bind(run, w));
    statements.push(db.prepare("INSERT INTO adoption_snapshot(export_id,workspace_id,table_name,source_key,row_json) SELECT ?,c.workspace_id,'adoption_artifacts',c.run_id||'/'||c.ordinal,json_object('id',c.run_id||'/'||c.ordinal,'workspace_id',c.workspace_id,'run_id',c.run_id,'ordinal',c.ordinal,'kind',c.kind,'blob_key',c.object_key,'size',c.size,'sha256',c.sha256,'metadata_json',c.metadata_json,'created_at',i.created_at) FROM adoption_chunks c JOIN adoption_imports i ON i.id=c.run_id AND i.workspace_id=c.workspace_id WHERE c.workspace_id=? AND i.state<>'erased' AND i.input_erased_at IS NULL").bind(run, w));
    statements.push(statement(ctx, 'adoption.export.snapshot', run));
    await db.batch(statements);
    check(await archivePrivacyRevision(ctx)===privacyRevision,'erasure_invalidated_snapshot',409);
    return getRun(ctx, 'exports', run);
}
async function saveChunk(ctx: AdoptionContext, runId: string, chunk: Chunk, bytes: Uint8Array) { const key = `${ctx.principal.workspaceId}/adoption/exports/${runId}/${chunk.ordinal}`; await ctx.env.ATTACHMENTS.put(key, bytes, { httpMetadata: { contentType: 'application/octet-stream' } }); await ctx.env.DB.prepare('INSERT OR REPLACE INTO adoption_chunks VALUES(?,?,?,?,?,?,?,?)').bind(ctx.principal.workspaceId, runId, chunk.ordinal, chunk.kind, key, chunk.sha256, chunk.size, JSON.stringify(chunk)).run(); }
export async function advanceExport(ctx: AdoptionContext, runId: string) {
    const run = await getRun(ctx, 'exports', runId);
    check(run.state !== 'erased', 'archive_erased', 410);
    const privacyRevision=await assertExportPrivacy(ctx,JSON.parse(String(run.manifest_json||'{}')));
    if (run.state === 'ready')
        return JSON.parse(String(run.manifest_json));
    const page = (await ctx.env.DB.prepare('SELECT * FROM adoption_snapshot WHERE workspace_id=? AND export_id=? AND seq>? ORDER BY seq LIMIT 25').bind(ctx.principal.workspaceId, runId, run.checkpoint).all<{
        seq: number;
        table_name: string;
        source_key: string;
        row_json: string;
    }>()).results;
    const projector=await archiveProjector(ctx,runId);
    for (const item of page) {
        const record=await projector.project({table:item.table_name,key:item.source_key,row:JSON.parse(item.row_json)}),row=record.row;
        const bytes = encode([record]);
        check(bytes.byteLength <= MAX_CHUNK, 'record_exceeds_chunk_limit');
        await saveChunk(ctx, runId, { ordinal: item.seq * 100, kind: 'records', size: bytes.byteLength, sha256: await sha(bytes), count: 1 }, bytes);
        if ((item.table_name === 'work_attachments' || item.table_name === 'adoption_artifacts')) {
            check(typeof row.blob_key === 'string' && row.blob_key.startsWith(ctx.principal.workspaceId + '/'), 'attachment_scope_invalid');
            const object = await ctx.env.ATTACHMENTS.get(row.blob_key);
            check(object, 'attachment_bytes_missing', 409);
            check(object.size === row.size && object.size <= 64 * 1024 * 1024, 'attachment_size_mismatch', 409);
            const data = new Uint8Array(await object.arrayBuffer());
            check(await sha(data) === row.sha256, 'attachment_hash_mismatch', 409);
            const parts = Math.max(1, Math.ceil(data.length / MAX_CHUNK));
            for (let part = 0; part < parts; part++) {
                const bytes = data.slice(part * MAX_CHUNK, (part + 1) * MAX_CHUNK);
                await saveChunk(ctx, runId, { ordinal: item.seq * 100 + part + 1, kind: 'attachment', size: bytes.length, sha256: await sha(bytes), count: 1, attachmentId: String(row.id), name: String(row.name), contentType: String(row.content_type), offset: part * MAX_CHUNK, totalSize: data.length, fullSha256: String(row.sha256) } as Chunk, bytes);
            }
        }
        await ctx.env.DB.prepare('UPDATE adoption_exports SET checkpoint=MAX(checkpoint,?) WHERE workspace_id=? AND id=?').bind(item.seq, ctx.principal.workspaceId, runId).run();
    }
    await projector.flushAliases();
    check(privacyRevision===await archivePrivacyRevision(ctx),'erasure_invalidated_snapshot',409);
    if (page.length)
        return { id: runId, state: 'snapshot', processed: page.length };
    const counts = (await ctx.env.DB.prepare('SELECT table_name,COUNT(*) n FROM adoption_snapshot WHERE export_id=? AND workspace_id=? GROUP BY table_name').bind(runId, ctx.principal.workspaceId).all<{
        table_name: string;
        n: number;
    }>()).results;
    const chunks = (await ctx.env.DB.prepare('SELECT metadata_json FROM adoption_chunks WHERE workspace_id=? AND run_id=? ORDER BY ordinal').bind(ctx.principal.workspaceId, runId).all<{
        metadata_json: string;
    }>()).results.map(x => JSON.parse(x.metadata_json));
    const manifest: Manifest = { format: 'linen-native', version: 1, sourceWorkspace: ctx.principal.workspaceId, exportId: runId, snapshotAt: String(run.created_at), state: 'ready', tables: Object.fromEntries(counts.map(x => [x.table_name, x.n])), chunks, excluded,privacyRevision };
    const manifestKey = `${ctx.principal.workspaceId}/adoption/exports/${runId}/manifest.json`;
    await ctx.env.ATTACHMENTS.put(manifestKey, JSON.stringify(manifest), { httpMetadata: { contentType: 'application/json' } });
    await ctx.env.DB.batch([ctx.env.DB.prepare("UPDATE adoption_exports SET state='ready',manifest_json=? WHERE workspace_id=? AND id=? AND state='snapshot'").bind(JSON.stringify(manifest), ctx.principal.workspaceId, runId), statement(ctx, 'adoption.export.ready', runId, { chunks: chunks.length })]);
    return manifest;
}
export async function downloadChunk(ctx: AdoptionContext, runId: string, ordinal: number) { const run = await getRun(ctx, 'exports', runId); check(run.state === 'ready', 'archive_not_available', 409); await assertExportPrivacy(ctx,JSON.parse(String(run.manifest_json))); const chunk = await ctx.env.DB.prepare('SELECT * FROM adoption_chunks WHERE workspace_id=? AND run_id=? AND ordinal=?').bind(ctx.principal.workspaceId, runId, ordinal).first<any>(); check(chunk, 'not_found', 404); await auditedDownload(ctx, runId, ordinal); const object = await ctx.env.ATTACHMENTS.get(chunk.object_key); check(object, 'artifact_missing', 409); const bytes = await object.arrayBuffer(); check(await sha(bytes) === chunk.sha256, 'artifact_corrupt', 409); await assertExportPrivacy(ctx,JSON.parse(String(run.manifest_json))); return new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-SHA256': chunk.sha256 } }); }
async function auditedDownload(ctx: AdoptionContext, runId: string, ordinal: number) { await ctx.env.DB.batch([statement(ctx, 'adoption.export.download', runId, { ordinal })]); }

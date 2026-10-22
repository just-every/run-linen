import { reconcilePendingHistory } from '../history/reconcile';
import { prepareHistoryErasure } from '../history/erasure';
import { historyArchiveRow } from '../history/archive';
import { privacyBindingFence } from '../work/person-privacy';
import { ApiError, id, now } from '../../platform/http';
import type { Env } from '../../platform/types';
import { check, owner, statement, identityHash, queueDelete, type AdoptionContext } from './core';
import { encryptSecret, decryptSecret } from '../../platform/crypto';
import { erasureIdentities } from './erasure-identities';
import { builtinErasurePorts } from './erasure-ports';
export interface ErasurePort {
    name: string;
    erase(ctx: AdoptionContext, identity: string): Promise<void>;
}
const erasers = new Map<string, ErasurePort>(builtinErasurePorts.map(p => [p.name, p]));
export function registerAdoptionErasurePort(port: ErasurePort) { check(!erasers.has(port.name), 'duplicate_erasure_port'); erasers.set(port.name, port); }
export async function configureRetention(ctx: AdoptionContext, days: number, revision: number) { await owner(ctx); check(Number.isInteger(days) && days >= 1 && days <= 3650, 'invalid_retention'); const row = await ctx.env.DB.prepare('SELECT revision FROM adoption_retention WHERE workspace_id=?').bind(ctx.principal.workspaceId).first<any>(); check((row?.revision || 0) === revision, 'retention_revision_conflict', 409); const update = row ? ctx.env.DB.prepare('UPDATE adoption_retention SET archive_days=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND revision=?').bind(days, now(), ctx.principal.workspaceId, revision) : ctx.env.DB.prepare('INSERT INTO adoption_retention VALUES(?,?,1,?)').bind(ctx.principal.workspaceId, days, now()); await ctx.env.DB.batch([update, statement(ctx, 'adoption.retention.configure', ctx.principal.workspaceId, { days })]); return { archiveDays: days, revision: revision + 1 }; }
export async function invalidateArchive(ctx: AdoptionContext, runId: string, kind: 'exports' | 'imports') {
    const chunks = (await ctx.env.DB.prepare('SELECT object_key FROM adoption_chunks WHERE workspace_id=? AND run_id=?').bind(ctx.principal.workspaceId, runId).all<{
        object_key: string;
    }>()).results;
    await ctx.env.DB.prepare(`UPDATE adoption_${kind} SET state='erased',manifest_json='{}' WHERE workspace_id=? AND id=?`).bind(ctx.principal.workspaceId, runId).run();
    for (const chunk of chunks)
        await queueDelete(ctx, chunk.object_key);
    if (kind === 'exports') {
        await queueDelete(ctx, `${ctx.principal.workspaceId}/adoption/exports/${runId}/manifest.json`);
        await ctx.env.DB.prepare('DELETE FROM adoption_snapshot WHERE workspace_id=? AND export_id=?').bind(ctx.principal.workspaceId, runId).run();
    }
    await ctx.env.DB.prepare('DELETE FROM adoption_chunks WHERE workspace_id=? AND run_id=?').bind(ctx.principal.workspaceId, runId).run();
}
export async function erasePersonData(ctx: AdoptionContext, identity: string, options:{preserveImportId?:string}={}) {
    await owner(ctx);
    check(identity && identity.length <= 300, 'identity_required');
    const self = await ctx.env.DB.prepare('SELECT 1 FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND u.id=? AND (u.id=? OR lower(u.email)=lower(?) OR EXISTS(SELECT 1 FROM adoption_identity_map a WHERE a.workspace_id=m.workspace_id AND a.source_key=? AND a.target_id=u.id))').bind(ctx.principal.workspaceId, ctx.principal.userId, identity, identity, identity).first();
    check(!self, 'different_owner_required_for_self_erasure', 409);
    const expanded = await erasureIdentities(ctx, identity);
    check(!expanded.identities.includes(ctx.principal.userId), 'different_owner_required_for_self_erasure', 409);
    const historyErasure=await prepareHistoryErasure(ctx,expanded.identities,now());
    const hash = await identityHash(identity), jobId = id();
    try {
        await ctx.env.DB.batch([
            privacyBindingFence(ctx, expanded.people, jobId, expanded.identities),
            ...historyErasure.statements,
            ...await Promise.all(expanded.identities.map(async value =>
                ctx.env.DB.prepare('INSERT OR IGNORE INTO adoption_tombstones VALUES(?,?,?)')
                    .bind(ctx.principal.workspaceId, await identityHash(value), now()))),
            ctx.env.DB.prepare("INSERT INTO adoption_erasure_jobs(id,workspace_id,identity_hash,state,ports_json,created_at,identity_ciphertext,actor_id,updated_at,aliases_ciphertext,history_counts_json) VALUES(?,?,?,'pending','[]',?,?,?,?,?,?)")
                .bind(jobId, ctx.principal.workspaceId, hash, now(), await encryptSecret(ctx.env.ENCRYPTION_KEY, identity),
                    ctx.principal.userId, now(), await encryptSecret(ctx.env.ENCRYPTION_KEY, JSON.stringify(expanded.identities)),JSON.stringify(historyErasure.counts)),
            ...(options.preserveImportId ? [ctx.env.DB.prepare('INSERT INTO adoption_import_erasures VALUES(?,?,?)')
                .bind(ctx.principal.workspaceId, options.preserveImportId, jobId)] : []),
            statement(ctx, 'adoption.erase.request', hash),
            ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(jobId),
        ]);
    } catch (error) {
        if (/CHECK constraint failed/i.test(String(error)))
            throw new ApiError(409, 'revision_conflict', 'Person or reviewed binding changed; reload before erasure');
        throw error;
    }
    // Archive invalidation is deliberately conservative: no stale sensitive package remains downloadable.
    const exports = (await ctx.env.DB.prepare("SELECT id FROM adoption_exports WHERE workspace_id=? AND state<>'erased'").bind(ctx.principal.workspaceId).all<{
        id: string;
    }>()).results;
    for (const r of exports)
        await invalidateArchive(ctx, r.id, 'exports');
    const imports = (await ctx.env.DB.prepare("SELECT id FROM adoption_imports WHERE workspace_id=? AND state<>'erased'").bind(ctx.principal.workspaceId).all<{
        id: string;
    }>()).results;
    for (const r of imports)
        if(r.id!==options.preserveImportId)await invalidateArchive(ctx, r.id, 'imports');
    const history = (await ctx.env.DB.prepare('SELECT id,table_name,row_json FROM adoption_history WHERE workspace_id=?').bind(ctx.principal.workspaceId).all<{
        id: string;
        row_json: string; table_name:string;
    }>()).results;
    const blocked = new Set(expanded.identities);
    let changed = true;
    while (changed) {
        changed = false;
        for (const row of history) {
            const archive=await historyArchiveRow(ctx,row.table_name,JSON.parse(row.row_json));
            if(archive.typed){await ctx.env.DB.prepare('UPDATE adoption_history SET row_json=? WHERE workspace_id=? AND id=?').bind(JSON.stringify(archive.row),ctx.principal.workspaceId,row.id).run();continue;}
            const value = JSON.parse(row.row_json);
            if (Object.values(value).some(v => typeof v === 'string' && [...blocked].some(identity => v === identity || (identity.length > 3 && v.includes(identity)))) || blocked.has(`${value.source}:${value.source_id}`)) {
                if (value.id && !blocked.has(value.id)) {
                    blocked.add(value.id);
                    changed = true;
                }
                await ctx.env.DB.prepare("UPDATE adoption_history SET row_json='{}',state='erased',reason='erasure tombstone' WHERE workspace_id=? AND id=?").bind(ctx.principal.workspaceId, row.id).run();
                row.row_json = '{}';
            }
        }
    }
    for (const blockedId of blocked)
        await ctx.env.DB.prepare('INSERT OR IGNORE INTO adoption_tombstones VALUES(?,?,?)').bind(ctx.principal.workspaceId, await identityHash(blockedId), now()).run();
    const artifacts = (await ctx.env.DB.prepare('SELECT blob_key FROM adoption_artifacts WHERE workspace_id=?').bind(ctx.principal.workspaceId).all<{
        blob_key: string;
    }>()).results;
    for (const a of artifacts)
        await queueDelete(ctx, a.blob_key);
    await ctx.env.DB.prepare('DELETE FROM adoption_artifacts WHERE workspace_id=?').bind(ctx.principal.workspaceId).run();
    // Provider snapshots may embed identity in arbitrary nested source fields. Delete all retained payloads rather than retain hidden copies.
    await ctx.env.DB.prepare("UPDATE adoption_source_records SET payload_json='{}',state='erased' WHERE workspace_id=?").bind(ctx.principal.workspaceId).run();
    return resumeErasure(ctx, jobId);
}
export async function resumeErasure(ctx: AdoptionContext, jobId: string) {
    await owner(ctx);
    const job = await ctx.env.DB.prepare('SELECT * FROM adoption_erasure_jobs WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, jobId).first<any>();
    check(job, 'erasure_not_found', 404);
    if (job.state === 'completed')
        return { id: jobId, state: 'completed', pendingDomains: [],historyCounts:JSON.parse(job.history_counts_json) };
    const identity = await decryptSecret(ctx.env.ENCRYPTION_KEY, job.identity_ciphertext), done = JSON.parse(job.ports_json) as string[];
    const { identities, platformIds } = await erasureIdentities(ctx, identity);if(job.aliases_ciphertext){const saved=JSON.parse(await decryptSecret(ctx.env.ENCRYPTION_KEY,job.aliases_ciphertext));check(Array.isArray(saved)&&saved.every(v=>typeof v==='string'),'invalid_erasure_aliases');identities.push(...saved)}
    check(!identities.includes(ctx.principal.userId), 'different_owner_required_for_self_erasure', 409);
    for (const value of identities)
        await ctx.env.DB.prepare('INSERT OR IGNORE INTO adoption_tombstones VALUES(?,?,?)').bind(ctx.principal.workspaceId, await identityHash(value), now()).run();
    const errors: Record<string, string> = {};
    for (const [name, port] of [...erasers].sort(([a], [b]) => Number(a === 'platform') - Number(b === 'platform'))) {
        if (done.includes(name))
            continue;
        try {
            check(name !== 'platform' || [...erasers.keys()].filter(domain => domain !== 'platform').every(domain => done.includes(domain)), 'remote_erasure_reconciliation_required', 409);
            for (const value of name === 'platform' ? (platformIds.length ? [...new Set(platformIds)] : [identity]) : [...new Set(identities)])
                await port.erase(ctx, value);
            done.push(name);
        }
        catch (e) {
            errors[name] = e instanceof ApiError ? e.code : 'erasure_domain_failed';
        }
        await ctx.env.DB.prepare('UPDATE adoption_erasure_jobs SET ports_json=?,error_code=?,updated_at=? WHERE workspace_id=? AND id=?').bind(JSON.stringify(done), Object.keys(errors).length ? 'domain_erasure_pending' : null, now(), ctx.principal.workspaceId, jobId).run();
    }
    const required = [...erasers.keys()];
    await processDueAdoption(ctx.env);const blobs=await ctx.env.DB.prepare("SELECT COUNT(*) n FROM adoption_deletions WHERE workspace_id=? AND state='pending'").bind(ctx.principal.workspaceId).first<{n:number}>();const pending = required.filter(n => !done.includes(n)), state = pending.length ? 'domain_erasure_pending' : blobs?.n?'blob_cleanup_pending':'completed';
    await ctx.env.DB.batch([ctx.env.DB.prepare('UPDATE adoption_erasure_jobs SET state=?,identity_ciphertext=CASE WHEN ?=1 THEN NULL ELSE identity_ciphertext END,aliases_ciphertext=CASE WHEN ?=1 THEN NULL ELSE aliases_ciphertext END,updated_at=? WHERE workspace_id=? AND id=?').bind(state, Number(state==='completed'),Number(state==='completed'), now(), ctx.principal.workspaceId, jobId), statement(ctx, 'adoption.erase.checkpoint', job.identity_hash, { state, completedDomains: done })]);
    return { id: jobId, state,historyCounts:JSON.parse(job.history_counts_json), completedDomains: done, pendingDomains: pending, pendingBlobs:blobs?.n||0, errors };
}
export async function processDueAdoption(env: Env) {
    await reconcilePendingHistory(env);
    let deleted = 0, failed = 0;
    const pending = (await env.DB.prepare("SELECT * FROM adoption_deletions WHERE state='pending' ORDER BY created_at LIMIT 100").all<any>()).results;
    for (const row of pending) {
        try {
            check(row.object_key.startsWith(row.workspace_id + '/'), 'invalid_object_scope');
            await env.ATTACHMENTS.delete(row.object_key);
            await env.DB.prepare("UPDATE adoption_deletions SET state='deleted',attempts=attempts+1 WHERE id=?").bind(row.id).run();
            deleted++;
        }
        catch {
            await env.DB.prepare('UPDATE adoption_deletions SET attempts=attempts+1 WHERE id=?').bind(row.id).run();
            failed++;
        }
    }
    const policies = (await env.DB.prepare('SELECT * FROM adoption_retention').all<any>()).results;
    for (const policy of policies) {
        const before = new Date(Date.now() - policy.archive_days * 86400000).toISOString();
        for (const kind of ['exports', 'imports'] as const) {
            const rows = (await env.DB.prepare(`SELECT id FROM adoption_${kind} WHERE workspace_id=? AND created_at<? AND state<>'erased' LIMIT 25`).bind(policy.workspace_id, before).all<{
                id: string;
            }>()).results;
            for (const row of rows)
                await invalidateArchive({ env, principal: { workspaceId: policy.workspace_id, userId: 'retention-service', roles: [] } }, row.id, kind);
        }
    }
    await env.DB.prepare("UPDATE adoption_erasure_jobs SET state='completed',identity_ciphertext=NULL,aliases_ciphertext=NULL,updated_at=? WHERE state='blob_cleanup_pending' AND NOT EXISTS(SELECT 1 FROM adoption_deletions d WHERE d.workspace_id=adoption_erasure_jobs.workspace_id AND d.state='pending')").bind(now()).run();
    return { deleted, failed };
}

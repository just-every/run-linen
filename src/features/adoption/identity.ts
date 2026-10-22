import { now } from '../../platform/http';
import { check, getRun, owner, statement, type AdoptionContext } from './core';
import { recordsFor, validateManifest } from './import';
import { isArchiveAlias } from '../history/archive-identities.mjs';
export async function mapImportedPrincipal(ctx: AdoptionContext, runId: string, sourceUserId: string, targetUserId: string) {
    await owner(ctx);
    check(!isArchiveAlias(sourceUserId)&&!['[erased]','erased'].includes(sourceUserId),'erased_identity_binding',409);
    const run = await getRun(ctx, 'imports', runId);
    check(['uploading', 'validated'].includes(String(run.state)), 'identity_mapping_locked', 409);
    check(await ctx.env.DB.prepare('SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(ctx.principal.workspaceId, targetUserId).first(), 'target_membership_required');
    let found = false;
    for (const chunk of validateManifest(JSON.parse(String(run.manifest_json))).chunks.filter(c => c.kind === 'records'))
        for (const record of await recordsFor(ctx, runId, chunk))
            if (record.table === 'identities' && record.row.id === sourceUserId)
                found = true;
    check(found, 'source_principal_not_found', 404);
    const prior = await ctx.env.DB.prepare('SELECT 1 FROM adoption_identity_map WHERE workspace_id=? AND source_id=? AND source_key=?').bind(ctx.principal.workspaceId, run.source_id, sourceUserId).first();
    check(!prior, 'source_identity_already_mapped', 409);
    await ctx.env.DB.batch([ctx.env.DB.prepare('INSERT INTO adoption_identity_map VALUES(?,?,?,?,?,?,?)').bind(ctx.principal.workspaceId, run.source_id, sourceUserId, targetUserId, 'principal', ctx.principal.userId, now()), statement(ctx, 'adoption.identity.map', runId, { sourceUserId, targetUserId })]);
    return { sourceUserId, targetUserId, rolesGranted: false };
}

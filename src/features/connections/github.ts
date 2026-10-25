import { connectionConfig } from '../../platform/connection-config';
import { decryptSecret } from '../../platform/crypto';
import { providerFetch } from '../execution/transport';
import { check, safeJson, type ConnectionContext } from './core';

// Fixed GitHub API origin, read methods only. Repository permission is not a workflow recovery claim.
export async function verifyGitHubConnection(ctx: ConnectionContext, row: any) {
    const config = connectionConfig('github', JSON.parse(row.config_json));
    const { repositoryOwner, repositoryName, memberId, githubLogin, githubUserId } = config;
    check(repositoryOwner && repositoryName && memberId && githubLogin && githubUserId, 'github_binding_required', 400);
    check(await ctx.env.DB.prepare('SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1')
        .bind(ctx.principal.workspaceId, memberId).first(), 'github_member_inactive', 409);
    check(row.secret_ciphertext, 'credential_required', 503);
    let secret: any;
    try { secret = JSON.parse(await decryptSecret(ctx.env.ENCRYPTION_KEY, row.secret_ciphertext)); }
    catch { check(false, 'credential_invalid', 400); }
    check(typeof secret.token === 'string' && secret.token.length > 0, 'credential_invalid', 400);
    const repository = `${repositoryOwner}/${repositoryName}`;
    const read = async (path: string) => safeJson(await providerFetch(ctx, row.id, 'github_access_readback',
        `https://api.github.com${path}`, { method: 'GET', headers: {
            Authorization: `Bearer ${secret.token}`, Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Linen', 'Cache-Control': 'no-cache',
        }, redirect: 'manual', signal: AbortSignal.timeout(20000) }));
    const path = `/repos/${encodeURIComponent(String(repositoryOwner))}/${encodeURIComponent(String(repositoryName))}`;
    const repo = await read(path);
    check(typeof repo.full_name === 'string' && repo.full_name.toLowerCase() === repository.toLowerCase()
        && Number.isSafeInteger(repo.id) && repo.id > 0, 'github_repository_mismatch', 502);
    const access = await read(`${path}/collaborators/${encodeURIComponent(String(githubLogin))}/permission`);
    check(access.user?.id === githubUserId && typeof access.user?.login === 'string'
        && access.user.login.toLowerCase() === String(githubLogin).toLowerCase()
        && ['none', 'read', 'triage', 'write', 'maintain', 'admin'].includes(access.permission), 'github_identity_mismatch', 502);
    return { repository, repositoryId: repo.id, memberId, githubLogin: access.user.login as string,
        githubUserId, permission: access.permission as string, accessVerified: access.permission !== 'none',
        readOnly: true, workflowVerified: false, observedAt: new Date().toISOString() };
}

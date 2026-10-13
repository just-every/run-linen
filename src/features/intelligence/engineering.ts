import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { id, jsonBody, now, requiredString } from '../../platform/http';
import { hashToken, token } from '../../platform/crypto';
import { assert, audit, current, iso } from './access';
import { getCommitment } from './commitments';
import { callModel, objectSchema, textSchema } from './models';
import type { IntelligenceContext } from './types';
export async function createEngineeringGrant(ctx: IntelligenceContext, b: any) {
    ctx = await current(ctx, ['owner']);
    const config = b.config;
    assert(config && typeof config.repository === 'string' && config.repository.startsWith('/') && /^[a-f0-9]{40}$/.test(config.baseCommit), 'owned_repository_and_pin_required');
    assert(Array.isArray(config.allowedPaths) && config.allowedPaths.length && config.allowedPaths.every((p: any) => typeof p === 'string' && !p.startsWith('/') && !p.split('/').includes('..') && !p.startsWith('.git')), 'engineering_paths_invalid');
    assert(config.commands && ['reproducer', 'test', 'check', 'canary', 'release', 'adoption'].every(k => Array.isArray(config.commands[k]) && config.commands[k].length > 0 && config.commands[k].every((a: any) => typeof a === 'string')), 'explicit_engineering_commands_required');
    assert(config.independentPaths && Array.isArray(config.independentPaths) && config.independentPaths.length, 'independent_checks_required');
    assert(typeof config.releaseRef === 'string' && /^refs\/heads\/[a-zA-Z0-9/_-]+$/.test(config.releaseRef), 'local_release_ref_required');
    assert(config.commands.check.join('\0') !== config.commands.test.join('\0'), 'independent_check_required');
    assert(Array.isArray(config.commitmentIds) && config.commitmentIds.length, 'engineering_commitment_scope_required');
    for (const key of config.commitmentIds)
        await getCommitment(ctx, key);
    assert(Array.isArray(config.contextPaths) && config.contextPaths.length && config.contextPaths.every((p: any) => typeof p === 'string' && !p.startsWith('/') && !p.split('/').includes('..') && !p.startsWith('.git')), 'engineering_context_paths_required');
    const expires = iso(b.expiresAt);
    assert(expires > now(), 'engineering_grant_expired');
    const grantId = id(), bearer = token();
    await ctx.env.DB.prepare('INSERT INTO intelligence_engineering_grants VALUES(?,?,1,?,?,?,?,NULL,?)').bind(grantId, ctx.principal.workspaceId, ctx.principal.userId, await hashToken(bearer), JSON.stringify(config), expires, now()).run();
    await audit(ctx, 'engineering.grant.created', grantId, { repository: config.repository });
    return { id: grantId, version: 1, token: bearer, expiresAt: expires };
}
export async function queueEngineeringNeed(ctx: IntelligenceContext, b: {
    commitmentId: string;
    researchId?: string;
    description: string;
}) {
    ctx = await current(ctx, ['owner', 'operator', 'hr', 'integration']);
    await getCommitment(ctx, b.commitmentId);
    const key = id();
    await ctx.env.DB.prepare("INSERT INTO intelligence_engineering_jobs VALUES(?,?,?,?,NULL,NULL,'needs_engineering_grant',?,NULL,NULL,NULL,?,?)").bind(key, ctx.principal.workspaceId, b.commitmentId, b.researchId || null, JSON.stringify({ description: requiredString(b.description, 'description', 10000) }), now(), now()).run();
    const grants = await ctx.env.DB.prepare('SELECT * FROM intelligence_engineering_grants WHERE workspace_id=? AND revoked_at IS NULL AND expires_at>?').bind(ctx.principal.workspaceId, now()).all<any>();
    const granted = grants.results.find(g => JSON.parse(g.config_json).commitmentIds?.includes(b.commitmentId));
    if (granted) {
        await ctx.env.DB.prepare("UPDATE intelligence_engineering_jobs SET grant_id=?,grant_version=?,state='queued' WHERE id=?").bind(granted.id, granted.version, key).run();
        return { id: key, state: 'queued' };
    }
    return { id: key, state: 'needs_engineering_grant' };
}
export async function assignEngineeringJob(ctx: IntelligenceContext, b: any) {
    ctx = await current(ctx, ['owner']);
    await getCommitment(ctx, b.commitmentId);
    const g: any = await ctx.env.DB.prepare('SELECT * FROM intelligence_engineering_grants WHERE id=? AND workspace_id=? AND revoked_at IS NULL AND expires_at>?').bind(b.grantId, ctx.principal.workspaceId, now()).first();
    assert(g, 'engineering_grant_unavailable', 403);
    assert(JSON.parse(g.config_json).commitmentIds.includes(b.commitmentId), 'engineering_commitment_denied', 403);
    const spec = b.spec;
    assert(spec && typeof spec.description === 'string' && (!spec.edits || Array.isArray(spec.edits) && spec.edits.length <= 30), 'engineering_edits_required');
    assert((spec.edits || []).every((e: any) => typeof e.path === 'string' && typeof e.beforeSha256 === 'string' && typeof e.content === 'string' && e.content.length <= 100000), 'invalid_engineering_edit');
    const key = b.jobId || id();
    if (b.jobId) {
        const update = await ctx.env.DB.prepare("UPDATE intelligence_engineering_jobs SET grant_id=?,grant_version=?,spec_json=?,state='queued',updated_at=? WHERE workspace_id=? AND id=? AND commitment_id=? AND state='needs_engineering_grant'").bind(g.id, g.version, JSON.stringify(spec), now(), ctx.principal.workspaceId, key, b.commitmentId).run();
        assert(update.meta.changes === 1, 'engineering_job_not_assignable', 409);
    }
    else
        await ctx.env.DB.prepare("INSERT INTO intelligence_engineering_jobs VALUES(?,?,?,?,?,?,'queued',?,NULL,NULL,NULL,?,?)").bind(key, ctx.principal.workspaceId, b.commitmentId, b.researchId || null, g.id, g.version, JSON.stringify(spec), now(), now()).run();
    return { id: key, state: 'queued' };
}
async function agentGrant(env: AppEnv['Bindings'], bearer?: string) {
    assert(bearer?.startsWith('Bearer '), 'engineering_bearer_required', 401);
    const g: any = await env.DB.prepare('SELECT g.* FROM intelligence_engineering_grants g JOIN memberships m ON m.workspace_id=g.workspace_id AND m.user_id=g.owner_id WHERE g.token_hash=? AND g.revoked_at IS NULL AND g.expires_at>? AND m.active=1').bind(await hashToken(bearer!.slice(7)), now()).first();
    assert(g, 'engineering_grant_revoked', 403);
    const m: any = await env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=?').bind(g.workspace_id, g.owner_id).first();
    assert(JSON.parse(m.roles_json).includes('owner'), 'engineering_owner_revoked', 403);
    const settings: any = await env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id=?').bind(g.workspace_id).first();
    assert(!JSON.parse(settings?.settings_json || '{}').executionHeld, 'execution_held', 409);
    return g;
}
export function registerEngineeringAgentRoutes(app: Hono<AppEnv>) {
    app.post('/engineering-agent/claim', async (c) => {
        const g = await agentGrant(c.env, c.req.header('Authorization'));
        await c.env.DB.prepare("UPDATE intelligence_engineering_jobs SET state='unknown',updated_at=? WHERE grant_id=? AND state='running' AND lease_until<?").bind(now(), g.id, now()).run();
        const job: any = await c.env.DB.prepare("SELECT * FROM intelligence_engineering_jobs WHERE grant_id=? AND grant_version=? AND state='queued' ORDER BY created_at LIMIT 1").bind(g.id, g.version).first();
        if (!job)
            return c.json({ job: null });
        const claim = token(), expires = new Date(Date.now() + 120000).toISOString();
        const r = await c.env.DB.prepare("UPDATE intelligence_engineering_jobs SET state='running',claim_token_hash=?,lease_until=?,updated_at=? WHERE id=? AND state='queued'").bind(await hashToken(claim), expires, now(), job.id).run();
        assert(r.meta.changes === 1, 'engineering_claim_conflict', 409);
        return c.json({ job: { id: job.id, spec: JSON.parse(job.spec_json) }, grant: { id: g.id, version: g.version, config: JSON.parse(g.config_json) }, claimToken: claim, leaseUntil: expires });
    });
    app.post('/engineering-agent/jobs/:id/design', async (c) => {
        const g = await agentGrant(c.env, c.req.header('Authorization')), b = await jsonBody(c), config = JSON.parse(g.config_json);
        const job: any = await c.env.DB.prepare("SELECT * FROM intelligence_engineering_jobs WHERE id=? AND grant_id=? AND claim_token_hash=? AND state='running' AND lease_until>?").bind(c.req.param('id'), g.id, await hashToken(requiredString(b.claimToken, 'claimToken')), now()).first();
        assert(job, 'engineering_claim_expired', 409);
        const files: any = b.files;
        assert(Array.isArray(files) && files.length > 0 && files.length <= 50 && files.every((f: any) => config.contextPaths.includes(f.path) && typeof f.content === 'string' && f.content.length <= 40000 && typeof f.sha256 === 'string'), 'engineering_context_denied');
        assert(config.modelConnectionId, 'engineering_model_required', 503);
        const result = await callModel({ env: c.env, principal: { workspaceId: g.workspace_id, userId: g.owner_id, roles: ['owner'] } }, { connectionId: config.modelConnectionId, commitmentId: job.commitment_id, runId: job.id, purpose: 'owned_repository_engineering', prompt: 'Implement the scoped engineering need using the provided actual source. Only propose edits to allowedPaths. Preserve independent tests. Return full replacement file content, copying each preimage SHA256 exactly. Never claim commands ran. ' + JSON.stringify({ need: JSON.parse(job.spec_json).description, allowedPaths: config.allowedPaths, files }), schema: objectSchema({ edits: { type: 'array', minItems: 1, maxItems: 30, items: objectSchema({ path: textSchema, beforeSha256: textSchema, content: textSchema }) }, explanation: textSchema }) });
        const value: any = result.value;
        assert(value.edits.every((e: any) => config.allowedPaths.some((p: string) => p.endsWith('/') ? e.path.startsWith(p) : e.path === p) && files.some((f: any) => f.path === e.path && f.sha256 === e.beforeSha256)), 'model_edit_scope_denied', 502);
        await agentGrant(c.env, c.req.header('Authorization'));
        return c.json({ edits: value.edits, attemptId: result.attemptId });
    });
    app.post('/engineering-agent/jobs/:id/heartbeat', async (c) => {
        const g = await agentGrant(c.env, c.req.header('Authorization')), b = await jsonBody(c);
        const r = await c.env.DB.prepare("UPDATE intelligence_engineering_jobs SET lease_until=? WHERE id=? AND grant_id=? AND claim_token_hash=? AND state='running' AND lease_until>?").bind(new Date(Date.now() + 120000).toISOString(), c.req.param('id'), g.id, await hashToken(requiredString(b.claimToken, 'claimToken')), now()).run();
        assert(r.meta.changes === 1, 'engineering_claim_expired', 409);
        return c.json({ authorized: true, grantVersion: g.version });
    });
    app.post('/engineering-agent/jobs/:id/receipt', async (c) => {
        const g = await agentGrant(c.env, c.req.header('Authorization')), b = await jsonBody(c), receipt: any = b.receipt;
        assert(receipt && ['failed', 'unknown', 'adopted'].includes(receipt.state) && Array.isArray(receipt.commands) && typeof receipt.jobId === 'string' && receipt.jobId === c.req.param('id'), 'invalid_engineering_receipt');
        if (receipt.state === 'adopted')
            assert(/^[a-f0-9]{40}$/.test(receipt.commit) && typeof receipt.diff === 'string' && receipt.diff.length > 0 && ['reproducer', 'test', 'check', 'canary', 'release', 'adoption'].every(phase => receipt.commands.some((x: any) => x.phase === phase && (phase === 'reproducer' ? x.exitCode !== 0 : x.exitCode === 0))), 'incomplete_engineering_receipt');
        const r = await c.env.DB.prepare("UPDATE intelligence_engineering_jobs SET state=?,receipt_json=?,updated_at=?,lease_until=NULL WHERE id=? AND grant_id=? AND claim_token_hash=? AND state IN ('running','unknown')").bind(receipt.state, JSON.stringify(receipt), now(), c.req.param('id'), g.id, await hashToken(requiredString(b.claimToken, 'claimToken'))).run();
        assert(r.meta.changes === 1, 'engineering_receipt_conflict', 409);
        return c.json({ accepted: true, state: receipt.state });
    });
}

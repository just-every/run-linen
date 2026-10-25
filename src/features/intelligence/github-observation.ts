import { assert, current } from './access';
import { verifyGitHubConnection } from '../connections/github';
import type { GitHubObservationStep, IntelligenceContext } from './types';

export async function observeGitHub(ctx: IntelligenceContext, step: GitHubObservationStep) {
    ctx = await current(ctx, ['owner']);
    const row = await ctx.env.DB.prepare('SELECT * FROM connections WHERE workspace_id=? AND id=?')
        .bind(ctx.principal.workspaceId, step.verifierConnectionId).first<any>();
    assert(row?.provider === 'github' && row.status === 'active', 'github_connection_required', 503);
    assert(step.verifierConnectionRevision === row.revision, 'connection_changed', 409);
    const config = JSON.parse(row.config_json);
    assert(config.memberId === step.beneficiaryId && step.target === `${config.repositoryOwner}/${config.repositoryName}`
        && (!step.cohort || step.cohort.length === 1 && step.cohort[0] === step.beneficiaryId), 'github_binding_mismatch', 403);
    const validation = await ctx.env.DB.prepare("SELECT evidence_json FROM connection_validations WHERE workspace_id=? AND connection_id=? AND connection_revision=? AND state='active'")
        .bind(ctx.principal.workspaceId, row.id, row.revision).first<{evidence_json:string}>();
    assert(validation, 'github_connection_required', 503);
    const evidence = await verifyGitHubConnection(ctx, row);
    assert(evidence.repositoryId === JSON.parse(validation.evidence_json).repositoryId, 'github_repository_changed', 409);
    await current(ctx, ['owner']);
    const fresh = await ctx.env.DB.prepare('SELECT revision,status FROM connections WHERE workspace_id=? AND id=?')
        .bind(ctx.principal.workspaceId, row.id).first<any>();
    assert(fresh?.revision === row.revision && fresh.status === 'active', 'connection_changed', 409);
    return { source: { connectionId: row.id, revision: row.revision, provider: 'github' },
        ...evidence, target: step.target, beneficiaryId: step.beneficiaryId,
        cohort: [step.beneficiaryId] };
}

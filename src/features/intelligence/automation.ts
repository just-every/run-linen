import {followPendingIntelligence} from './followup';
import { now } from '../../platform/http';
import { dispatchChange, verifyChange } from '../services/changes';
import { getService } from '../services/store';
import { getCommitment } from './commitments';
import { getResearch, verifyResearch } from './research';
import { executeSimplification, measureSimplification } from './simplification';
import { compileVerifiedCase } from './capabilities';
import { errorCode, current } from './access';
import type { IntelligenceContext } from './types';
/** Advance actual adopted repairs and measured interventions. No record is verified from a model narrative. */
export async function advanceFrontierOperations(ctx: IntelligenceContext) {
    ctx = await current(ctx, ['owner', 'operator']);
    const results: any[] = await followPendingIntelligence(ctx);
    const jobs = await ctx.env.DB.prepare("SELECT * FROM intelligence_engineering_jobs WHERE workspace_id=? AND state='adopted' AND research_id IS NOT NULL").bind(ctx.principal.workspaceId).all<any>();
    for (const job of jobs.results) {
        try {
            const r = await getResearch(ctx, job.research_id);
            if (r.state === 'verified')
                continue;
            const grant: any = await ctx.env.DB.prepare('SELECT config_json FROM intelligence_engineering_grants WHERE workspace_id=? AND id=? AND revoked_at IS NULL AND expires_at>?').bind(ctx.principal.workspaceId, job.grant_id, now()).first();
            if (!grant)
                continue;
            const config = JSON.parse(grant.config_json);
            if (!config.serviceChangeId) {
                results.push({ jobId: job.id, state: 'local_adopted_service_release_unconfigured' });
                continue;
            }
            let change = await getService(ctx.env.DB, ctx.principal, config.serviceChangeId, 'change');
            const receipt = JSON.parse(job.receipt_json);
            if (!receipt.commit || change.data.implementation?.payload?.commit !== receipt.commit) {
                results.push({ jobId: job.id, state: 'release_artifact_not_authorized' });
                continue;
            }
            const active = change.data.invocations.find((i: any) => !['verified', 'failed'].includes(i.state));
            if (active?.executionId)
                change = await verifyChange(ctx.env, ctx.principal, change, { revision: change.revision, invocationId: active.id });
            if (change.data.state === 'authorized' || change.data.state === 'canary-verified') {
                const phase = change.data.state === 'authorized' ? 'canary' : 'rollout';
                change = await dispatchChange(ctx.env, ctx.principal, change, { revision: change.revision, phase, idempotencyKey: 'engineering:' + job.id + ':' + phase });
            }
            if (change.data.state === 'verified') {
                const invocation = change.data.invocations.find((i: any) => i.phase === 'rollout' && i.state === 'verified');
                if (invocation?.executionId)
                    results.push(await verifyResearch(ctx, r.id, invocation.executionId));
            }
            results.push({ jobId: job.id, changeState: change.data.state });
        }
        catch (e) {
            results.push({ jobId: job.id, state: 'blocked', error: errorCode(e) });
        }
    }
    const verified = await ctx.env.DB.prepare("SELECT id FROM intelligence_research WHERE workspace_id=? AND state='verified' LIMIT 30").bind(ctx.principal.workspaceId).all<any>();
    for (const r of verified.results) {
        try {
            results.push(await compileVerifiedCase(ctx, r.id));
        }
        catch (e) {
            results.push({ id: r.id, capability: 'awaiting_discriminating_evidence', error: errorCode(e) });
        }
    }
    const interventions = await ctx.env.DB.prepare("SELECT id,commitment_id,change_id FROM intelligence_simplifications WHERE workspace_id=? AND state NOT IN ('erased','failed') LIMIT 30").bind(ctx.principal.workspaceId).all<any>();
    for (const i of interventions.results) {
        try {
            await getCommitment(ctx, i.commitment_id);
            let change = await getService(ctx.env.DB, ctx.principal, i.change_id, 'change');
            const effectContext = await current({...ctx,principal:{...ctx.principal,userId:change.ownerId,roles:[]}},['owner','operator']);
            const active = change.data.invocations.find((v: any) => v.executionId && !['verified','failed'].includes(v.state));
            if (active) change = await verifyChange(effectContext.env, effectContext.principal, change, {revision: change.revision, invocationId: active.id});
            if (['authorized','canary-verified'].includes(change.data.state)) {
                const phase = change.data.state === 'authorized' ? 'canary' : 'rollout';
                change = await executeSimplification(effectContext, i.id, {phase, idempotencyKey: 'simplification:'+i.id+':'+phase});
            }
            if (change.data.state === 'verified') results.push(await measureSimplification(effectContext, i.id, {}));
            else results.push({id:i.id,state:change.data.state});
        }
        catch (e) {
            results.push({ id: i.id, error: errorCode(e) });
        }
    }
    return results;
}

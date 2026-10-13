import type { Env } from '../../platform/types';
import { now } from '../../platform/http';
import { current, errorCode } from './access';
import { getCommitment, observeCommitment } from './commitments';
import { startResearch, advanceResearch } from './research';
import { followFulfilmentExpiry } from './expiry-followup';
import { followPendingFulfilments } from './pending-fulfilments';
import { followInvestigations } from './investigations';
import { discoverWorkIntake } from './intake';
import { advanceFrontierOperations } from './automation';
import { processCapabilityReuse } from './capabilities';
export async function processDueIntelligence(env: Env) {
    const result: any[] = [];
    const settings = await env.DB.prepare('SELECT workspace_id,settings_json FROM workspace_settings').all<any>();
    const held = new Set(settings.results.filter(s => JSON.parse(s.settings_json).executionHeld).map(s => s.workspace_id));
    for (const s of settings.results) {
        if (held.has(s.workspace_id)) continue;
        const owner:any = await env.DB.prepare("SELECT user_id FROM memberships WHERE workspace_id=? AND active=1 AND roles_json LIKE '%owner%' LIMIT 1").bind(s.workspace_id).first();
        if (owner) result.push({workspaceId:s.workspace_id,intake:await discoverWorkIntake({env,principal:{workspaceId:s.workspace_id,userId:owner.user_id,roles:['owner']}}).catch(e=>({error:errorCode(e)}))});
    }
    const rows=await env.DB.prepare("SELECT id,workspace_id,owner_id FROM intelligence_commitments WHERE due_at<=? AND (lease_until IS NULL OR lease_until<?) AND json_extract(data_json,'$.effectiveAt')<=? AND (json_extract(data_json,'$.expiresAt') IS NULL OR json_extract(data_json,'$.expiresAt')>?) ORDER BY due_at LIMIT 50").bind(now(),now(),now(),now()).all<any>();
    await Promise.allSettled(rows.results.map(async (row) => {
        const hasInvestigation = await env.DB.prepare("SELECT 1 FROM intelligence_investigations WHERE workspace_id=? AND commitment_id=? AND state NOT IN ('verified','erased','unknown')").bind(row.workspace_id,row.id).first();
        if (held.has(row.workspace_id)) {
            result.push({ id: row.id, state: 'restore_held' });
            return;
        }
        const lease = new Date(Date.now() + 240000).toISOString(), claimed = await env.DB.prepare('UPDATE intelligence_commitments SET lease_until=? WHERE id=? AND (lease_until IS NULL OR lease_until<?)').bind(lease, row.id, now()).run();
        if (!claimed.meta.changes)
            return;
        try {
            const ctx = await current({ env, principal: { userId: row.owner_id, workspaceId: row.workspace_id, roles: [] } }, ['owner', 'operator', 'hr']);
            const c = await getCommitment(ctx, row.id);
            const coverage = await observeCommitment(ctx, c.id);
            await env.DB.prepare("UPDATE intelligence_events SET state='observed' WHERE commitment_id=? AND state='pending'").bind(c.id).run();
            if (!hasInvestigation && c.data.modelConnectionId && (coverage.dependencies.some(d => d.state !== 'verified') || coverage.uncoveredCohorts.length || coverage.coverage.some(f => f.state !== 'verified'))) {
                const reuse = await processCapabilityReuse(ctx, c.id);
                if (reuse.state === 'executing' || reuse.state === 'existing_repair_pending') {
                    result.push({ id: c.id, reuse });
                    return;
                }
                let r: any = await env.DB.prepare("SELECT id,state FROM intelligence_research WHERE commitment_id=? AND state NOT IN ('verified','cancelled') ORDER BY created_at DESC LIMIT 1").bind(c.id).first();
                if (!r)
                    r = await startResearch(ctx, { commitmentId: c.id, connectionId: c.data.modelConnectionId, question: 'Investigate threat to commitment: ' + c.data.outcome });
                if (!r.state || ['pending', 'budget_held'].includes(r.state))
                    await advanceResearch(ctx, r.id);
            }
            result.push({ id: c.id, state: 'observed' });
        }
        catch (e) {
            result.push({ id: row.id, state: 'blocked', error: errorCode(e) });
            await env.DB.prepare('UPDATE intelligence_commitments SET due_at=? WHERE id=?').bind(new Date(Date.now() + 60000).toISOString(), row.id).run();
        }
        finally {
            await env.DB.prepare('UPDATE intelligence_commitments SET lease_until=NULL WHERE id=? AND lease_until=?').bind(row.id, lease).run();
        }
    }));
    for (const s of settings.results) {
        if (held.has(s.workspace_id))
            continue;
        const owner: any = await env.DB.prepare("SELECT user_id FROM memberships WHERE workspace_id=? AND active=1 AND roles_json LIKE '%owner%' LIMIT 1").bind(s.workspace_id).first();
        if (owner) {
            const automationCtx = { env, principal: { workspaceId: s.workspace_id, userId: owner.user_id, roles: ['owner'] as any } };
            result.push({pendingFulfilments:await followPendingFulfilments(automationCtx).catch(e=>({error:errorCode(e)}))});
            result.push({ frontier: await advanceFrontierOperations(automationCtx).catch(e => ({ error: errorCode(e) })) });
            result.push({expiry:await followFulfilmentExpiry(automationCtx).catch(e=>({error:errorCode(e)}))});
            result.push({investigations:await followInvestigations(automationCtx).catch(e=>({error:errorCode(e)}))});
        }
    }
    return result;
}

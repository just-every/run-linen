import { hashToken } from '../../platform/crypto';
import { now } from '../../platform/http';
import { assert, audit, current } from './access';
import type { IntelligenceContext } from './types';
export async function eraseIntelligenceIdentity(ctx: IntelligenceContext, identity: string) {
    ctx = await current(ctx, ['owner']);
    assert(identity && identity.length <= 300, 'identity_required');
    const replacement = 'erased:' + await hashToken(identity), w = ctx.principal.workspaceId;
    const rows = await ctx.env.DB.prepare('SELECT * FROM intelligence_commitments WHERE workspace_id=?').bind(w).all<any>();
    const affected = rows.results.filter(r => r.owner_id === identity || JSON.parse(r.participants_json).includes(identity) || JSON.parse(r.data_json).cohort.includes(identity));
    for (const c of affected) {
        const data = JSON.parse(c.data_json);
        data.outcome = 'Erased service commitment';
        data.cohort = data.cohort.map((v: string) => v === identity ? replacement : v);
        data.observations = [];
        data.expiresAt = now();
        await ctx.env.DB.batch([ctx.env.DB.prepare('UPDATE intelligence_commitments SET owner_id=?,participants_json=?,data_json=?,lease_until=NULL,revision=revision+1,updated_at=? WHERE id=?').bind(c.owner_id === identity ? replacement : c.owner_id, JSON.stringify(JSON.parse(c.participants_json).filter((v: string) => v !== identity)), JSON.stringify(data), now(), c.id), ctx.env.DB.prepare("UPDATE intelligence_versions SET data_json='{}',actor_id=CASE WHEN actor_id=? THEN ? ELSE actor_id END WHERE commitment_id=?").bind(identity, replacement, c.id), ctx.env.DB.prepare("UPDATE intelligence_observations SET evidence_json='{}',cohort_json='[]',state='erased' WHERE commitment_id=?").bind(c.id), ctx.env.DB.prepare("UPDATE intelligence_events SET payload_json='{}',state='erased' WHERE commitment_id=?").bind(c.id), ctx.env.DB.prepare("UPDATE intelligence_research SET question='Erased',data_json='{}',state='cancelled',lease_until=NULL WHERE commitment_id=?").bind(c.id), ctx.env.DB.prepare("UPDATE intelligence_engineering_jobs SET spec_json='{}',receipt_json='{}',state=CASE WHEN state='running' THEN 'unknown' ELSE 'erased' END,claim_token_hash=NULL WHERE commitment_id=?").bind(c.id), ctx.env.DB.prepare("UPDATE intelligence_capabilities SET data_json='{}',state='erased' WHERE commitment_id=?").bind(c.id), ctx.env.DB.prepare("UPDATE intelligence_simplifications SET data_json='{}',state='erased' WHERE commitment_id=?").bind(c.id)]);
    }
    await ctx.env.DB.batch([ctx.env.DB.prepare('UPDATE intelligence_attempts SET actor_id=? WHERE workspace_id=? AND actor_id=?').bind(replacement, w, identity), ctx.env.DB.prepare('UPDATE intelligence_engineering_grants SET revoked_at=?,token_hash=?,config_json=? WHERE workspace_id=? AND owner_id=?').bind(now(), replacement, '{}', w, identity)]);
    await ctx.env.DB.prepare("UPDATE intelligence_fulfilment_runs SET requester_id=CASE WHEN requester_id=? THEN ? ELSE requester_id END,actor_id=CASE WHEN actor_id=? THEN ? ELSE actor_id END,state='unknown',updated_at=? WHERE workspace_id=? AND (requester_id=? OR actor_id=?)").bind(identity,replacement,identity,replacement,now(),w,identity,identity).run();
    await ctx.env.DB.prepare("UPDATE intelligence_investigations SET requester_id=CASE WHEN requester_id=? THEN ? ELSE requester_id END,owner_id=CASE WHEN owner_id=? THEN ? ELSE owner_id END,state='erased',error_code=NULL,reported_key=NULL,lease_until=NULL,updated_at=? WHERE workspace_id=? AND (requester_id=? OR owner_id=?)").bind(identity,replacement,identity,replacement,now(),w,identity,identity).run();
    await ctx.env.DB.prepare("UPDATE intelligence_pending_fulfilments SET requester_id=?,input_json='{}',state='erased',error_code=NULL,lease_until=NULL,updated_at=? WHERE workspace_id=? AND requester_id=?").bind(replacement,now(),w,identity).run();
    await audit(ctx, 'intelligence.erased', replacement, { commitments: affected.length });
}

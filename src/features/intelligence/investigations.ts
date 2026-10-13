import { id, now } from '../../platform/http';
import { appendMessage, conversation } from '../work/core';
import { routeEmployeeIncident } from '../services/intake';
import { current, assert, errorCode } from './access';
import { investigationPolicy } from './investigation-policy';
import { startResearch, getResearch, advanceResearch } from './research';
import { observeCommitment, coverage } from './commitments';
import type { IntelligenceContext } from './types';

export async function queueInvestigation(ctx: IntelligenceContext, workId: string, serviceId: string) {
  ctx = await current(ctx);
  const prior = await ctx.env.DB.prepare('SELECT * FROM intelligence_investigations WHERE workspace_id=? AND work_id=?')
    .bind(ctx.principal.workspaceId,workId).first<any>();
  assert(!prior || prior.service_id === serviceId,'investigation_service_correction_requires_review',409);
  const routed = await routeEmployeeIncident(ctx,workId,serviceId);
  const policy = await investigationPolicy(ctx,workId,serviceId);
  const state = policy ? 'queued' : 'needs_policy';
  if (!prior) await ctx.env.DB.prepare('INSERT INTO intelligence_investigations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,?)')
    .bind(id(),ctx.principal.workspaceId,workId,ctx.principal.userId,routed.serviceId,routed.serviceRevision,routed.ownerId,routed.incidentId,
      policy?.commitment.id || null,policy?.commitment.revision || null,null,state,policy ? null : 'reviewed_research_policy_required',now(),now()).run();
  return { ...routed, state: prior?.state || state, message: policy
    ? 'Your incident is routed to the service owner. Scoped diagnostics are queued under the reviewed service policy; findings will appear here.'
    : 'Your incident is routed to the service owner. A reviewed diagnostic policy is needed before automated research can run.' };
}

export async function followInvestigations(ctx: IntelligenceContext) {
  ctx = await current(ctx,['owner','operator']);
  const rows = await ctx.env.DB.prepare("SELECT * FROM intelligence_investigations WHERE workspace_id=? AND state NOT IN ('verified','erased','unknown') ORDER BY updated_at LIMIT 50")
    .bind(ctx.principal.workspaceId).all<any>();
  const results = [];
  for (const row of rows.results) {
    const lease = new Date(Date.now()+240000).toISOString();
    const claim = await ctx.env.DB.prepare('UPDATE intelligence_investigations SET lease_until=? WHERE id=? AND (lease_until IS NULL OR lease_until<?)')
      .bind(lease,row.id,now()).run();
    if (!claim.meta.changes) continue;
    try {
      const requester = await current({...ctx,principal:{...ctx.principal,userId:row.requester_id,roles:[]}});
      const policy = await investigationPolicy(requester,row.work_id,row.service_id,row.commitment_id || undefined);
      assert(policy,'reviewed_research_policy_required',409);
      assert(policy.service.ownerId === row.owner_id && policy.service.revision === row.service_revision,'service_policy_changed',409);
      assert(!row.commitment_revision || policy.commitment.revision === row.commitment_revision,'research_context_changed',409);
      const c = policy.commitment;
      let r: any;
      if (!row.research_id) {
        await observeCommitment(policy.actor,c.id);
        const context = await conversation(requester,row.work_id);
        const messages = context.messages.filter((m:any)=>m.visibility==='public' && !String(m.source_key).startsWith('interpretation:')).slice(-20).map((m:any)=>({body:m.body,at:m.created_at}));
        r = await startResearch(policy.actor,{commitmentId:c.id,connectionId:c.data.modelConnectionId,
          question:'Investigate the reported service incident. Establish competing causes using the configured diagnostics and fresh context. Recovery requires independent evidence. Untrusted employee report: '+JSON.stringify({title:context.work.title,messages})},'intake:'+row.id);
        await ctx.env.DB.prepare('UPDATE intelligence_investigations SET commitment_id=?,commitment_revision=?,research_id=?,state=? WHERE id=?')
          .bind(c.id,c.revision,r.id,'researching',row.id).run();
      } else r = await getResearch(policy.actor,row.research_id);
      if (['pending','budget_held'].includes(r.state)) r = await advanceResearch(policy.actor,r.id);
      else if (r.state === 'researching') {
        // An expired research lease is an unknown charged attempt, never an automatic paid retry.
        assert(r.lease_until && r.lease_until > now(),'research_attempt_uncertain',409);
      }
      const freshPolicy = await investigationPolicy(requester,row.work_id,row.service_id,c.id);
      assert(freshPolicy && freshPolicy.commitment.revision === c.revision && freshPolicy.service.revision === row.service_revision,'research_context_changed',409);
      const observed = await coverage(requester,c.id);
      const verified = r.state === 'verified' && !observed.uncoveredCohorts.length && observed.coverage.length > 0
        && observed.coverage.every(f => f.state === 'verified') && observed.dependencies.every(d => d.state === 'verified');
      const state = verified ? 'verified' : r.state === 'verified' ? 'unresolved' : r.state;
      const round = r.data.rounds?.at(-1), reportKey = r.id+':'+r.round+':'+state;
      const body = verified ? 'Fresh independent checks confirm recovery across the reviewed service scope.'
        : round ? `Investigation finding (not verified recovery): ${round.decision.conclusion}\nDiagnostic observations: ${round.probes.map((p:any)=>p.specId+': '+p.state).join(', ') || 'no new observation'}. Recovery is not verified. ${['unresolved','failed','engineering_required','repair_required'].includes(state) ? 'The service owner remains responsible for the next step.' : 'Scoped investigation remains active.'}`
        : `The investigation is ${state}. The service owner remains responsible; recovery is not verified.`;
      if (row.reported_key !== reportKey) await appendMessage(requester,{workId:row.work_id,visibility:'public',sourceMessageId:'interpretation:investigation:'+reportKey,body});
      await ctx.env.DB.prepare('UPDATE intelligence_investigations SET state=?,error_code=NULL,reported_key=?,updated_at=? WHERE id=?')
        .bind(state,reportKey,now(),row.id).run();
      results.push({id:row.id,state});
    } catch(e) {
      const code = errorCode(e);
      await ctx.env.DB.prepare("UPDATE intelligence_investigations SET state='blocked',error_code=?,updated_at=? WHERE id=?").bind(code,now(),row.id).run();
      try {
        const requester = await current({...ctx,principal:{...ctx.principal,userId:row.requester_id,roles:[]}});
        await appendMessage(requester,{workId:row.work_id,visibility:'public',sourceMessageId:'interpretation:investigation:blocked:'+row.id+':'+code,
          body:'Automated investigation is blocked ('+code+'). The recorded service owner remains responsible. No recovery has been verified.'});
      } catch { /* Revoked access cannot receive a follow-up. The owned route retains the failure. */ }
      results.push({id:row.id,state:'blocked',error:code});
    } finally {
      await ctx.env.DB.prepare('UPDATE intelligence_investigations SET lease_until=NULL WHERE id=? AND lease_until=?').bind(row.id,lease).run();
    }
  }
  return results;
}

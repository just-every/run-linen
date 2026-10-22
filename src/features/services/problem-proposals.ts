import { serviceEvent, serviceSnapshot } from './history';
import type { Env, Principal } from '../../platform/types';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { hashToken } from '../../platform/crypto';
import { getWork, permit, type WorkContext } from '../work/core';
import { currentWorkPrincipal } from '../work/identity';
import { dto, getService, readable, writable, type RecordRow, type Kind } from './store';

export interface ProblemEvidence {
  type: 'ticket' | 'alert';
  id: string;
  revision: number;
  observedAt: string;
  serviceId?: string;
  monitorEventKey?: string;
}
export interface ProblemCluster {
  facet: 'service' | 'deviceModel' | 'app';
  value: string;
  scopeType: 'cohort' | 'location' | 'all';
  scopeValue: string;
}
export const proposalKind: Kind = 'problem-proposal';

export async function problemActor(env: Env, principal: Principal): Promise<WorkContext> {
  const ctx = { env, principal: { ...principal, roles: [...principal.roles] } };
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'operator']);
  return ctx;
}

/** Source content is projected only after checking the current caller at every read. */
export async function problemEvidence(ctx: WorkContext, evidence: ProblemEvidence[]) {
  const sources = [];
  for (const ref of evidence) {
    if (ref.type === 'ticket') {
      const work = await getWork(ctx, ref.id);
      if (work.kind !== 'incident') throw new ApiError(409, 'problem_evidence_changed', 'Evidence is no longer an incident ticket');
      sources.push({ ...ref, currentRevision: work.revision, title: work.title });
    } else {
      const incident = await getService(ctx.env.DB, ctx.principal, ref.id, 'incident');
      if (!ref.monitorEventKey || incident.data.monitorEventKey !== ref.monitorEventKey)
        throw new ApiError(409, 'problem_evidence_changed', 'Monitoring incident identity changed');
      sources.push({ ...ref, currentRevision: incident.revision, title: incident.data.title });
    }
    if (ref.serviceId) await getService(ctx.env.DB, ctx.principal, ref.serviceId, 'service');
  }
  return sources;
}

export async function getProblemProposal(env: Env, principal: Principal, key: string) {
  const ctx = await problemActor(env, principal);
  const record = await getService(env.DB, ctx.principal, key, proposalKind);
  const sources = await problemEvidence(ctx, record.data.evidence || []);
  return { ...record, sources };
}

export async function listProblemProposals(env: Env, principal: Principal) {
  const ctx = await problemActor(env, principal);
  const rows = await env.DB.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind='problem-proposal' ORDER BY updated_at DESC")
    .bind(ctx.principal.workspaceId).all<RecordRow>();
  const items = [];
  for (const row of rows.results) {
    if (!readable(ctx.principal, dto(row))) continue;
    try { items.push(await getProblemProposal(env, ctx.principal, row.id)); }
    catch (error) {
      if (!(error instanceof ApiError) || ![403, 404, 409].includes(error.status)) throw error;
    }
  }
  return { items };
}

/** SQL predicates fence role revocation and source changes in the same batch as the decision. */
export async function proposalFence(ctx: WorkContext, evidence: ProblemEvidence[]) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'operator']);
  await problemEvidence(ctx, evidence);
  const membership = await ctx.env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1')
    .bind(ctx.principal.workspaceId, ctx.principal.userId).first<{ roles_json: string }>();
  if (!membership) throw new ApiError(403, 'forbidden', 'Current service operator required');
  const predicates = ['EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1 AND roles_json=? AND EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value IN (\'owner\',\'operator\')))'];
  const values: (string | number)[] = [ctx.principal.workspaceId, ctx.principal.userId, membership.roles_json];
  predicates.push(`NOT EXISTS(SELECT 1 FROM json_each(?) ref WHERE
    (json_extract(ref.value,'$.type')='ticket' AND NOT EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=json_extract(ref.value,'$.id') AND revision=json_extract(ref.value,'$.revision')))
    OR (json_extract(ref.value,'$.type')='alert' AND NOT EXISTS(SELECT 1 FROM svc_records WHERE workspace_id=? AND id=json_extract(ref.value,'$.id') AND revision=json_extract(ref.value,'$.revision'))))`);
  values.push(JSON.stringify(evidence),ctx.principal.workspaceId,ctx.principal.workspaceId);
  const services = [];
  for (const key of new Set(evidence.map(ref=>ref.serviceId).filter((key):key is string=>!!key))) {
    const service = await getService(ctx.env.DB, ctx.principal, key, 'service');
    services.push({id:key,revision:service.revision});
  }
  predicates.push("NOT EXISTS(SELECT 1 FROM json_each(?) ref WHERE NOT EXISTS(SELECT 1 FROM svc_records WHERE workspace_id=? AND id=json_extract(ref.value,'$.id') AND revision=json_extract(ref.value,'$.revision')))" );
  values.push(JSON.stringify(services),ctx.principal.workspaceId);
  return { sql: predicates.join(' AND '), values };
}

export async function decideProblemProposal(env: Env, principal: Principal, key: string,
  input: { revision: number; reason: string }, decision: 'accept' | 'reject') {
  const ctx = await problemActor(env, principal), p = ctx.principal;
  const proposal = await getProblemProposal(env, p, key);
  if (!writable(p, proposal)) throw new ApiError(403, 'forbidden', 'Scoped problem operator required');
  if (proposal.revision !== input.revision || proposal.data.state !== 'proposed')
    throw new ApiError(409, 'revision_conflict', 'Reload the undecided proposal');
  const reason = requiredString(input.reason, 'reason', 3000);
  if (proposal.sources.some(s => s.currentRevision !== s.revision))
    throw new ApiError(409, 'problem_evidence_changed', 'Refresh detection before deciding changed evidence');
  const evidence: ProblemEvidence[] = proposal.data.evidence;
  const fence = await proposalFence(ctx, evidence), t = now();
  const problemId = decision === 'accept' ? await hashToken(p.workspaceId + ':accepted-problem:' + key) : null;
  const data = { ...proposal.data, state: decision === 'accept' ? 'accepted' : 'rejected',
    decision: { actorId: p.userId, reason, at: t }, problemId };
  const statements = [];
  let createdProblem: Record<string,unknown> | undefined;
  if (problemId) {
    const serviceIds = [...new Set(evidence.map(e => e.serviceId).filter(Boolean))];
    const problemData = { title: proposal.data.title, serviceId: serviceIds.length === 1 ? serviceIds[0] : null, serviceIds,
      incidentIds: evidence.filter(e => e.type === 'alert').map(e => e.id),
      ticketIds: evidence.filter(e => e.type === 'ticket').map(e => e.id),
      alertIncidentIds: evidence.filter(e => e.type === 'alert').map(e => e.id),
      evidence, cluster: proposal.data.cluster, sourceProposalId: key, symptoms: 'Recurring recorded incidents; cause requires investigation',
      cause: null, causeState: 'unknown', workarounds: [], preventionChangeId: null, preventionState: 'unverified' };
    createdProblem=problemData;
    statements.push(env.DB.prepare(`INSERT INTO svc_records SELECT ?,?,'problem',?,?,?,?,1,?,? WHERE EXISTS(SELECT 1 FROM svc_records WHERE workspace_id=? AND id=? AND revision=? AND json_extract(data_json,'$.state')='proposed') AND ${fence.sql}`)
      .bind(problemId, p.workspaceId, proposal.ownerId, proposal.visibility, JSON.stringify(proposal.participants), JSON.stringify(problemData), t, t,
        p.workspaceId, key, input.revision, ...fence.values));
  }
  statements.push(env.DB.prepare(`UPDATE svc_records SET data_json=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=? AND json_extract(data_json,'$.state')='proposed' AND ${problemId ? 'changes()=1' : fence.sql}`)
    .bind(JSON.stringify(data), t, p.workspaceId, key, input.revision, ...(problemId ? [] : fence.values)));
  const updateIndex = statements.length - 1;
  statements.push(serviceEvent(env.DB,p,proposal,serviceSnapshot(proposal),serviceSnapshot({...proposal,data}),'problem-proposal-'+data.state,t));
  if (problemId && createdProblem) statements.push(serviceEvent(env.DB,p,{...proposal,id:problemId,kind:'problem'}, {},serviceSnapshot({...proposal,data:createdProblem}),'created',t));
  const results = await env.DB.batch(statements);
  if (!results[updateIndex].meta.changes) throw new ApiError(409, 'revision_conflict', 'Proposal, evidence or current authority changed');
  return getProblemProposal(env, p, key);
}

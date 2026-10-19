import type { Env, Principal } from '../../platform/types';
import { ApiError, id, now } from '../../platform/http';
import { hashToken } from '../../platform/crypto';
import { getWork } from '../work/core';
import { dto, getService, readable, type RecordRow } from './store';
import { problemActor, problemEvidence, proposalFence, listProblemProposals,
  type ProblemCluster, type ProblemEvidence } from './problem-proposals';

interface Source {
  ref: ProblemEvidence;
  context: Record<string, any>;
  audience: string;
  restricted: boolean;
}
const value = (v: unknown) => typeof v === 'string' ? v.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') : '';
const strings = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
function scopes(context: Record<string, any>) {
  const result: { scopeType: ProblemCluster['scopeType']; scopeValue: string }[] = [];
  for (const cohort of new Set([context.cohort, ...strings(context.cohorts)].map(value).filter(Boolean)))
    result.push({ scopeType: 'cohort', scopeValue: cohort });
  if (value(context.location)) result.push({ scopeType: 'location', scopeValue: value(context.location) });
  return result.length ? result : [{ scopeType: 'all' as const, scopeValue: '' }];
}
function facets(context: Record<string, any>) {
  const result: { facet: ProblemCluster['facet']; value: string }[] = [];
  // Service IDs are opaque identities; names, application names and model labels are normalized.
  if (typeof context.serviceId === 'string' && context.serviceId) result.push({ facet: 'service', value: context.serviceId });
  for (const facet of ['deviceModel', 'app'] as const) if (value(context[facet])) result.push({ facet, value: value(context[facet]) });
  return result;
}

/** Recorded-context recurrence: >=3 distinct sources in the trailing 30 days by default.
 * No text classifier or inferred cause. Each facet/cohort or facet/location is a separate
 * explainable cluster. Alert-derived incidents represent alerts exactly once, even when
 * their monitor's observation log contains the same event. Rejected semantic keys persist
 * across later tickets and rolling windows; detection never reopens a human decision.
 */
export async function detectProblemProposals(env: Env, principal: Principal,
  input: { threshold?: number; windowDays?: number } = {}) {
  const ctx = await problemActor(env, principal), p = ctx.principal;
  const threshold = input.threshold ?? 3, windowDays = input.windowDays ?? 30;
  if (!Number.isInteger(threshold) || threshold < 2 || threshold > 1000 || !Number.isFinite(windowDays) || windowDays <= 0 || windowDays > 365)
    throw new ApiError(400, 'problem_detection_policy', 'Use 2–1000 sources and a positive window of at most 365 days');
  const end = now(), start = new Date(Date.parse(end) - windowDays * 86400000).toISOString();
  const sources: Source[] = [];
  const workRows = await env.DB.prepare("SELECT id FROM work_records WHERE workspace_id=? AND kind='incident' AND state<>'cancelled' AND created_at>=? AND created_at<=? ORDER BY id")
    .bind(p.workspaceId, start, end).all<{ id: string }>();
  for (const row of workRows.results) {
    try {
      const work = await getWork(ctx, row.id), context = JSON.parse(work.context_json);
      if (!context || typeof context !== 'object' || Array.isArray(context)) continue;
      const service = typeof context.serviceId === 'string' ? await getService(env.DB, p, context.serviceId, 'service') : null;
      const restricted = work.sensitivity !== 'normal' || service?.visibility === 'restricted';
      // Restricted cohorts cannot be merged into a broader operator proposal.
      const audience = JSON.stringify([work.sensitivity, work.sensitivity !== 'normal' ? [work.requester_id, work.beneficiary_id].sort() : [],
        service?.visibility === 'restricted' ? [service.ownerId, ...service.participants].sort() : []]);
      sources.push({ ref: { type: 'ticket', id: work.id, revision: work.revision, observedAt: work.created_at, ...(service ? { serviceId: service.id } : {}) },
        context, audience: restricted ? audience : 'operators', restricted: !!restricted });
    } catch (error) {
      if (!(error instanceof ApiError) || ![403, 404].includes(error.status)) throw error;
    }
  }
  const alerts = await env.DB.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind='incident' AND created_at>=? AND created_at<=? AND json_extract(data_json,'$.monitorEventKey') IS NOT NULL ORDER BY id")
    .bind(p.workspaceId, start, end).all<RecordRow>();
  const seenAlerts = new Set<string>();
  for (const row of alerts.results) {
    if (!readable(p, dto(row))) continue;
    try {
      const incident = await getService(env.DB, p, row.id, 'incident');
      const service = await getService(env.DB, p, incident.data.serviceId, 'service');
      const eventKey = String(incident.data.monitorEventKey);
      if (seenAlerts.has(eventKey)) continue;
      seenAlerts.add(eventKey);
      const restricted = incident.visibility === 'restricted' || service.visibility === 'restricted';
      const audience = JSON.stringify([incident.visibility === 'restricted' ? [incident.ownerId, ...incident.participants].sort() : [],
        service.visibility === 'restricted' ? [service.ownerId, ...service.participants].sort() : []]);
      sources.push({ ref: { type: 'alert', id: incident.id, revision: incident.revision, observedAt: incident.createdAt, serviceId: service.id, monitorEventKey: eventKey },
        context: { ...incident.data.context, ...incident.data }, audience: restricted ? audience : 'operators', restricted });
    } catch (error) {
      if (!(error instanceof ApiError) || ![403, 404].includes(error.status)) throw error;
    }
  }
  const groups = new Map<string, { cluster: ProblemCluster; sources: Source[] }>();
  for (const source of sources) for (const facet of facets(source.context)) for (const scope of scopes(source.context)) {
    const cluster = { ...facet, ...scope }, signature = JSON.stringify([cluster, source.audience]);
    const group = groups.get(signature) || { cluster, sources: [] };
    group.sources.push(source); groups.set(signature, group);
  }
  for (const [signature, group] of groups) {
    if (group.sources.length < threshold) continue;
    const fingerprint = await hashToken(p.workspaceId + ':problem-cluster-v1:' + signature);
    const audience = group.sources[0].audience === 'operators' ? 'operators' : JSON.parse(group.sources[0].audience);
    // Native restore remaps opaque IDs. Match the structured semantic key as well as its original hash.
    const prior = await env.DB.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind='problem-proposal' AND (id=? OR (json_extract(data_json,'$.cluster')=json(?) AND json_extract(data_json,'$.audience')=json_extract(?,'$'))) ORDER BY id LIMIT 1")
      .bind(p.workspaceId, fingerprint, JSON.stringify(group.cluster), JSON.stringify(audience)).first<RecordRow>();
    const key = prior?.id ?? fingerprint;
    if (prior && (!readable(p, dto(prior)) || JSON.parse(prior.data_json).state !== 'proposed')) continue;
    if (prior) {
      try { await problemEvidence(ctx,JSON.parse(prior.data_json).evidence); }
      catch (error) { if (error instanceof ApiError && [403,404].includes(error.status)) continue; throw error; }
    }
    const evidence = group.sources.map(s => s.ref).sort((a, b) => (a.type + a.id).localeCompare(b.type + b.id));
    await problemEvidence(ctx, evidence);
    if (prior && JSON.stringify(JSON.parse(prior.data_json).evidence) === JSON.stringify(evidence)) continue;
    const fence = await proposalFence(ctx, evidence), t = now();
    const data = { title: `Recurring ${group.cluster.facet === 'service' ? 'service incidents' : group.cluster.value}${group.cluster.scopeValue ? ' — ' + group.cluster.scopeValue : ''}`,
      state: 'proposed', cluster: group.cluster, fingerprint: key, audience, evidence, threshold, windowDays,
      windowStart: start, windowEnd: end, decision: null, problemId: null };
    const statement = prior
      ? env.DB.prepare(`UPDATE svc_records SET data_json=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=? AND json_extract(data_json,'$.state')='proposed' AND ${fence.sql}`)
        .bind(JSON.stringify(data), t, p.workspaceId, key, prior.revision, ...fence.values)
      : env.DB.prepare(`INSERT OR IGNORE INTO svc_records SELECT ?,?,'problem-proposal',?,?,?,?,1,?,? WHERE ${fence.sql}`)
        .bind(key, p.workspaceId, p.userId, group.sources.some(s => s.restricted) ? 'restricted' : 'operators', '[]', JSON.stringify(data), t, t, ...fence.values);
    await env.DB.batch([statement, env.DB.prepare('INSERT INTO svc_events SELECT ?,?,?,?,?,?,? WHERE changes()=1')
      .bind(id(), p.workspaceId, key, p.userId, prior ? 'problem-proposal-evidence-updated' : 'problem-proposed', JSON.stringify({ count: evidence.length }), t)]);
  }
  return listProblemProposals(env, p);
}

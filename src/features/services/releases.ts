import type { Env, Principal } from '../../platform/types';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { currentPrincipal } from '../work/identity';
import { create, dto, getService, mutate, readable, staff, strings, type RecordRow, type ServiceRecord } from './store';

/** CHANGE-007: a release groups current changes; it never executes anything itself. */
type Phase = { outcome: 'passed' | 'failed'; reference: string; recordedBy: string; recordedAt: string };
type Decision = { id: string; actor: string; decision: 'go' | 'no-go'; reason: string; revisions: Record<string, number>; at: string };
const closed = ['completed', 'imported-review', 'privacy-review'];
const settled = (state: string) => ['verified', 'compensated'].includes(state);
const held = ['failed', 'unresolved', 'unknown', 'compensation-incomplete', 'needs_configuration'];

function optionalIds(value: unknown, name: string) {
  return value === undefined || (Array.isArray(value) && !value.length) ? [] : strings(value, name);
}
async function approvalAuthority(db: D1Database, workspaceId: string, userId: string) {
  return !!await db.prepare(`SELECT 1 FROM memberships m,json_each(m.roles_json) role
    WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND role.value IN ('owner','approver')`).bind(workspaceId, userId).first();
}
async function memberRows(db: D1Database, workspaceId: string, changeIds: string[]) {
  const rows = [];
  for (const changeId of changeIds) {
    const row = await db.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND id=? AND kind='change'").bind(workspaceId, changeId).first<RecordRow>();
    if (row) rows.push(dto(row));
  }
  return rows;
}
/** The open release that holds a change, if any. A change belongs to at most one open release. */
async function releaseOf(db: D1Database, workspaceId: string, changeId: string) {
  const rows = await db.prepare(`SELECT * FROM svc_records r WHERE r.workspace_id=? AND r.kind='release'
    AND EXISTS(SELECT 1 FROM json_each(r.data_json,'$.changeIds') c WHERE c.value=?)`).bind(workspaceId, changeId).all<RecordRow>();
  return rows.results.map(dto).find(r => r.data.state !== 'completed') ?? null;
}
/** Each named approver's latest decision counts; one no-go holds the release. */
export function goNoGo(data: Record<string, any>): 'go' | 'no-go' | 'awaiting-decision' {
  const latest = (data.approverIds as string[]).map(a => (data.decisions as Decision[]).find(d => d.actor === a));
  if (latest.some(d => d?.decision === 'no-go')) return 'no-go';
  return latest.every(d => d?.decision === 'go') ? 'go' : 'awaiting-decision';
}
/** The release span on the shared change calendar: earliest member start to latest member end. */
export async function releaseWindow(db: D1Database, workspaceId: string, r: ServiceRecord) {
  const windows = (await memberRows(db, workspaceId, r.data.changeIds)).map(c => c.data.window).filter(w => w?.start && w?.end);
  if (!windows.length) return null;
  return { start: windows.map(w => w.start).sort()[0], end: windows.map(w => w.end).sort().at(-1) as string };
}
export async function presentRelease(db: D1Database, p: Principal, r: ServiceRecord) {
  const members = await memberRows(db, p.workspaceId, r.data.changeIds);
  const deploy = members.every(c => settled(c.data.state)) ? 'complete' : members.some(c => held.includes(c.data.state)) ? 'held'
    : members.some(c => (c.data.invocations || []).some((i: any) => i.phase === 'rollout')) ? 'rollout'
    : members.some(c => (c.data.invocations || []).length) ? 'canary' : 'not-started';
  const insider = staff(p) || p.roles.includes('auditor') || r.data.approverIds.includes(p.userId);
  // Cohort notes are read only through CHANNEL-008's membership and source gates.
  const { employeeNotices: _notices, ...data } = r.data;
  const recorded = goNoGo(r.data);
  const current = recorded === 'go' && await releaseApprovalIssue(db, p.workspaceId, r) ? 'awaiting-decision' : recorded;
  return { ...r, data: { ...data, window: await releaseWindow(db, p.workspaceId, r), goNoGo: current, deploy,
    // Member detail is for release staff and named approvers; titles stay within each change's own readership.
    members: insider ? members.map(c => ({ id: c.id, title: readable(p, c) ? c.data.title : null, state: c.data.state,
      phases: (c.data.invocations || []).map((i: any) => ({ phase: i.phase, state: i.state })) })) : [],
    holding: insider ? members.filter(c => !settled(c.data.state)).map(c => c.id) : [] } };
}

export async function newRelease(env: Env, principal: Principal, b: Record<string, any>) {
  const p = await currentPrincipal(env.DB, principal);
  const changeIds = strings(b.changeIds, 'changeIds'), services = new Set<string>();
  for (const changeId of changeIds) {
    const change = await getService(env.DB, p, changeId, 'change');
    if (change.data.adoption?.historical || ['cancelled', 'imported-review', 'privacy-review'].includes(change.data.state))
      throw new ApiError(422, 'release_change', 'A release groups current changes only');
    if ((change.data.invocations || []).length)
      throw new ApiError(409, 'release_change_started', 'Group a change into a release before any of its effects are dispatched');
    if (await releaseOf(env.DB, p.workspaceId, changeId))
      throw new ApiError(409, 'release_change_grouped', 'A change belongs to at most one open release');
    for (const service of change.data.services) services.add(service);
  }
  for (const service of optionalIds(b.services, 'services')) services.add((await getService(env.DB, p, service, 'service')).id);
  const problemIds = optionalIds(b.problemIds, 'problemIds');
  for (const problemId of problemIds) await getService(env.DB, p, problemId, 'problem');
  const approverIds = strings(b.approverIds, 'approverIds');
  for (const approver of approverIds)
    if (!await approvalAuthority(env.DB, p.workspaceId, approver))
      throw new ApiError(422, 'release_approver', 'Each named go/no-go approver must currently hold the owner or approver role');
  const affectedGroupIds = strings(b.affectedGroupIds, 'affectedGroupIds');
  for (const groupId of affectedGroupIds)
    if (!await env.DB.prepare('SELECT 1 FROM work_requester_groups WHERE workspace_id=? AND id=?').bind(p.workspaceId, groupId).first())
      throw new ApiError(422, 'release_cohort', 'Affected employees are named by existing requester groups');
  const participants = [...new Set([...(Array.isArray(b.participants) ? b.participants : []), ...approverIds])];
  try { return await create(env.DB, p, 'release', { title: requiredString(b.title, 'title'), plan: requiredString(b.plan, 'plan', 8000),
    changeIds, services: [...services], problemIds, approverIds, affectedGroupIds,
    phases: { build: null, test: null }, decisions: [], priorDecisions: [], state: 'planning', completedAt: null, outcomes: null },
    { visibility: b.visibility, participants }); }
  catch (error) {
    if (String(error).includes('release_change_grouped')) throw new ApiError(409, 'release_change_grouped', 'A change belongs to at most one open release');
    if (String(error).includes('release_change_started')) throw new ApiError(409, 'release_change_started', 'A member change started or changed during release creation; reload it');
    throw error;
  }
}

/** Build and test results are recorded references, never claimed as runs Linen performed. */
export async function recordReleasePhase(env: Env, principal: Principal, r: ServiceRecord, b: Record<string, any>) {
  const p = await currentPrincipal(env.DB, principal);
  if (closed.includes(r.data.state)) throw new ApiError(409, 'release_closed', 'This release is closed');
  if (!['build', 'test'].includes(b.phase) || !['passed', 'failed'].includes(b.outcome))
    throw new ApiError(400, 'release_phase', 'Record a build or test phase as passed or failed');
  if (b.phase === 'test' && r.data.phases.build?.outcome !== 'passed')
    throw new ApiError(409, 'release_phase', 'Record a passed build before its test');
  const entry: Phase = { outcome: b.outcome, reference: requiredString(b.reference, 'reference', 500), recordedBy: p.userId, recordedAt: now() };
  // A new build or test result is a different candidate: earlier go/no-go decisions no longer apply.
  const phases = b.phase === 'build' ? { build: entry, test: null } : { ...r.data.phases, test: entry };
  return mutate(env.DB, p, r, b.revision, { ...r.data, phases, state: 'planning', decisions: [],
    priorDecisions: [...r.data.priorDecisions, ...r.data.decisions] }, `release-${b.phase}-recorded`);
}

export async function decideRelease(env: Env, principal: Principal, r: ServiceRecord, b: Record<string, any>) {
  const p = await currentPrincipal(env.DB, principal);
  if (closed.includes(r.data.state)) throw new ApiError(409, 'release_closed', 'This release is closed');
  if (!r.data.approverIds.includes(p.userId) || !p.roles.some(role => ['owner', 'approver'].includes(role)))
    throw new ApiError(403, 'release_approver', 'Only a named approver holding the owner or approver role decides go or no-go');
  if (r.ownerId === p.userId && !p.roles.includes('owner')) throw new ApiError(403, 'separation', 'Independent approver required');
  if (!['go', 'no-go'].includes(b.decision)) throw new ApiError(400, 'release_decision', 'Choose go or no-go');
  if (b.decision === 'go' && (r.data.phases.build?.outcome !== 'passed' || r.data.phases.test?.outcome !== 'passed'))
    throw new ApiError(409, 'release_phase', 'A go decision needs recorded passed build and test phases');
  // The decision covers the exact implementation revision of every member change.
  const revisions = Object.fromEntries((await memberRows(env.DB, p.workspaceId, r.data.changeIds)).map(c => [c.id, c.data.implementationRevision]));
  const decisions = [{ id: id(), actor: p.userId, decision: b.decision, reason: requiredString(b.reason, 'reason', 2000), revisions, at: now() },
    ...r.data.decisions.filter((d: Decision) => d.actor !== p.userId)];
  const outcome = goNoGo({ ...r.data, decisions });
  return mutate(env.DB, p, r, b.revision, { ...r.data, decisions, state: outcome === 'awaiting-decision' ? 'planning' : outcome },
    'release-decision', true);
}

/** A go covers the whole candidate, not just the member about to deploy. */
async function releaseApprovalIssue(db: D1Database, workspaceId: string, release: ServiceRecord) {
  if (closed.includes(release.data.state) || goNoGo(release.data) !== 'go'
    || release.data.phases.build?.outcome !== 'passed' || release.data.phases.test?.outcome !== 'passed')
    return 'Its release needs a go decision from every named approver before deployment';
  const members = await memberRows(db, workspaceId, release.data.changeIds);
  if (members.length !== release.data.changeIds.length || release.data.decisions.some((d: Decision) =>
    members.some(c => d.revisions[c.id] !== c.data.implementationRevision)))
    return 'A member implementation changed; review the whole release and record fresh go decisions';
  for (const approver of release.data.approverIds)
    if (!await approvalAuthority(db, workspaceId, approver)) return 'A named approver no longer holds approval authority';
  return null;
}

/** Dispatch gate for member changes. Backout never waits for go/no-go. */
export async function assertReleaseGo(db: D1Database, p: Principal, change: ServiceRecord, phase: string) {
  if (phase === 'compensate') return;
  const release = await releaseOf(db, p.workspaceId, change.id);
  if (!release) return;
  const issue = await releaseApprovalIssue(db, p.workspaceId, release);
  if (issue) throw new ApiError(409, 'release_go', issue);
}

/** Completes only when every change is successful (verified) or explicitly backed out (compensated). */
export async function completeRelease(env: Env, principal: Principal, r: ServiceRecord, b: Record<string, any>) {
  const p = await currentPrincipal(env.DB, principal);
  if (closed.includes(r.data.state)) throw new ApiError(409, 'release_closed', 'This release is closed');
  const members = await memberRows(env.DB, p.workspaceId, r.data.changeIds);
  if (members.length !== r.data.changeIds.length || members.some(c => !settled(c.data.state)))
    throw new ApiError(409, 'release_open', 'Every change must be successful or explicitly backed out before the release completes');
  return mutate(env.DB, p, r, b.revision, { ...r.data, state: 'completed', completedAt: now(),
    outcomes: members.map(c => ({ changeId: c.id, outcome: c.data.state === 'verified' ? 'successful' : 'backed-out' })) }, 'release-completed');
}

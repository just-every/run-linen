import { notificationEvent } from './notification-history';
import { serviceEvent, serviceSnapshot } from './history';
import type { Env, Principal } from '../../platform/types';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { currentPrincipal } from '../work/identity';
import { getService, list, staff, type ServiceRecord } from './store';

export interface EmployeeNotice {
  id: string; groupId: string; message: string; state: 'open' | 'all-clear' | 'withdrawn';
  cadenceMinutes: number; nextUpdateAt: string | null; publishedBy: string; publishedAt: string;
  updatedAt: string; version: number; eventKey: string; emailConnectionId: string | null;
  verifiedBy: string | null; verifiedAt: string | null; verification: string | null;
}
const notices = (r: ServiceRecord): EmployeeNotice[] => r.data.employeeNotices || [];
export async function noticePublisher(env: Env, principal: Principal) {
  const p = await currentPrincipal(env.DB, principal);
  if (!staff(p)) throw new ApiError(403, 'notice_publisher', 'Current owner or operator required');
  return p;
}
async function source(env: Env, p: Principal, sourceId: string) {
  const r = await getService(env.DB, p, sourceId);
  if (!['incident', 'change', 'release'].includes(r.kind) || r.data.adoption?.historical || (r.kind === 'release' && ['imported-review', 'privacy-review'].includes(r.data.state)))
    throw new ApiError(404, 'not_found', 'Current incident, change or release required');
  if (r.kind === 'incident') await getService(env.DB, p, r.data.serviceId, 'service');
  else for (const serviceId of r.data.services || []) await getService(env.DB, p, serviceId, 'service');
  return r;
}
async function cohort(env: Env, p: Principal, groupId: string) {
  const g = await env.DB.prepare('SELECT id,name,members_json FROM work_requester_groups WHERE workspace_id=? AND id=?')
    .bind(p.workspaceId, groupId).first<{ id: string; name: string; members_json: string }>();
  if (!g) throw new ApiError(404, 'not_found', 'Requester group unavailable');
  return { ...g, memberIds: JSON.parse(g.members_json) as string[] };
}
async function eligible(env: Env, p: Principal, r: ServiceRecord, n: EmployeeNotice) {
  const group = await cohort(env, p, n.groupId);
  if (!group.memberIds.includes(p.userId)) throw new ApiError(404, 'not_found', 'Notice unavailable');
  await source(env, p, r.id);
  if (n.state === 'withdrawn') throw new ApiError(404, 'not_found', 'Notice unavailable');
  return group;
}
export async function recipientNotice(env: Env, principal: Principal, sourceId: string, noticeId: string) {
  const p = await currentPrincipal(env.DB, principal), r = await source(env, p, sourceId);
  const n = notices(r).find(n => n.id === noticeId);
  if (!n) throw new ApiError(404, 'not_found', 'Notice unavailable');
  const group = await eligible(env, p, r, n);
  const person = n.verifiedBy ? await env.DB.prepare('SELECT name FROM users WHERE id=?').bind(n.verifiedBy).first<{name:string}>() : null;
  return { id: n.id, message: n.message, state: n.state, cohort: group.name, updatedAt: n.updatedAt,
    nextUpdateAt: n.nextUpdateAt, verifiedBy: person?.name ?? (n.verifiedBy ? 'Recorded verifier' : null), verifiedAt: n.verifiedAt };
}
export async function employeeNotices(env: Env, principal: Principal, question?: string) {
  const p = await currentPrincipal(env.DB, principal), items = [];
  const records = [...await list(env.DB, p, 'incident'), ...await list(env.DB, p, 'change'), ...await list(env.DB, p, 'release')];
  for (const r of records) {
    for (const n of notices(r)) {
      try {
        if (question !== undefined) {
          if (n.state !== 'open' || r.kind !== 'incident' || ['restored', 'closed'].includes(r.data.status)) continue;
          const service = await getService(env.DB, p, r.data.serviceId, 'service');
          const name = String(service.data.name).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
          const words = question.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
          if (!name || !(` ${words} `).includes(` ${name} `)) continue;
        }
        items.push(await recipientNotice(env, p, r.id, n.id));
      } catch (error) { if (!(error instanceof ApiError) || ![403,404].includes(error.status)) throw error; }
    }
  }
  return { items };
}
export async function manageNotices(env: Env, principal: Principal, sourceId: string) {
  const p = await noticePublisher(env, principal), r = await source(env, p, sourceId);
  const groups = (await env.DB.prepare('SELECT id,name FROM work_requester_groups WHERE workspace_id=? ORDER BY name')
    .bind(p.workspaceId).all<{id:string;name:string}>()).results;
  return { revision: r.revision, items: notices(r), groups };
}
async function commit(env: Env, p: Principal, r: ServiceRecord, n: EmployeeNotice, audience: string[], event: string) {
  const all = [...notices(r).filter(prior => prior.id !== n.id), n], t = now();
  const writes = [
    env.DB.prepare('UPDATE svc_records SET data_json=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?')
      .bind(JSON.stringify({ ...r.data, employeeNotices: all }), t, p.workspaceId, r.id, r.revision),
    serviceEvent(env.DB,p,r,serviceSnapshot(r),serviceSnapshot({...r,data:{...r.data,employeeNotices:all}}),event,t,n.eventKey),
  ];
  if (n.emailConnectionId && n.state !== 'withdrawn') for (const userId of audience) {
    // Publication and its delivery intent commit together. A losing source CAS cannot enqueue mail.
    writes.push(env.DB.prepare(`INSERT OR IGNORE INTO svc_outbox(id,workspace_id,record_id,recipient_id,kind,payload_json,next_at,connection_id)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM svc_events WHERE id=? AND workspace_id=? AND record_id=?)`)
      .bind(`${n.eventKey}:${userId}`, p.workspaceId, r.id, userId, 'employee-notice',
        JSON.stringify({ noticeId: n.id, eventKey: n.eventKey, version: n.version, publisherId: p.userId }), t, n.emailConnectionId, n.eventKey, p.workspaceId, r.id),notificationEvent(env.DB,p,r,{id:`${n.eventKey}:${userId}`,recipient_id:userId},null,'pending',t));
  }
  const result = await env.DB.batch(writes);
  if (!result[0].meta.changes) throw new ApiError(409, 'revision_conflict', 'Reload the current source before publishing');
  return manageNotices(env, p, r.id);
}
export async function publishNotice(env: Env, principal: Principal, sourceId: string, b: Record<string, any>, noticeId?: string, command = 'update') {
  const p = await noticePublisher(env, principal), r = await source(env, p, sourceId);
  if (b.revision !== r.revision) throw new ApiError(409, 'revision_conflict', 'Reload the current source before publishing');
  const prior = noticeId ? notices(r).find(n => n.id === noticeId) : null;
  if (noticeId && !prior) throw new ApiError(404, 'not_found', 'Notice unavailable');
  if (prior?.state === 'withdrawn' || (prior?.state === 'all-clear' && command !== 'withdraw'))
    throw new ApiError(409, 'notice_terminal', 'A retained all-clear can only be withdrawn; publish a new notice for a new interruption');
  if (command === 'withdraw' && prior?.verifiedBy && prior.verifiedBy !== p.userId)
    throw new ApiError(403, 'notice_verifier', 'Only the person who recorded this recovery may withdraw its all-clear');
  const groupId = prior?.groupId ?? requiredString(b.groupId, 'groupId');
  // CHANGE-007: release notes reach only the release's named affected cohorts.
  if (r.kind === 'release' && !r.data.affectedGroupIds.includes(groupId))
    throw new ApiError(422, 'release_cohort', 'Release notes go only to the release’s affected cohorts');
  const g = command === 'withdraw' ? { memberIds: [] as string[] } : await cohort(env, p, groupId);
  const audience = [];
  if (command !== 'withdraw') for (const userId of g.memberIds) {
    const m = await env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1')
      .bind(p.workspaceId, userId).first<{roles_json:string}>();
    if (!m) continue;
    try { await source(env, { workspaceId: p.workspaceId, userId, roles: JSON.parse(m.roles_json) }, r.id); }
    catch (error) { if (error instanceof ApiError && [403,404].includes(error.status)) throw new ApiError(403, 'notice_audience', 'Every current cohort member must be allowed to read the source and its services'); throw error; }
    audience.push(userId);
  }
  const cadence = prior?.cadenceMinutes ?? b.cadenceMinutes;
  if (!Number.isInteger(cadence) || cadence < 1 || cadence > 10080) throw new ApiError(422, 'notice_cadence', 'Update cadence must be whole minutes from 1 to 10080');
  let verification = prior?.verification ?? null;
  if (command === 'all-clear') {
    if (r.kind === 'incident' ? r.data.status !== 'restored' || !r.data.cohorts.every((cohort: string) => (r.data.recoveries || []).some((e: any) => e.cohort === cohort && e.independent && e.usable && e.negativeChecksPassed && Number.isFinite(Date.parse(e.observedAt)) && Date.parse(e.observedAt) <= Date.now() && Date.parse(e.expiresAt) > Date.now())) : r.data.state !== (r.kind === 'release' ? 'completed' : 'verified'))
      throw new ApiError(422, 'notice_recovery', 'Independently verified source recovery is required before recording an all-clear');
    verification = requiredString(b.verification, 'verification', 2000);
  }
  const t = now(), state = command === 'withdraw' ? 'withdrawn' : command === 'all-clear' ? 'all-clear' : 'open';
  const emailConnectionId = prior?.emailConnectionId ?? (b.emailConnectionId ? requiredString(b.emailConnectionId, 'emailConnectionId') : null);
  if (emailConnectionId && !prior) {
    const c = await env.DB.prepare("SELECT id FROM connections WHERE workspace_id=? AND id=? AND provider='sendgrid' AND status='active'")
      .bind(p.workspaceId, emailConnectionId).first();
    if (!c) throw new ApiError(422, 'notice_mail', 'Choose a currently active SendGrid connection or leave email off');
  }
  return commit(env, p, r, { id: prior?.id ?? id(), groupId, message: command === 'withdraw' ? prior!.message : requiredString(b.message, 'message', 4000),
    state, cadenceMinutes: cadence, nextUpdateAt: state === 'open' ? new Date(Date.now() + cadence * 60000).toISOString() : null,
    publishedBy: p.userId, publishedAt: prior?.publishedAt ?? t, updatedAt: t,
    version: (prior?.version ?? 0) + 1, eventKey: id(), emailConnectionId, verification,
    verifiedBy: command === 'all-clear' ? p.userId : prior?.verifiedBy ?? null, verifiedAt: command === 'all-clear' ? t : prior?.verifiedAt ?? null,
  }, audience, `employee-notice-${command}`);
}

/** Repeat only a generic link at the chosen cadence; never invent a fresh progress or recovery report. */
export async function queueNoticeCadence(env: Env, principal: Principal) {
  const p = await noticePublisher(env, principal);
  for (const initial of [...await list(env.DB, p, 'incident'), ...await list(env.DB, p, 'change'), ...await list(env.DB, p, 'release')]) {
    for (const due of notices(initial).filter(n => n.state === 'open' && n.emailConnectionId && n.nextUpdateAt && n.nextUpdateAt <= now())) {
      const r = await source(env, p, initial.id), n = notices(r).find(n => n.id === due.id)!;
      if (n.eventKey !== due.eventKey) continue;
      const actor = await currentPrincipal(env.DB, { ...p, userId: n.publishedBy, roles: ['owner', 'operator'] });
      await noticePublisher(env, actor); await source(env, actor, r.id);
      const group = await cohort(env, actor, n.groupId);
      await commit(env, actor, r, { ...n, eventKey: id(), version: n.version + 1,
        nextUpdateAt: new Date(Date.now() + n.cadenceMinutes * 60000).toISOString() }, group.memberIds, 'employee-notice-cadence');
    }
  }
}

export async function noticeMailGate(env: Env, principal: Principal, job: any) {
  const b = JSON.parse(job.payload_json);
  const actor = await noticePublisher(env, { ...principal, userId: b.publisherId, roles: ['owner', 'operator'] });
  const r = await source(env, actor, job.record_id), n = notices(r).find(n => n.id === b.noticeId);
  if (!n || n.eventKey !== b.eventKey || n.version !== b.version || n.emailConnectionId !== job.connection_id)
    throw new ApiError(409, 'notice_superseded', 'Delivery belongs to an earlier notice version');
  const recipient = await currentPrincipal(env.DB, { ...principal, userId: job.recipient_id, roles: ['employee', 'owner', 'operator', 'auditor', 'approver', 'hr', 'integration'] });
  await eligible(env, recipient, r, n);
  return { actor, notice: n };
}

import { ApiError, id, now } from '../../platform/http';
import { createWork, permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';
import { businessMinuteTest, calendarFromRow, type BusinessCalendar } from './calendar';
import { groupMember } from './desk-groups';
import type { Template } from './lifecycle-templates';

/**
 * LIFE-002: the dated tasks a matching template creates for a join, move or leave. A task is a team task of the
 * lifecycle record (`task.manual` with a lifecycle): its team, the person's manager or the accountable owner does it,
 * the owner may waive it with a reason, and it grants no provider authority. Its due and reminder instants are whole
 * business days from the start or end of the change and are re-dated only when the effective date is amended.
 * A reminder is a request in each responsible person's own queue (the portal); other channels are not connected.
 */
export interface TaskSource { templateId: string; templateRevision: number; key: string; anchor: 'start' | 'end'; endFrom: 'effective' | 'expiry'; offsetDays: number; remindDays: number | null }

export async function calendarFor(ctx: WorkContext, timezone: string, ownerId: string): Promise<BusinessCalendar> {
  const rows = (await ctx.env.DB.prepare('SELECT * FROM work_calendars WHERE workspace_id=? AND timezone=? ORDER BY id LIMIT 2').bind(ctx.principal.workspaceId, timezone).all<any>()).results;
  if (rows.length !== 1) throw new ApiError(409, 'lifecycle_calendar_required',
    `Dated tasks are held: accountable owner ${ownerId} must configure one unambiguous business calendar for ${timezone}; ${rows.length ? 'multiple calendars match' : 'none is configured'}`);
  return calendarFromRow(rows[0]);
}
const wall = (t: number, zone: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(t).map(x => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
};
const zoned = (y: number, m: number, d: number, hour: number, zone: string) => {
  let t = Date.UTC(y, m - 1, d, hour);
  for (let i = 0; i < 3; i++) { const w = wall(t, zone); t = Date.UTC(y, m - 1, d, hour) - (Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - t); }
  return t;
};
/** The instant `days` business days before (negative) or after the anchor's local day, at the calendar's opening hour. Zero keeps the anchor. */
export function shiftBusinessDays(calendar: BusinessCalendar, anchor: string, days: number) {
  if (days === 0) return new Date(anchor).toISOString();
  const test = businessMinuteTest(calendar), step = days < 0 ? -1 : 1;
  let { y, m, d } = wall(Date.parse(anchor), calendar.timezone), remaining = Math.abs(days);
  for (let guard = 0; remaining && guard < 5000; guard++) {
    const next = new Date(Date.UTC(y, m - 1, d + step));
    y = next.getUTCFullYear(); m = next.getUTCMonth() + 1; d = next.getUTCDate();
    if (test(zoned(y, m, d, calendar.startHour, calendar.timezone))) remaining--;
  }
  if (remaining) throw new ApiError(422, 'calendar_horizon', 'No sufficient business days within the calendar horizon');
  return new Date(zoned(y, m, d, calendar.startHour, calendar.timezone)).toISOString();
}
export function taskDates(calendar: BusinessCalendar, source: Pick<TaskSource, 'offsetDays' | 'remindDays'>, anchor: string) {
  const dueAt = shiftBusinessDays(calendar, anchor, source.offsetDays);
  return { dueAt, remindAt: source.remindDays === null ? null : shiftBusinessDays(calendar, dueAt, -source.remindDays) };
}

export interface PlannedTask { obligationId: string; source: TaskSource; title: string; groupId: string | null; ownerId: string; dueAt: string; remindAt: string | null; note: string | null; state: 'pending' | 'blocked' }
/** The dated tasks of every matching template; a task whose anchor does not exist (no end date) is listed as skipped. */
export async function planTasks(ctx: WorkContext, input: { templates: Template[]; kind: string; effectiveAt: string; expiry: string | null; timezone: string; ownerId: string; managerId: string | null }) {
  const planned: PlannedTask[] = [], skipped: { templateId: string; key: string; title: string; reason: string }[] = [];
  if (!input.templates.length) return { planned, skipped };
  const calendar = await calendarFor(ctx, input.timezone, input.ownerId);
  const manager = input.managerId && await ctx.env.DB.prepare('SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(ctx.principal.workspaceId, input.managerId).first() ? input.managerId : null;
  for (const template of input.templates) for (const task of template.tasks) {
    const endFrom = input.expiry ? 'expiry' as const : 'effective' as const;
    const anchor = task.anchor === 'start' ? input.effectiveAt : input.expiry ?? (input.kind === 'leave' ? input.effectiveAt : null);
    if (!anchor) { skipped.push({ templateId: template.id, key: task.key, title: task.title, reason: 'No end date is recorded to date this task from' }); continue; }
    const { dueAt, remindAt } = taskDates(calendar, task, anchor);
    const forManager = task.assignee.type === 'manager';
    planned.push({ obligationId: id(), title: task.title, dueAt, remindAt, groupId: task.assignee.type === 'group' ? task.assignee.groupId : null,
      ownerId: forManager ? manager ?? input.ownerId : input.ownerId,
      state: forManager && !manager ? 'blocked' : 'pending',
      note: forManager && !manager ? `No active manager is recorded. Accountable owner ${input.ownerId} must resolve the missing manager; this task cannot be completed as a manager by the owner` : null,
      source: { templateId: template.id, templateRevision: template.revision, key: task.key, anchor: task.anchor, endFrom, offsetDays: task.offsetDays, remindDays: task.remindDays } });
  }
  return { planned, skipped };
}
export const taskStatements = (ctx: WorkContext, workId: string, lifecycleId: string, personId: string, planned: PlannedTask[]) => planned.map(t => ctx.env.DB.prepare(
  `INSERT OR IGNORE INTO work_obligations(id,workspace_id,work_id,lifecycle_id,kind,target,beneficiary_id,due_at,state,owner_id,last_error,title,group_id,remind_at,template_json)
   VALUES(?,?,?,?,'task.manual',?,?,?,?,?,?,?,?,?,?)`)
  .bind(t.obligationId, ctx.principal.workspaceId, workId, lifecycleId, `template:${t.source.templateId}:${t.source.key}`, personId, t.dueAt, t.state, t.ownerId, t.note, t.title, t.groupId, t.remindAt, JSON.stringify(t.source)));

/** An effective-date amendment re-dates every open template task from its recorded anchor; a cancellation cancels them. */
export async function redateLifecycleTasks(ctx: WorkContext, lifecycleId: string, change: { effectiveAt: string | null; cancel: boolean; timezone: string; ownerId: string }) {
  const db = ctx.env.DB, w = ctx.principal.workspaceId;
  if (change.cancel) {
    await db.prepare("UPDATE work_obligations SET state='cancelled',revision=revision+1 WHERE workspace_id=? AND lifecycle_id=? AND kind='task.manual' AND state IN ('pending','blocked')").bind(w, lifecycleId).run();
    return;
  }
  if (!change.effectiveAt) return;
  const rows = (await db.prepare("SELECT id,template_json,owner_id,state FROM work_obligations WHERE workspace_id=? AND lifecycle_id=? AND kind='task.manual' AND state IN ('pending','blocked') AND template_json IS NOT NULL").bind(w, lifecycleId).all<{ id: string; template_json: string; owner_id: string; state: string }>()).results;
  if (!rows.length) return;
  const calendar = await calendarFor(ctx, change.timezone, change.ownerId);
  for (const row of rows) {
    const source = JSON.parse(row.template_json) as TaskSource;
    if (source.anchor === 'end' && source.endFrom === 'expiry') continue;
    const { dueAt, remindAt } = taskDates(calendar, source, change.effectiveAt);
    await db.prepare('UPDATE work_obligations SET due_at=?,remind_at=?,reminded_at=NULL,revision=revision+1 WHERE workspace_id=? AND id=? AND state=?').bind(dueAt, remindAt, w, row.id, row.state).run();
  }
}

interface TaskRow { id: string; work_id: string; lifecycle_id: string; owner_id: string; group_id: string | null; state: string; revision: number; title: string; due_at: string; remind_at: string | null; reminded_at: string | null; beneficiary_id: string; cancelled_at: string | null; kind: string; effective_at: string; person_name: string }
const taskSelect = `SELECT o.id,o.work_id,o.lifecycle_id,o.owner_id,o.group_id,o.state,o.revision,o.title,o.due_at,o.remind_at,o.reminded_at,o.beneficiary_id,l.cancelled_at,l.kind,l.effective_at,p.name person_name
  FROM work_obligations o JOIN work_lifecycle l ON l.workspace_id=o.workspace_id AND l.id=o.lifecycle_id JOIN work_people p ON p.workspace_id=o.workspace_id AND p.id=o.beneficiary_id
  WHERE o.workspace_id=? AND o.kind='task.manual' AND o.template_json IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=o.workspace_id AND e.person_id=o.beneficiary_id)`;

/** Who does a task: the owner, its team's members, or the person it names (the manager or the accountable owner). Integrations never do. */
export async function mayDoTask(ctx: WorkContext, row: Pick<TaskRow, 'owner_id' | 'group_id'>) {
  if (ctx.principal.roles.includes('integration') && !ctx.principal.roles.includes('owner')) return false;
  if (ctx.principal.roles.includes('owner')) return true;
  return row.group_id ? groupMember(ctx, row.group_id, ctx.principal.userId) : row.owner_id === ctx.principal.userId;
}

/** The open tasks the caller does, with the minimum business scope: no HR record, access list or conversation. */
export async function myLifecycleTasks(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  const rows = (await ctx.env.DB.prepare(`${taskSelect} AND o.state='pending' AND l.cancelled_at IS NULL
    AND (?=1 OR (o.group_id IS NULL AND o.owner_id=?) OR EXISTS(SELECT 1 FROM work_group_members g WHERE g.workspace_id=o.workspace_id AND g.group_id=o.group_id AND g.user_id=?))
    ORDER BY o.due_at,o.id LIMIT 200`).bind(ctx.principal.workspaceId, Number(ctx.principal.roles.includes('owner')), ctx.principal.userId, ctx.principal.userId).all<TaskRow>()).results;
  const items = [];
  for (const row of rows) if (await mayDoTask(ctx, row))
    items.push({ id: row.id, title: row.title, person: row.person_name, change: row.kind, effectiveAt: row.effective_at, dueAt: row.due_at, remindAt: row.remind_at, revision: row.revision });
  return { items };
}

async function taskFor(ctx: WorkContext, taskId: string) {
  await currentWorkPrincipal(ctx);
  const row = await ctx.env.DB.prepare(`${taskSelect} AND o.id=?`).bind(ctx.principal.workspaceId, taskId).first<TaskRow>();
  // A task the caller neither does nor administers is not shown to exist.
  if (!row || !(await mayDoTask(ctx, row) || ctx.principal.roles.includes('hr'))) throw new ApiError(404, 'not_found', 'Task not found');
  return row;
}
export async function completeLifecycleTask(ctx: WorkContext, taskId: string, input: { revision?: unknown }) {
  const row = await taskFor(ctx, taskId);
  if (!await mayDoTask(ctx, row)) throw new ApiError(403, 'task_assignee_only', 'Only the task\'s team, its named person or the workspace owner completes it');
  if (!Number.isInteger(input.revision)) throw new ApiError(422, 'revision', 'Current task revision required');
  if (row.state !== 'pending' || row.cancelled_at) throw new ApiError(409, 'task_not_open', 'This task is already done, waived or cancelled');
  const t = now(), w = ctx.principal.workspaceId;
  const [result] = await ctx.env.DB.batch([
    ctx.env.DB.prepare(`UPDATE work_obligations SET state='done',completed_by=?,completed_at=?,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=? AND state='pending'
      AND NOT EXISTS(SELECT 1 FROM work_lifecycle WHERE workspace_id=? AND id=? AND cancelled_at IS NOT NULL)
      AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=work_obligations.workspace_id AND e.person_id=work_obligations.beneficiary_id)
      AND EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=work_obligations.workspace_id AND m.user_id=? AND m.active=1
        AND (EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value='owner') OR
          (NOT EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value='integration') AND
            ((work_obligations.group_id IS NULL AND work_obligations.owner_id=m.user_id) OR
             EXISTS(SELECT 1 FROM work_group_members g WHERE g.workspace_id=m.workspace_id AND g.user_id=m.user_id AND g.group_id=work_obligations.group_id)))))`).bind(ctx.principal.userId, t, w, taskId, input.revision, w, row.lifecycle_id, ctx.principal.userId),
    ctx.env.DB.prepare("INSERT INTO audit_events SELECT ?,?,?,'lifecycle.task_completed',?,?,? WHERE changes()=1").bind(id(), w, ctx.principal.userId, taskId, JSON.stringify({ lifecycleId: row.lifecycle_id }), t),
    ctx.env.DB.prepare("UPDATE work_records SET updated_at=? WHERE workspace_id=? AND id=? AND changes()=1").bind(t, w, row.work_id),
  ]);
  if (!result.meta.changes) throw new ApiError(409, 'revision_conflict', 'Task changed; refresh before completing it');
  return { id: taskId, state: 'done', revision: Number(input.revision) + 1 };
}
export async function waiveLifecycleTask(ctx: WorkContext, taskId: string, input: { revision?: unknown; reason?: unknown }) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const row = await taskFor(ctx, taskId);
  if (!Number.isInteger(input.revision)) throw new ApiError(422, 'revision', 'Current task revision required');
  if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 500) throw new ApiError(422, 'reason_required', 'Explain why this task is waived');
  if (row.state !== 'pending') throw new ApiError(409, 'task_not_open', 'This task is already done, waived or cancelled');
  const t = now(), w = ctx.principal.workspaceId;
  const [result] = await ctx.env.DB.batch([
    ctx.env.DB.prepare(`UPDATE work_obligations SET state='waived',waived_by=?,waived_at=?,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=? AND state='pending'
      AND NOT EXISTS(SELECT 1 FROM work_lifecycle l WHERE l.workspace_id=work_obligations.workspace_id AND l.id=work_obligations.lifecycle_id AND l.cancelled_at IS NOT NULL)
      AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=work_obligations.workspace_id AND e.person_id=work_obligations.beneficiary_id)
      AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=work_obligations.workspace_id AND m.user_id=? AND m.active=1 AND r.value='owner')`).bind(ctx.principal.userId, t, w, taskId, input.revision, ctx.principal.userId),
    ctx.env.DB.prepare("INSERT INTO audit_events SELECT ?,?,?,'lifecycle.task_waived',?,?,? WHERE changes()=1").bind(id(), w, ctx.principal.userId, taskId, JSON.stringify({ lifecycleId: row.lifecycle_id, reason: input.reason.trim() }), t),
  ]);
  if (!result.meta.changes) throw new ApiError(409, 'revision_conflict', 'Task changed; refresh before waiving it');
  return { id: taskId, state: 'waived', revision: Number(input.revision) + 1 };
}

/** One reminder request per responsible person once an open task's reminder instant has passed; the task is marked reminded. */
export async function remindLifecycleTasks(ctx: WorkContext, at: string) {
  const db = ctx.env.DB, w = ctx.principal.workspaceId, results = [];
  const due = (await db.prepare(`${taskSelect} AND o.state='pending' AND l.cancelled_at IS NULL AND o.remind_at IS NOT NULL AND o.remind_at<=? AND o.reminded_at IS NULL ORDER BY o.remind_at,o.id LIMIT 100`)
    .bind(w, at).all<TaskRow>()).results;
  for (const row of due) {
    const recipients = row.group_id
      ? (await db.prepare(`SELECT g.user_id FROM work_group_members g JOIN memberships m ON m.workspace_id=g.workspace_id AND m.user_id=g.user_id AND m.active=1
          WHERE g.workspace_id=? AND g.group_id=? ORDER BY g.lead DESC,g.user_id`).bind(w, row.group_id).all<{ user_id: string }>()).results.map(r => r.user_id)
      : [row.owner_id];
    const leads = row.group_id ? (await db.prepare('SELECT g.user_id FROM work_group_members g JOIN memberships m ON m.workspace_id=g.workspace_id AND m.user_id=g.user_id AND m.active=1 WHERE g.workspace_id=? AND g.group_id=? AND g.lead=1').bind(w, row.group_id).all<{ user_id: string }>()).results.map(r => r.user_id) : [];
    const to = (row.group_id ? (leads.length ? recipients.filter(r => leads.includes(r)) : recipients) : recipients);
    if (!to.length) { results.push({ id: row.id, state: 'reminder_failed', error: 'no_recipient' }); continue; }
    try {
      for (const user of to) await createWork(ctx, {
        title: 'Lifecycle task reminder',
        body: 'A lifecycle task needs your attention. Open this reminder to review the task if it is currently assigned to you.',
        deduplicationKey: `life-task:${row.id}:${user}`, beneficiaryId: user,
        context: { lifecycleTaskReminder: { taskId: row.id } },
      }, { admittedLifecycleBeneficiary: user, statements: () => {
        const guard = id();
        return [db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN
          EXISTS(SELECT 1 FROM work_obligations o JOIN work_lifecycle l ON l.workspace_id=o.workspace_id AND l.id=o.lifecycle_id
            WHERE o.workspace_id=? AND o.id=? AND o.revision=? AND o.state='pending' AND l.cancelled_at IS NULL
            AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=o.workspace_id AND e.person_id=o.beneficiary_id))
          AND EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1)
          AND (? IS NULL OR EXISTS(SELECT 1 FROM work_group_members WHERE workspace_id=? AND group_id=? AND user_id=?)) THEN 1 ELSE 0 END)`)
          .bind(guard, w, row.id, row.revision, w, user, row.group_id, w, row.group_id, user), db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard)];
      } });
      await db.prepare('UPDATE work_obligations SET reminded_at=? WHERE workspace_id=? AND id=? AND reminded_at IS NULL').bind(at, w, row.id).run();
      results.push({ id: row.id, state: 'task_reminded', recipients: to.length });
    } catch (error) { results.push({ id: row.id, state: 'reminder_failed', error: error instanceof ApiError ? error.code : 'error' }); }
  }
  return results;
}

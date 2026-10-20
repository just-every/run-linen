import { ApiError, id, now, requiredString } from "../../platform/http";
import { currentWorkPrincipal } from "./identity";
import { getWork, permit, transitionWork, type WorkContext, type WorkRecord } from "./core";
import { slaFor } from "./sla-policies";
import { slaDue, type SlaTargetState } from "./sla-clock";
import type { BusinessCalendar } from "./calendar";

/** DESK-005: multi-level escalation around SLA targets and the awaiting-requester reminder rule.
 * Each escalation or reminder is a persisted row with its next due time; the scheduler tick fires
 * due rows and stops rows whose obligation is satisfied. */
const targets = ["first_response", "resolution"] as const;
const OFFSET_LIMIT = 10080;
interface Level { id: string; target: string; level: number; offset_minutes: number; notify: string; label: string }
interface Followup { id: string; kind: string; episode: string; level: number; state: string; next_due_at: string | null }
const activeOperator = "SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1 AND EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value IN ('owner','operator'))";

export async function saveEscalationLevel(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner"]);
  const target = input.target as string, level = input.level as number, offset = input.offsetMinutes as number;
  if (!targets.includes(target as never)) throw new ApiError(422, "escalation_target", "Escalate on first response or resolution");
  if (!Number.isInteger(level) || level < 1 || level > 5) throw new ApiError(422, "escalation_level", "Level must be 1 to 5");
  if (!Number.isInteger(offset) || Math.abs(offset) > OFFSET_LIMIT)
    throw new ApiError(422, "escalation_offset", "Offset is whole minutes from the due time, at most one week before or after");
  const label = requiredString(input.label, "label", 80), notify = requiredString(input.notify, "notify", 200);
  if (notify !== "assignee" && !(await ctx.env.DB.prepare(activeOperator).bind(ctx.principal.workspaceId, notify).first()))
    throw new ApiError(422, "escalation_notify", "Notify the assignee or an active owner or operator");
  const at = now(), levelId = id();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare("INSERT INTO work_escalation_levels(id,workspace_id,target,level,offset_minutes,notify,label,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,target,level) DO UPDATE SET offset_minutes=excluded.offset_minutes,notify=excluded.notify,label=excluded.label,created_by=excluded.created_by,created_at=excluded.created_at")
      .bind(levelId, ctx.principal.workspaceId, target, level, offset, notify, label, ctx.principal.userId, at),
    ctx.env.DB.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)")
      .bind(id(), ctx.principal.workspaceId, ctx.principal.userId, "work.escalation_level_saved", `${target}:${level}`, JSON.stringify({ offsetMinutes: offset, notify, label }), at),
  ]);
  return listEscalationLevels(ctx);
}

export async function listEscalationLevels(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator", "auditor"]);
  const ws = ctx.principal.workspaceId;
  const [levels, rule] = await Promise.all([
    ctx.env.DB.prepare("SELECT id,target,level,offset_minutes,notify,label FROM work_escalation_levels WHERE workspace_id=? ORDER BY target,level").bind(ws).all<Level>(),
    ctx.env.DB.prepare("SELECT remind_business_days,resolve_business_days,revision FROM work_waiting_rules WHERE workspace_id=?").bind(ws).first(),
  ]);
  return { levels: levels.results, waitingRule: rule };
}

export async function saveWaitingRule(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner"]);
  const remind = input.remindBusinessDays as number, resolve = input.resolveBusinessDays as number;
  if (!Number.isInteger(remind) || !Number.isInteger(resolve) || remind < 1 || resolve <= remind || resolve > 30)
    throw new ApiError(422, "waiting_rule", "Remind after 1 or more business days and resolve later, within 30");
  const at = now();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare("INSERT INTO work_waiting_rules(workspace_id,remind_business_days,resolve_business_days,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET remind_business_days=excluded.remind_business_days,resolve_business_days=excluded.resolve_business_days,revision=work_waiting_rules.revision+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at")
      .bind(ctx.principal.workspaceId, remind, resolve, ctx.principal.userId, at),
    ctx.env.DB.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)")
      .bind(id(), ctx.principal.workspaceId, ctx.principal.userId, "work.waiting_rule_saved", ctx.principal.workspaceId, JSON.stringify({ remindBusinessDays: remind, resolveBusinessDays: resolve }), at),
  ]);
  return listEscalationLevels(ctx);
}

export async function readFollowups(ctx: WorkContext, workId: string) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator", "auditor"]);
  await getWork(ctx, workId);
  return { items: (await ctx.env.DB.prepare("SELECT f.*,u.name notify_name FROM work_followups f LEFT JOIN users u ON u.id=f.notify_id WHERE f.workspace_id=? AND f.work_id=? ORDER BY f.kind,f.level")
    .bind(ctx.principal.workspaceId, workId).all()).results };
}

/** A business day is one working day's hours on the ticket's SLA calendar; without one, 24 hours. */
function afterBusinessDays(start: string, days: number, calendar: BusinessCalendar | null) {
  return slaDue(start, days * (calendar ? (calendar.endHour - calendar.startHour) * 60 : 1440), calendar, []);
}
const zoneTime = (value: string, calendar: BusinessCalendar | null) => new Intl.DateTimeFormat("en-US", {
  timeZone: calendar?.timezone ?? "UTC", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
}).format(new Date(value));

async function upsert(ctx: WorkContext, workId: string, row: { kind: string; episode: string; level: number; notifyId: string | null; label: string; dueAt: string | null }) {
  await ctx.env.DB.prepare("INSERT INTO work_followups(id,workspace_id,work_id,kind,episode,level,notify_id,label,next_due_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,work_id,kind,episode,level) DO UPDATE SET next_due_at=excluded.next_due_at,notify_id=excluded.notify_id,label=excluded.label WHERE work_followups.state='scheduled'")
    .bind(id(), ctx.principal.workspaceId, workId, row.kind, row.episode, row.level, row.notifyId, row.label, row.dueAt).run();
  return ctx.env.DB.prepare("SELECT * FROM work_followups WHERE workspace_id=? AND work_id=? AND kind=? AND episode=? AND level=?")
    .bind(ctx.principal.workspaceId, workId, row.kind, row.episode, row.level).first<Followup>();
}
const stop = (ctx: WorkContext, workId: string, kind: string, reason: string, at: string, episode?: string) =>
  ctx.env.DB.prepare(`UPDATE work_followups SET state='stopped',stopped_at=?,stop_reason=?,next_due_at=NULL WHERE workspace_id=? AND work_id=? AND kind=? AND state='scheduled'${episode ? " AND episode=?" : ""}`)
    .bind(at, reason, ctx.principal.workspaceId, workId, kind, ...(episode ? [episode] : [])).run();
/** Claims a due row once; a concurrent tick that loses the claim does nothing. */
async function claim(ctx: WorkContext, row: Followup, at: string) {
  const claimed = await ctx.env.DB.prepare("UPDATE work_followups SET state='fired',fired_at=? WHERE workspace_id=? AND id=? AND state='scheduled' AND next_due_at<=?")
    .bind(at, ctx.principal.workspaceId, row.id, at).run();
  return claimed.meta.changes > 0;
}
const note = (ctx: WorkContext, workId: string, key: string, visibility: "public" | "private", body: string, at: string) =>
  ctx.env.DB.prepare("INSERT OR IGNORE INTO work_messages(id,workspace_id,work_id,author_id,visibility,body,source_key,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(id(), ctx.principal.workspaceId, workId, ctx.principal.userId, visibility, body, key, at).run();

async function escalate(ctx: WorkContext, work: WorkRecord, levels: Level[], sla: NonNullable<Awaited<ReturnType<typeof slaFor>>>, at: string) {
  const zone = sla.policy.calendar;
  for (const target of targets) {
    const state: SlaTargetState = target === "first_response" ? sla.firstResponse : sla.resolution;
    if (state.metAt) { await stop(ctx, work.id, "escalation", "target met", at, target); continue; }
    for (const level of levels.filter((l) => l.target === target)) {
      const notifyId = level.notify === "assignee" ? work.assignee_id : level.notify;
      const dueAt = state.dueAt && new Date(Date.parse(state.dueAt) + level.offset_minutes * 60000).toISOString();
      const row = await upsert(ctx, work.id, { kind: "escalation", episode: target, level: level.level, notifyId, label: level.label, dueAt });
      if (!row || row.state !== "scheduled" || !row.next_due_at || row.next_due_at > at || !(await claim(ctx, row, at))) continue;
      const person = notifyId ? (await ctx.env.DB.prepare("SELECT name FROM users WHERE id=?").bind(notifyId).first<{ name: string }>())?.name ?? notifyId : null;
      const when = state.dueAt! < at ? `breached at ${zoneTime(state.dueAt!, zone)}` : `due ${zoneTime(state.dueAt!, zone)}`;
      await note(ctx, work.id, `followup:${row.id}`, "private",
        `Level ${level.level} escalation (${level.label}${person ? `: ${person}` : ": no agent is assigned"}): ${target === "first_response" ? "first response" : "resolution"} ${when} under ${sla.policy.name}.`, at);
    }
  }
}

async function remindRequester(ctx: WorkContext, work: WorkRecord, rule: { remind_business_days: number; resolve_business_days: number }, calendar: BusinessCalendar | null, messages: { author_id: string; visibility: string; source_key: string; created_at: string }[], at: string) {
  const pause = await ctx.env.DB.prepare("SELECT id,waiting_on,paused_at FROM work_sla_pauses WHERE workspace_id=? AND work_id=? AND resumed_at IS NULL ORDER BY paused_at DESC LIMIT 1")
    .bind(ctx.principal.workspaceId, work.id).first<{ id: string; waiting_on: string | null; paused_at: string }>();
  if (work.state !== "paused" || pause?.waiting_on !== "requester") { await stop(ctx, work.id, "requester_reminder", "no longer awaiting the requester", at); return; }
  const replied = messages.some((m) => m.visibility === "public" && (m.author_id === work.requester_id || m.author_id === work.beneficiary_id)
    && m.created_at > pause.paused_at && !/^(transition|interpretation|followup):/.test(m.source_key));
  if (replied) {
    await upsert(ctx, work.id, { kind: "requester_reminder", episode: pause.id, level: 1, notifyId: work.requester_id, label: "Reminder", dueAt: null });
    await upsert(ctx, work.id, { kind: "requester_reminder", episode: pause.id, level: 2, notifyId: work.requester_id, label: "Resolve with disclosure", dueAt: null });
    await stop(ctx, work.id, "requester_reminder", "requester replied", at, pause.id);
    return;
  }
  const resolveAt = afterBusinessDays(pause.paused_at, rule.resolve_business_days, calendar)!;
  const reminder = await upsert(ctx, work.id, { kind: "requester_reminder", episode: pause.id, level: 1, notifyId: work.requester_id, label: "Reminder", dueAt: afterBusinessDays(pause.paused_at, rule.remind_business_days, calendar) });
  const resolve = await upsert(ctx, work.id, { kind: "requester_reminder", episode: pause.id, level: 2, notifyId: work.requester_id, label: "Resolve with disclosure", dueAt: resolveAt });
  if (reminder?.state === "scheduled" && reminder.next_due_at! <= at && await claim(ctx, reminder, at))
    await note(ctx, work.id, `followup:${reminder.id}`, "public",
      `Reminder: we are waiting for your reply. If we do not hear from you by ${zoneTime(resolveAt, calendar)}, this request will be resolved; you can reply or reopen it at any time.`, at);
  if (resolve?.state === "scheduled" && resolve.next_due_at! <= at && reminder?.state !== "scheduled" && await claim(ctx, resolve, at))
    await transitionWork(ctx, work.id, work.revision, "close",
      `Resolved without a reply: no reply arrived within ${rule.resolve_business_days} business days of our question on ${zoneTime(pause.paused_at, calendar)}, after a reminder. Reply or reopen to continue.`);
}

/** Scheduler duty: plan, fire and stop escalations and requester reminders on open and paused tickets. */
export async function processFollowups(ctx: WorkContext, at = now()) {
  const ws = ctx.principal.workspaceId;
  const [levels, rule] = await Promise.all([
    ctx.env.DB.prepare("SELECT * FROM work_escalation_levels WHERE workspace_id=? ORDER BY level").bind(ws).all<Level>(),
    ctx.env.DB.prepare("SELECT remind_business_days,resolve_business_days FROM work_waiting_rules WHERE workspace_id=?").bind(ws).first<{ remind_business_days: number; resolve_business_days: number }>(),
  ]);
  if (!levels.results.length && !rule) return [];
  const works = (await ctx.env.DB.prepare("SELECT * FROM work_records WHERE workspace_id=? AND state IN ('open','paused') ORDER BY created_at LIMIT 500")
    .bind(ws).all<WorkRecord>()).results;
  const results = [];
  for (const work of works) {
    try {
      const sla = await slaFor(ctx, work, at);
      if (sla && levels.results.length) await escalate(ctx, work, levels.results, sla, at);
      if (rule) {
        const messages = sla?.messages ?? (await ctx.env.DB.prepare("SELECT author_id,visibility,source_key,created_at FROM work_messages WHERE workspace_id=? AND work_id=?").bind(ws, work.id).all<any>()).results;
        await remindRequester(ctx, work, rule, sla?.policy.calendar ?? null, messages, at);
      }
      results.push({ workId: work.id, state: "checked" });
    } catch (error) {
      results.push({ workId: work.id, state: "failed", error: error instanceof ApiError ? error.code : "error" });
    }
  }
  // Closed or cancelled tickets satisfy every remaining obligation.
  await ctx.env.DB.prepare("UPDATE work_followups SET state='stopped',stopped_at=?,stop_reason='ticket closed',next_due_at=NULL WHERE workspace_id=? AND state='scheduled' AND work_id IN (SELECT id FROM work_records WHERE workspace_id=? AND state IN ('closed','cancelled'))")
    .bind(at, ws, ws).run();
  return results;
}

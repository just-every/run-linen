import { currentWorkPrincipal } from "./identity";
import { ApiError, id, now, requiredString } from "../../platform/http";
import { getWork, permit, type WorkContext, type WorkRecord } from "./core";
import { calendarFromRow, type BusinessCalendar } from "./calendar";
import { categories, type TicketClassification } from "./classification-policy";
import { targetState, type SlaPause, type SlaTargetState } from "./sla-clock";

/** DESK-004: owner-ordered SLA policies matched by priority, category and requester group. */
export const waitingOn = ["requester", "vendor"] as const;
const priorities = ["P1", "P2", "P3", "P4"];
interface PolicySnapshot {
  name: string;
  firstResponseMinutes: number;
  nextResponseMinutes: number;
  resolutionMinutes: number;
  pauseOn: string[];
  hours: "business" | "calendar";
}
const minutes = (value: unknown, name: string) => {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 525600)
    throw new ApiError(422, "sla_target", `${name} must be whole minutes between 1 and 525600`);
  return value as number;
};

export async function saveRequesterGroup(ctx: WorkContext, input: { name?: unknown; memberIds?: unknown }) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner"]);
  const name = requiredString(input.name, "name", 120);
  const members = Array.isArray(input.memberIds) ? [...new Set(input.memberIds)] : [];
  if (!members.length || members.length > 1000 || !members.every((m) => typeof m === "string" && m))
    throw new ApiError(422, "requester_group_members", "Name 1 to 1000 workspace members");
  const known = await ctx.env.DB.prepare(
    "SELECT COUNT(*) n FROM memberships WHERE workspace_id=? AND user_id IN (SELECT value FROM json_each(?))",
  ).bind(ctx.principal.workspaceId, JSON.stringify(members)).first<{ n: number }>();
  if (known?.n !== members.length) throw new ApiError(422, "requester_group_members", "Every member must belong to this workspace");
  const groupId = id();
  const saved = await ctx.env.DB.prepare(
    "INSERT OR IGNORE INTO work_requester_groups(id,workspace_id,name,members_json,created_at) VALUES(?,?,?,?,?)",
  ).bind(groupId, ctx.principal.workspaceId, name, JSON.stringify(members), now()).run();
  if (!saved.meta.changes) throw new ApiError(409, "requester_group_exists", "A requester group with this name exists");
  return { id: groupId, name, memberIds: members };
}

export async function saveSlaPolicy(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner"]);
  const name = requiredString(input.name, "name", 120);
  const position = input.position;
  if (!Number.isInteger(position) || (position as number) < 1 || (position as number) > 1000)
    throw new ApiError(422, "sla_position", "Position must be a whole number from 1 to 1000");
  const priority = input.priority ?? null, category = input.category ?? null;
  if (priority !== null && !priorities.includes(priority as string))
    throw new ApiError(422, "sla_priority", "Priority must be P1, P2, P3 or P4, or omitted for any");
  if (category !== null && !Object.hasOwn(categories, category as string))
    throw new ApiError(422, "sla_category", "Choose a desk category, or omit it for any");
  const groupId = (input.requesterGroupId as string | null | undefined) ?? null;
  if (groupId !== null && !(await ctx.env.DB.prepare("SELECT 1 FROM work_requester_groups WHERE workspace_id=? AND id=?")
    .bind(ctx.principal.workspaceId, groupId).first()))
    throw new ApiError(422, "requester_group_missing", "Choose an existing requester group, or omit it for anyone");
  const calendarId = (input.calendarId as string | null | undefined) ?? null;
  if (calendarId !== null && !(await ctx.env.DB.prepare("SELECT 1 FROM work_calendars WHERE workspace_id=? AND id=?")
    .bind(ctx.principal.workspaceId, calendarId).first()))
    throw new ApiError(422, "calendar_missing", "Choose a business calendar, or omit it for calendar hours");
  const pauseOn = Array.isArray(input.pauseOn) ? [...new Set(input.pauseOn)] : [...waitingOn];
  if (!pauseOn.every((w) => waitingOn.includes(w as never)))
    throw new ApiError(422, "sla_pause_on", "Pause on awaiting requester, awaiting vendor, both or neither");
  const policyId = id();
  const saved = await ctx.env.DB.prepare(
    "INSERT OR IGNORE INTO work_sla_policies(id,workspace_id,name,position,priority,category,requester_group_id,calendar_id,first_response_minutes,next_response_minutes,resolution_minutes,pause_on_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).bind(policyId, ctx.principal.workspaceId, name, position, priority, category, groupId, calendarId,
    minutes(input.firstResponseMinutes, "First response"), minutes(input.nextResponseMinutes, "Next response"),
    minutes(input.resolutionMinutes, "Resolution"), JSON.stringify(pauseOn), ctx.principal.userId, now()).run();
  if (!saved.meta.changes) throw new ApiError(409, "sla_position_taken", "Another policy holds this position");
  return (await listSlaPolicies(ctx)).find((p) => p.id === policyId);
}

export async function listSlaPolicies(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator", "auditor"]);
  return (await ctx.env.DB.prepare(
    "SELECT p.*,g.name requester_group_name,c.name calendar_name,c.location calendar_location FROM work_sla_policies p LEFT JOIN work_requester_groups g ON g.id=p.requester_group_id AND g.workspace_id=p.workspace_id LEFT JOIN work_calendars c ON c.id=p.calendar_id AND c.workspace_id=p.workspace_id WHERE p.workspace_id=? ORDER BY p.position",
  ).bind(ctx.principal.workspaceId).all<Record<string, unknown>>()).results;
}

/** Binds the first policy, in owner order, whose set criteria all match; unset criteria match anything.
 * Called whenever a classification is applied, so a priority change rebinds from the ticket's opening. */
export async function bindSlaPolicy(ctx: WorkContext, work: WorkRecord, classification: TicketClassification) {
  const policy = await ctx.env.DB.prepare(
    `SELECT p.*,c.timezone,c.weekdays_json,c.start_hour,c.end_hour,c.holidays_json,c.location,c.holiday_catalog FROM work_sla_policies p
     LEFT JOIN work_calendars c ON c.id=p.calendar_id AND c.workspace_id=p.workspace_id
     WHERE p.workspace_id=? AND (p.priority IS NULL OR p.priority=?) AND (p.category IS NULL OR p.category=?)
     AND (p.requester_group_id IS NULL OR EXISTS(SELECT 1 FROM work_requester_groups g, json_each(g.members_json) m WHERE g.id=p.requester_group_id AND g.workspace_id=p.workspace_id AND m.value=?))
     ORDER BY p.position LIMIT 1`,
  ).bind(ctx.principal.workspaceId, classification.priority, classification.category, work.requester_id).first<any>();
  if (!policy) {
    await ctx.env.DB.prepare("DELETE FROM work_sla_clocks WHERE workspace_id=? AND work_id=?").bind(ctx.principal.workspaceId, work.id).run();
    return null;
  }
  const snapshot: PolicySnapshot = {
    name: policy.name, firstResponseMinutes: policy.first_response_minutes, nextResponseMinutes: policy.next_response_minutes,
    resolutionMinutes: policy.resolution_minutes, pauseOn: JSON.parse(policy.pause_on_json), hours: policy.calendar_id ? "business" : "calendar",
  };
  const calendar = policy.calendar_id ? calendarFromRow(policy) : null;
  await ctx.env.DB.prepare(
    "INSERT INTO work_sla_clocks(workspace_id,work_id,policy_id,policy_revision,policy_json,calendar_json,bound_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(workspace_id,work_id) DO UPDATE SET policy_id=excluded.policy_id,policy_revision=excluded.policy_revision,policy_json=excluded.policy_json,calendar_json=excluded.calendar_json,bound_at=excluded.bound_at,revision=work_sla_clocks.revision+1",
  ).bind(ctx.principal.workspaceId, work.id, policy.id, policy.revision, JSON.stringify(snapshot), calendar && JSON.stringify(calendar), now()).run();
  return policy.id as string;
}

/** Waiting-on pauses: a pause names who the ticket waits for; any transition out of paused ends it. */
export function slaPauseStatements(ctx: WorkContext, workId: string, command: string, waiting: string | undefined, at: string) {
  const db = ctx.env.DB, ws = ctx.principal.workspaceId;
  const statements = [db.prepare("UPDATE work_sla_pauses SET resumed_at=? WHERE workspace_id=? AND work_id=? AND resumed_at IS NULL").bind(at, ws, workId)];
  if (command === "pause")
    statements.push(db.prepare("INSERT INTO work_sla_pauses(id,workspace_id,work_id,waiting_on,paused_at) VALUES(?,?,?,?,?)").bind(id(), ws, workId, waiting ?? null, at));
  return statements;
}
export function validWaitingOn(command: string, waiting: unknown) {
  if (waiting === undefined || waiting === null) return undefined;
  if (command !== "pause" || !waitingOn.includes(waiting as never))
    throw new ApiError(422, "waiting_on", "Only a pause names who the ticket waits for: requester or vendor");
  return waiting as string;
}

interface Clock { policy_id: string; policy_revision: number; policy_json: string; calendar_json: string | null; bound_at: string }
type Message = { author_id: string; visibility: string; source_key: string; created_at: string };
/** The ticket's targets at `at`. Agent replies are public messages by anyone other than the requester and
 * beneficiary; each requester message after an agent reply starts a next-response target met by the next agent reply. */
function evaluate(work: WorkRecord, clock: Clock, pauses: SlaPause[], messages: Message[], at: string) {
  const policy: PolicySnapshot = JSON.parse(clock.policy_json), calendar: BusinessCalendar | null = clock.calendar_json ? JSON.parse(clock.calendar_json) : null;
  const applicable = pauses.filter((p) => p.waiting_on && policy.pauseOn.includes(p.waiting_on));
  const isRequester = (m: Message) => m.author_id === work.requester_id || m.author_id === work.beneficiary_id;
  const conversation = messages.filter((m) => m.visibility === "public" && !m.source_key.startsWith("transition:") && !m.source_key.startsWith("interpretation:") && !m.source_key.startsWith("followup:"));
  const next: SlaTargetState[] = [];
  let answered = false, waitingSince: string | null = null;
  for (const m of conversation) {
    if (!isRequester(m)) {
      if (waitingSince) next.push(targetState("next_response", waitingSince, policy.nextResponseMinutes, m.created_at, calendar, applicable, at));
      answered = true; waitingSince = null;
    } else if (answered && !waitingSince) waitingSince = m.created_at;
  }
  if (waitingSince) next.push(targetState("next_response", waitingSince, policy.nextResponseMinutes, null, calendar, applicable, at));
  return {
    policy: { id: clock.policy_id, revision: clock.policy_revision, ...policy, calendar, boundAt: clock.bound_at },
    firstResponse: targetState("first_response", work.created_at, policy.firstResponseMinutes, work.response_at ?? null, calendar, applicable, at),
    nextResponses: next,
    resolution: targetState("resolution", work.created_at, policy.resolutionMinutes, work.state === "closed" ? work.closed_at ?? null : null, calendar, applicable, at),
    pauses: pauses.map((p) => ({ ...p, stopsClock: applicable.includes(p) })),
  };
}
async function slaInputs(ctx: WorkContext, workId: string) {
  const ws = ctx.principal.workspaceId;
  const [clock, pauses, messages] = await Promise.all([
    ctx.env.DB.prepare("SELECT * FROM work_sla_clocks WHERE workspace_id=? AND work_id=?").bind(ws, workId).first<Clock>(),
    ctx.env.DB.prepare("SELECT waiting_on,paused_at,resumed_at FROM work_sla_pauses WHERE workspace_id=? AND work_id=? ORDER BY paused_at").bind(ws, workId).all<SlaPause>(),
    ctx.env.DB.prepare("SELECT author_id,visibility,source_key,created_at FROM work_messages WHERE workspace_id=? AND work_id=? ORDER BY created_at,rowid").bind(ws, workId).all<Message>(),
  ]);
  return { clock, pauses: pauses.results, messages: messages.results };
}
/** The ticket's evaluated targets at `at` without a role check, for callers that already hold the record. */
export async function slaFor(ctx: WorkContext, work: WorkRecord, at: string) {
  const { clock, pauses, messages } = await slaInputs(ctx, work.id);
  return clock ? { ...evaluate(work, clock, pauses, messages, at), messages } : null;
}
export async function readWorkSla(ctx: WorkContext, workId: string, at = now()) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator", "auditor"]);
  const work = await getWork(ctx, workId);
  const { clock, pauses, messages } = await slaInputs(ctx, workId);
  return { workId, at, ...(clock ? evaluate(work, clock, pauses, messages, at) : { policy: null }) };
}
/** Report rows for normal-sensitivity tickets opened in [from,to) with a bound policy, and breach counts per target. */
export async function slaReport(ctx: WorkContext, from: string, to: string, at = now()) {
  const works = (await ctx.env.DB.prepare(
    "SELECT w.* FROM work_records w JOIN work_sla_clocks c ON c.workspace_id=w.workspace_id AND c.work_id=w.id WHERE w.workspace_id=? AND w.sensitivity='normal' AND w.created_at>=? AND w.created_at<? ORDER BY w.created_at",
  ).bind(ctx.principal.workspaceId, from, to).all<WorkRecord>()).results;
  const rows = await Promise.all(works.map(async (work) => {
    const { clock, pauses, messages } = await slaInputs(ctx, work.id);
    return { workId: work.id, title: work.title, ...evaluate(work, clock!, pauses, messages, at) };
  }));
  const count = (states: SlaTargetState[]) => Object.fromEntries(["met", "breached", "running", "paused"].map((s) => [s, states.filter((t) => t.state === s).length]));
  return {
    at,
    definition: "Normal-sensitivity tickets opened in [from,to) with a bound SLA policy. A target is breached when it was met after, or is still unmet past, its due time; waiting-on pauses the policy names stop its clock.",
    denominator: rows.length,
    counts: {
      firstResponse: count(rows.map((r) => r.firstResponse)),
      nextResponse: count(rows.flatMap((r) => r.nextResponses)),
      resolution: count(rows.map((r) => r.resolution)),
    },
    rows,
  };
}

import { departmentWorkBatch } from './department-spaces';
import { departmentReportScope } from './department-report-scope';
import { workPrivateReadable } from './scope';
import { ApiError, id, now, requiredString } from "../../platform/http";
import { currentWorkPrincipal } from "./identity";
import { getWork, permit, type WorkContext, type WorkRecord } from "./core";
import { waitingOn } from "./sla-policies";

/** DESK-010: owner-defined ticket fields per ticket type, named statuses mapped to SLA waiting-on behaviour,
 * and the resolution code and close notes every close records. The owner acts for "admin". */
export const ticketTypes = ["incident", "service_request", "question"] as const;
/** The legacy "request" kind is a service request. */
export const ticketType = (kind: string) => (kind === "request" ? "service_request" : kind);
const defaultCodes = ["Solved (workaround)", "Solved (permanent fix)", "Not reproducible"];
/** Automatic closures record these, so they stay on every workspace's list. */
export const systemCodes = ["Duplicate", "No response"] as const;
const builtInStates = ["open", "paused", "closed", "cancelled"];
interface FieldRow { id: string; name: string; field_type: "text" | "dropdown"; options_json: string; kinds_json: string; required_on_json: string }
const field = (row: FieldRow) => ({
  id: row.id, name: row.name, type: row.field_type, options: JSON.parse(row.options_json) as string[],
  kinds: JSON.parse(row.kinds_json) as string[], requiredOn: JSON.parse(row.required_on_json) as string[],
});
const audit = (ctx: WorkContext, action: string, target: string, detail: unknown, at: string) =>
  ctx.env.DB.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)").bind(id(), ctx.principal.workspaceId, ctx.principal.userId, action, target, JSON.stringify(detail), at);
const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
function distinctTexts(value: unknown, name: string, max: number, length: number) {
  if (!Array.isArray(value) || value.length > max || !value.every((v) => typeof v === "string" && v.trim() && v.trim().length <= length))
    throw new ApiError(422, name, `Give at most ${max} entries of 1 to ${length} characters`);
  const texts = value.map((v: string) => v.trim());
  if (texts.some((t, i) => texts.findIndex((u) => sameText(t, u)) !== i)) throw new ApiError(422, name, "Entries must be distinct");
  return texts;
}

async function fields(ctx: WorkContext) {
  return (await ctx.env.DB.prepare("SELECT * FROM work_custom_fields WHERE workspace_id=? ORDER BY created_at,name")
    .bind(ctx.principal.workspaceId).all<FieldRow>()).results.map(field);
}
async function statuses(ctx: WorkContext) {
  return (await ctx.env.DB.prepare("SELECT id,name,waiting_on waitingOn FROM work_custom_statuses WHERE workspace_id=? ORDER BY created_at,name")
    .bind(ctx.principal.workspaceId).all<{ id: string; name: string; waitingOn: string | null }>()).results;
}
/** The owner's list (the default list until the owner saves one), then the system codes it does not already name. */
export async function resolutionCodes(ctx: WorkContext) {
  const row = await ctx.env.DB.prepare("SELECT codes_json,revision FROM work_resolution_codes WHERE workspace_id=?")
    .bind(ctx.principal.workspaceId).first<{ codes_json: string; revision: number }>();
  const own: string[] = row ? JSON.parse(row.codes_json) : defaultCodes;
  return { codes: [...own, ...systemCodes.filter((s) => !own.some((c) => sameText(c, s)))], system: [...systemCodes], revision: row?.revision ?? 0 };
}

export async function deskSettings(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator", "hr", "auditor"]);
  return { fields: await fields(ctx), statuses: await statuses(ctx), resolutionCodes: await resolutionCodes(ctx) };
}

export async function saveCustomField(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner"]);
  const name = requiredString(input.name, "name", 80);
  if (input.type !== "text" && input.type !== "dropdown") throw new ApiError(422, "field_type", "A field is text or a dropdown");
  const options = input.type === "dropdown" ? distinctTexts(input.options, "field_options", 100, 120) : [];
  if (input.type === "dropdown" && !options.length) throw new ApiError(422, "field_options", "A dropdown needs at least one option");
  const kinds = distinctTexts(input.kinds, "field_kinds", 3, 40);
  if (!kinds.length || !kinds.every((k) => ticketTypes.includes(k as never)))
    throw new ApiError(422, "field_kinds", "Show the field on incidents, service requests, questions or several of them");
  // Required on "closed" (resolving) or on named statuses, by their ids.
  const requiredOn = distinctTexts(input.requiredOn ?? [], "field_required_on", 21, 40);
  const known = new Set(["closed", ...(await statuses(ctx)).map((s) => s.id)]);
  if (!requiredOn.every((s) => known.has(s))) throw new ApiError(422, "field_required_on", "Require the field on closed or on a named status");
  const at = now(), fieldId = id();
  const [saved] = await ctx.env.DB.batch([
    ctx.env.DB.prepare("INSERT OR IGNORE INTO work_custom_fields(id,workspace_id,name,field_type,options_json,kinds_json,required_on_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(fieldId, ctx.principal.workspaceId, name, input.type, JSON.stringify(options), JSON.stringify(kinds), JSON.stringify(requiredOn), ctx.principal.userId, at),
    audit(ctx, "work.field_defined", fieldId, { name, type: input.type, options, kinds, requiredOn }, at),
  ]);
  if (!saved.meta.changes) throw new ApiError(409, "field_exists", "A field with this name exists");
  return (await fields(ctx)).find((f) => f.id === fieldId);
}

export async function saveCustomStatus(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner"]);
  const name = requiredString(input.name, "name", 60);
  if (builtInStates.some((s) => sameText(s, name))) throw new ApiError(422, "status_name", "Name a status other than open, paused, closed or cancelled");
  const waiting = input.waitingOn ?? null;
  if (waiting !== null && !waitingOn.includes(waiting as never))
    throw new ApiError(422, "status_waiting_on", "A status waits on the requester, a vendor, or nobody outside the desk");
  const at = now(), statusId = id();
  const [saved] = await ctx.env.DB.batch([
    ctx.env.DB.prepare("INSERT OR IGNORE INTO work_custom_statuses(id,workspace_id,name,waiting_on,created_by,created_at) VALUES(?,?,?,?,?,?)")
      .bind(statusId, ctx.principal.workspaceId, name, waiting, ctx.principal.userId, at),
    audit(ctx, "work.status_defined", statusId, { name, waitingOn: waiting }, at),
  ]);
  if (!saved.meta.changes) throw new ApiError(409, "status_exists", "A status with this name exists");
  return { id: statusId, name, waitingOn: waiting };
}

export async function saveResolutionCodes(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner"]);
  const codes = distinctTexts(input.codes, "resolution_codes", 50, 80);
  if (!codes.length) throw new ApiError(422, "resolution_codes", "Keep at least one resolution code");
  const current = await resolutionCodes(ctx), at = now();
  if (input.revision !== current.revision) throw new ApiError(409, "revision_conflict", "Resolution codes changed; refresh before saving");
  await ctx.env.DB.batch([
    ctx.env.DB.prepare("INSERT INTO work_resolution_codes(workspace_id,codes_json,revision,updated_by,updated_at) VALUES(?,?,1,?,?) ON CONFLICT(workspace_id) DO UPDATE SET codes_json=excluded.codes_json,revision=work_resolution_codes.revision+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at WHERE work_resolution_codes.revision=?")
      .bind(ctx.principal.workspaceId, JSON.stringify(codes), ctx.principal.userId, at, current.revision),
    audit(ctx, "work.resolution_codes_saved", ctx.principal.workspaceId, { codes }, at),
  ]);
  return resolutionCodes(ctx);
}

/** Fields shown on this ticket's type with their values, its named status and, once closed, its resolution.
 * Anyone who can read the ticket reads these; shared and team viewers see the public thread only. */
export async function readWorkDesk(ctx: WorkContext, workId: string) {
  await currentWorkPrincipal(ctx);
  const work = await getWork(ctx, workId), ws = ctx.principal.workspaceId, type = ticketType(work.kind);
  const values = (await ctx.env.DB.prepare("SELECT field_id,value FROM work_field_values WHERE workspace_id=? AND work_id=?")
    .bind(ws, workId).all<{ field_id: string; value: string }>()).results;
  const status = work.state === "paused" ? await ctx.env.DB.prepare("SELECT s.id,s.name,s.waiting_on waitingOn FROM work_sla_pauses p JOIN work_custom_statuses s ON s.workspace_id=p.workspace_id AND s.id=p.status_id WHERE p.workspace_id=? AND p.work_id=? AND p.resumed_at IS NULL")
    .bind(ws, workId).first() : null;
  const resolution = work.state === "closed" ? await ctx.env.DB.prepare("SELECT r.code,r.close_notes closeNotes,r.resolved_at resolvedAt,u.name resolvedBy FROM work_resolutions r LEFT JOIN users u ON u.id=r.resolved_by WHERE r.workspace_id=? AND r.work_id=?")
    .bind(ws, workId).first() : null;
  return {
    workId, ticketType: type, status, resolution,
    fields: (await fields(ctx)).filter((f) => f.kinds.includes(type)).map((f) => ({ ...f, value: values.find((v) => v.field_id === f.id)?.value ?? null })),
  };
}

/** Agents write field values with the same roles that move a ticket's state; an empty value clears it. */
export async function setWorkField(ctx: WorkContext, workId: string, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  const work = await getWork(ctx, workId);
  permit(ctx, ["owner", "operator", "hr"]);
  if (work.department_id && !workPrivateReadable(ctx.principal, work)) throw new ApiError(403, "department_staff", "Current department staff required");
  const target = (await fields(ctx)).find((f) => f.id === input.fieldId);
  if (!target || !target.kinds.includes(ticketType(work.kind))) throw new ApiError(422, "field_missing", "Choose a field shown on this ticket type");
  if (typeof input.value !== "string" || input.value.length > 2000) throw new ApiError(422, "field_value", "A field value is text of at most 2000 characters");
  const value = input.value.trim();
  if (value && target.type === "dropdown" && !target.options.includes(value)) throw new ApiError(422, "field_value", `Choose one of the ${target.name} options`);
  const at = now(), ws = ctx.principal.workspaceId;
  await departmentWorkBatch(ctx, work, [
    ctx.env.DB.prepare(`INSERT INTO audit_events SELECT ?,?,?,'work.field_set',?,
      json_object('field',?,'before',(SELECT value FROM work_field_values WHERE workspace_id=? AND work_id=? AND field_id=?),'value',?),?`)
      .bind(id(), ws, ctx.principal.userId, workId, target.name, ws, workId, target.id, value || null, at),
    value
      ? ctx.env.DB.prepare("INSERT INTO work_field_values(workspace_id,work_id,field_id,value,updated_by,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_id,work_id,field_id) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at")
        .bind(ws, workId, target.id, value, ctx.principal.userId, at)
      : ctx.env.DB.prepare("DELETE FROM work_field_values WHERE workspace_id=? AND work_id=? AND field_id=?").bind(ws, workId, target.id),
    ctx.env.DB.prepare("UPDATE work_records SET updated_at=? WHERE workspace_id=? AND id=?").bind(at, ws, workId),
  ], "private");
  return readWorkDesk(ctx, workId);
}

/** A named status for a pause: it waits on whom the status names, and the bound SLA policy decides whether that stops the clock. */
export async function pauseStatus(ctx: WorkContext, work: WorkRecord, command: string, statusId: unknown, waiting: string | undefined) {
  if (statusId === undefined || statusId === null || statusId === "") return { statusId: null, waiting };
  if (command !== "pause") throw new ApiError(422, "status_command", "Only a pause sets a named status");
  const status = await ctx.env.DB.prepare("SELECT id,waiting_on FROM work_custom_statuses WHERE workspace_id=? AND id=?")
    .bind(ctx.principal.workspaceId, statusId).first<{ id: string; waiting_on: string | null }>();
  if (!status) throw new ApiError(422, "status_missing", "Choose a status the owner defined");
  if (waiting !== undefined && waiting !== status.waiting_on) throw new ApiError(422, "waiting_on", "The status already names who the ticket waits for");
  await requireFields(ctx, work, status.id, "setting this status");
  return { statusId: status.id, waiting: status.waiting_on ?? undefined };
}

/** Fields shown on the ticket's type and required on `on` ("closed" or a named status id) must have a value. */
async function requireFields(ctx: WorkContext, work: WorkRecord, on: string, action: string) {
  const missing = (await ctx.env.DB.prepare("SELECT f.name FROM work_custom_fields f WHERE f.workspace_id=? AND EXISTS(SELECT 1 FROM json_each(f.required_on_json) WHERE value=?) AND EXISTS(SELECT 1 FROM json_each(f.kinds_json) WHERE value=?) AND NOT EXISTS(SELECT 1 FROM work_field_values v WHERE v.workspace_id=f.workspace_id AND v.work_id=? AND v.field_id=f.id) ORDER BY f.name")
    .bind(ctx.principal.workspaceId, on, ticketType(work.kind), work.id).all<{ name: string }>()).results;
  if (missing.length) throw new ApiError(422, "field_required", `Fill ${missing.map((m) => m.name).join(", ")} before ${action}`);
}

/** Every close, by an agent or automatic, records close notes; an incident also needs a resolution code from the
 * list, and every field required on close for the ticket's type needs a value. Returns the statement recording the
 * resolution, which writes only when the ticket closed at `closedAt`. */
export async function closeResolution(ctx: WorkContext, work: WorkRecord, code: unknown, notes: string, closedAt: string) {
  const ws = ctx.principal.workspaceId, type = ticketType(work.kind);
  if (!notes.trim()) throw new ApiError(422, "close_notes_required", "Close notes are required to resolve a ticket");
  if (code !== undefined && code !== null && code !== "" && typeof code !== "string") throw new ApiError(422, "resolution_code", "Choose a resolution code from the list");
  const chosen = typeof code === "string" && code.trim() ? code.trim() : null;
  if (type === "incident" && !chosen) throw new ApiError(422, "resolution_code_required", "An incident is resolved only with a resolution code");
  if (chosen && !(await resolutionCodes(ctx)).codes.includes(chosen)) throw new ApiError(422, "resolution_code", "Choose a resolution code from the list");
  await requireFields(ctx, work, "closed", "resolving");
  return ctx.env.DB.prepare("INSERT OR REPLACE INTO work_resolutions(workspace_id,work_id,code,close_notes,resolved_by,resolved_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=? AND state='closed' AND closed_at=?)")
    .bind(ws, work.id, chosen, notes.trim(), ctx.principal.userId, closedAt, ws, work.id, closedAt);
}

/** REPORT-001: closed normal-sensitivity tickets opened in [from,to), counted by resolution code. */
export async function resolutionReport(ctx: WorkContext, from: string, to: string) {
  await currentWorkPrincipal(ctx);
  const scope = departmentReportScope(ctx);
  const counts = (await ctx.env.DB.prepare(`SELECT r.code,COUNT(*) count FROM work_records w LEFT JOIN work_resolutions r ON r.workspace_id=w.workspace_id AND r.work_id=w.id WHERE w.workspace_id=? AND w.sensitivity='normal' AND w.state='closed' AND w.created_at>=? AND w.created_at<? AND ${scope.sql} GROUP BY r.code ORDER BY count DESC,r.code`)
    .bind(ctx.principal.workspaceId, from, to, ...scope.bindings).all<{ code: string | null; count: number }>()).results;
  return {
    definition: "Closed normal-sensitivity tickets opened in [from,to), by the resolution code recorded at their latest close; no code means none was required or the ticket closed before codes were recorded.",
    denominator: counts.reduce((sum, c) => sum + c.count, 0),
    counts,
  };
}

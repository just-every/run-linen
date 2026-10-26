import { currentWorkPrincipal } from "./identity";
import { ApiError, id } from "../../platform/http";
import { getWork, permit, type WorkContext } from "./core";
import { holidayCatalogs, usFederalHolidays, type HolidayCatalog } from "./sla-holidays";
export interface BusinessCalendar {
  timezone: string;
  weekdays: number[];
  startHour: number;
  endHour: number;
  holidays: string[];
  /** DESK-004: the location this calendar serves and the holiday catalog it observes. */
  location?: string | null;
  holidayCatalog?: HolidayCatalog | null;
}
export function validateCalendar(calendar: BusinessCalendar) {
  let zone = true;
  try { new Intl.DateTimeFormat("en", { timeZone: calendar.timezone }).format(); } catch { zone = false; }
  if (
    !zone ||
    !Array.isArray(calendar.weekdays) ||
    !calendar.weekdays.length ||
    !calendar.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ||
    !Number.isInteger(calendar.startHour) ||
    !Number.isInteger(calendar.endHour) ||
    calendar.startHour < 0 ||
    calendar.endHour > 24 ||
    calendar.startHour >= calendar.endHour ||
    !Array.isArray(calendar.holidays) ||
    !calendar.holidays.every((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) ||
    (calendar.holidayCatalog != null && !holidayCatalogs.includes(calendar.holidayCatalog))
  )
    throw new ApiError(422, "calendar", "Invalid business calendar/duration");
}
/** Whether the minute starting at instant t is working time on the calendar, in its own time zone. */
export function businessMinuteTest(calendar: BusinessCalendar) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: calendar.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  return (t: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(t).map((p) => [p.type, p.value]));
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    return (
      calendar.weekdays.includes(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday!)) &&
      Number(parts.hour) >= calendar.startHour &&
      Number(parts.hour) < calendar.endHour &&
      !calendar.holidays.includes(day) &&
      !(calendar.holidayCatalog === "us-federal" && usFederalHolidays(Number(parts.year)).has(day))
    );
  };
}
export function calendarFromRow(c: { timezone: string; weekdays_json: string; start_hour: number; end_hour: number; holidays_json: string; location?: string | null; holiday_catalog?: string | null }): BusinessCalendar {
  return {
    timezone: c.timezone,
    weekdays: JSON.parse(c.weekdays_json),
    startHour: c.start_hour,
    endHour: c.end_hour,
    holidays: JSON.parse(c.holidays_json),
    location: c.location ?? null,
    holidayCatalog: (c.holiday_catalog as HolidayCatalog | null) ?? null,
  };
}
export function businessDue(
  start: string,
  minutes: number,
  calendar: BusinessCalendar,
) {
  validateCalendar(calendar);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 525600)
    throw new ApiError(422, "calendar", "Invalid business calendar/duration");
  const working = businessMinuteTest(calendar);
  let t = Date.parse(start);
  if (!Number.isFinite(t)) throw new ApiError(422, "time", "Invalid start");
  let remaining = minutes;
  for (let step = 0; remaining && step < 5270400; step++) {
    if (working(t)) remaining--;
    t += 60000;
  }
  if (remaining)
    throw new ApiError(
      422,
      "calendar_horizon",
      "No sufficient business time within ten years",
    );
  return new Date(t).toISOString();
}
export async function saveCalendar(
  ctx: WorkContext,
  input: BusinessCalendar & { name: string },
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator"]);
  businessDue(new Date().toISOString(), 1, input);
  if (input.location != null && (typeof input.location !== "string" || !input.location.trim() || input.location.length > 120))
    throw new ApiError(422, "calendar_location", "Location must be a short name");
  const calendarId = id();
  await ctx.env.DB.prepare(
    "INSERT INTO work_calendars(id,workspace_id,name,timezone,weekdays_json,start_hour,end_hour,holidays_json,revision,location,holiday_catalog) VALUES(?,?,?,?,?,?,?,?,1,?,?)",
  )
    .bind(
      calendarId,
      ctx.principal.workspaceId,
      input.name,
      input.timezone,
      JSON.stringify(input.weekdays),
      input.startHour,
      input.endHour,
      JSON.stringify(input.holidays),
      input.location?.trim() || null,
      input.holidayCatalog ?? null,
    )
    .run();
  return { id: calendarId };
}
export async function setCommitment(
  ctx: WorkContext,
  workId: string,
  input: {
    calendarId: string;
    responseMinutes: number;
    resolutionMinutes: number;
  },
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator"]);
  const work = await getWork(ctx, workId);
  const c = await ctx.env.DB.prepare(
    "SELECT * FROM work_calendars WHERE workspace_id=? AND id=?",
  )
    .bind(ctx.principal.workspaceId, input.calendarId)
    .first<{
      revision: number;
      timezone: string;
      weekdays_json: string;
      start_hour: number;
      end_hour: number;
      holidays_json: string;
      location: string | null;
      holiday_catalog: string | null;
    }>();
  if (!c)
    throw new ApiError(422, "calendar_missing", "Configured calendar required");
  const calendar = calendarFromRow(c);
  const response = businessDue(
      work.created_at,
      input.responseMinutes,
      calendar,
    ),
    resolution = businessDue(
      work.created_at,
      input.resolutionMinutes,
      calendar,
    );
  await ctx.env.DB.prepare(
    `INSERT INTO work_commitments(id,workspace_id,work_id,calendar_id,calendar_revision,response_minutes,resolution_minutes,response_due_at,resolution_due_at,revision,calendar_snapshot_json) VALUES(?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(workspace_id,work_id) DO UPDATE SET calendar_id=excluded.calendar_id,calendar_revision=excluded.calendar_revision,response_minutes=excluded.response_minutes,resolution_minutes=excluded.resolution_minutes,response_due_at=excluded.response_due_at,resolution_due_at=excluded.resolution_due_at,revision=work_commitments.revision+1,calendar_snapshot_json=excluded.calendar_snapshot_json`,
  )
    .bind(
      id(),
      ctx.principal.workspaceId,
      work.id,
      input.calendarId,
      c.revision,
      input.responseMinutes,
      input.resolutionMinutes,
      response,
      resolution,
      JSON.stringify(calendar),
    )
    .run();
  return {
    workId,
    responseDueAt: response,
    resolutionDueAt: resolution,
    calendarRevision: c.revision,
  };
}

export async function commitmentStatus(ctx: WorkContext, workId: string) {
  const work = await getWork(ctx, workId);
  const commitment = await ctx.env.DB.prepare(
    "SELECT * FROM work_commitments WHERE workspace_id=? AND work_id=?",
  )
    .bind(ctx.principal.workspaceId, workId)
    .first();
  return {
    commitment,
    clock: work.paused_at ? "paused" : "running",
    pausedMilliseconds:
      work.paused_ms +
      (work.paused_at ? Date.now() - Date.parse(work.paused_at) : 0),
    closureIsRecovery: false,
  };
}

export async function pauseCommitmentStatement(
  ctx: WorkContext,
  workId: string,
  from: string,
  to: string,
) {
  const row = await ctx.env.DB.prepare(
    "SELECT c.*,b.timezone,b.weekdays_json,b.start_hour,b.end_hour,b.holidays_json,b.location,b.holiday_catalog FROM work_commitments c JOIN work_calendars b ON b.id=c.calendar_id AND b.workspace_id=c.workspace_id WHERE c.workspace_id=? AND c.work_id=?",
  )
    .bind(ctx.principal.workspaceId, workId)
    .first<{
      id: string;
      calendar_snapshot_json: string|null;
      response_due_at: string;
      resolution_due_at: string;
      timezone: string;
      weekdays_json: string;
      start_hour: number;
      end_hour: number;
      holidays_json: string;
      location: string | null;
      holiday_catalog: string | null;
    }>();
  if (!row) return null;
  const calendar:BusinessCalendar = row.calendar_snapshot_json?JSON.parse(row.calendar_snapshot_json):calendarFromRow(row), working = businessMinuteTest(calendar);
  let pausedMinutes = 0;
  for (
    let instant = Date.parse(from);
    instant < Date.parse(to);
    instant += 60000
  )
    if (working(instant)) pausedMinutes++;
  const response = businessDue(row.response_due_at, pausedMinutes, calendar),
    resolution = businessDue(row.resolution_due_at, pausedMinutes, calendar);
  return ctx.env.DB.prepare(
    "UPDATE work_commitments SET response_due_at=CASE WHEN EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=? AND response_at IS NULL) THEN ? ELSE response_due_at END,resolution_due_at=?,revision=revision+1 WHERE workspace_id=? AND id=?",
  )
    .bind(
      ctx.principal.workspaceId,
      workId,
      response,
      resolution,
      ctx.principal.workspaceId,
      row.id,
    );
}

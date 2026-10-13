import { currentWorkPrincipal } from "./identity";
import { ApiError, id } from "../../platform/http";
import { getWork, permit, type WorkContext } from "./core";
export interface BusinessCalendar {
  timezone: string;
  weekdays: number[];
  startHour: number;
  endHour: number;
  holidays: string[];
}
export function businessDue(
  start: string,
  minutes: number,
  calendar: BusinessCalendar,
) {
  if (
    !Number.isInteger(minutes) ||
    minutes < 0 ||
    minutes > 525600 ||
    calendar.startHour < 0 ||
    calendar.endHour > 24 ||
    calendar.startHour >= calendar.endHour ||
    !calendar.weekdays.length
  )
    throw new ApiError(422, "calendar", "Invalid business calendar/duration");
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: calendar.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  let t = Date.parse(start);
  if (!Number.isFinite(t)) throw new ApiError(422, "time", "Invalid start");
  let remaining = minutes;
  for (let step = 0; remaining && step < 5270400; step++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(t).map((p) => [p.type, p.value]),
    );
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      parts.weekday!,
    );
    if (
      calendar.weekdays.includes(weekday) &&
      Number(parts.hour) >= calendar.startHour &&
      Number(parts.hour) < calendar.endHour &&
      !calendar.holidays.includes(`${parts.year}-${parts.month}-${parts.day}`)
    )
      remaining--;
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
  const calendarId = id();
  await ctx.env.DB.prepare(
    "INSERT INTO work_calendars VALUES(?,?,?,?,?,?,?,?,1)",
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
    }>();
  if (!c)
    throw new ApiError(422, "calendar_missing", "Configured calendar required");
  const calendar = {
    timezone: c.timezone,
    weekdays: JSON.parse(c.weekdays_json),
    startHour: c.start_hour,
    endHour: c.end_hour,
    holidays: JSON.parse(c.holidays_json),
  };
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
    `INSERT INTO work_commitments VALUES(?,?,?,?,?,?,?,?,?,1) ON CONFLICT(workspace_id,work_id) DO UPDATE SET calendar_id=excluded.calendar_id,calendar_revision=excluded.calendar_revision,response_minutes=excluded.response_minutes,resolution_minutes=excluded.resolution_minutes,response_due_at=excluded.response_due_at,resolution_due_at=excluded.resolution_due_at,revision=work_commitments.revision+1`,
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

export async function shiftCommitmentForPause(
  ctx: WorkContext,
  workId: string,
  from: string,
  to: string,
) {
  const row = await ctx.env.DB.prepare(
    "SELECT c.*,b.timezone,b.weekdays_json,b.start_hour,b.end_hour,b.holidays_json FROM work_commitments c JOIN work_calendars b ON b.id=c.calendar_id AND b.workspace_id=c.workspace_id WHERE c.workspace_id=? AND c.work_id=?",
  )
    .bind(ctx.principal.workspaceId, workId)
    .first<{
      id: string;
      response_due_at: string;
      resolution_due_at: string;
      timezone: string;
      weekdays_json: string;
      start_hour: number;
      end_hour: number;
      holidays_json: string;
    }>();
  if (!row) return;
  const calendar = {
    timezone: row.timezone,
    weekdays: JSON.parse(row.weekdays_json),
    startHour: row.start_hour,
    endHour: row.end_hour,
    holidays: JSON.parse(row.holidays_json),
  };
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: calendar.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  let pausedMinutes = 0;
  for (
    let instant = Date.parse(from);
    instant < Date.parse(to);
    instant += 60000
  ) {
    const part = Object.fromEntries(
      formatter.formatToParts(instant).map((p) => [p.type, p.value]),
    );
    if (
      calendar.weekdays.includes(
        ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
          part.weekday!,
        ),
      ) &&
      Number(part.hour) >= calendar.startHour &&
      Number(part.hour) < calendar.endHour &&
      !calendar.holidays.includes(`${part.year}-${part.month}-${part.day}`)
    )
      pausedMinutes++;
  }
  const response = businessDue(row.response_due_at, pausedMinutes, calendar),
    resolution = businessDue(row.resolution_due_at, pausedMinutes, calendar);
  await ctx.env.DB.prepare(
    "UPDATE work_commitments SET response_due_at=CASE WHEN EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=? AND response_at IS NULL) THEN ? ELSE response_due_at END,resolution_due_at=?,revision=revision+1 WHERE workspace_id=? AND id=?",
  )
    .bind(
      ctx.principal.workspaceId,
      workId,
      response,
      resolution,
      ctx.principal.workspaceId,
      row.id,
    )
    .run();
}

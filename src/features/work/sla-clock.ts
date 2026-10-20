import { businessMinuteTest, validateCalendar, type BusinessCalendar } from "./calendar";
/** DESK-004: pure SLA arithmetic. A minute counts toward a target when it is working time on the
 * policy's calendar (every minute for calendar hours) and outside every applicable waiting-on pause. */
export interface SlaPause { waiting_on: string | null; paused_at: string; resumed_at: string | null; status?: string | null }
export interface SlaTargetState {
  target: "first_response" | "next_response" | "resolution";
  startedAt: string;
  dueAt: string | null;
  metAt: string | null;
  state: "met" | "breached" | "running" | "paused";
  breachedAt: string | null;
}
const HORIZON = 5270400;
/** The due instant, or null while an open pause holds the clock before the target is reached. */
export function slaDue(start: string, minutes: number, calendar: BusinessCalendar | null, pauses: SlaPause[]) {
  if (calendar) validateCalendar(calendar);
  const working = calendar ? businessMinuteTest(calendar) : () => true;
  const held = pauses.map((p) => [Date.parse(p.paused_at), p.resumed_at ? Date.parse(p.resumed_at) : Infinity] as const)
    .sort((a, b) => a[0] - b[0]);
  let t = Date.parse(start), remaining = minutes;
  for (let step = 0; remaining && step < HORIZON; step++) {
    const pause = held.find(([from, to]) => t >= from && t < to);
    if (pause) {
      if (pause[1] === Infinity) return null;
      t = Math.ceil((pause[1] - Date.parse(start)) / 60000) * 60000 + Date.parse(start);
      continue;
    }
    if (working(t)) remaining--;
    t += 60000;
  }
  return remaining ? null : new Date(t).toISOString();
}
export function targetState(target: SlaTargetState["target"], startedAt: string, minutes: number, metAt: string | null,
  calendar: BusinessCalendar | null, pauses: SlaPause[], at: string): SlaTargetState {
  const dueAt = slaDue(startedAt, minutes, calendar, pauses);
  const late = dueAt !== null && (metAt ? metAt > dueAt : at > dueAt);
  return {
    target, startedAt, dueAt, metAt,
    state: late ? "breached" : metAt ? "met" : dueAt === null ? "paused" : "running",
    breachedAt: late ? dueAt : null,
  };
}

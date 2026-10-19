/**
 * CHANGE-002: risk scored from a fixed questionnaire, the impacted configuration
 * items' environment, the schedule and failed changes on those items; the band
 * selects the approval path. Unanswered questions score as "yes".
 */
import type { Principal } from '../../platform/types';
import { ApiError } from '../../platform/http';
import { dto, getService, type RecordRow } from './store';

export const riskQuestions = {
  userFacingOutage: 'A user-facing outage is expected',
  untestedBackout: 'The backout has not been tested',
  firstOfKind: 'This is the first change of its kind',
  touchesSecurity: 'It touches authentication or security',
} as const;
export const environments = ['production', 'test', 'development'] as const;
const FAILED_LOOKBACK_MS = 180 * 86400000;

interface Window { start: string; end: string }
export interface RiskFactor { factor: string; points: number; detail: string }

/** Any hour of [start,end) on a business weekday, inside business hours and not a holiday. */
async function inBusinessHours(db: D1Database, p: Principal, window: Window, calendarId: string) {
  const c = await db.prepare('SELECT * FROM work_calendars WHERE workspace_id=? AND id=?').bind(p.workspaceId, calendarId)
    .first<{ timezone: string; weekdays_json: string; start_hour: number; end_hour: number; holidays_json: string }>();
  if (!c) throw new ApiError(422, 'calendar_required', 'Business calendar not found');
  const weekdays = JSON.parse(c.weekdays_json) as number[], holidays = JSON.parse(c.holidays_json) as string[];
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: c.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const end = Date.parse(window.end);
  // Minute steps, bounded to 31 days: a window longer than that already spans business hours on any calendar with a weekday.
  for (let t = Date.parse(window.start), n = 0; t < end && n < 31 * 1440; t += 60000, n++) {
    const parts = Object.fromEntries(f.formatToParts(t).map(x => [x.type, x.value]));
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday!);
    if (weekdays.includes(weekday) && Number(parts.hour) >= c.start_hour && Number(parts.hour) < c.end_hour && !holidays.includes(`${parts.year}-${parts.month}-${parts.day}`)) return true;
  }
  return end - Date.parse(window.start) > 31 * 86400000 && weekdays.length > 0;
}

export async function scoreChange(db: D1Database, p: Principal, input: { services: string[]; window: Window; calendarId?: unknown; riskAnswers?: unknown }) {
  const answers = input.riskAnswers && typeof input.riskAnswers === 'object' ? input.riskAnswers as Record<string, unknown> : {};
  for (const [key, value] of Object.entries(answers))
    if (!(key in riskQuestions) || typeof value !== 'boolean') throw new ApiError(400, 'risk_answers', 'Answer each risk question yes or no');
  const factors: RiskFactor[] = [];
  for (const [key, question] of Object.entries(riskQuestions)) {
    const answer = answers[key];
    if (answer !== false) factors.push({ factor: key, points: 2, detail: answer === true ? question : `${question} (unanswered, scored as yes)` });
  }
  const items = await Promise.all(input.services.map(id => getService(db, p, id, 'service')));
  const production = items.filter(i => (i.data.environment ?? 'production') === 'production');
  if (production.length) factors.push({ factor: 'production', points: 3, detail: `Production configuration item: ${production.map(i => i.data.name).join(', ')}` });
  if (typeof input.calendarId === 'string' && input.calendarId) {
    if (await inBusinessHours(db, p, input.window, input.calendarId)) factors.push({ factor: 'schedule', points: 1, detail: 'The window falls inside business hours' });
  } else factors.push({ factor: 'schedule', points: 1, detail: 'No business calendar named; counted as business hours' });
  const since = Date.parse(input.window.start) - FAILED_LOOKBACK_MS;
  const failed = (await db.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind='change'").bind(p.workspaceId).all<RecordRow>()).results.map(dto)
    .filter(c => ['failed', 'compensated'].includes(c.data.state) && Date.parse(c.data.window?.start) >= since && Date.parse(c.data.window?.start) < Date.parse(input.window.start)
      && (c.data.services as string[]).some(s => input.services.includes(s)));
  if (failed.length) factors.push({ factor: 'failedChanges', points: Math.min(6, failed.length * 3), detail: `${failed.length} failed change${failed.length === 1 ? '' : 's'} on these items in the prior 180 days: ${failed.map(c => c.data.title).join(', ')}` });
  const score = factors.reduce((n, f) => n + f.points, 0);
  const band = score >= 8 ? 'high' : score >= 4 ? 'medium' : 'low';
  return { score, band, factors, answers: Object.fromEntries(Object.keys(riskQuestions).map(k => [k, typeof answers[k] === 'boolean' ? answers[k] : null])) };
}

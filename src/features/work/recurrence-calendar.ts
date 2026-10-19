import { ApiError } from '../../platform/http';
import type { BusinessCalendar } from './calendar';
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'annual';
export interface RecurrenceRule { startDate: string; frequency: Frequency; interval: number; firstBusinessDay: boolean }
const fail = () => new ApiError(422, 'recurrence_calendar', 'Valid date, frequency, interval and business calendar required');
export function dateOnly(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value+'T12:00:00Z')) || new Date(value+'T12:00:00Z').toISOString().slice(0,10) !== value) throw fail();
  return value;
}
export function validateRecurrence(rule: RecurrenceRule, calendar: BusinessCalendar) {
  dateOnly(rule.startDate);
  if (!['daily','weekly','monthly','annual'].includes(rule.frequency) || !Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 120 || typeof rule.firstBusinessDay !== 'boolean'
    || (rule.firstBusinessDay && !['monthly','annual'].includes(rule.frequency)) || !Array.isArray(calendar.weekdays) || !calendar.weekdays.length
    || calendar.weekdays.some(n => !Number.isInteger(n) || n < 0 || n > 6) || !Number.isInteger(calendar.startHour) || calendar.startHour < 0 || calendar.startHour > 23
    || !Array.isArray(calendar.holidays)) throw fail();
  calendar.holidays.forEach(dateOnly);
  try { new Intl.DateTimeFormat('en', {timeZone:calendar.timezone}).format(); } catch { throw fail(); }
}
function addDays(date: string, days: number) { const d = new Date(date+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
export function nominalDate(rule: RecurrenceRule, index: number) {
  if (!Number.isInteger(index) || index < 0) throw fail();
  if (rule.frequency === 'daily' || rule.frequency === 'weekly') return addDays(rule.startDate,index*rule.interval*(rule.frequency === 'weekly'?7:1));
  const anchor = new Date(rule.startDate+'T12:00:00Z');
  const month = anchor.getUTCMonth()+index*rule.interval*(rule.frequency === 'annual'?12:1);
  const first = new Date(Date.UTC(anchor.getUTCFullYear(),month,1,12));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0,12)).getUTCDate();
  first.setUTCDate(rule.firstBusinessDay?1:Math.min(anchor.getUTCDate(),lastDay));
  return first.toISOString().slice(0,10);
}
/** Calendar dates stay in the chosen zone; holidays/weekends roll forward, never backward. */
export function occurrence(rule: RecurrenceRule, calendar: BusinessCalendar, index: number) {
  let date = nominalDate(rule,index);
  // The initial first-business-day period must not precede the selected start date.
  if (index === 0 && date < rule.startDate) date = rule.startDate;
  const nominal = date;
  for (let n=0;n<3660;n++,date=addDays(date,1)) {
    if (calendar.weekdays.includes(new Date(date+'T12:00:00Z').getUTCDay()) && !calendar.holidays.includes(date))
      return {nominalDate:nominal,date,dueAt:localHour(date,calendar.startHour,calendar.timezone)};
  }
  throw new ApiError(422,'calendar_horizon','No business day within ten years');
}
function localHour(date: string, hour: number, timezone: string) {
  const format = new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const parts = (t:number) => Object.fromEntries(format.formatToParts(t).map(p=>[p.type,p.value]));
  const target = Date.parse(`${date}T${String(hour).padStart(2,'0')}:00:00Z`);
  let guess = target;
  for (let n=0;n<4;n++) { const p=parts(guess); const represented=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`); const next=guess+target-represented; if(next===guess)break; guess=next; }
  // Earliest matching instant resolves folds; a missing local hour advances to the next real minute.
  for(let t=guess-180*60000;t<=guess+180*60000;t+=60000) {
    const p=parts(t), localDate=`${p.year}-${p.month}-${p.day}`;
    if(localDate===date && Number(p.hour)*60+Number(p.minute)>=hour*60) return new Date(t).toISOString();
  }
  throw new ApiError(422,'calendar_time','Scheduled local date has no valid business start');
}

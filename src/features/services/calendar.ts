import { serviceEvent, serviceSnapshot, sameServiceValues } from './history';
import type { Env, Principal } from '../../platform/types';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { currentPrincipal } from '../work/identity';
import { dto, getService, readable, type Kind, type RecordRow, type ServiceRecord } from './store';
import { releaseWindow } from './releases';

const calendarWindowKind: Kind = 'calendar-window';
type Window = { start: string; end: string };
type CalendarData = { title: string; kind: 'freeze' | 'maintenance'; window: Window; services: string[]; active: boolean };
export interface CalendarConflict { changeId: string; otherId: string; kind: 'change' | 'freeze' | 'maintenance' }
export interface CalendarWarning { changeId: string; code: 'calendar_blocked'; message: string }

/** Explicit-offset ISO instants only: reject local time and normalized invalid dates. */
function instant(value: unknown, field: string): string {
  const match = typeof value === 'string'
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value) : null;
  if (!match) throw new ApiError(400, 'date', `${field} requires an ISO instant with an explicit offset`);
  const [, y, m, d, h, min, s, offset] = match;
  const year = +y, month = +m, leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || +d < 1 || +d > days[month - 1]
    || +h > 23 || +min > 59 || +s > 59 || (offset !== 'Z' && (+offset.slice(1, 3) > 23 || +offset.slice(4) > 59)))
    throw new ApiError(400, 'date', `${field} requires a valid ISO instant`);
  const milliseconds = Date.parse(value as string), result = new Date(milliseconds);
  if (!Number.isFinite(milliseconds) || result.getUTCFullYear() < 1 || result.getUTCFullYear() > 9999)
    throw new ApiError(400, 'date', `${field} requires a valid ISO instant`);
  return result.toISOString();
}

function window(value: any): Window {
  const start = instant(value?.start, 'window.start'), end = instant(value?.end, 'window.end');
  if (start >= end) throw new ApiError(400, 'window', 'Window must have positive duration');
  return { start, end };
}
function services(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 1000 || value.some(v => typeof v !== 'string' || !v.trim()))
    throw new ApiError(400, 'services', 'Services must be a list of service IDs; an empty list covers the workspace');
  return [...new Set(value)] as string[];
}
const overlaps = (a: Window, b: Window) => a.start < b.end && b.start < a.end;
const shared = (a: string[], b: string[]) => !a.length || !b.length || a.some(s => b.includes(s));
const inert = (r: ServiceRecord) => ['imported-review', 'privacy-review'].includes(r.data.state);
const conflictingChange = (r: ServiceRecord) => !inert(r) && !['cancelled', 'verified', 'compensated'].includes(r.data.state);
const ownerFence = "EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) role WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND role.value='owner')";

async function currentOwner(db: D1Database, principal: Principal) {
  const p = await currentPrincipal(db, principal);
  if (!p.roles.includes('owner')) throw new ApiError(403, 'owner', 'Current owner required');
  return p;
}

/** Complete-input save. Revision, current owner admission and its event commit together. */
export async function saveCalendarWindow(env: Env, principal: Principal, input: Record<string, any>, key?: string) {
  const p = await currentOwner(env.DB, principal);
  const previous = key ? await getService(env.DB, p, key, calendarWindowKind) : null;
  if (previous && input.revision !== previous.revision) throw new ApiError(409, 'revision_conflict', 'Reload the current revision');
  if (!['freeze', 'maintenance'].includes(input.kind) || typeof input.active !== 'boolean')
    throw new ApiError(400, 'calendar_window', 'Window kind and active flag required');
  const data: CalendarData = { title: requiredString(input.title, 'title'), kind: input.kind,
    window: window(input.window), services: services(input.services), active: input.active };
  for (const service of data.services) await getService(env.DB, p, service, 'service');
  const visibility = input.visibility ?? 'operators', participants = input.participants ?? [];
  if (!['workspace', 'operators', 'restricted'].includes(visibility)) throw new ApiError(400, 'visibility', 'Invalid visibility');
  if (!Array.isArray(participants) || participants.length > 1000 || participants.some(v => typeof v !== 'string' || !v))
    throw new ApiError(400, 'participants', 'Member ID list required');
  for (const user of participants) {
    if (!await env.DB.prepare('SELECT user_id FROM memberships WHERE workspace_id=? AND user_id=? AND active=1')
      .bind(p.workspaceId, user).first()) throw new ApiError(400, 'member', 'Active workspace member required');
  }
  const t = now(), recordId = key || id(), payload = JSON.stringify(data), scope = JSON.stringify([...new Set(participants)]);
  const record={id:recordId,kind:calendarWindowKind,ownerId:previous?.ownerId ?? p.userId,visibility,participants:[...new Set(participants)] as string[],data};
  if (previous && sameServiceValues(serviceSnapshot(previous),serviceSnapshot(record))) return previous;
  const statement = previous
    ? env.DB.prepare(`UPDATE svc_records SET data_json=?,visibility=?,participants_json=?,revision=revision+1,updated_at=?
        WHERE workspace_id=? AND id=? AND kind='calendar-window' AND revision=? AND ${ownerFence}`)
      .bind(payload, visibility, scope, t, p.workspaceId, recordId, previous.revision, p.workspaceId, p.userId)
    : env.DB.prepare(`INSERT INTO svc_records SELECT ?,?,'calendar-window',?,?,?,?,1,?,? WHERE ${ownerFence}`)
      .bind(recordId, p.workspaceId, p.userId, visibility, scope, payload, t, t, p.workspaceId, p.userId);
  const results = await env.DB.batch([statement,
    serviceEvent(env.DB,p,record,previous ? serviceSnapshot(previous) : {},serviceSnapshot(record),previous ? 'calendar-window-amended' : 'created',t)]);
  if (results[0].meta.changes !== 1) {
    await currentOwner(env.DB, p);
    throw new ApiError(409, 'revision_conflict', 'Concurrent calendar update');
  }
  return getService(env.DB, await currentOwner(env.DB, p), recordId, calendarWindowKind);
}

/** Parent callers stamp this from the current request, never from submitted actor IDs.
 * assertCalendarSchedule also checks the recorded actor's current owner membership.
 */
export function emergencySchedulingActor(p: Principal, input: Record<string, any>): string | null {
  return p.roles.includes('owner') && input.emergency === true && typeof input.emergencyReason === 'string'
    && !!input.emergencyReason.trim() ? p.userId : null;
}

/** Full proposed window, rather than dispatch time or the selected calendar range. */
export async function assertCalendarSchedule(db: D1Database, principal: Principal, changeData: Record<string, any>) {
  const proposed = window(changeData.window), affected = services(changeData.services);
  const freezes = await db.prepare(`SELECT data_json FROM svc_records WHERE workspace_id=? AND kind='calendar-window'
    AND json_extract(data_json,'$.kind')='freeze' AND json_extract(data_json,'$.active')=1`)
    .bind(principal.workspaceId).all<{ data_json: string }>();
  const blocked = freezes.results.some(row => {
    const freeze = JSON.parse(row.data_json);
    return overlaps(proposed, window(freeze.window)) && shared(affected, services(freeze.services));
  });
  if (!blocked) return;
  if (changeData.emergency === true && typeof changeData.emergencyReason === 'string' && changeData.emergencyReason.trim()
    && typeof changeData.emergencySchedulingActor === 'string') {
    const owner = await db.prepare(`SELECT 1 AS admitted FROM memberships m,json_each(m.roles_json) role
      WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND role.value='owner'`)
      .bind(principal.workspaceId, changeData.emergencySchedulingActor).first();
    if (owner) return;
  }
  throw new ApiError(409, 'calendar_frozen', 'Scheduling is blocked by calendar policy; current owner emergency authority and a reason are required');
}

/** No capped list: old changes can still overlap a new range or a visible change. */
export async function changeCalendar(env: Env, principal: Principal, from: unknown, to: unknown, timezone: unknown) {
  const p = await currentPrincipal(env.DB, principal), range = window({ start: from, end: to });
  if (typeof timezone !== 'string' || !timezone || /^[+-]/.test(timezone))
    throw new ApiError(400, 'timezone', 'IANA timezone required');
  let zone: string;
  try { zone = new Intl.DateTimeFormat('en-US', { timeZone: timezone }).resolvedOptions().timeZone; }
  catch { throw new ApiError(400, 'timezone', 'IANA timezone required'); }
  const rows = await env.DB.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind IN ('change','calendar-window') ORDER BY created_at,id")
    .bind(p.workspaceId).all<RecordRow>();
  const all = rows.results.map(dto).filter(r => !inert(r) && r.data.window?.start && r.data.window?.end);
  const visible = all.filter(r => readable(p, r) && overlaps(window(r.data.window), range));
  const changes = visible.filter(r => r.kind === 'change'), windows = visible.filter(r => r.kind === calendarWindowKind);
  const conflicts: CalendarConflict[] = [], warnings: CalendarWarning[] = [];
  for (const change of changes.filter(conflictingChange)) {
    let blocked = false;
    const changeWindow = window(change.data.window), affected = services(change.data.services);
    for (const other of all) {
      if (other.id === change.id || (other.kind === 'change' ? !conflictingChange(other) : other.data.active !== true)) continue;
      if (!overlaps(changeWindow, window(other.data.window)) || !shared(affected, services(other.data.services))) continue;
      if (readable(p, other)) conflicts.push({ changeId: change.id, otherId: other.id,
        kind: other.kind === 'change' ? 'change' : other.data.kind });
      else blocked = true;
    }
    if (blocked) warnings.push({ changeId: change.id, code: 'calendar_blocked', message: 'This change has a calendar conflict requiring an authorized operator.' });
  }
  // CHANGE-007: releases share this calendar, spanning their member changes' windows.
  const releaseRows = await env.DB.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind='release' ORDER BY created_at,id")
    .bind(p.workspaceId).all<RecordRow>();
  const releases: ServiceRecord[] = [];
  for (const release of releaseRows.results.map(dto).filter(r => !inert(r) && readable(p, r))) {
    const span = await releaseWindow(env.DB, p.workspaceId, release), { employeeNotices: _notices, ...data } = release.data;
    if (span && overlaps(span, range)) releases.push({ ...release, data: { ...data, window: span } });
  }
  return { from: range.start, to: range.end, timezone: zone, changes, windows, releases, conflicts, warnings };
}

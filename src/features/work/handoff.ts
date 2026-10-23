import { ApiError, id, now, requiredString } from '../../platform/http';
import { appendMessage, getWork, permit, transitionWork, type WorkContext } from './core';
import { businessDue, businessMinuteTest, calendarFromRow } from './calendar';
import { currentWorkPrincipal } from './identity';

const PRESENCE_FRESH_MS = 5 * 60_000;
interface Handoff { id: string; work_id: string; requester_id: string; state: string; agent_id: string | null; expected_at: string | null; created_at: string; expires_at: string; accepted_at: string | null; ended_at: string | null }
const staff = async (ctx: WorkContext) => { await currentWorkPrincipal(ctx); permit(ctx, ['owner', 'operator']); };

/** Owner setting: the business-hours calendar a live handoff needs, how long an agent has to accept, and the reply time promised otherwise. */
export async function configureHandoff(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const w = ctx.principal.workspaceId, accept = Number(input.acceptSeconds), minutes = Number(input.responseMinutes);
  if (!Number.isInteger(accept) || accept < 10 || accept > 900 || !Number.isInteger(minutes) || minutes < 15 || minutes > 1440) throw new ApiError(422, 'handoff_config', 'Accept time is 10 to 900 seconds and expected reply 15 to 1440 business minutes');
  if (!await ctx.env.DB.prepare('SELECT 1 FROM work_calendars WHERE workspace_id=? AND id=?').bind(w, requiredString(input.calendarId, 'calendarId')).first()) throw new ApiError(422, 'calendar_required', 'Select an existing business calendar');
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO work_handoff_config VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET calendar_id=excluded.calendar_id,accept_seconds=excluded.accept_seconds,response_minutes=excluded.response_minutes,actor_id=excluded.actor_id,updated_at=excluded.updated_at')
      .bind(w, input.calendarId, accept, minutes, ctx.principal.userId, now()),
    ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(), w, ctx.principal.userId, 'work.handoff.configured', w, JSON.stringify({ acceptSeconds: accept, responseMinutes: minutes }), now()),
  ]);
  return { acceptSeconds: accept, responseMinutes: minutes };
}
export async function readHandoffConfig(ctx: WorkContext) {
  await staff(ctx);
  return (await ctx.env.DB.prepare('SELECT calendar_id calendarId,accept_seconds acceptSeconds,response_minutes responseMinutes FROM work_handoff_config WHERE workspace_id=?').bind(ctx.principal.workspaceId).first()) ?? null;
}
export async function setPresence(ctx: WorkContext, input: Record<string, unknown>) {
  await staff(ctx);
  await ctx.env.DB.prepare('INSERT INTO work_agent_presence VALUES(?,?,?,?) ON CONFLICT(workspace_id,user_id) DO UPDATE SET available=excluded.available,seen_at=excluded.seen_at')
    .bind(ctx.principal.workspaceId, ctx.principal.userId, input.available === true ? 1 : 0, now()).run();
  return { available: input.available === true };
}
export async function presence(ctx: WorkContext) {
  await staff(ctx);
  const row = await ctx.env.DB.prepare('SELECT available,seen_at FROM work_agent_presence WHERE workspace_id=? AND user_id=?').bind(ctx.principal.workspaceId, ctx.principal.userId).first<{ available: number; seen_at: string }>();
  return { available: Boolean(row?.available) && Date.now() - Date.parse(row!.seen_at) < PRESENCE_FRESH_MS };
}
const availableAgents = async (ctx: WorkContext) => (await ctx.env.DB.prepare(`SELECT p.user_id FROM work_agent_presence p JOIN memberships m ON m.workspace_id=p.workspace_id AND m.user_id=p.user_id AND m.active=1
  WHERE p.workspace_id=? AND p.available=1 AND p.seen_at>? AND (m.roles_json LIKE '%"operator"%' OR m.roles_json LIKE '%"owner"%')`).bind(ctx.principal.workspaceId, new Date(Date.now() - PRESENCE_FRESH_MS).toISOString()).all<{ user_id: string }>()).results;
const expectation = (expected: string, timezone: string) => `We will reply by ${new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date(expected))} (${timezone}).`;

/** Ends an unanswered request: the conversation is already the ticket, so it stays one, carrying its transcript and a stated reply time. */
async function fileTicket(ctx: WorkContext, handoff: Handoff, why: string) {
  const w = ctx.principal.workspaceId, config = await ctx.env.DB.prepare('SELECT c.*,k.* FROM work_handoff_config c JOIN work_calendars k ON k.workspace_id=c.workspace_id AND k.id=c.calendar_id WHERE c.workspace_id=?').bind(w).first<any>();
  if (!config) throw new ApiError(503, 'handoff_unconfigured', 'Live handoff is not configured');
  const calendar = calendarFromRow(config), expected = businessDue(now(), config.response_minutes, calendar);
  const claim = await ctx.env.DB.prepare("UPDATE work_handoffs SET state='ticketed',expected_at=? WHERE workspace_id=? AND id=? AND state='requested'").bind(expected, w, handoff.id).run();
  if (!claim.meta.changes) return;
  const requester: WorkContext = { ...ctx, principal: { workspaceId: w, userId: handoff.requester_id, roles: ['employee'] } };
  await appendMessage(requester, { workId: handoff.work_id, body: `Linen: ${why} This conversation stays open as your request, with everything above. ${expectation(expected, calendar.timezone)}`, visibility: 'public', sourceMessageId: `handoff:${handoff.id}:ticketed` });
}
export async function expireHandoffs(ctx: WorkContext) {
  const due = (await ctx.env.DB.prepare("SELECT * FROM work_handoffs WHERE workspace_id=? AND state='requested' AND expires_at<=?").bind(ctx.principal.workspaceId, now()).all<Handoff>()).results;
  for (const handoff of due) await fileTicket(ctx, handoff, 'No agent accepted in time.');
  return due.length;
}
/** "Ask for a person" in the portal conversation: an available agent during business hours may accept; otherwise the request files as a ticket at once. */
export async function requestHandoff(ctx: WorkContext, workId: string) {
  await currentWorkPrincipal(ctx);
  const w = ctx.principal.workspaceId, db = ctx.env.DB, work = await getWork(ctx, workId);
  if (work.requester_id !== ctx.principal.userId) throw new ApiError(403, 'forbidden', 'Only the person who asked can ask for an agent');
  await expireHandoffs(ctx);
  const open = await db.prepare("SELECT * FROM work_handoffs WHERE workspace_id=? AND work_id=? AND state IN ('requested','live')").bind(w, workId).first<Handoff>();
  if (open) return open;
  const config = await db.prepare('SELECT c.*,k.timezone,k.weekdays_json,k.start_hour,k.end_hour,k.holidays_json,k.location,k.holiday_catalog FROM work_handoff_config c JOIN work_calendars k ON k.workspace_id=c.workspace_id AND k.id=c.calendar_id WHERE c.workspace_id=?').bind(w).first<any>();
  if (!config) throw new ApiError(503, 'handoff_unconfigured', 'Live handoff is not configured');
  const handoffId = id(), at = now(), calendar = calendarFromRow(config);
  const inHours = businessMinuteTest(calendar)(Date.now()), agents = inHours ? await availableAgents(ctx) : [];
  await db.prepare("INSERT INTO work_handoffs VALUES(?,?,?,?,'requested',NULL,NULL,?,?,NULL,NULL)").bind(handoffId, w, workId, ctx.principal.userId, at, new Date(Date.now() + config.accept_seconds * 1000).toISOString()).run();
  await appendMessage(ctx, { workId, body: 'I would like to talk to a person.', visibility: 'public', sourceMessageId: `handoff:${handoffId}:asked` });
  if (!inHours || !agents.length) await fileTicket(ctx, { id: handoffId, work_id: workId, requester_id: ctx.principal.userId } as Handoff, inHours ? 'No agent is available right now.' : 'The service desk is outside its business hours.');
  return db.prepare('SELECT * FROM work_handoffs WHERE workspace_id=? AND id=?').bind(w, handoffId).first<Handoff>();
}
export async function currentHandoff(ctx: WorkContext, workId: string) {
  await currentWorkPrincipal(ctx);
  await getWork(ctx, workId);
  await expireHandoffs(ctx);
  const w = ctx.principal.workspaceId, latest = await ctx.env.DB.prepare('SELECT h.id,h.state,h.agent_id,h.expected_at,h.created_at,h.expires_at,h.accepted_at,u.name agent FROM work_handoffs h LEFT JOIN users u ON u.id=h.agent_id WHERE h.workspace_id=? AND h.work_id=? ORDER BY h.created_at DESC LIMIT 1').bind(w, workId).first();
  const configured = Boolean(await ctx.env.DB.prepare('SELECT 1 FROM work_handoff_config WHERE workspace_id=?').bind(w).first());
  return { handoff: latest ?? null, configured };
}
/** Agents' view: waiting requests and the chats they hold. */
export async function handoffQueue(ctx: WorkContext) {
  await staff(ctx);
  await expireHandoffs(ctx);
  return { items: (await ctx.env.DB.prepare(`SELECT h.id,h.work_id,h.state,h.created_at,h.expires_at,u.name requester,r.title FROM work_handoffs h JOIN users u ON u.id=h.requester_id JOIN work_records r ON r.workspace_id=h.workspace_id AND r.id=h.work_id
    WHERE h.workspace_id=? AND (h.state='requested' OR (h.state='live' AND h.agent_id=?)) ORDER BY h.created_at`).bind(ctx.principal.workspaceId, ctx.principal.userId).all()).results };
}
export async function acceptHandoff(ctx: WorkContext, handoffId: string) {
  await staff(ctx);
  await expireHandoffs(ctx);
  const w = ctx.principal.workspaceId, row = await ctx.env.DB.prepare('SELECT * FROM work_handoffs WHERE workspace_id=? AND id=?').bind(w, handoffId).first<Handoff>();
  if (!row) throw new ApiError(404, 'not_found', 'Handoff not found');
  if (row.state === 'live' && row.agent_id === ctx.principal.userId) return row;
  const claim = await ctx.env.DB.prepare("UPDATE work_handoffs SET state='live',agent_id=?,accepted_at=? WHERE workspace_id=? AND id=? AND state='requested' AND expires_at>?").bind(ctx.principal.userId, now(), w, handoffId, now()).run();
  if (!claim.meta.changes) throw new ApiError(409, 'handoff_closed', 'This request was already taken or has timed out');
  const work = await getWork(ctx, row.work_id);
  await transitionWork(ctx, row.work_id, work.revision, 'assign', 'Accepted a live handoff', ctx.principal.userId);
  const name = (await ctx.env.DB.prepare('SELECT name FROM users WHERE id=?').bind(ctx.principal.userId).first<{ name: string }>())?.name ?? 'An agent';
  await appendMessage(ctx, { workId: row.work_id, body: `${name} joined this conversation.`, visibility: 'public', sourceMessageId: `handoff:${handoffId}:joined` });
  return ctx.env.DB.prepare('SELECT * FROM work_handoffs WHERE workspace_id=? AND id=?').bind(w, handoffId).first<Handoff>();
}
export async function endHandoff(ctx: WorkContext, handoffId: string) {
  await currentWorkPrincipal(ctx);
  const w = ctx.principal.workspaceId, row = await ctx.env.DB.prepare('SELECT * FROM work_handoffs WHERE workspace_id=? AND id=?').bind(w, handoffId).first<Handoff>();
  if (!row || (row.agent_id !== ctx.principal.userId && row.requester_id !== ctx.principal.userId)) throw new ApiError(404, 'not_found', 'Handoff not found');
  await ctx.env.DB.prepare("UPDATE work_handoffs SET state='ended',ended_at=? WHERE workspace_id=? AND id=? AND state='live'").bind(now(), w, handoffId).run();
  return ctx.env.DB.prepare('SELECT * FROM work_handoffs WHERE workspace_id=? AND id=?').bind(w, handoffId).first<Handoff>();
}
export async function processDueHandoffs(ctx: WorkContext) { await currentWorkPrincipal(ctx); permit(ctx, ['owner']); return expireHandoffs(ctx); }

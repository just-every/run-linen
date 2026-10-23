import { ApiError, id, now, requiredString } from '../../platform/http';
import { createWork, permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';
import { memberByContact, normalizePhone } from './contact-points';

export const PHONE_PROVIDERS = ['ringcentral'] as const;
const SAME_CALLER_WINDOW_MS = 24 * 3_600_000;
const link = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  let url: URL;
  try { url = new URL(String(value)); } catch { throw new ApiError(422, 'recording_invalid', 'The recording link must be an absolute https URL'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new ApiError(422, 'recording_invalid', 'The recording link must be an https URL without credentials');
  return url.href;
};
/**
 * One finished call from the phone system. A caller whose number the owner mapped to an active member gets a ticket (or, within a day
 * of an open call ticket, an update to it) carrying a staff-only transcript and the recording link; any other number is held, never guessed.
 */
export async function receiveCall(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'integration']);
  const w = ctx.principal.workspaceId, db = ctx.env.DB, connectionId = requiredString(input.connectionId, 'connectionId'), callId = requiredString(input.callId, 'callId', 200);
  const line = await db.prepare(`SELECT name FROM connections WHERE workspace_id=? AND id=? AND status='active' AND provider IN (${PHONE_PROVIDERS.map(() => '?').join(',')})`).bind(w, connectionId, ...PHONE_PROVIDERS).first<{ name: string }>();
  if (!line) throw new ApiError(503, 'phone_configuration', 'An active phone-system connection is required');
  const prior = await db.prepare('SELECT state,work_id FROM work_calls WHERE workspace_id=? AND connection_id=? AND call_id=?').bind(w, connectionId, callId).first<{ state: string; work_id: string | null }>();
  if (prior) return { state: prior.state, workId: prior.work_id, replayed: true };
  const caller = normalizePhone(requiredString(input.from, 'from', 40)), recording = link(input.recordingUrl);
  const startedAt = Number.isFinite(Date.parse(String(input.startedAt))) ? new Date(String(input.startedAt)).toISOString() : now();
  const seconds = Number.isSafeInteger(input.durationSeconds) && Number(input.durationSeconds) >= 0 ? Number(input.durationSeconds) : 0;
  const transcript = typeof input.transcript === 'string' ? input.transcript.trim().slice(0, 100_000) : '';
  const member = await memberByContact(ctx, 'phone', caller);
  if (!member) {
    await db.prepare("INSERT OR IGNORE INTO work_calls VALUES(?,?,?,?,NULL,NULL,'unmatched',NULL,?)").bind(w, connectionId, callId, caller, now()).run();
    return { state: 'unmatched', workId: null };
  }
  const sender: WorkContext = { ...ctx, principal: { workspaceId: w, userId: member.user_id, roles: JSON.parse(member.roles_json) } };
  const open = await db.prepare(`SELECT c.work_id FROM work_calls c JOIN work_records r ON r.workspace_id=c.workspace_id AND r.id=c.work_id WHERE c.workspace_id=? AND c.user_id=? AND c.state='ticketed'
    AND c.created_at>? AND r.state NOT IN ('closed','cancelled') ORDER BY c.created_at DESC LIMIT 1`).bind(w, member.user_id, new Date(Date.now() - SAME_CALLER_WINDOW_MS).toISOString()).first<{ work_id: string }>();
  const summary = `Phone call to ${line.name} at ${startedAt}, ${seconds} seconds.`;
  const workId = open?.work_id ?? (await createWork(sender, { title: 'Phone call to the IT line', body: summary, deduplicationKey: `call:${connectionId}:${callId}` })).id;
  const note = [`Call ${callId}${recording ? `\nRecording: ${recording}` : ''}`, transcript ? `Transcript:\n${transcript}` : 'No transcript was supplied by the phone system.'].join('\n');
  await db.batch([
    ...(open ? [db.prepare("INSERT OR IGNORE INTO work_messages VALUES(?,?,?,?,'public',?,?,?)").bind(id(), w, workId, member.user_id, `Another call: ${summary}`, `call:${connectionId}:${callId}:update`, now())] : []),
    db.prepare("INSERT OR IGNORE INTO work_messages VALUES(?,?,?,?,'private',?,?,?)").bind(id(), w, workId, member.user_id, note, `call:${connectionId}:${callId}`, now()),
    db.prepare("INSERT OR IGNORE INTO work_calls VALUES(?,?,?,?,?,?,'ticketed',?,?)").bind(w, connectionId, callId, caller, member.user_id, workId, recording, now()),
    db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(), w, member.user_id, 'work.call.received', workId, JSON.stringify({ connectionId, callId, updated: Boolean(open) }), now()),
  ]);
  return { state: 'ticketed', workId, updated: Boolean(open) };
}
export async function heldCalls(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  return { items: (await ctx.env.DB.prepare("SELECT connection_id,call_id,caller,created_at FROM work_calls WHERE workspace_id=? AND state='unmatched' ORDER BY created_at DESC LIMIT 50").bind(ctx.principal.workspaceId).all()).results };
}
export async function dismissCall(ctx: WorkContext, connectionId: string, callId: string) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const result = await ctx.env.DB.prepare("UPDATE work_calls SET state='dismissed',caller=NULL WHERE workspace_id=? AND connection_id=? AND call_id=? AND state='unmatched'").bind(ctx.principal.workspaceId, connectionId, callId).run();
  if (!result.meta.changes) throw new ApiError(404, 'not_found', 'No held call with this id');
  return { state: 'dismissed' };
}

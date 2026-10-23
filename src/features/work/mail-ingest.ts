import { ApiError, id, now } from '../../platform/http';
import { appendMessage, createWork, getWork, type WorkContext } from './core';
import { storeAttachment } from './attachments';
import { collaborationReader } from './collaboration';
import { sha256Hex } from './mail-attachment';
import { automaticReason, type MailMessage } from './mail-envelope';

export const MAIL_PROVIDERS = ['gmail', 'exchange-online'] as const;
const LOOP_WINDOW_MS = 10 * 60_000, LOOP_LIMIT = 10, MAX_ATTACHMENTS = 10, MAX_TEXT = 50000;
const UNKNOWN_SENDER = 'Unknown or deactivated sender; accountable identity review required';
const mailAddress = (value: string) => (/<([^<>]+)>/.exec(value)?.[1] ?? value).trim().toLowerCase();

/** Addresses of every connected support mailbox: mail from one of them is Linen's own traffic, never a requester's. */
async function ownMailboxes(ctx: WorkContext) {
  const rows = (await ctx.env.DB.prepare(`SELECT config_json FROM connections WHERE workspace_id=? AND provider IN (${MAIL_PROVIDERS.map(() => '?').join(',')})`)
    .bind(ctx.principal.workspaceId, ...MAIL_PROVIDERS).all<{ config_json: string }>()).results;
  return new Set(rows.map(r => String(JSON.parse(r.config_json).mailbox ?? '').toLowerCase()).filter(Boolean));
}
/** The ticket an RFC 822 reply belongs to: newest referenced id first, inbound ids and Linen's own deliveries alike. */
async function threadWork(ctx: WorkContext, refs: string[]) {
  const w = ctx.principal.workspaceId;
  for (const ref of refs.slice(0, 25)) {
    const row = await ctx.env.DB.prepare(`SELECT work_id FROM work_intake_events WHERE workspace_id=? AND rfc_message_id=? AND state='accepted' AND work_id IS NOT NULL
      UNION SELECT work_id FROM work_mail_deliveries WHERE workspace_id=? AND mail_message_id=? AND state IN ('accepted','unknown') LIMIT 1`).bind(w, ref, w, ref).first<{ work_id: string }>();
    if (row) return row.work_id;
  }
  return null;
}
async function storeAttachments(ctx: WorkContext, workId: string, attachments: NonNullable<MailMessage['attachments']>) {
  let kept = 0, skipped = 0;
  for (const attachment of attachments) {
    const bytes = attachment.bytes.buffer.slice(attachment.bytes.byteOffset, attachment.bytes.byteOffset + attachment.bytes.byteLength) as ArrayBuffer;
    if (kept >= MAX_ATTACHMENTS || !bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) { skipped++; continue; }
    // A replayed message must not store its files twice.
    const hash = await sha256Hex(bytes);
    if (await ctx.env.DB.prepare('SELECT 1 FROM work_attachments WHERE workspace_id=? AND work_id=? AND sha256=? AND name=?').bind(ctx.principal.workspaceId, workId, hash, attachment.name).first()) { kept++; continue; }
    await storeAttachment(ctx, workId, { name: attachment.name, contentType: attachment.contentType, visibility: 'public', bytes });
    kept++;
  }
  return { kept, skipped };
}
/** CC'd colleagues watch only when they already read the ticket; mail never widens who can read it. */
async function ccWatchers(ctx: WorkContext, connectionId: string, workId: string, sender: { user_id: string }, cc: string[], excluded: Set<string>) {
  const w = ctx.principal.workspaceId, work = await getWork(ctx, workId), added: string[] = [];
  let ignored = 0;
  const open = work.sensitivity === 'normal' && work.department_kind !== 'hr' && JSON.parse(work.protected_departments_json ?? '[]').length === 0;
  for (const address of new Set(cc.map(mailAddress))) {
    if (excluded.has(address)) continue;
    const member = open ? await ctx.env.DB.prepare('SELECT user_id FROM work_sender_identities WHERE workspace_id=? AND connection_id=? AND email=?').bind(w, connectionId, address).first<{ user_id: string }>() : null;
    if (!member) { ignored++; continue; }
    if (member.user_id === sender.user_id) continue;
    try { await collaborationReader(ctx, workId, member.user_id, false); } catch { ignored++; continue; }
    const result = await ctx.env.DB.prepare('INSERT OR IGNORE INTO work_watchers VALUES(?,?,?,?,?)').bind(w, workId, member.user_id, sender.user_id, now()).run();
    if (result.meta.changes) added.push(member.user_id);
  }
  return { added, ignored };
}

export async function recordMailEvent(ctx: WorkContext, input: { connectionId: string; sourceMessageId: string; sender: string | null; subject: string | null; messageId: string | null; state: string; error: string | null; workId?: string | null }) {
  await ctx.env.DB.prepare('INSERT OR IGNORE INTO work_intake_events(id,workspace_id,work_id,connection_id,source_message_id,sender,state,error,created_at,subject,rfc_message_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id(), ctx.principal.workspaceId, input.workId ?? null, input.connectionId, input.sourceMessageId, input.sender, input.state, input.error, now(), input.subject, input.messageId).run();
  return { workId: input.workId ?? null, state: input.state, error: input.error };
}

/**
 * One message from an authenticated receiving adapter or a mailbox poll. Automatic mail is suppressed first, then the sender must
 * be a mapped active member whose From domain passed DMARC; anything else is quarantined without trusting its content.
 */
export async function ingestMail(ctx: WorkContext, input: MailMessage & { workId?: string }) {
  const w = ctx.principal.workspaceId, db = ctx.env.DB;
  const sender = mailAddress(input.sender), subject = (input.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  const prior = await db.prepare('SELECT work_id,state,error FROM work_intake_events WHERE workspace_id=? AND connection_id=? AND source_message_id=?').bind(w, input.connectionId, input.sourceMessageId).first<{ work_id: string | null; state: string; error: string | null }>();
  if (prior) return { workId: prior.work_id, state: prior.state, error: prior.error };
  const record = (state: string, error: string | null, workId: string | null = null) =>
    recordMailEvent(ctx, { connectionId: input.connectionId, sourceMessageId: input.sourceMessageId, sender, subject, messageId: input.messageId ?? null, state, error, workId });
  const own = await ownMailboxes(ctx);
  let reason = automaticReason(sender, subject, input.headers) ?? (own.has(sender) ? 'own-mailbox' : null);
  if (!reason && input.messageId && await db.prepare('SELECT 1 FROM work_mail_deliveries WHERE workspace_id=? AND mail_message_id=?').bind(w, input.messageId).first()) reason = 'own-message';
  if (!reason && (await db.prepare('SELECT count(*) n FROM work_intake_events WHERE workspace_id=? AND connection_id=? AND sender=? AND created_at>?').bind(w, input.connectionId, sender, new Date(Date.now() - LOOP_WINDOW_MS).toISOString()).first<{ n: number }>())!.n >= LOOP_LIMIT) reason = 'loop-rate';
  if (reason) return record('suppressed', reason);
  const identity = await db.prepare('SELECT s.user_id,m.roles_json FROM work_sender_identities s JOIN memberships m ON m.workspace_id=s.workspace_id AND m.user_id=s.user_id AND m.active=1 WHERE s.workspace_id=? AND s.connection_id=? AND s.email=?')
    .bind(w, input.connectionId, sender).first<{ user_id: string; roles_json: string }>();
  if (!identity) return record('quarantined', UNKNOWN_SENDER);
  if (input.authentication?.dmarc !== 'pass' || !input.authentication.aligned) return record('quarantined', 'Sender address is not authenticated: DMARC must pass aligned with the From domain');
  const senderContext: WorkContext = { ...ctx, principal: { workspaceId: w, userId: identity.user_id, roles: JSON.parse(identity.roles_json) } };
  const body = input.text.slice(0, MAX_TEXT), source = `mail:${input.connectionId}:${input.sourceMessageId}`;
  const refs = [input.inReplyTo, ...[...(input.references ?? [])].reverse()].filter((x): x is string => !!x);
  let workId = input.workId ?? await threadWork(ctx, refs);
  try {
    if (workId) await appendMessage(senderContext, { workId, body, visibility: 'public', sourceMessageId: source });
    else workId = (await createWork(senderContext, { title: subject || '(no subject)', body, deduplicationKey: source })).id;
  } catch (error) {
    if (error instanceof ApiError && [403, 404, 409].includes(error.status)) return record('quarantined', 'This sender cannot write to the referenced request');
    throw error;
  }
  const files = await storeAttachments(senderContext, workId, input.attachments ?? []);
  const watchers = await ccWatchers(senderContext, input.connectionId, workId, identity, input.cc ?? [], new Set([sender, ...own]));
  const result = await record('accepted', null, workId);
  await db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(), w, identity.user_id, 'work.mail.received', workId,
    JSON.stringify({ connectionId: input.connectionId, attachments: files.kept, attachmentsSkipped: files.skipped, watchers: watchers.added, ccIgnored: watchers.ignored }), now()).run();
  return result;
}

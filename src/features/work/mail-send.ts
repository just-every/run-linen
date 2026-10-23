import { ApiError, id, now } from '../../platform/http';
import { assertAdoptionEffectAllowed } from '../adoption/authority';
import { MailboxSendError, mailboxAccess, sendRaw } from '../connections/mailbox-provider';
import { getWork, type WorkContext } from './core';
import { brandedHtml } from './brand';
import { MAIL_PROVIDERS } from './mail-ingest';

const word = (value: string) => /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(value)))}?=`;
const wrapped = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/(.{76})/g, '$1\r\n');
const address = /^[^\s@<>"\r\n]+@[^\s@<>"\r\n]+\.[^\s@<>"\r\n]+$/;

/** The reply as RFC 822: threaded by In-Reply-To and References, from the mailbox itself, asking recipients' auto-responders to stay silent. */
export function composeReply(input: { from: string; to: string; subject: string; text: string; html?: string | null; messageId: string; thread: string[] }) {
  if (!address.test(input.from) || !address.test(input.to)) throw new ApiError(422, 'mail_address', 'A single valid address is required');
  const lines = [`From: ${input.from}`, `To: ${input.to}`, `Subject: ${word(input.subject.replace(/[\x00-\x1f\x7f]+/g, ' ').trim())}`, `Date: ${new Date().toUTCString()}`, `Message-ID: ${input.messageId}`,
    ...(input.thread.length ? [`In-Reply-To: ${input.thread.at(-1)}`, `References: ${input.thread.slice(-20).join(' ')}`] : []),
    'MIME-Version: 1.0', 'X-Auto-Response-Suppress: All'];
  if (input.html) {
    const boundary = `linen-${crypto.randomUUID()}`, part = (type: string, value: string) => [`--${boundary}`, `Content-Type: ${type}; charset=utf-8`, 'Content-Transfer-Encoding: base64', '', wrapped(new TextEncoder().encode(value))];
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, '', ...part('text/plain', input.text), ...part('text/html', input.html), `--${boundary}--`);
  } else lines.push('Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', wrapped(new TextEncoder().encode(input.text)));
  return new TextEncoder().encode(lines.join('\r\n'));
}

/**
 * A staff public reply on a ticket that arrived by mailbox goes back to its requester from that mailbox, once. The buyer's
 * domain authentication must have been read back for the connection's current revision; an unconfirmed send is never repeated.
 */
export async function deliverMailReply(ctx: WorkContext, workId: string, messageId: string) {
  const w = ctx.principal.workspaceId, db = ctx.env.DB;
  const existing = await db.prepare('SELECT id,state,error FROM work_mail_deliveries WHERE workspace_id=? AND message_id=?').bind(w, messageId).first<{ id: string; state: string; error: string | null }>();
  if (existing) return existing;
  const message = await db.prepare("SELECT author_id,body FROM work_messages WHERE workspace_id=? AND work_id=? AND id=? AND visibility='public'").bind(w, workId, messageId).first<{ author_id: string; body: string }>();
  const origin = await db.prepare(`SELECT e.connection_id,e.sender,e.subject FROM work_intake_events e JOIN connections c ON c.workspace_id=e.workspace_id AND c.id=e.connection_id
    WHERE e.workspace_id=? AND e.work_id=? AND e.state='accepted' AND c.provider IN (${MAIL_PROVIDERS.map(() => '?').join(',')}) ORDER BY e.created_at,e.rowid LIMIT 1`).bind(w, workId, ...MAIL_PROVIDERS).first<{ connection_id: string; sender: string | null; subject: string | null }>();
  if (!message || !origin?.sender) return null;
  const work = await getWork(ctx, workId);
  const mapped = await db.prepare('SELECT user_id FROM work_sender_identities WHERE workspace_id=? AND connection_id=? AND email=?').bind(w, origin.connection_id, origin.sender).first<{ user_id: string }>();
  if (message.author_id === work.requester_id || mapped?.user_id !== work.requester_id ||
    await db.prepare('SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id=?').bind(w, work.requester_id).first()) return null;
  const row = await db.prepare("SELECT * FROM connections WHERE workspace_id=? AND id=? AND status='active'").bind(w, origin.connection_id).first<any>();
  if (!row) return null;
  const config = JSON.parse(row.config_json), deliveryId = id(), mailMessageId = `<linen-${deliveryId}@${String(config.mailbox).split('@')[1]}>`;
  await db.prepare("INSERT INTO work_mail_deliveries VALUES(?,?,?,?,?,?,?,'prepared',NULL,NULL,?)").bind(deliveryId, w, workId, messageId, row.id, row.revision, mailMessageId, now()).run();
  let claimed = false;
  const settle = async (state: string, error: string | null, providerRef: string | null = null) => {
    await db.prepare('UPDATE work_mail_deliveries SET state=?,error=?,provider_ref=? WHERE workspace_id=? AND id=?').bind(state, error, providerRef, w, deliveryId).run();
    return { id: deliveryId, state, error };
  };
  try {
    const settings = JSON.parse((await db.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id=?').bind(w).first<{ settings_json: string }>())?.settings_json || '{}');
    if (settings.executionHeld) throw new ApiError(409, 'execution_held', 'Mail is held');
    await assertAdoptionEffectAllowed(ctx, { resource: workId, action: 'notification.send' });
    const evidence = await db.prepare("SELECT evidence_json FROM connection_validations WHERE workspace_id=? AND connection_id=? AND connection_revision=? AND state='active'").bind(w, row.id, row.revision).first<{ evidence_json: string }>();
    if (!JSON.parse(evidence?.evidence_json ?? '{}').domainAuthentication?.aligned) throw new ApiError(409, 'domain_alignment_required', 'SPF, DKIM and DMARC must be read back for this mailbox before Linen sends from it');
    const thread = (await db.prepare(`SELECT id FROM (SELECT rfc_message_id id,created_at FROM work_intake_events WHERE workspace_id=? AND work_id=? AND state='accepted' AND rfc_message_id IS NOT NULL
      UNION SELECT mail_message_id,created_at FROM work_mail_deliveries WHERE workspace_id=? AND work_id=? AND state IN ('accepted','unknown') AND id<>?) ORDER BY created_at`).bind(w, workId, w, workId, deliveryId).all<{ id: string }>()).results.map(r => r.id);
    const subject = origin.subject?.trim() || work.title;
    const access = await mailboxAccess(ctx, row);
    const mime = composeReply({ from: access.mailbox, to: origin.sender, subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`, text: message.body, html: await brandedHtml(ctx.env, w, message.body), messageId: mailMessageId, thread });
    const claim = await db.prepare("UPDATE work_mail_deliveries SET state='sending' WHERE workspace_id=? AND id=? AND state='prepared' AND EXISTS(SELECT 1 FROM connections c WHERE c.workspace_id=? AND c.id=? AND c.revision=? AND c.status='active')").bind(w, deliveryId, w, row.id, row.revision).run();
    if (!claim.meta.changes) throw new ApiError(409, 'mail_changed', 'The mailbox connection changed; reload');
    claimed = true;
    return await settle('accepted', null, await sendRaw(access, mime));
  } catch (error) {
    if (error instanceof MailboxSendError) return settle(error.outcome === 'ambiguous' ? 'unknown' : 'failed', `mail_${error.outcome}`);
    return settle(claimed ? 'unknown' : 'failed', error instanceof ApiError ? error.code : 'mail_unavailable');
  }
}

/** What staff see on a mailbox ticket: each received message and each delivery, never bodies. */
export async function ticketMail(ctx: WorkContext, workId: string) {
  const w = ctx.principal.workspaceId, work = await getWork(ctx, workId);
  if (!ctx.principal.roles.some(r => ['owner', 'operator'].includes(r)) || work.requester_id === ctx.principal.userId) throw new ApiError(403, 'forbidden', 'Staff only');
  const db = ctx.env.DB;
  return {
    received: (await db.prepare(`SELECT e.id,e.created_at,e.sender,e.subject,c.name connection,(SELECT count(*) FROM work_attachments a WHERE a.workspace_id=e.workspace_id AND a.work_id=e.work_id) attachments
      FROM work_intake_events e JOIN connections c ON c.workspace_id=e.workspace_id AND c.id=e.connection_id WHERE e.workspace_id=? AND e.work_id=? AND e.state='accepted' AND e.connection_id<>'' ORDER BY e.created_at,e.rowid`).bind(w, workId).all()).results,
    sent: (await db.prepare('SELECT id,state,error,created_at FROM work_mail_deliveries WHERE workspace_id=? AND work_id=? ORDER BY created_at').bind(w, workId).all()).results,
    watchers: (await db.prepare('SELECT w.user_id id,u.name FROM work_watchers w JOIN users u ON u.id=w.user_id WHERE w.workspace_id=? AND w.work_id=?').bind(w, workId).all()).results,
  };
}

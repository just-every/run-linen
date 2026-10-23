import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, id, jsonBody, now, requiredString } from '../../platform/http';
import { permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';
import { receiveMail } from './intake';
import { parseRawMail } from './mail-envelope';
import { MAIL_PROVIDERS, recordMailEvent } from './mail-ingest';
import { pollMailboxes } from './mail-poll';
import { ticketMail } from './mail-send';

/** Owner view of every mailbox connection, its recent mail and the unknown senders waiting for a decision. */
async function mailStatus(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const w = ctx.principal.workspaceId, db = ctx.env.DB;
  const rows = (await db.prepare(`SELECT c.id,c.provider,c.name,c.status,c.revision,c.config_json,p.polled_at,p.state poll_state,p.error poll_error,v.connection_revision,v.evidence_json
    FROM connections c LEFT JOIN work_mailbox_polls p ON p.workspace_id=c.workspace_id AND p.connection_id=c.id LEFT JOIN connection_validations v ON v.workspace_id=c.workspace_id AND v.connection_id=c.id
    WHERE c.workspace_id=? AND c.provider IN (${MAIL_PROVIDERS.map(() => '?').join(',')}) ORDER BY c.name`).bind(w, ...MAIL_PROVIDERS).all<any>()).results;
  return {
    mailboxes: rows.map(r => ({
      id: r.id, provider: r.provider, name: r.name, status: r.status, mailbox: JSON.parse(r.config_json).mailbox, mode: JSON.parse(r.config_json).mode,
      polledAt: r.polled_at, pollState: r.poll_state, pollError: r.poll_error,
      domainAuthentication: r.connection_revision === r.revision ? JSON.parse(r.evidence_json).domainAuthentication ?? null : null,
    })),
    events: (await db.prepare(`SELECT e.id,e.connection_id,e.work_id,e.sender,e.subject,e.state,e.error,e.created_at FROM work_intake_events e JOIN connections c ON c.workspace_id=e.workspace_id AND c.id=e.connection_id
      WHERE e.workspace_id=? AND e.state IN ('accepted','quarantined','suppressed') AND c.provider IN (${MAIL_PROVIDERS.map(() => '?').join(',')}) ORDER BY e.created_at DESC,e.rowid DESC LIMIT 50`).bind(w, ...MAIL_PROVIDERS).all()).results,
    members: (await db.prepare('SELECT m.user_id id,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND m.active=1 ORDER BY u.name').bind(w).all()).results,
  };
}
/** Forwarding rules and adapters hand over the original RFC 822 bytes; Linen parses and authenticates them itself. */
async function receiveRaw(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'integration']);
  const connectionId = requiredString(input.connectionId, 'connectionId'), sourceMessageId = requiredString(input.sourceMessageId, 'sourceMessageId', 300);
  const row = await ctx.env.DB.prepare("SELECT config_json FROM connections WHERE workspace_id=? AND id=? AND status='active' AND provider IN ('gmail','exchange-online')").bind(ctx.principal.workspaceId, connectionId).first<{ config_json: string }>();
  if (!row) throw new ApiError(503, 'mail_configuration', 'An active Gmail or Exchange Online mailbox connection is required');
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(requiredString(input.raw, 'raw', 60_000_000)), c => c.charCodeAt(0)); } catch { throw new ApiError(422, 'mail_invalid', 'raw must be base64 RFC 822 bytes'); }
  let message;
  try { message = parseRawMail(connectionId, sourceMessageId, bytes, JSON.parse(row.config_json).mailbox); }
  catch { return recordMailEvent(ctx, { connectionId, sourceMessageId, sender: null, subject: null, messageId: null, state: 'quarantined', error: 'The message could not be read safely' }); }
  return receiveMail(ctx, { ...message, attachments: message.attachments!.map(a => ({ name: a.name, contentType: a.contentType, contentBase64: btoa(String.fromCharCode(...a.bytes)) })) });
}
async function dismiss(ctx: WorkContext, eventId: string) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const w = ctx.principal.workspaceId;
  const result = await ctx.env.DB.prepare("UPDATE work_intake_events SET state='dismissed',sender=NULL,subject=NULL,rfc_message_id=NULL WHERE workspace_id=? AND id=? AND state IN ('quarantined','suppressed') AND connection_id<>''").bind(w, eventId).run();
  if (!result.meta.changes) throw new ApiError(404, 'not_found', 'No quarantined or suppressed message with this id');
  await ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(), w, ctx.principal.userId, 'work.mail.dismissed', eventId, '{}', now()).run();
  return { state: 'dismissed' };
}
export function registerMailRoutes(app: Hono<AppEnv>) {
  const ctx = (c: any): WorkContext => ({ env: c.env, principal: c.get('principal') });
  app.get('/mail/status', async c => c.json(await mailStatus(ctx(c))));
  app.post('/mail/poll', async c => c.json(await pollMailboxes(ctx(c), (await jsonBody(c)).connectionId as string | undefined)));
  app.post('/mail/messages', async c => c.json(await receiveRaw(ctx(c), await jsonBody(c))));
  app.post('/mail/events/:id/dismiss', async c => c.json(await dismiss(ctx(c), c.req.param('id'))));
  app.get('/work/:id/mail', async c => c.json(await ticketMail(ctx(c), c.req.param('id'))));
}

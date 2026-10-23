import { ApiError, now } from '../../platform/http';
import { fetchRaw, listInbox, mailboxAccess } from '../connections/mailbox-provider';
import { permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';
import { routeMail } from './intake';
import { parseRawMail } from './mail-envelope';
import { MAIL_PROVIDERS, recordMailEvent } from './mail-ingest';

const DAY = 86_400_000;
/** Reads each connected OAuth mailbox since its last good check (three days at first, never more than fourteen), once per provider message. */
async function pollOne(ctx: WorkContext, row: any) {
  const w = ctx.principal.workspaceId, db = ctx.env.DB, config = JSON.parse(row.config_json), started = now();
  if (config.mode !== 'oauth') return { id: row.id, state: 'forwarding' };
  const last = await db.prepare('SELECT polled_at FROM work_mailbox_polls WHERE workspace_id=? AND connection_id=?').bind(w, row.id).first<{ polled_at: string }>();
  const since = new Date(Math.max(Date.now() - 14 * DAY, last ? Date.parse(last.polled_at) - 3_600_000 : Date.now() - 3 * DAY));
  let seen = 0;
  try {
    const access = await mailboxAccess(ctx, row);
    for (const providerId of await listInbox(access, since)) {
      if (await db.prepare('SELECT 1 FROM work_intake_events WHERE workspace_id=? AND connection_id=? AND source_message_id=?').bind(w, row.id, providerId).first()) continue;
      let message;
      try { message = parseRawMail(row.id, providerId, await fetchRaw(access, providerId), config.mailbox); }
      catch (error) {
        if (error instanceof ApiError) throw error;
        await recordMailEvent(ctx, { connectionId: row.id, sourceMessageId: providerId, sender: null, subject: null, messageId: null, state: 'quarantined', error: 'The message could not be read safely' });
        continue;
      }
      await routeMail(ctx, message);
      seen++;
    }
    await db.prepare("INSERT INTO work_mailbox_polls VALUES(?,?,?,?,'ok',NULL,?) ON CONFLICT(workspace_id,connection_id) DO UPDATE SET connection_revision=excluded.connection_revision,polled_at=excluded.polled_at,state='ok',error=NULL,seen=excluded.seen")
      .bind(w, row.id, row.revision, started, seen).run();
    return { id: row.id, state: 'ok', seen };
  } catch (error) {
    const code = error instanceof ApiError ? error.code : 'mailbox_poll_failed';
    await db.prepare("INSERT INTO work_mailbox_polls VALUES(?,?,?,?,'failed',?,0) ON CONFLICT(workspace_id,connection_id) DO UPDATE SET connection_revision=excluded.connection_revision,state='failed',error=excluded.error")
      .bind(w, row.id, row.revision, new Date(since.getTime()).toISOString(), code).run();
    return { id: row.id, state: 'failed', error: code };
  }
}
export async function pollMailboxes(ctx: WorkContext, connectionId?: string) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const rows = (await ctx.env.DB.prepare(`SELECT * FROM connections WHERE workspace_id=? AND status='active' AND provider IN (${MAIL_PROVIDERS.map(() => '?').join(',')})${connectionId ? ' AND id=?' : ''} ORDER BY name`)
    .bind(ctx.principal.workspaceId, ...MAIL_PROVIDERS, ...(connectionId ? [connectionId] : [])).all<any>()).results;
  const items = [];
  for (const row of rows) items.push(await pollOne(ctx, row));
  return { items };
}

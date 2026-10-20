import type { Env, Principal } from '../../platform/types';
import { ApiError } from '../../platform/http';
import { connection } from '../execution/connectors';
import { assertAdoptionEffectAllowed } from '../adoption/authority';
import { sendSendGrid, SendGridSendError } from '../execution/mail/sender';
import { noticeMailGate, noticePublisher } from './employee-notices';

/** Only a generic authenticated link leaves Linen. 202 means provider acceptance, never delivery. */
export async function deliverNoticeMail(env: Env, principal: Principal) {
  const p = await noticePublisher(env, principal), results = [];
  const jobs = await env.DB.prepare("SELECT * FROM svc_outbox WHERE workspace_id=? AND kind='employee-notice' AND state='pending' AND next_at<=? ORDER BY next_at LIMIT 50")
    .bind(p.workspaceId, new Date().toISOString()).all<any>();
  for (const job of jobs.results) {
    let claimed = false;
    try {
      const { actor, notice } = await noticeMailGate(env, p, job);
      const ctx = { env, principal: actor };
      const settings = await env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id=?').bind(p.workspaceId).first<{settings_json:string}>();
      if (JSON.parse(settings?.settings_json || '{}').executionHeld) throw new ApiError(409, 'execution_held', 'Delivery is held');
      await assertAdoptionEffectAllowed(ctx, { resource: job.record_id, action: 'notification.send' });
      const c = await connection(ctx, job.connection_id, 'sendgrid');
      if (!c.config.from || !c.secret.apiKey || !env.APP_ORIGIN) throw new ApiError(503, 'needs_configuration', 'Mail connection and application origin required');
      const origin = new URL(env.APP_ORIGIN);
      if (origin.protocol !== 'https:' || origin.username || origin.password) throw new ApiError(503, 'needs_configuration', 'HTTPS application origin required');
      const user = await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(job.recipient_id).first<{email:string}>();
      if (!user) throw new ApiError(404, 'not_found', 'Recipient unavailable');
      await noticeMailGate(env, p, job);
      const claim = await env.DB.prepare("UPDATE svc_outbox SET state='sending',attempts=attempts+1,error=NULL WHERE workspace_id=? AND id=? AND state='pending'")
        .bind(p.workspaceId, job.id).run();
      if (!claim.meta.changes) continue;
      claimed = true;
      // No retry of an uncertain or interrupted send. The durable sending intent remains visible.
      const sent = await sendSendGrid({ apiKey: c.secret.apiKey, message: { from: c.config.from, to: [user.email],
        subject: 'Linen service notice', text: `A service notice is available. Sign in to Linen to read it: ${origin.origin}/app#/work?notice=${encodeURIComponent(notice.id)}`,
        deliveryId: job.id } });
      await env.DB.prepare("UPDATE svc_outbox SET state='accepted',provider_ref=?,error=NULL WHERE workspace_id=? AND id=? AND state='sending'")
        .bind(sent.providerMessageId, p.workspaceId, job.id).run();
      results.push({ id: job.id, state: 'accepted' });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'mail_unavailable';
      const state = error instanceof SendGridSendError ? (error.outcome === 'ambiguous' ? 'unknown' : 'failed')
        : claimed ? 'unknown' : code === 'needs_configuration' || code === 'execution_held' || code === 'connection_not_active' ? 'pending' : 'access_revoked';
      await env.DB.prepare('UPDATE svc_outbox SET state=?,error=? WHERE workspace_id=? AND id=?')
        .bind(state, error instanceof SendGridSendError ? error.message : code, p.workspaceId, job.id).run();
      results.push({ id: job.id, state, error: code });
    }
  }
  return results;
}

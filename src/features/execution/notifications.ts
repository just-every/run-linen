import { providerFetch } from "./transport";
import type { Env } from "../../platform/types";
import { id, now } from "../../platform/http";
import { decryptSecret } from "../../platform/crypto";
import { assert, membership, privileged } from "./authority";
import { getWork } from "../work/core";
import { assertAdoptionEffectAllowed } from "../adoption/authority";
import { connection } from "./connectors";
import { sendSendGrid, SendGridSendError } from "./mail/sender";
import { verifySendGridWebhook } from "./mail/signature";
import type { CoreContext } from "./types";
export async function enqueueNotification(
  ctx: CoreContext,
  input: {
    workId: string;
    messageId: string;
    recipientId: string;
    connectionId: string;
    idempotencyKey: string;
  },
) {
  await privileged(ctx);
  await getWork(ctx, input.workId);
  await membership(ctx, input.recipientId);
  const message: any = await ctx.env.DB.prepare(
    "SELECT * FROM work_messages WHERE id=? AND workspace_id=? AND work_id=? AND visibility='public'",
  )
    .bind(input.messageId, ctx.principal.workspaceId, input.workId)
    .first();
  assert(message, "public_message_required", 422);
  await getWork(
    {
      ...ctx,
      principal: {
        ...ctx.principal,
        userId: input.recipientId,
        roles: (await membership(ctx, input.recipientId)) as any,
      },
    },
    input.workId,
  );
  assert(
    input.idempotencyKey && input.idempotencyKey.length < 200,
    "idempotency_key_required",
    422,
  );
  const prior: any = await ctx.env.DB.prepare(
    "SELECT * FROM execution_outbox WHERE workspace_id=? AND dedup_key=?",
  )
    .bind(ctx.principal.workspaceId, input.idempotencyKey)
    .first();
  if (prior) {
    assert(
      prior.message_id === input.messageId &&
        prior.recipient_id === input.recipientId &&
        prior.connection_id === input.connectionId,
      "idempotency_conflict",
    );
    return prior;
  }
  const oid = id();
  await ctx.env.DB.prepare(
    "INSERT INTO execution_outbox VALUES(?,?,?,?,?,?,?,'queued',NULL,?,?,?)",
  )
    .bind(
      oid,
      ctx.principal.workspaceId,
      input.workId,
      input.messageId,
      input.recipientId,
      input.connectionId,
      ctx.principal.userId,
      input.idempotencyKey,
      now(),
      now(),
    )
    .run();
  return { id: oid, state: "queued" };
}
export async function processNotifications(ctx: CoreContext) {
  await privileged(ctx);
  const rows = await ctx.env.DB.prepare(
    "SELECT * FROM execution_outbox WHERE workspace_id=? AND state IN ('queued','rate_limited','needs_configuration') AND next_attempt_at<=? ORDER BY created_at LIMIT 50",
  )
    .bind(ctx.principal.workspaceId, now())
    .all<any>();
  const results = [];
  for (const o of rows.results) {
    let claimed = false;
    try {
      const actor = {
        ...ctx,
        principal: {
          ...ctx.principal,
          userId: o.actor_id,
          roles: (await membership(ctx, o.actor_id)) as any,
        },
      };
      await privileged(actor);
      await getWork(actor, o.work_id);
      await getWork(
        {
          ...ctx,
          principal: {
            ...ctx.principal,
            userId: o.recipient_id,
            roles: (await membership(ctx, o.recipient_id)) as any,
          },
        },
        o.work_id,
      );
      const message: any = await ctx.env.DB.prepare(
        "SELECT body FROM work_messages WHERE workspace_id=? AND work_id=? AND id=? AND visibility='public'",
      )
        .bind(o.workspace_id, o.work_id, o.message_id)
        .first();
      assert(message, "message_unavailable", 403);
      const recipient: any = await ctx.env.DB.prepare(
        "SELECT u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND m.user_id=? AND m.active=1",
      )
        .bind(o.workspace_id, o.recipient_id)
        .first();
      assert(recipient, "recipient_unavailable", 403);
      const settings: any = await ctx.env.DB.prepare(
        "SELECT settings_json FROM workspace_settings WHERE workspace_id=?",
      )
        .bind(o.workspace_id)
        .first();
      assert(
        !JSON.parse(settings?.settings_json || "{}").executionHeld,
        "execution_held",
      );
      await assertAdoptionEffectAllowed(ctx, {
        resource: o.work_id,
        action: "notification.send",
      });
      const c = await connection(ctx, o.connection_id, "sendgrid");
      assert(c.config.from && c.secret.apiKey, "needs_configuration", 503);
      const claim = await ctx.env.DB.prepare(
        "UPDATE execution_outbox SET state='sending' WHERE id=? AND workspace_id=? AND state IN ('queued','rate_limited','needs_configuration')",
      )
        .bind(o.id, o.workspace_id)
        .run();
      if (!claim.meta.changes) continue;
      claimed = true;
      const sent = await sendSendGrid({
        apiKey: c.secret.apiKey,
        fetch: ((input: any, init: any) =>
          providerFetch(
            ctx,
            o.connection_id,
            "notification",
            input,
            init,
          )) as typeof fetch,
        message: {
          from: c.config.from,
          to: [recipient.email],
          subject: "Linen service update",
          text: message.body,
          deliveryId: o.id,
        },
      });
      await ctx.env.DB.prepare(
        "UPDATE execution_outbox SET state='accepted',provider_message_id=? WHERE id=? AND state='sending'",
      )
        .bind(sent.providerMessageId, o.id)
        .run();
      results.push({ id: o.id, state: "accepted" });
    } catch (e) {
      const state =
        e instanceof SendGridSendError
          ? e.outcome === "rate_limited"
            ? "rate_limited"
            : e.outcome === "rejected"
              ? "rejected"
              : "unknown"
          : claimed
            ? "unknown"
            : (e as any)?.code === "needs_configuration"
              ? "needs_configuration"
              : "blocked";
      await ctx.env.DB.prepare(
        "UPDATE execution_outbox SET state=?,next_attempt_at=? WHERE id=? AND workspace_id=?",
      )
        .bind(
          state,
          new Date(Date.now() + 60000).toISOString(),
          o.id,
          o.workspace_id,
        )
        .run();
      results.push({ id: o.id, state });
    }
  }
  return results;
}
export async function handleNotificationWebhook(
  env: Env,
  connectionId: string,
  request: Request,
) {
  const row: any = await env.DB.prepare(
    "SELECT * FROM connections WHERE id=? AND provider='sendgrid'",
  )
    .bind(connectionId)
    .first();
  assert(row, "connection_missing", 404);
  const config = JSON.parse(row.config_json);
  const raw = await request.text();
  assert(raw.length <= 1048576, "event_too_large", 413);
  assert(
    await verifySendGridWebhook({
      publicKey: config.webhookPublicKey,
      timestamp:
        request.headers.get("X-Twilio-Email-Event-Webhook-Timestamp") ||
        undefined,
      signature:
        request.headers.get("X-Twilio-Email-Event-Webhook-Signature") ||
        undefined,
      rawBody: raw,
    }),
    "invalid_delivery_signature",
    403,
  );
  const events = JSON.parse(raw);
  assert(Array.isArray(events) && events.length <= 1000, "invalid_events", 422);
  for (const event of events) {
    if (
      !["delivered", "bounce", "dropped", "deferred"].includes(event.event) ||
      !event.sg_event_id ||
      !event.rer_delivery_id
    )
      continue;
    const o: any = await env.DB.prepare(
      "SELECT * FROM execution_outbox WHERE id=? AND workspace_id=? AND connection_id=?",
    )
      .bind(event.rer_delivery_id, row.workspace_id, connectionId)
      .first();
    if (!o) continue;
    const recipient: any = await env.DB.prepare(
      "SELECT email FROM users WHERE id=?",
    )
      .bind(o.recipient_id)
      .first();
    if (recipient?.email !== event.email) continue;
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO execution_delivery_events VALUES(?,?,?,?,?,?)",
      ).bind(id(), o.workspace_id, o.id, event.sg_event_id, event.event, now()),
      env.DB.prepare(
        "UPDATE execution_outbox SET state=? WHERE id=? AND workspace_id=? AND state IN ('sending','accepted','unknown','deferred')",
      ).bind(event.event, o.id, o.workspace_id),
    ]);
  }
  return { received: true };
}

import { currentWorkPrincipal } from "./identity";
import { ApiError, id, now } from "../../platform/http";
import { appendMessage, createWork, permit, type WorkContext } from "./core";
export async function mapMailSender(
  ctx: WorkContext,
  input: { connectionId: string; email: string; userId: string },
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner"]);
  const member = await ctx.env.DB.prepare(
    "SELECT user_id FROM memberships WHERE workspace_id=? AND user_id=? AND active=1",
  )
    .bind(ctx.principal.workspaceId, input.userId)
    .first();
  if (!member)
    throw new ApiError(
      422,
      "member_missing",
      "Sender must map to an active authenticated workspace identity",
    );
  await ctx.env.DB.prepare(
    "INSERT INTO work_sender_identities VALUES(?,?,?,?) ON CONFLICT(workspace_id,connection_id,email) DO UPDATE SET user_id=excluded.user_id",
  )
    .bind(
      ctx.principal.workspaceId,
      input.connectionId,
      input.email.trim().toLowerCase(),
      input.userId,
    )
    .run();
  return { state: "mapped" };
}
export async function receiveMail(
  ctx: WorkContext,
  input: {
    connectionId: string;
    sourceMessageId: string;
    sender: string;
    subject: string;
    text: string;
    workId?: string;
  },
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "integration"]);
  if (!input.sender || !input.sourceMessageId || !input.text)
    throw new ApiError(
      422,
      "mail_invalid",
      "Sender, provider message identity and text required",
    );
  const connection = await ctx.env.DB.prepare(
    "SELECT id FROM connections WHERE workspace_id=? AND id=?",
  )
    .bind(ctx.principal.workspaceId, input.connectionId)
    .first();
  if (!connection)
    throw new ApiError(
      503,
      "mail_configuration",
      "Configured authenticated receiving adapter required",
    );
  const prior = await ctx.env.DB.prepare(
    "SELECT * FROM work_intake_events WHERE workspace_id=? AND connection_id=? AND source_message_id=?",
  )
    .bind(ctx.principal.workspaceId, input.connectionId, input.sourceMessageId)
    .first();
  if (prior) return prior;
  const sender = await ctx.env.DB.prepare(
    "SELECT s.user_id,m.roles_json FROM work_sender_identities s JOIN memberships m ON m.workspace_id=s.workspace_id AND m.user_id=s.user_id AND m.active=1 WHERE s.workspace_id=? AND s.connection_id=? AND s.email=?",
  )
    .bind(
      ctx.principal.workspaceId,
      input.connectionId,
      input.sender.trim().toLowerCase(),
    )
    .first<{ user_id: string; roles_json: string }>();
  let workId: string | null = null,
    state = "quarantined",
    error: string | null =
      "Unknown or deactivated sender; accountable identity review required";
  if (sender) {
    const senderContext = {
      ...ctx,
      principal: {
        workspaceId: ctx.principal.workspaceId,
        userId: sender.user_id,
        roles: JSON.parse(sender.roles_json),
      },
    };
    if (input.workId) {
      await appendMessage(senderContext, {
        workId: input.workId,
        body: input.text,
        visibility: "public",
        sourceMessageId: `mail:${input.connectionId}:${input.sourceMessageId}`,
      });
      workId = input.workId;
    } else
      workId = (
        await createWork(senderContext, {
          title: input.subject,
          body: input.text,
          deduplicationKey: `mail:${input.connectionId}:${input.sourceMessageId}`,
        })
      ).id;
    state = "accepted";
    error = null;
  }
  await ctx.env.DB.prepare(
    "INSERT OR IGNORE INTO work_intake_events(id,workspace_id,work_id,connection_id,source_message_id,sender,state,error,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      id(),
      ctx.principal.workspaceId,
      workId,
      input.connectionId,
      input.sourceMessageId,
      input.sender,
      state,
      error,
      now(),
    )
    .run();
  return { workId, state, error };
}

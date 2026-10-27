import { receiveSideMail } from './side-mail';
import { currentWorkPrincipal } from "./identity";
import { ApiError, id, now, requiredString } from "../../platform/http";
import { permit, type WorkContext } from "./core";
import { ingestMail } from "./mail-ingest";
import type { MailMessage } from "./mail-envelope";
export async function mapMailSender(
  ctx: WorkContext,
  input: { connectionId: string; email: string; userId: string },
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner"]);
  const connectionId = requiredString(input.connectionId, "connectionId");
  const userId = requiredString(input.userId, "userId");
  const email = requiredString(input.email, "email", 320).trim().toLowerCase();
  if (!/^[^\s@<>"\r\n]+@[^\s@<>"\r\n]+\.[^\s@<>"\r\n]+$/.test(email))
    throw new ApiError(422, "mail_address", "A single sender address is required");
  const w = ctx.principal.workspaceId, db = ctx.env.DB;
  if (!await db.prepare("SELECT 1 FROM connections WHERE workspace_id=? AND id=?").bind(w, connectionId).first())
    throw new ApiError(404, "not_found", "Mailbox connection unavailable");
  if (!await db.prepare("SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1").bind(w, userId).first())
    throw new ApiError(422, "member_missing", "Sender must map to an active authenticated workspace identity");
  // Keep the mapping and its audit atomic, without copying the address into audit history.
  const result = await db.batch([
    db.prepare(`INSERT INTO work_sender_identities SELECT ?,?,?,?
      WHERE EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1)
      AND EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1 AND EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value='owner'))
      AND EXISTS(SELECT 1 FROM connections WHERE workspace_id=? AND id=?)
      ON CONFLICT(workspace_id,connection_id,email) DO UPDATE SET user_id=excluded.user_id`)
      .bind(w, connectionId, email, userId, w, userId, w, ctx.principal.userId, w, connectionId),
    db.prepare("INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()>0")
      .bind(id(), w, ctx.principal.userId, "work.mail.sender_mapped", userId, JSON.stringify({ connectionId }), now()),
  ]);
  if (!result[0].meta.changes)
    throw new ApiError(409, "mail_mapping_changed", "Mailbox or membership changed; reload");
  return { state: "mapped" };
}
const decode = (value: unknown) => {
  try { return Uint8Array.from(atob(String(value)), c => c.charCodeAt(0)); }
  catch { throw new ApiError(422, "mail_invalid", "Attachment content must be base64"); }
};
const strings = (value: unknown, max: number) => Array.isArray(value) && value.length <= max && value.every(x => typeof x === "string") ? value as string[] : [];
/** A reply to Linen's own vendor mail is correlated first; it never falls through to ordinary ticket intake. */
async function sideReference(ctx: WorkContext, refs: string[]) {
  for (const ref of refs.slice(0, 25))
    if (await ctx.env.DB.prepare("SELECT 1 FROM work_side_deliveries WHERE workspace_id=? AND mail_message_id=?").bind(ctx.principal.workspaceId, ref).first()) return ref;
  return null;
}
export async function receiveMail(ctx: WorkContext, input: Record<string, any>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "integration"]);
  const references = strings(input.references, 50);
  if (input.sideConversationId) return receiveSideMail(ctx, input);
  if (!input.sender || !input.sourceMessageId || !input.text)
    throw new ApiError(422, "mail_invalid", "Sender, provider message identity and text required");
  const connection = await ctx.env.DB.prepare("SELECT id FROM connections WHERE workspace_id=? AND id=? AND status='active'")
    .bind(ctx.principal.workspaceId, requiredString(input.connectionId, "connectionId")).first();
  if (!connection)
    throw new ApiError(503, "mail_configuration", "Configured authenticated receiving adapter required");
  const attachments = (Array.isArray(input.attachments) ? input.attachments : []).slice(0, 25).map((a: any) => ({
    name: requiredString(a?.name, "attachment name", 255), contentType: String(a?.contentType ?? "application/octet-stream"), bytes: decode(a?.contentBase64),
  }));
  const message: MailMessage & { workId?: string } = {
    connectionId: input.connectionId, sourceMessageId: input.sourceMessageId, sender: String(input.sender), subject: String(input.subject ?? ""), text: String(input.text),
    messageId: typeof input.messageId === "string" ? input.messageId : null, inReplyTo: typeof input.inReplyTo === "string" ? input.inReplyTo : null,
    references, cc: strings(input.cc, 100), attachments,
    headers: Object.fromEntries(Object.entries(input.headers ?? {}).filter(([, v]) => typeof v === "string").map(([k, v]) => [k.toLowerCase(), v as string])),
    authentication: input.authentication && ["pass", "fail", "none"].includes(input.authentication.dmarc) ? { dmarc: input.authentication.dmarc, aligned: input.authentication.aligned === true } : undefined,
    ...(typeof input.workId === "string" ? { workId: input.workId } : {}),
  };
  return routeMail(ctx, message);
}
/** Vendor replies are matched to their side conversation before ordinary ticket intake sees the message. */
export async function routeMail(ctx: WorkContext, message: MailMessage & { workId?: string }) {
  const side = await sideReference(ctx, [message.inReplyTo, ...(message.references ?? [])].filter((x): x is string => !!x));
  if (side) return receiveSideMail(ctx, { connectionId: message.connectionId, sourceMessageId: message.sourceMessageId, sender: message.sender, subject: message.subject, text: message.text, inReplyTo: side });
  return ingestMail(ctx, message);
}

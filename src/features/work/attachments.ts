import { workPrivateReadable, workReplyAllowed } from './scope';
import { departmentWorkBatch } from './department-spaces';
import { currentWorkPrincipal } from "./identity";
import { safeFileName, safeContentType, sha256Hex } from "./mail-attachment";
import { ApiError, id, now } from "../../platform/http";
import { QUOTE_VISIBILITY, readCatalogQuote } from "./catalog-quotes";
import { getWork, operator, type WorkContext } from "./core";
export async function storeAttachment(
  ctx: WorkContext,
  workId: string,
  input: {
    name: string;
    contentType: string;
    visibility: "public" | "private";
    bytes: ArrayBuffer;
  },
) {
  await currentWorkPrincipal(ctx);
  const work = await getWork(ctx, workId);
  if (!workReplyAllowed(ctx.principal,work,input.visibility==='private'))
    throw new ApiError(403, "private", "Private attachments require operator");
  if (input.bytes.byteLength > 20 * 1024 * 1024 || !input.name)
    throw new ApiError(
      422,
      "attachment_size",
      "Named attachment up to 20MiB required",
    );
  const attachmentId = id(),
    key = `${ctx.principal.workspaceId}/${workId}/${attachmentId}`;
  const hash = await sha256Hex(input.bytes);
  await ctx.env.ATTACHMENTS.put(key, input.bytes, {
    httpMetadata: { contentType: "application/octet-stream" },
  });
  try {
    await departmentWorkBatch(ctx,work,[ctx.env.DB.prepare(
      "INSERT INTO work_attachments(id,workspace_id,work_id,visibility,blob_key,name,content_type,size,sha256,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        attachmentId,
        ctx.principal.workspaceId,
        workId,
        input.visibility,
        key,
        safeFileName(input.name),
        safeContentType(input.contentType),
        input.bytes.byteLength,
        hash,
        now(),
      )
      ],input.visibility==='private'?'privateReply':'reply');
  } catch (error) {
    await ctx.env.ATTACHMENTS.delete(key);
    throw error;
  }
  return { id: attachmentId, sha256: hash, size: input.bytes.byteLength };
}
export async function readAttachment(ctx: WorkContext, attachmentId: string) {
  await currentWorkPrincipal(ctx);
  const row = await ctx.env.DB.prepare(
    "SELECT * FROM work_attachments WHERE workspace_id=? AND id=?",
  )
    .bind(ctx.principal.workspaceId, attachmentId)
    .first<{
      work_id: string;
      visibility: string;
      blob_key: string;
      name: string;
    }>();
  if (!row) throw new ApiError(404, "not_found", "Attachment not found");
  // The generic attachment door applies the quote reader rules too.
  if (row.visibility === QUOTE_VISIBILITY) return readCatalogQuote(ctx, attachmentId);
  const work = await getWork(ctx, row.work_id);
  if (
    row.visibility === "private" &&
    !workPrivateReadable(ctx.principal,work)
  )
    throw new ApiError(404, "not_found", "Attachment not found");
  const blob = await ctx.env.ATTACHMENTS.get(row.blob_key);
  if (!blob)
    throw new ApiError(
      503,
      "attachment_unavailable",
      "Attachment bytes unavailable",
    );
  const current=await getWork(ctx,row.work_id);
  if(row.visibility==='private'&&!workPrivateReadable(ctx.principal,current))throw new ApiError(404,'not_found','Attachment not found');
  return { blob, name: row.name };
}

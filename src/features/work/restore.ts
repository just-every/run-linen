import { currentWorkPrincipal } from "./identity";
import { ApiError, now } from "../../platform/http";
import { permit, type WorkContext } from "./core";
const tables = new Set([
  "work_records",
  "work_messages",
  "work_attachments",
  "work_people",
  "work_pending_people",
  "work_pending_services",
  "work_assets",
  "work_asset_contracts",
  "work_asset_repairs",
  "work_custody",
  "work_lifecycle",
  "work_obligations",
  "work_knowledge",
  "work_article_versions",
  "work_catalog",
  "work_fulfilments",
  "work_calendars",
  "work_commitments",
]);
/** Restore content into real product tables; never restore grants, dispatch bindings or execution authority. */
export async function restoreAdoptionRecord(
  ctx: WorkContext,
  input: {
    table: string;
    row: Record<string, unknown>;
    sourceId: string;
    sourceKey: string;
  },
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner"]);
  if (
    !tables.has(input.table) ||
    !input.sourceId ||
    !input.sourceKey ||
    !input.row ||
    typeof input.row !== "object"
  )
    throw new ApiError(
      422,
      "restore_input",
      "Allowlisted work table and stable source identity required",
    );
  const prior = await ctx.env.DB.prepare(
    "SELECT record_id FROM work_restore_records WHERE workspace_id=? AND source_id=? AND source_key=?",
  )
    .bind(ctx.principal.workspaceId, input.sourceId, input.sourceKey)
    .first();
  if (prior) return { id: prior.record_id, state: "already_restored" };
  const columns = (
    await ctx.env.DB.prepare(`PRAGMA table_info(${input.table})`).all<{
      name: string;
    }>()
  ).results.map((c) => c.name);
  const row: Record<string, unknown> = {
    ...input.row,
    workspace_id: ctx.principal.workspaceId,
  };
  for (const key of Object.keys(row))
    if (!columns.includes(key))
      throw new ApiError(
        422,
        "restore_column",
        `Unknown ${input.table} column ${key}`,
      );
  for (const value of Object.values(row))
    if (
      value !== null &&
      !["string", "number", "boolean"].includes(typeof value)
    )
      throw new ApiError(
        422,
        "restore_scalar",
        "Stored SQL fields must be scalar",
      );
  if (
    input.table === "work_records" &&
    !["normal", "hr", "restricted"].includes(String(row.sensitivity))
  )
    throw new ApiError(
      422,
      "restore_scope",
      "Explicit normal or HR scope required",
    );
  if (
    ["work_messages", "work_attachments"].includes(input.table) &&
    !["public", "private"].includes(String(row.visibility))
  )
    throw new ApiError(
      422,
      "restore_scope",
      "Explicit public/private visibility required",
    );
  if (
    input.table === "work_knowledge" &&
    !["employees", "operators", "hr"].includes(String(row.scope))
  )
    throw new ApiError(422, "restore_scope", "Known article scope required");
  if (input.table === "work_obligations" && row.state !== "verified") {
    row.state = "blocked";
    row.last_error = `Restored held obligation; reconcile source operation ${row.operation_id || "none"} before resuming`;
    row.operation_id = null;
  }
  if (
    input.table === "work_attachments" &&
    !String(row.blob_key).startsWith(`${ctx.principal.workspaceId}/`)
  )
    throw new ApiError(
      422,
      "restore_blob_scope",
      "Attachment bytes must first be restored under current workspace R2 prefix",
    );
  if (input.table === "work_people") {
    row.member_id = null;
    row.binding_id = null;
    row.manager_id = null; // Imported identity facts never activate account authority.

    const erased = await ctx.env.DB.prepare(
      "SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id=?",
    )
      .bind(ctx.principal.workspaceId, `${row.source}:${row.source_id}`)
      .first();
    if (erased)
      throw new ApiError(
        409,
        "erased",
        "Restore cannot resurrect erased identity",
      );
  }
  if (input.table === 'work_pending_people') {
    if (!['pending','bound','withdrawn'].includes(String(row.state)))
      throw new ApiError(422,'restore_scope','Known pending-person state required');
    if (!await ctx.env.DB.prepare('SELECT 1 FROM work_people WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,String(row.id)).first())
      throw new ApiError(422,'restore_parent','Restore the pending person domain record first');
    // Retain source state as history. work_people has no restored account link;
    // fresh authentication must prove its email before any current binding.
  }
  if (row.pending_person_id && !await ctx.env.DB.prepare('SELECT 1 FROM work_pending_people WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,String(row.pending_person_id)).first())
    throw new ApiError(422,'restore_parent','Restore the pending-person record before its work');
  if (input.table === 'work_pending_services') {
    if (!['held','released','cancelled'].includes(String(row.state)))
      throw new ApiError(422,'restore_scope','Known pending-service state required');
    if (!await ctx.env.DB.prepare(`SELECT 1 FROM work_records w JOIN work_pending_people p ON p.workspace_id=w.workspace_id AND p.id=w.pending_person_id
      JOIN work_catalog c ON c.workspace_id=w.workspace_id AND c.id=?
      WHERE w.workspace_id=? AND w.id=? AND p.id=?`).bind(String(row.catalog_id),ctx.principal.workspaceId,String(row.work_id),String(row.person_id)).first())
      throw new ApiError(422,'restore_parent','Restore matching work, pending person and catalogue service first');
    // An imported selection is content, not a new instruction. Historical released
    // selections never become queued work, and held selections remain inert.
    if(row.state==='held') {
      row.reason='Restored held service; reconcile source effects and review current fulfilment authority';
      row.released_at=null;
    }
  }
  if (['work_asset_contracts','work_asset_repairs'].includes(input.table)) {
    if (!await ctx.env.DB.prepare('SELECT 1 FROM work_assets WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,String(row.asset_id)).first())
      throw new ApiError(422,'restore_parent','Restore the matching asset first');
    if (input.table==='work_asset_contracts' && !await ctx.env.DB.prepare("SELECT 1 FROM svc_records WHERE workspace_id=? AND id=? AND kind='supplier'").bind(ctx.principal.workspaceId,String(row.vendor_id)).first())
      throw new ApiError(422,'restore_parent','Restore the matching vendor first');
  }
  const subjects = [row.requester_id, row.beneficiary_id, row.author_id, row.person_id, row.pending_person_id,
    ...(input.table==='work_pending_people'?[row.id]:[])].filter(
    (v): v is string => typeof v === "string",
  );
  if (
    subjects.length &&
    (await ctx.env.DB.prepare(
      `SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id IN (${subjects.map(() => "?").join(",")})`,
    )
      .bind(ctx.principal.workspaceId, ...subjects)
      .first())
  )
    throw new ApiError(
      409,
      "erased",
      "Restore cannot resurrect erased subject content",
    );
  if (row.work_id) {
    const parent = await ctx.env.DB.prepare(
      "SELECT id FROM work_records WHERE workspace_id=? AND id=?",
    )
      .bind(ctx.principal.workspaceId, row.work_id as string)
      .first();
    if (!parent)
      throw new ApiError(
        422,
        "restore_parent",
        "Restore parent work in this workspace first",
      );
  }
  const keys = Object.keys(row),
    recordId = String(row.id || row.article_id || (input.table==='work_pending_services'?`${row.work_id}:${row.catalog_id}`:input.sourceKey));
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      `INSERT INTO ${input.table}(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
    ).bind(...keys.map((k) => row[k] as string | number | null)),
    ctx.env.DB.prepare(
      "INSERT INTO work_restore_records VALUES(?,?,?,?,?,?)",
    ).bind(
      ctx.principal.workspaceId,
      input.sourceId,
      input.sourceKey,
      input.table,
      recordId,
      now(),
    ),
  ]);
  return { id: recordId, state: "restored_held", table: input.table };
}

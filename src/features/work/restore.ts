import { dimensions, normalizeAudience, normalizeAttributes } from './catalog-audience';
import { prepareApplicationWorkRestore } from './application-restore';
import { validateRecurrence, type RecurrenceRule } from './recurrence-calendar';
import type { BusinessCalendar } from './calendar';
import { calendarDate } from './depreciation';
import { currentWorkPrincipal } from "./identity";
import { validateCannedBody } from './canned-responses';
import { prepareKnowledgeDraftRestore } from './knowledge-draft-restore';
import { ApiError, now } from "../../platform/http";
import { permit, type WorkContext } from "./core";
const tables = new Set([
  'work_canned_responses',
  'work_knowledge_drafts',
  "work_records",
  "work_time_entries",
  "work_messages",
  "work_attachments",
  "work_people",
  "work_pending_people",
  "work_pending_services",
  "work_assets",
  "work_recurring_plans",
  "work_recurring_occurrences",
  "work_recurring_tasks",
  "work_asset_financials",
  "work_asset_contracts",
  "work_asset_repairs",
  "work_classifications",
  "work_custody",
  "work_lifecycle",
  "work_obligations",
  "work_knowledge",
  "work_article_versions",
  "work_catalog_values",
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
  if (input.table === 'work_canned_responses') {
    validateCannedBody(row.body);
    if (typeof row.title !== 'string' || !row.title.trim() || row.title.length > 200 || !Number.isInteger(row.revision) || Number(row.revision) < 1)
      throw new ApiError(422, 'restore_response', 'Valid response title and revision required');
  }
  if (input.table === 'work_time_entries') {
    if (!['manual','measured'].includes(String(row.source)) || !['employee','agent','approver','owner','vendor','technician'].includes(String(row.effort_role)) ||
        !Number.isInteger(row.active_ms) || Number(row.active_ms)<0 || !Number.isInteger(row.touches) || Number(row.touches)<0)
      throw new ApiError(422,'restore_time','Valid recorded effort required');
    if (row.obligation_id && !await ctx.env.DB.prepare('SELECT 1 FROM work_obligations WHERE workspace_id=? AND work_id=? AND id=?')
      .bind(ctx.principal.workspaceId,String(row.work_id),String(row.obligation_id)).first())
      throw new ApiError(422,'restore_parent','Restore the matching task before its effort');
    // Activity evidence is portable; a source browser's live timer authority is not.
    row.state='completed'; row.last_seen_at=null; row.sequence=Number(row.sequence||0)+1;
  }
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
  if(input.table==='work_catalog_values' && (!dimensions.includes(row.dimension as never) || typeof row.label!=='string' || !row.label.trim() || ![0,1].includes(Number(row.active))))
    throw new ApiError(422,'restore_catalog_value','Known dimension, label and state required');
  if(input.table==='work_catalog')row.audience_json=JSON.stringify(normalizeAudience(JSON.parse(String(row.audience_json??'{}'))));
  if (input.table === "work_people") {
    row.attributes_json=JSON.stringify(normalizeAttributes(JSON.parse(String(row.attributes_json??'{}'))));
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
  if (['work_asset_contracts','work_asset_repairs','work_asset_financials'].includes(input.table)) {
    if (!await ctx.env.DB.prepare('SELECT 1 FROM work_assets WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,String(row.asset_id)).first())
      throw new ApiError(422,'restore_parent','Restore the matching asset first');
    if (input.table==='work_asset_contracts' && !await ctx.env.DB.prepare("SELECT 1 FROM svc_records WHERE workspace_id=? AND id=? AND kind='supplier'").bind(ctx.principal.workspaceId,String(row.vendor_id)).first())
      throw new ApiError(422,'restore_parent','Restore the matching vendor first');
  }
  if (input.table==='work_recurring_plans') {
    let rule:RecurrenceRule,calendar:BusinessCalendar,tasks:unknown;
    try { rule=JSON.parse(String(row.rule_json));calendar=JSON.parse(String(row.calendar_json));tasks=JSON.parse(String(row.tasks_json)); }
    catch { throw new ApiError(422,'restore_recurrence','Valid recurring plan content required'); }
    if (!rule || !calendar || !Array.isArray(tasks)) throw new ApiError(422,'restore_recurrence','Valid recurring plan content required');
    validateRecurrence(rule,calendar);
    // Imported instructions never activate scheduled work under source authority.
    row.enabled=0;
  }
  if (input.table==='work_recurring_occurrences' && !await ctx.env.DB.prepare('SELECT 1 FROM work_recurring_plans WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,String(row.plan_id)).first())
    throw new ApiError(422,'restore_parent','Restore the recurring plan before its occurrence');
  if (input.table==='work_recurring_tasks' && !await ctx.env.DB.prepare('SELECT 1 FROM work_recurring_occurrences WHERE workspace_id=? AND id=? AND work_id=?').bind(ctx.principal.workspaceId,String(row.occurrence_id),String(row.work_id)).first())
    throw new ApiError(422,'restore_parent','Restore the matching occurrence before its tasks');
  if (input.table==='work_asset_financials') {
    calendarDate(row.in_service_date,'In-service date');
    if (!Number.isSafeInteger(row.purchase_cents) || Number(row.purchase_cents)<=0 || Number(row.purchase_cents)>100000000000
      || !Number.isInteger(row.useful_months) || Number(row.useful_months)<2 || Number(row.useful_months)>600
      || !['straight-line','declining-balance'].includes(String(row.method))
      || typeof row.cost_center!=='string' || !row.cost_center.trim() || row.cost_center.length>200)
      throw new ApiError(422,'restore_financial','Valid asset accounting policy required');
  }
  if (input.table==='work_classifications') {
    row.proposal_token=null;
    row.proposal_until=null;
    if(row.state==='proposing')row.state='restored';
  }
  const subjects = [row.requester_id, row.beneficiary_id, row.author_id, row.actor_id, row.person_id, row.pending_person_id,
    ...(input.table.startsWith('work_recurring_')?[row.creator_id,row.owner_id,row.completed_by]:[]),
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
  await prepareApplicationWorkRestore(ctx,input.table,row);
  if (input.table === 'work_knowledge_drafts') await prepareKnowledgeDraftRestore(ctx, row);
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

import { hashToken } from "../../platform/crypto";
import { assert, membership } from "./authority";
import type { CoreContext } from "./types";
const tables = [
  "execution_plans",
  "execution_operations",
  "execution_attempts",
  "execution_receipts",
  "execution_verifications",
  "execution_decisions",
];
// Restore under a held workspace. Imported grants are deliberately not activated.
export async function restoreExecutionRecord(
  ctx: CoreContext,
  input: {
    table: string;
    row: Record<string, unknown>;
    sourceId: string;
    sourceKey: string;
  },
) {
  assert((await membership(ctx)).includes("owner"), "owner_required", 403);
  const setting: any = await ctx.env.DB.prepare(
    "SELECT settings_json FROM workspace_settings WHERE workspace_id=?",
  )
    .bind(ctx.principal.workspaceId)
    .first();
  const hold = await ctx.env.DB.prepare(
    "SELECT 1 FROM adoption_holds WHERE workspace_id=? AND state='held'",
  )
    .bind(ctx.principal.workspaceId)
    .first();
  assert(
    hold || JSON.parse(setting?.settings_json || "{}").executionHeld,
    "restore_hold_required",
  );
  assert(tables.includes(input.table), "execution_restore_history_only", 422);
  const row: Record<string, unknown> = {
    ...input.row,
    workspace_id: ctx.principal.workspaceId,
  };
  const identities = new Set<string>();
  function scan(value: unknown) {
    if (typeof value === "string") {
      identities.add(value);
      if (value.startsWith("{") || value.startsWith("[")) {
        try {
          scan(JSON.parse(value));
        } catch {}
      }
    } else if (Array.isArray(value)) value.forEach(scan);
    else if (value && typeof value === "object")
      Object.values(value).forEach(scan);
  }
  scan(row);
  assert(identities.size < 2000, "restore_record_too_large", 422);
  for (const identity of identities)
    assert(
      !(await ctx.env.DB.prepare(
        "SELECT 1 FROM adoption_tombstones WHERE workspace_id=? AND identity_hash=?",
      )
        .bind(ctx.principal.workspaceId, await hashToken(identity))
        .first()),
      "erased_identity_restore_denied",
      409,
    );
  assert(
    typeof row.id === "string" && row.id.length <= 200,
    "invalid_restore_identity",
    422,
  );
  if (input.table === "execution_plans") {
    const domains: Record<string, string> = {
      work: "work_records",
      change: "svc_records",
      commitment: "intelligence_commitments",
      engineering: "intelligence_engineering_jobs",
    };
    const table = domains[String(row.context_type || "work")];
    assert(table, "restore_context_invalid", 422);
    assert(
      await ctx.env.DB.prepare(
        `SELECT 1 FROM ${table} WHERE workspace_id=? AND id=?`,
      )
        .bind(ctx.principal.workspaceId, row.work_id)
        .first(),
      "restore_context_missing",
      422,
    );
    row.state = "restored_held";
  }
  if (input.table === "execution_verifications") row.state = "historical";
  if (input.table === "execution_operations") {
    row.state = ["failed", "cancelled"].includes(String(row.state))
      ? row.state
      : "unknown";
    row.lease_until = null;
    row.fence = 0;
    row.cancel_requested = 1;
  }
  if (
    input.table === "execution_operations" ||
    input.table === "execution_decisions"
  )
    assert(
      await ctx.env.DB.prepare(
        "SELECT 1 FROM execution_plans WHERE workspace_id=? AND id=?",
      )
        .bind(ctx.principal.workspaceId, row.plan_id)
        .first(),
      "restore_parent_missing",
      422,
    );
  if (
    [
      "execution_attempts",
      "execution_receipts",
      "execution_verifications",
    ].includes(input.table)
  )
    assert(
      await ctx.env.DB.prepare(
        "SELECT 1 FROM execution_operations WHERE workspace_id=? AND id=?",
      )
        .bind(ctx.principal.workspaceId, row.operation_id)
        .first(),
      "restore_parent_missing",
      422,
    );
  const columns = (
    await ctx.env.DB.prepare(`PRAGMA table_info(${input.table})`).all<{
      name: string;
    }>()
  ).results.map((c) => c.name);
  assert(
    Object.keys(row).every((k) => columns.includes(k)),
    "invalid_restore_columns",
    422,
  );
  const existing = await ctx.env.DB.prepare(
    `SELECT workspace_id FROM ${input.table} WHERE id=?`,
  )
    .bind(row.id)
    .first<{
      workspace_id: string;
    }>();
  assert(
    !existing || existing.workspace_id === ctx.principal.workspaceId,
    "restore_identity_collision",
  );
  if (existing) return { state: "retained", id: row.id };
  const keys = Object.keys(row);
  await ctx.env.DB.prepare(
    `INSERT INTO ${input.table} (${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
  )
    .bind(...keys.map((k) => row[k] as any))
    .run();
  return { state: "restored_held", id: row.id };
}

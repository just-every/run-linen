import { ApiError, id, now } from "../../platform/http";
import { assert, authorize, privileged } from "./authority";
import { getOperation, acting } from "./state";
import { runOperation } from "./runner";
import type { CoreContext, Step } from "./types";
export { getOperation } from "./state";
export { runOperation } from "./runner";
export { reconcileOperation, verifyOutcome } from "./verification";
export async function cancelOrTakeover(
  ctx: CoreContext,
  input: {
    operationId: string;
    expectedRevision: number;
    reason: string;
  },
) {
  const o = await getOperation(ctx, input.operationId);
  assert(
    typeof input.reason === "string" && input.reason.trim(),
    "reason_required",
    422,
  );
  const result = await ctx.env.DB.prepare(
    "UPDATE execution_operations SET cancel_requested=1,state=CASE WHEN state IN ('queued','needs_configuration','blocked','retry_wait') THEN 'cancelled' ELSE 'cancel_requested' END,revision=revision+1 WHERE id=? AND workspace_id=? AND revision=?",
  )
    .bind(o.id, o.workspace_id, input.expectedRevision)
    .run();
  assert(result.meta.changes, "operation_changed");
  await ctx.env.DB.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)")
    .bind(
      id(),
      o.workspace_id,
      ctx.principal.userId,
      "execution.cancel_or_takeover",
      o.id,
      JSON.stringify({ reason: input.reason }),
      now(),
    )
    .run();
  const step: Step = JSON.parse(o.step_json);
  if (
    step.compensationGrantId &&
    ["group.add", "license.add"].includes(step.action) &&
    !["queued", "needs_configuration", "blocked", "cancelled"].includes(o.state)
  ) {
    const g: any = await ctx.env.DB.prepare(
      "SELECT version FROM execution_grants WHERE workspace_id=? AND id=? ORDER BY version DESC LIMIT 1",
    )
      .bind(o.workspace_id, step.compensationGrantId)
      .first();
    assert(g, "compensation_grant_missing");
    const compensation: Step = {
      ...step,
      action: step.action.replace(".add", ".remove") as Step["action"],
      grantId: step.compensationGrantId,
      grantVersion: g.version,
      expiresAt: undefined,
      revocationGrantId: undefined,
      expectedPresent: undefined,
      compensationGrantId: undefined,
    };
    await authorize(await acting(ctx, o), compensation, o.plan_id);
    await ctx.env.DB.prepare(
      "UPDATE execution_operations SET step_json=?,due_at=?,revision=revision+1 WHERE workspace_id=? AND parent_id=? AND resource=? AND state='queued'",
    )
      .bind(
        JSON.stringify(compensation),
        now(),
        o.workspace_id,
        o.id,
        o.resource,
      )
      .run();
    await ctx.env.DB.prepare(
      "INSERT OR IGNORE INTO execution_operations(id,workspace_id,plan_id,step_json,state,resource,actor_id,due_at,parent_id,created_at) VALUES(?,?,?,?,'queued',?,?,?,?,?)",
    )
      .bind(
        id(),
        o.workspace_id,
        o.plan_id,
        JSON.stringify(compensation),
        o.resource,
        o.actor_id,
        now(),
        o.id,
        now(),
      )
      .run();
  }
  return getOperation(ctx, o.id);
}
export async function processDueExecution(ctx: CoreContext) {
  await privileged(ctx);
  const rows = await ctx.env.DB.prepare(
    "SELECT id FROM execution_operations WHERE workspace_id=? AND state IN ('queued','needs_configuration','blocked','retry_wait','running','unknown','submitted','cancel_requested') AND (due_at IS NULL OR due_at<=?) ORDER BY CASE WHEN parent_id!='initial' THEN 0 ELSE 1 END,COALESCE(last_checked_at,created_at) LIMIT 100",
  )
    .bind(ctx.principal.workspaceId, now())
    .all<{
      id: string;
    }>();
  const results = [];
  for (const row of rows.results) {
    try {
      const result = await runOperation(ctx, row.id);
      results.push(result);
      await ctx.env.DB.prepare(
        "UPDATE execution_operations SET last_checked_at=? WHERE id=? AND workspace_id=?",
      )
        .bind(now(), row.id, ctx.principal.workspaceId)
        .run();
    } catch (error) {
      const code =
        error instanceof ApiError ? error.code : "execution_unavailable";
      await ctx.env.DB.prepare(
        "UPDATE execution_operations SET state=CASE WHEN state IN ('queued','needs_configuration','blocked','retry_wait') THEN 'blocked' ELSE state END,last_error=?,last_checked_at=? WHERE id=? AND workspace_id=?",
      )
        .bind(code, now(), row.id, ctx.principal.workspaceId)
        .run();
      results.push({ id: row.id, state: "blocked", reason: code });
    }
  }
  return results;
}

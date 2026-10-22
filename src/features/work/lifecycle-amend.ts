import { currentWorkPrincipal } from "./identity";
import { ApiError, id, now } from "../../platform/http";
import { createWork, getWork, permit, type WorkContext } from "./core";
import { effectiveInstant } from "./lifecycle";
import { calendarFor, redateLifecycleTasks } from "./lifecycle-tasks";
export async function amendLifecycle(
  ctx: WorkContext,
  id: string,
  revision: number,
  effectiveAt: string | undefined,
  cancel: boolean,
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "hr"]);
  const row = await ctx.env.DB.prepare(
    "SELECT l.*,json_extract(r.context_json,'$.ownerId') owner_id FROM work_lifecycle l JOIN work_records r ON r.workspace_id=l.workspace_id AND r.id=l.work_id WHERE l.workspace_id=? AND l.id=?",
  )
    .bind(ctx.principal.workspaceId, id)
    .first<{ timezone: string; work_id: string; owner_id: string }>();
  if (!row) throw new ApiError(404, "not_found", "Lifecycle not found");
  await getWork(ctx, row.work_id);
  const due = effectiveAt ? effectiveInstant(effectiveAt, row.timezone) : null;
  if (due && !cancel && await ctx.env.DB.prepare("SELECT 1 FROM work_obligations WHERE workspace_id=? AND lifecycle_id=? AND kind='task.manual' AND state IN ('pending','blocked') AND template_json IS NOT NULL")
    .bind(ctx.principal.workspaceId, id).first()) await calendarFor(ctx, row.timezone, row.owner_id);
  const result = await ctx.env.DB.prepare(
    "UPDATE work_lifecycle SET revision=revision+1,effective_at=COALESCE(?,effective_at),cancelled_at=? WHERE workspace_id=? AND id=? AND revision=?",
  )
    .bind(due, cancel ? now() : null, ctx.principal.workspaceId, id, revision)
    .run();
  if (!result.meta.changes)
    throw new ApiError(409, "revision_conflict", "Lifecycle changed");
  await ctx.env.DB.prepare(
    `UPDATE work_obligations SET revision=revision+1,due_at=CASE WHEN is_expiry=1 THEN due_at ELSE COALESCE(?,due_at) END,state=CASE WHEN operation_id IS NOT NULL THEN 'unknown' WHEN ?=1 AND is_expiry=0 THEN 'cancelled' ELSE 'pending' END,last_error=CASE WHEN operation_id IS NOT NULL THEN 'Source changed; reconcile existing effect before replacement or compensation' ELSE NULL END WHERE workspace_id=? AND lifecycle_id=? AND state<>'verified' AND kind<>'task.manual'`,
  )
    .bind(due, Number(cancel), ctx.principal.workspaceId, id)
    .run();
  await redateLifecycleTasks(ctx, id, { effectiveAt: due, cancel, timezone: row.timezone, ownerId: row.owner_id });
  await ctx.env.DB.prepare(
    "UPDATE work_records SET revision=revision+1,updated_at=? WHERE workspace_id=? AND id=?",
  )
    .bind(now(), ctx.principal.workspaceId, row.work_id)
    .run();
  if (cancel) {
    const applied = (
      await ctx.env.DB.prepare(
        "SELECT * FROM work_obligations WHERE workspace_id=? AND lifecycle_id=? AND (state='verified' OR operation_id IS NOT NULL)",
      )
        .bind(ctx.principal.workspaceId, id)
        .all<{
          kind: string;
          target: string;
          beneficiary_id: string;
          owner_id: string;
        }>()
    ).results;
    for (const original of applied) {
      const kinds =
        original.kind === "identity.create"
          ? ["identity.disable", "sessions.revoke"]
          : original.kind === "access.grant"
            ? ["access.revoke"]
            : original.kind === "device.deliver"
              ? ["device.return"]
              : [];
      // A cancelled hire's sessions are revoked once its disable is verified (one account fence).
      const disableId = crypto.randomUUID();
      for (const kind of kinds)
        await ctx.env.DB.prepare(
          "INSERT OR IGNORE INTO work_obligations(id,workspace_id,work_id,lifecycle_id,kind,target,beneficiary_id,due_at,owner_id,last_error,depends_on) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        )
          .bind(
            kind === "identity.disable" ? disableId : crypto.randomUUID(),
            ctx.principal.workspaceId,
            row.work_id,
            id,
            kind,
            original.target,
            original.beneficiary_id,
            now(),
            original.owner_id,
            "Cancelled hire: reconcile prior effect and satisfy separate compensation authority",
            kind === "sessions.revoke" ? disableId : null,
          )
          .run();
    }
  }
  if (cancel)
    await ctx.env.DB.prepare(
      "UPDATE work_obligations SET due_at=?,state='pending' WHERE workspace_id=? AND lifecycle_id=? AND is_expiry=1 AND operation_id IS NULL",
    )
      .bind(now(), ctx.principal.workspaceId, id)
      .run();
  return { id, revision: revision + 1, cancelled: cancel };
}

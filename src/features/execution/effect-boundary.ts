import { assertAdoptionEffectAllowed } from "../adoption/authority";
import { assert } from "./authority";
import { getOperation, current } from "./state";
import type { CoreContext,Step } from "./types";
/** Recheck after OAuth/credential acquisition, immediately before service bytes leave the Worker. */
export async function checkEffectBoundary(
  ctx: CoreContext,
  operationId: string,
) {
  const operation = await getOperation(ctx, operationId);
  await current(ctx, operation);
  assert(
    operation.state === "running" && !operation.cancel_requested,
    "effect_admission_denied",
    403,
  );
  const fence: any = await ctx.env.DB.prepare(
    "SELECT operation_id,fence FROM execution_fences WHERE workspace_id=? AND resource=?",
  )
    .bind(operation.workspace_id, operation.resource)
    .first();
  assert(
    fence?.operation_id === operation.id && fence.fence === operation.fence,
    "effect_fence_changed",
    409,
  );
  const settings: any = await ctx.env.DB.prepare(
    "SELECT settings_json FROM workspace_settings WHERE workspace_id=?",
  )
    .bind(operation.workspace_id)
    .first();
  assert(
    !JSON.parse(settings?.settings_json || "{}").executionHeld,
    "execution_held",
    409,
  );
  const step:Step=JSON.parse(operation.step_json);
  await assertAdoptionEffectAllowed(ctx, {
    resource: operation.resource,
    action: step.action,sourceId:step.sourceId,sourceRevision:step.sourceRevision,fence:step.sourceFence,
  });
  const admitted = await ctx.env.DB.prepare(
    "UPDATE execution_operations SET last_checked_at=? WHERE id=? AND workspace_id=? AND state='running' AND cancel_requested=0 AND fence=? AND EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1)",
  )
    .bind(
      new Date().toISOString(),
      operation.id,
      operation.workspace_id,
      operation.fence,
      operation.workspace_id,
      operation.actor_id,
    )
    .run();
  assert(admitted.meta.changes === 1, "effect_admission_denied", 403);
}

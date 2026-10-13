import { assertAdoptionEffectAllowed } from "../adoption/authority";
import { ApiError, id, now } from "../../platform/http";
import { assert } from "./authority";
import { applyEffect, observeEffect } from "./connectors";
import { getOperation, acting, current, setState } from "./state";
import { reconcileOperation } from "./verification";
import type { CoreContext, Step } from "./types";
export async function runOperation(ctx: CoreContext, operationId: string) {
  let o = await getOperation(ctx, operationId);
  if (["running", "unknown", "cancel_requested", "submitted"].includes(o.state))
    return reconcileOperation(ctx, { operationId });
  if (
    !["queued", "needs_configuration", "blocked", "retry_wait"].includes(
      o.state,
    ) ||
    o.cancel_requested ||
    (o.due_at && o.due_at > now())
  )
    return o;
  await current(ctx, o);
  if (o.parent_id && o.parent_id !== "initial") {
    const parent = await getOperation(ctx, o.parent_id);
    if (
      [
        "queued",
        "blocked",
        "needs_configuration",
        "retry_wait",
        "cancelled",
        "failed",
      ].includes(parent.state)
    ) {
      await setState(ctx, o, "cancelled");
      return getOperation(ctx, o.id);
    }
    if (["running", "unknown", "cancel_requested"].includes(parent.state)) {
      if (
        parent.state === "running" &&
        parent.lease_until &&
        parent.lease_until > now()
      )
        return o;
      const observed = await observeEffect(
        await acting(ctx, o),
        JSON.parse(parent.step_json),
        parent.id,
      );
      if (!observed.matches) return o;
      await current(ctx, o);
      await setState(ctx, parent, "effect_verified");
    }
  }
  const db = ctx.env.DB,
    lease = new Date(Date.now() + 60000).toISOString();
  const claimResults = await db.batch([
    db
      .prepare(
        "INSERT INTO execution_fences VALUES(?,?,?,1) ON CONFLICT(workspace_id,resource) DO UPDATE SET operation_id=excluded.operation_id,fence=execution_fences.fence+1 WHERE NOT EXISTS(SELECT 1 FROM execution_operations WHERE id=execution_fences.operation_id AND state IN ('running','unknown','cancel_requested'))",
      )
      .bind(o.workspace_id, o.resource, o.id),
    db
      .prepare(
        "UPDATE execution_operations SET state='running',fence=(SELECT fence FROM execution_fences WHERE workspace_id=? AND resource=? AND operation_id=?),lease_until=?,revision=revision+1 WHERE id=? AND revision=? AND state IN ('queued','needs_configuration','blocked','retry_wait') AND cancel_requested=0 AND EXISTS(SELECT 1 FROM execution_fences WHERE workspace_id=? AND resource=? AND operation_id=?)",
      )
      .bind(
        o.workspace_id,
        o.resource,
        o.id,
        lease,
        o.id,
        o.revision,
        o.workspace_id,
        o.resource,
        o.id,
      ),
  ]);
  const claimed = await getOperation(ctx, o.id);
  if (
    claimResults[1].meta.changes !== 1 ||
    claimed.state !== "running" ||
    claimed.revision !== o.revision + 1
  )
    return claimed;
  o = claimed;
  const attempt = id(),
    start = Date.now();
  await db
    .prepare(
      "INSERT INTO execution_attempts(id,workspace_id,operation_id,fence,kind,state,started_at) VALUES(?,?,?,?,'dispatch','intent',?)",
    )
    .bind(attempt, o.workspace_id, o.id, o.fence, now())
    .run();
  let state = "unknown",
    status: number | null = null;
  try {
    await current(ctx, o);
    const step: Step = JSON.parse(o.step_json);
    const before = await observeEffect(await acting(ctx, o), step, o.id);
    assert(
      step.expectedPresent === undefined ||
        before.present === step.expectedPresent,
      "target_precondition_changed",
    );
    if (before.matches) state = "effect_verified";
    else {
      const checkpoint = await getOperation(ctx, o.id);
      assert(
        !checkpoint.cancel_requested && checkpoint.fence === o.fence,
        "cancelled_before_effect",
      );
      await current(ctx, o);
      const settings: any = await db
        .prepare(
          "SELECT settings_json FROM workspace_settings WHERE workspace_id=?",
        )
        .bind(o.workspace_id)
        .first();
      assert(
        !JSON.parse(settings?.settings_json || "{}").executionHeld,
        "execution_held",
      );
      await assertAdoptionEffectAllowed(ctx, {
        resource: o.resource,
        action: step.action,
        sourceId:step.sourceId,sourceRevision:step.sourceRevision,fence:step.sourceFence,
      });
      await db
        .prepare("UPDATE execution_attempts SET state='dispatching' WHERE id=?")
        .bind(attempt)
        .run();
      const result = await applyEffect(await acting(ctx, o), step, o.id);
      status = result.status;
      state = result.accepted
        ? "submitted"
        : result.unknown
          ? "unknown"
          : result.status === 429
            ? "retry_wait"
            : "failed";
      if (state === "retry_wait") {
        const count: any = await db
          .prepare(
            "SELECT COUNT(*) n FROM execution_attempts WHERE workspace_id=? AND operation_id=?",
          )
          .bind(o.workspace_id, o.id)
          .first();
        if (count.n >= 5 && o.parent_id === "initial") state = "failed";
        else
          await db
            .prepare(
              "UPDATE execution_operations SET due_at=? WHERE id=? AND workspace_id=?",
            )
            .bind(
              new Date(
                Date.now() +
                  Math.min(3600000, 60000 * 2 ** Math.min(count.n, 6)),
              ).toISOString(),
              o.id,
              o.workspace_id,
            )
            .run();
      }
    }
    await current(ctx, o);
    const after = await getOperation(ctx, o.id);
    if (after.cancel_requested || after.fence !== o.fence) state = "unknown";
  } catch (e) {
    const a: any = await db
      .prepare("SELECT state FROM execution_attempts WHERE id=?")
      .bind(attempt)
      .first();
    await db
      .prepare(
        "UPDATE execution_operations SET last_error=? WHERE id=? AND workspace_id=?",
      )
      .bind(
        e instanceof ApiError ? e.code : "provider_outcome_unknown",
        o.id,
        o.workspace_id,
      )
      .run();
    state =
      a?.state === "dispatching"
        ? "unknown"
        : e instanceof ApiError && e.code === "needs_configuration"
          ? "needs_configuration"
          : "blocked";
  }
  await db.batch([
    db
      .prepare("INSERT INTO execution_receipts VALUES(?,?,?,?,?,?,?)")
      .bind(id(), o.workspace_id, o.id, attempt, state, status, now()),
    db
      .prepare(
        "UPDATE execution_attempts SET state=?,finished_at=?,elapsed_ms=? WHERE id=?",
      )
      .bind(state, now(), Date.now() - start, attempt),
  ]);
  await setState(ctx, o, state);
  if (["submitted", "effect_verified"].includes(state))
    return reconcileOperation(ctx, { operationId: o.id });
  return getOperation(ctx, o.id);
}

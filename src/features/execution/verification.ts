import { ApiError, id, now } from "../../platform/http";
import { assert, authorize } from "./authority";
import { observeEffect, observeWorkflow } from "./connectors";
import { getOperation, acting, current, setState } from "./state";
import type { CoreContext, Step } from "./types";
export async function reconcileOperation(
  ctx: CoreContext,
  input: {
    operationId: string;
    grantId?: string;
    grantVersion?: number;
  },
) {
  const o = await getOperation(ctx, input.operationId);
  if (o.state === "running" && o.lease_until && o.lease_until > now()) return o;
  const step: Step = JSON.parse(o.step_json);
  const readAuthority = async () =>
    input.grantId
      ? authorize(
          ctx,
          {
            ...step,
            action: "effect.observe",
            grantId: input.grantId,
            grantVersion: input.grantVersion!,
          },
          o.plan_id,
          o.id,
        )
      : current(ctx, o);
  try {
    await readAuthority();
    const observed = await observeEffect(
      input.grantId ? ctx : await acting(ctx, o),
      step,
      o.id,
    );
    await readAuthority();
    await ctx.env.DB.prepare(
      "INSERT INTO execution_verifications VALUES(?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        id(),
        o.workspace_id,
        o.id,
        1,
        1,
        step.target,
        step.beneficiaryId,
        observed.matches ? "effect_verified" : "effect_absent",
        JSON.stringify(observed),
        now(),
      )
      .run();
    await setState(
      ctx,
      o,
      observed.matches
        ? "effect_verified"
        : "terminal" in observed && observed.terminal
          ? o.cancel_requested
            ? "cancelled"
            : "failed"
          : "unknown",
    );
    if (observed.matches && step.expiresAt && step.revocationGrantId) {
      const g: any = await ctx.env.DB.prepare(
        "SELECT version FROM execution_grants WHERE workspace_id=? AND id=? ORDER BY version DESC LIMIT 1",
      )
        .bind(o.workspace_id, step.revocationGrantId)
        .first();
      assert(g, "revocation_grant_missing");
      const revoke: Step = {
        ...step,
        action: step.action.replace(".add", ".remove") as Step["action"],
        grantId: step.revocationGrantId,
        grantVersion: g.version,
        expiresAt: undefined,
        revocationGrantId: undefined,
        expectedPresent: undefined,
      };
      await ctx.env.DB.prepare(
        "INSERT OR IGNORE INTO execution_operations(id,workspace_id,plan_id,step_json,state,resource,actor_id,due_at,parent_id,created_at) VALUES(?,?,?,?,'queued',?,?,?,?,?)",
      )
        .bind(
          id(),
          o.workspace_id,
          o.plan_id,
          JSON.stringify(revoke),
          o.resource,
          o.actor_id,
          step.expiresAt,
          o.id,
          now(),
        )
        .run();
    }
  } catch (e) {
    await setState(
      ctx,
      o,
      e instanceof ApiError && e.code === "needs_configuration"
        ? "needs_configuration"
        : "unknown",
    );
  }
  return getOperation(ctx, o.id);
}
export async function verifyOutcome(
  ctx: CoreContext,
  input: {
    operationId: string;
    verifierVersion: number;
  },
) {
  assert(input.verifierVersion === 1, "verifier_version_unsupported");
  const o = await getOperation(ctx, input.operationId);
  assert(!o.cancel_requested, "cancelled_result_admission");
  await current(ctx, o);
  const step: Step = JSON.parse(o.step_json),
    effect = await observeEffect(await acting(ctx, o), step, o.id);
  assert(effect.matches, "effect_unverified");
  const workflow = await observeWorkflow(await acting(ctx, o), step);
  await current(ctx, o);
  const latest = await getOperation(ctx, o.id);
  const fence: any = await ctx.env.DB.prepare(
    "SELECT * FROM execution_fences WHERE workspace_id=? AND resource=?",
  )
    .bind(o.workspace_id, o.resource)
    .first();
  assert(
    latest.fence === o.fence &&
      !latest.cancel_requested &&
      fence?.operation_id === o.id &&
      fence.fence === o.fence,
    "stale_verification",
  );
  const result = { id: id(), state: "verified", effect, workflow };
  await ctx.env.DB.prepare(
    "INSERT INTO execution_verifications VALUES(?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      result.id,
      o.workspace_id,
      o.id,
      1,
      1,
      step.target,
      step.beneficiaryId,
      "verified",
      JSON.stringify({ effect, workflow }),
      now(),
    )
    .run();
  await setState(ctx, o, "verified");
  return result;
}

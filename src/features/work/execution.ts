import { ensureAmendedRemoval, inspectAmendedRemoval, resumeFulfilmentAmendment } from "./fulfilment-amend-execution";
import { inspectFulfilmentExecution } from "./fulfilment-execution";
import { currentWorkPrincipal } from "./identity";
import { ApiError, id, now } from "../../platform/http";
import { proposePlan, dispatchPlan } from "../execution/plans";
import { cancelOrTakeover, getOperation, verifyOutcome } from "../execution/engine";
import type { Operation, Step } from "../execution/types";
import { getWork, permit, type WorkContext } from "./core";
import type { Obligation, WorkExecutionPort } from "./lifecycle";
export async function bindObligationExecution(
  ctx: WorkContext,
  obligationId: string,
  step: Step,
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator"]);
  const o = await ctx.env.DB.prepare(
    "SELECT * FROM work_obligations WHERE workspace_id=? AND id=?",
  )
    .bind(ctx.principal.workspaceId, obligationId)
    .first<Obligation>();
  if (!o) throw new ApiError(404, "not_found", "Obligation not found");
  await getWork(ctx, o.work_id);
  if (o.operation_id)
    throw new ApiError(
      409,
      "already_dispatched",
      "Reconcile dispatched operation before replacement",
    );
  if (
    o.target !== step.target ||
    o.beneficiary_id !== (step.localBeneficiaryId || step.beneficiaryId) ||
    (o.kind === "access.revoke" && !step.action.endsWith(".remove")) ||
    (o.kind === "access.grant" && !step.action.endsWith(".add")) ||
    ![
      "access.grant",
      "access.revoke",
      "identity.create",
      "identity.disable",
      "sessions.revoke",
    ].includes(o.kind) ||
    (["identity.create", "identity.disable", "sessions.revoke"].includes(
      o.kind,
    ) &&
      o.kind !== step.action)
  )
    throw new ApiError(
      422,
      "binding_mismatch",
      "Execution step must match exact obligation; unsupported identity actions require a connector extension",
    );
  await ctx.env.DB.prepare(
    "INSERT INTO work_execution_bindings VALUES(?,?,?,1) ON CONFLICT(workspace_id,obligation_id) DO UPDATE SET step_json=excluded.step_json,revision=work_execution_bindings.revision+1",
  )
    .bind(ctx.principal.workspaceId, obligationId, JSON.stringify(step))
    .run();
  return {
    obligationId,
    state: "configured",
    authority: "Grant is rechecked by execution at dispatch and every effect",
  };
}
export const executionPort: WorkExecutionPort = {
  async ensureIntent(ctx, o) {
    const amended = await ensureAmendedRemoval(ctx, o.id);
    if (amended) return amended;
    // A persisted link is authoritative even if a caller retained an old obligation row.
    const linked = await ctx.env.DB.prepare(
      "SELECT operation_id FROM work_fulfilment_execution WHERE workspace_id=? AND obligation_id=?",
    ).bind(ctx.principal.workspaceId, o.id).first<{ operation_id: string }>();
    if (linked) {
      await inspectFulfilmentExecution(ctx, linked.operation_id);
      return { operationId: linked.operation_id };
    }
    const binding = await ctx.env.DB.prepare(
      "SELECT step_json FROM work_execution_bindings WHERE workspace_id=? AND obligation_id=?",
    )
      .bind(ctx.principal.workspaceId, o.id)
      .first<{ step_json: string }>();
    if (!binding)
      throw new ApiError(
        503,
        "execution_binding_missing",
        "Owner must configure exact supported action, connection and current grant for this obligation",
      );
    const step: Step = JSON.parse(binding.step_json);
    // The configured grant names the effect actor. A scheduler's elected owner
    // may change when another owner joins; that must never change the actor.
    const actor = await ctx.env.DB.prepare(`SELECT g.principal_id,m.roles_json
      FROM execution_grants g JOIN memberships m ON m.workspace_id=g.workspace_id
      AND m.user_id=g.principal_id AND m.active=1
      WHERE g.workspace_id=? AND g.id=? AND g.version=?`)
      .bind(ctx.principal.workspaceId,step.grantId,step.grantVersion)
      .first<{principal_id:string;roles_json:string}>();
    if(!actor) throw new ApiError(409,"execution_actor_unavailable","Configured grant requires its current active effect actor");
    const effectContext = {...ctx, principal:{...ctx.principal,userId:actor.principal_id,roles:JSON.parse(actor.roles_json)}};
    const work = await getWork(effectContext, o.work_id);
    const plan = await proposePlan(effectContext, {
      workId: work.id,
      revision: work.revision,
      steps: [step],
      idempotencyKey: `obligation:${o.id}:${o.revision}`,
    });
    const operations = await dispatchPlan(effectContext, {
      planId: plan.id,
      expectedRevision: plan.revision,
    });
    if (!operations[0]?.id)
      throw new ApiError(503, "intent_missing", "Execution intent not created");
    return { operationId: String(operations[0].id) };
  },
  async inspect(ctx, operationId) {
    const prepared = await ctx.env.DB.prepare("SELECT * FROM work_fulfilment_amendments WHERE workspace_id=? AND old_operation_id=? AND state='prepared'")
      .bind(ctx.principal.workspaceId,operationId).first();
    if(prepared) await resumeFulfilmentAmendment(ctx,prepared);
    const amended = await inspectAmendedRemoval(ctx, operationId);
    if(amended) return amended;
    const linked = await inspectFulfilmentExecution(ctx, operationId);
    if (linked) return linked;
    let operation = await getOperation(ctx, operationId);
    if(operation.state === "effect_verified" && !operation.cancel_requested) {
      await verifyOutcome(ctx,{operationId,verifierVersion:1});
      operation = await getOperation(ctx, operationId);
    }
    return {
      state:
        operation.state === "verified"
          ? "verified"
          : operation.state === "failed"
            ? "failed"
            : ["unknown", "cancel_requested"].includes(operation.state)
              ? "unknown"
              : "pending",
      reason: operation.state,
    };
  },
};

/** The work ACL authorizes cancellation, never a new effect. Execution owns cancellation
 * and any compensation, under the operation's current authenticated actor/grants. */
export async function cancelWorkExecution(ctx: WorkContext, workId: string, reason: string) {
  await getWork(ctx, workId);
  const operations = await ctx.env.DB.prepare(`SELECT o.* FROM execution_operations o
    JOIN execution_plans p ON p.workspace_id=o.workspace_id AND p.id=o.plan_id
    WHERE o.workspace_id=? AND p.context_type='work' AND p.work_id=? AND o.parent_id='initial'
      AND json_extract(o.step_json,'$.action') IN ('group.add','license.add','identity.create')
      AND o.state NOT IN ('cancelled','failed') AND o.cancel_requested=0`)
    .bind(ctx.principal.workspaceId, workId).all<Operation>();
  const pending: { operationId: string; reason: string }[] = [];
  for (const operation of operations.results) {
    const step: Step = JSON.parse(operation.step_json);
    // Verified access remains historical evidence; its separately granted expiry still runs.
    if (operation.state === "verified" && !step.compensationGrantId) continue;
    try {
      const actor = await ctx.env.DB.prepare("SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1")
        .bind(ctx.principal.workspaceId, operation.actor_id).first<{ roles_json: string }>();
      if (!actor) throw new ApiError(409, "execution_actor_unavailable", "Current execution actor required to cancel; reconcile outstanding effects");
      await cancelOrTakeover({ env: ctx.env, principal: { ...ctx.principal,
        userId: operation.actor_id, roles: JSON.parse(actor.roles_json) } },
        { operationId: operation.id, expectedRevision: operation.revision, reason });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "execution_cancellation_unknown";
      // Persist the partial outcome and keep cancelling other independent initial duties.
      // A cancellation flag never supplies provider evidence or replacement authority.
      await ctx.env.DB.batch([
        ctx.env.DB.prepare(`UPDATE work_obligations SET state='unknown',last_error=?
          WHERE workspace_id=? AND work_id=? AND operation_id=?`)
          .bind(`Cancellation pending reconciliation: ${code}`, ctx.principal.workspaceId, workId, operation.id),
        ctx.env.DB.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)")
          .bind(id(), ctx.principal.workspaceId, ctx.principal.userId, "work.execution_cancel_pending",
            operation.id, JSON.stringify({ workId, reason: code }), now()),
      ]);
      pending.push({ operationId: operation.id, reason: code });
    }
  }
  return pending;
}

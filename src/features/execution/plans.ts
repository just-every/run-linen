import {bindAdoptionStep} from '../adoption/plan-binding';
import { subjectMapping } from "./mappings";
import { id, now } from "../../platform/http";
import { assert, authorize, privileged } from "./authority";
import { origin } from "./origin";
import {
  actions,
  type CoreContext,
  type Plan,
  type PlanInput,
  type Step,
} from "./types";
export async function proposePlan(ctx: CoreContext, input: PlanInput) {
  await privileged(ctx);
  assert(
    input &&
      Array.isArray(input.steps) &&
      input.steps.length > 0 &&
      input.steps.length <= 30 &&
      typeof input.idempotencyKey === "string",
    "invalid_plan",
    422,
  );
  await origin(
    ctx,
    input.contextType || "work",
    input.workId,
    input.revision,
    input.contextSnapshot || {},
  );
  for (const s of input.steps) {
    if (s.localBeneficiaryId) {
      const mapping = await subjectMapping(ctx, s);
      assert(
        (s.mappingId === undefined || s.mappingId === mapping.id) &&
          (s.mappingRevision === undefined ||
            s.mappingRevision === mapping.revision),
        "provider_subject_mapping_changed",
        403,
      );
      s.mappingId = mapping.id;
      s.mappingRevision = mapping.revision;
    }
    assert(
      actions.includes(s.action) &&
        s.action !== "effect.observe" &&
        s.actionVersion === 1 &&
        [s.target, s.beneficiaryId, s.connectionId, s.grantId].every(
          (x) => typeof x === "string" && x.length > 0 && x.length < 500,
        ) &&
        Number.isInteger(s.grantVersion),
      "invalid_step",
      422,
    );
    assert(
      !s.cohort ||
        (Array.isArray(s.cohort) &&
          s.cohort.length > 0 &&
          s.cohort.length <= 1000 &&
          new Set(s.cohort).size === s.cohort.length &&
          s.cohort.every((v) => typeof v === "string" && v.length > 0) &&
          (s.action.startsWith("deployment.") ||
            s.cohort.includes(s.beneficiaryId))),
      "invalid_verification_cohort",
      422,
    );
    assert(
      !s.expiresAt ||
        (s.action.endsWith(".add") &&
          Number.isFinite(Date.parse(s.expiresAt)) &&
          new Date(s.expiresAt).toISOString() === s.expiresAt &&
          Date.parse(s.expiresAt) > Date.now() &&
          s.revocationGrantId),
      "revocation_authority_required",
      422,
    );
    if (s.expiresAt && s.expectedPresent === undefined)
      s.expectedPresent = false;
    const connection: any = await ctx.env.DB.prepare(
      "SELECT revision FROM connections WHERE id=? AND workspace_id=?",
    )
      .bind(s.connectionId, ctx.principal.workspaceId)
      .first();
    assert(connection, "connection_missing", 422);
    assert(
      s.connectionRevision === undefined ||
        s.connectionRevision === connection.revision,
      "connection_changed",
    );
    s.connectionRevision = connection.revision;
    await bindAdoptionStep(ctx,s);
    if (s.verifierConnectionId) {
      const verifier: any = await ctx.env.DB.prepare(
        "SELECT revision FROM connections WHERE id=? AND workspace_id=?",
      )
        .bind(s.verifierConnectionId, ctx.principal.workspaceId)
        .first();
      assert(verifier, "verifier_connection_missing", 422);
      assert(
        s.verifierConnectionRevision === undefined ||
          s.verifierConnectionRevision === verifier.revision,
        "verifier_connection_changed",
      );
      s.verifierConnectionRevision = verifier.revision;
    }
  }
  const old = await ctx.env.DB.prepare(
    "SELECT * FROM execution_plans WHERE workspace_id=? AND idempotency_key=?",
  )
    .bind(ctx.principal.workspaceId, input.idempotencyKey)
    .first<Plan>();
  if (old) {
    assert(
      old.work_id === input.workId &&
        old.work_revision === input.revision &&
        old.steps_json === JSON.stringify(input.steps),
      "idempotency_conflict",
    );
    return old;
  }
  const pid = id();
  await ctx.env.DB.prepare(
    "INSERT INTO execution_plans(id,workspace_id,work_id,work_revision,actor_id,steps_json,idempotency_key,created_at,context_type,context_snapshot_json) VALUES(?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      pid,
      ctx.principal.workspaceId,
      input.workId,
      input.revision,
      ctx.principal.userId,
      JSON.stringify(input.steps),
      input.idempotencyKey,
      now(),
      input.contextType || "work",
      JSON.stringify(input.contextSnapshot || {}),
    )
    .run();
  return (await ctx.env.DB.prepare("SELECT * FROM execution_plans WHERE id=?")
    .bind(pid)
    .first<Plan>())!;
}
export async function dispatchPlan(
  ctx: CoreContext,
  input: {
    planId: string;
    expectedRevision: number;
  },
) {
  await privileged(ctx);
  const db = ctx.env.DB,
    w = ctx.principal.workspaceId;
  const p = await db
    .prepare("SELECT * FROM execution_plans WHERE id=? AND workspace_id=?")
    .bind(input.planId, w)
    .first<Plan>();
  assert(p && p.revision === input.expectedRevision, "plan_changed");
  assert(p.actor_id === ctx.principal.userId, "plan_actor_denied", 403);
  await origin(
    ctx,
    p.context_type,
    p.work_id,
    p.work_revision,
    JSON.parse(p.context_snapshot_json),
  );
  if (p.state === "dispatched")
    return (
      await db
        .prepare(
          "SELECT * FROM execution_operations WHERE plan_id=? AND workspace_id=?",
        )
        .bind(p.id, w)
        .all()
    ).results;
  assert(p.state === "proposed", "plan_unavailable");
  const steps: Step[] = JSON.parse(p.steps_json);
  for (const step of steps) {
    await authorize(ctx, step, p.id);
    if (step.expiresAt) {
      const g: any = await db
        .prepare(
          "SELECT version FROM execution_grants WHERE workspace_id=? AND id=? ORDER BY version DESC LIMIT 1",
        )
        .bind(w, step.revocationGrantId)
        .first();
      assert(g, "revocation_grant_missing");
      await authorize(
        ctx,
        {
          ...step,
          action: step.action.replace(".add", ".remove") as Step["action"],
          grantId: step.revocationGrantId!,
          grantVersion: g.version,
        },
        p.id,
        undefined,
        step.expiresAt,
      );
    }
  }
  const statements = [
    db
      .prepare(
        "UPDATE execution_plans SET state='dispatched',revision=revision+1 WHERE id=? AND workspace_id=? AND revision=? AND state='proposed'",
      )
      .bind(p.id, w, p.revision),
  ];
  for (const step of steps) {
    const op = id();
    statements.push(
      db
        .prepare(
          "INSERT INTO execution_operations(id,workspace_id,plan_id,step_json,state,resource,actor_id,parent_id,created_at) SELECT ?,?,?,?,'queued',?,?,?,? WHERE EXISTS(SELECT 1 FROM execution_plans WHERE id=? AND state='dispatched' AND revision=?)",
        )
        .bind(
          op,
          w,
          p.id,
          JSON.stringify(step),
          `${step.connectionId}:${step.target}:${step.beneficiaryId}`,
          ctx.principal.userId,
          "initial",
          now(),
          p.id,
          p.revision + 1,
        ),
    );
    if (step.expiresAt) {
      const g: any = await db
        .prepare(
          "SELECT version FROM execution_grants WHERE workspace_id=? AND id=? ORDER BY version DESC LIMIT 1",
        )
        .bind(w, step.revocationGrantId)
        .first();
      const remove = {
        ...step,
        action: step.action.replace(".add", ".remove"),
        grantId: step.revocationGrantId,
        grantVersion: g.version,
        expiresAt: undefined,
        revocationGrantId: undefined,
        expectedPresent: undefined,
      };
      statements.push(
        db
          .prepare(
            "INSERT INTO execution_operations(id,workspace_id,plan_id,step_json,state,resource,actor_id,due_at,parent_id,created_at) VALUES(?,?,?,?,'queued',?,?,?,?,?)",
          )
          .bind(
            id(),
            w,
            p.id,
            JSON.stringify(remove),
            `${step.connectionId}:${step.target}:${step.beneficiaryId}`,
            ctx.principal.userId,
            step.expiresAt,
            op,
            now(),
          ),
      );
    }
  }
  await db.batch(statements);
  return (
    await db
      .prepare(
        "SELECT * FROM execution_operations WHERE plan_id=? AND workspace_id=?",
      )
      .bind(p.id, w)
      .all()
  ).results;
}

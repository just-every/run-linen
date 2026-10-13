import { getWork } from "../work/core";
import { assert, membership } from "./authority";
import { proposePlan, dispatchPlan } from "./plans";
import type { CoreContext, PlanInput } from "./types";
/** Caller requests their permitted work; execution identity comes only from persisted grants. */
export async function dispatchGrantedPlan(ctx: CoreContext, input: PlanInput) {
  await membership(ctx);
  assert(
    !input.contextType || input.contextType === "work",
    "employee_execution_context_denied",
    403,
  );
  const work = await getWork(ctx, input.workId);
  assert(work.revision === input.revision, "work_changed");
  assert(
    Array.isArray(input.steps) &&
      input.steps.length > 0 &&
      input.steps.length <= 30,
    "invalid_plan",
    422,
  );
  const principals = new Set<string>();
  for (const step of input.steps) {
    assert(
      step.localBeneficiaryId === work.beneficiary_id,
      "work_beneficiary_mismatch",
      403,
    );
    const grant = await ctx.env.DB.prepare(
      "SELECT principal_id FROM execution_grants WHERE workspace_id=? AND id=? AND version=?",
    )
      .bind(ctx.principal.workspaceId, step.grantId, step.grantVersion)
      .first<{ principal_id: string }>();
    assert(grant, "standing_grant_missing", 403);
    principals.add(grant.principal_id);
  }
  assert(principals.size === 1, "mixed_execution_principals", 403);
  const actorId = [...principals][0];
  const roles = await membership(ctx, actorId);
  assert(roles.includes("integration"), "automation_principal_required", 403);
  const executionContext: CoreContext = {
    env: ctx.env,
    principal: {
      workspaceId: ctx.principal.workspaceId,
      userId: actorId,
      roles: roles as CoreContext["principal"]["roles"],
    },
  };
  const plan = await proposePlan(executionContext, {
    ...input,
    contextType: "work",
    idempotencyKey: `work:${work.id}:${input.idempotencyKey}`,
  });
  const operations = await dispatchPlan(executionContext, {
    planId: plan.id,
    expectedRevision: plan.revision,
  });
  return { planId: plan.id, operations };
}

export async function createAutomationPrincipal(
  ctx: CoreContext,
  input: { name: string; idempotencyKey: string },
) {
  assert((await membership(ctx)).includes("owner"), "owner_required", 403);
  assert(
    typeof input.name === "string" &&
      input.name.trim().length > 0 &&
      input.name.length <= 120 &&
      typeof input.idempotencyKey === "string" &&
      input.idempotencyKey.length > 0 &&
      input.idempotencyKey.length <= 200,
    "automation_identity_input",
    422,
  );
  const prior = await ctx.env.DB.prepare(
    "SELECT user_id,name,revoked_at FROM execution_automation_principals WHERE workspace_id=? AND idempotency_key=?",
  )
    .bind(ctx.principal.workspaceId, input.idempotencyKey)
    .first<{ user_id: string; name: string; revoked_at: string | null }>();
  if (prior) {
    assert(
      prior.name === input.name && !prior.revoked_at,
      "automation_identity_conflict",
    );
    return {
      id: prior.user_id,
      name: prior.name,
      kind: "automation",
      interactiveLogin: false,
      roles: ["integration"],
    };
  }
  const identity = crypto.randomUUID(),
    time = new Date().toISOString();
  // A machine identity has no password or routable email. The sentinel cannot pass password verification.
  await ctx.env.DB.batch([
    ctx.env.DB.prepare("INSERT INTO users VALUES(?,?,?,?,?)").bind(
      identity,
      `urn:linen:automation:${identity}`,
      input.name,
      "!non-interactive-automation",
      time,
    ),
    ctx.env.DB.prepare("INSERT INTO memberships VALUES(?,?,?,1)").bind(
      ctx.principal.workspaceId,
      identity,
      JSON.stringify(["integration"]),
    ),
    ctx.env.DB.prepare(
      "INSERT INTO execution_automation_principals VALUES(?,?,?,?,?,NULL)",
    ).bind(
      ctx.principal.workspaceId,
      identity,
      input.name,
      input.idempotencyKey,
      time,
    ),
    ctx.env.DB.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)").bind(
      crypto.randomUUID(),
      ctx.principal.workspaceId,
      ctx.principal.userId,
      "automation.created",
      identity,
      "{}",
      time,
    ),
  ]);
  return {
    id: identity,
    name: input.name,
    kind: "automation",
    interactiveLogin: false,
    roles: ["integration"],
  };
}
export async function revokeAutomationPrincipal(
  ctx: CoreContext,
  identity: string,
) {
  assert((await membership(ctx)).includes("owner"), "owner_required", 403);
  const machine = await ctx.env.DB.prepare(
    "SELECT 1 FROM execution_automation_principals WHERE workspace_id=? AND user_id=?",
  )
    .bind(ctx.principal.workspaceId, identity)
    .first();
  assert(machine, "automation_identity_missing", 404);
  const time = new Date().toISOString();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      "UPDATE execution_automation_principals SET revoked_at=? WHERE workspace_id=? AND user_id=?",
    ).bind(time, ctx.principal.workspaceId, identity),
    ctx.env.DB.prepare(
      "UPDATE memberships SET active=0 WHERE workspace_id=? AND user_id=?",
    ).bind(ctx.principal.workspaceId, identity),
    ctx.env.DB.prepare(
      "INSERT OR IGNORE INTO execution_grant_revocations SELECT workspace_id,id,version,?,? FROM execution_grants WHERE workspace_id=? AND principal_id=?",
    ).bind(ctx.principal.userId, time, ctx.principal.workspaceId, identity),
    ctx.env.DB.prepare(
      "UPDATE execution_operations SET cancel_requested=1,state=CASE WHEN state IN ('queued','blocked','needs_configuration','retry_wait') THEN 'cancelled' ELSE 'unknown' END,revision=revision+1 WHERE workspace_id=? AND actor_id=? AND state NOT IN ('verified','failed','cancelled')",
    ).bind(ctx.principal.workspaceId, identity),
    ctx.env.DB.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)").bind(
      crypto.randomUUID(),
      ctx.principal.workspaceId,
      ctx.principal.userId,
      "automation.revoked",
      identity,
      "{}",
      time,
    ),
  ]);
  return { revoked: true, remoteStopped: false };
}

export async function listAutomationPrincipals(ctx: CoreContext) {
  assert((await membership(ctx)).includes("owner"), "owner_required", 403);
  const rows = (await ctx.env.DB.prepare(`SELECT a.user_id id,a.name,a.revoked_at,
    m.active,m.roles_json FROM execution_automation_principals a
    JOIN memberships m ON m.workspace_id=a.workspace_id AND m.user_id=a.user_id
    WHERE a.workspace_id=? ORDER BY a.name`).bind(ctx.principal.workspaceId).all<any>()).results;
  return rows.map(r => ({ id: r.id, name: r.name, kind: "automation", interactiveLogin: false,
    active: r.active === 1 && !r.revoked_at && JSON.parse(r.roles_json).includes("integration") }));
}

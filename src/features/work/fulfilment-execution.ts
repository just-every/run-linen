import { assertWorkFulfilmentAuthority } from "./fulfilment-authority";
import { ApiError, id, now } from "../../platform/http";
import { getWork, type WorkContext } from "./core";
import { authorize } from "../execution/authority";
import { subjectMapping } from "../execution/mappings";
import type { Operation, Plan, Step } from "../execution/types";

export interface FulfilmentExecutionInput {
  workId: string;
  planId: string;
  operationIds: string[];
}
type Row = Record<string, any>;
function check(value: unknown, message: string): asserts value {
  if (!value) throw new ApiError(409, "fulfilment_execution_conflict", message);
}

/** Associate execution-owned evidence; callers never supply a state or provider result. */
export async function recordFulfilmentExecution(ctx: WorkContext, input: FulfilmentExecutionInput) {
  const work = await getWork(ctx, input.workId);
  check(Array.isArray(input.operationIds) && input.operationIds.length > 0 &&
    input.operationIds.length <= 60 && input.operationIds.every(v => typeof v === "string") &&
    new Set(input.operationIds).size === input.operationIds.length, "Exact operation identities required");
  const db = ctx.env.DB, workspace = ctx.principal.workspaceId;
  // Snapshot fences run inside the association transaction, including membership and
  // work ACL inputs. No execution-domain table is written by this service.
  const snapshots: { table: string; row: Row }[] = [];
  async function one(table: string, where: string, values: (string | number)[]) {
    const row = await db.prepare(`SELECT * FROM ${table} WHERE workspace_id=? AND ${where}`)
      .bind(workspace, ...values).first<Row>();
    check(row, `Missing ${table} evidence`);
    snapshots.push({ table, row });
    return row;
  }
  const { department_name: _departmentName, department_kind: _departmentKind, ...storedWork } = work;
  snapshots.push({ table: "work_records", row: storedWork });
  await one("memberships", "user_id=? AND active=1", [ctx.principal.userId]);
  const plan = await one("execution_plans", "id=?", [input.planId]) as Plan;
  check(plan.context_type === "work" && plan.work_id === work.id &&
    plan.work_revision === work.revision && plan.state === "dispatched" &&
    !["cancelled", "closed"].includes(work.state), "Plan must describe the current active work revision");
  const operations = (await db.prepare("SELECT * FROM execution_operations WHERE workspace_id=? AND plan_id=?")
    .bind(workspace, plan.id).all<Operation>()).results;
  check(operations.length === input.operationIds.length && operations.every(o => input.operationIds.includes(o.id)),
    "Supply exactly all operations of this plan");
  const steps: Step[] = JSON.parse(plan.steps_json);
  const initial = operations.filter(o => o.parent_id === "initial");
  check(initial.length === steps.length && initial.length > 0, "Initial operation set differs from plan");
  const actor = await one("memberships", "user_id=? AND active=1", [plan.actor_id]);
  check(JSON.parse(actor.roles_json).includes("integration"), "Standing execution requires its real integration principal");
  const links: { obligation: Row; operation: Operation; step: Step; fulfilment: Row; catalog: Row; phase: "initial" | "expiry" }[] = [];
  for (const operation of initial) {
    const step: Step = JSON.parse(operation.step_json);
    await assertWorkFulfilmentAuthority(ctx,step,plan.id);
    check(steps.filter(s => JSON.stringify(s) === operation.step_json).length === 1,
      "Operation must be an exact unique plan step");
    check(step.localBeneficiaryId === work.beneficiary_id &&
      ["group.add", "license.add"].includes(step.action), "Initial operation beneficiary/action mismatch");
    const matches = (await db.prepare(`SELECT f.* FROM work_fulfilments f JOIN work_catalog c
      ON c.workspace_id=f.workspace_id AND c.id=f.catalog_id
      WHERE f.workspace_id=? AND f.work_id=? AND f.beneficiary_id=? AND c.target=? AND c.kind=?`)
      .bind(workspace, work.id, work.beneficiary_id, step.target, step.action === "group.add" ? "access" : "software")
      .all<Row>()).results;
    check(matches.length === 1, "A unique existing catalogue fulfilment is required");
    const fulfilment = matches[0];
    snapshots.push({ table: "work_fulfilments", row: fulfilment });
    const catalog = await one("work_catalog", "id=?", [fulfilment.catalog_id]);
    check((fulfilment.expires_at || undefined) === step.expiresAt, "Fulfilment expiry differs from plan");
    await add(operation, step, fulfilment, catalog, "initial");
    const children = operations.filter(o => o.parent_id === operation.id);
    check(children.length === (step.expiresAt ? 1 : 0), "Exact independent expiry operation required");
    if (step.expiresAt) {
      const removal = children[0], removeStep: Step = JSON.parse(removal.step_json);
      const expected = { ...step, action: step.action.replace(".add", ".remove"),
        grantId: step.revocationGrantId, grantVersion: removeStep.grantVersion,
        expiresAt: undefined, revocationGrantId: undefined, expectedPresent: undefined };
      check(step.revocationGrantId && step.revocationGrantId !== step.grantId &&
        removal.due_at === step.expiresAt && JSON.stringify(expected) === removal.step_json,
        "Removal must retain the separately granted exact expiry scope");
      await add(removal, removeStep, fulfilment, catalog, "expiry");
    }
  }
  check(links.length === operations.length && new Set(links.map(l => l.obligation.id)).size === links.length,
    "Every operation must bind one distinct obligation");

  async function add(operation: Operation, step: Step, fulfilment: Row, catalog: Row, phase: "initial" | "expiry") {
    check(operation.actor_id === plan.actor_id && operation.resource === `${step.connectionId}:${step.target}:${step.beneficiaryId}`,
      "Operation actor/resource mismatch");
    snapshots.push({ table: "execution_operations", row: operation });
    const grant = await one("execution_grants", "id=? AND version=?", [step.grantId, step.grantVersion]);
    check(grant.principal_id === operation.actor_id && grant.action === step.action && grant.action_version === step.actionVersion &&
      grant.target === step.target && grant.beneficiary_id === step.beneficiaryId &&
      grant.local_beneficiary_id === step.localBeneficiaryId && grant.connection_id === step.connectionId &&
      grant.connection_revision === step.connectionRevision && grant.mapping_id === step.mappingId &&
      grant.mapping_revision === step.mappingRevision, "Execution grant scope differs from operation");
    // Historical dispatch decisions alone do not establish current authority.
    await authorize({ env: ctx.env, principal: { ...ctx.principal, userId: plan.actor_id,
      roles: JSON.parse(actor.roles_json) } }, step, plan.id, operation.id,
      phase === "expiry" && operation.due_at && operation.due_at > now() ? operation.due_at : now());
    const decision = await db.prepare(`SELECT * FROM execution_decisions WHERE workspace_id=? AND plan_id=?
      AND actor_id=? AND grant_id=? AND grant_version=? AND allowed=1 LIMIT 1`)
      .bind(workspace, plan.id, plan.actor_id, step.grantId, step.grantVersion).first<Row>();
    check(decision, "Persisted execution authorization evidence required");
    snapshots.push({ table: "execution_decisions", row: decision });
    const mapping = await subjectMapping(ctx, step);
    check(mapping.id === step.mappingId && mapping.revision === step.mappingRevision,
      "Reviewed provider mapping changed");
    snapshots.push({ table: "execution_subject_mappings", row: mapping });
    const connection = await one("connections", "id=?", [step.connectionId]);
    check(connection.revision === step.connectionRevision, "Connection changed");
    const obligation = await one("work_obligations", "work_id=? AND kind=? AND target=?", [work.id,
      phase === "initial" ? "access.grant" : "access.revoke", step.target]);
    check(obligation.beneficiary_id === work.beneficiary_id && !obligation.lifecycle_id &&
      (phase !== "expiry" || obligation.due_at === fulfilment.expires_at) &&
      (!obligation.operation_id || obligation.operation_id === operation.id), "Obligation is amended or already differently bound");
    const prior = await db.prepare("SELECT * FROM work_fulfilment_execution WHERE workspace_id=? AND obligation_id=?")
      .bind(workspace, obligation.id).first<Row>();
    if (prior) check(prior.plan_id === plan.id && prior.operation_id === operation.id && prior.work_revision === work.revision &&
      prior.context_json === work.context_json && prior.fulfilment_id === fulfilment.id &&
      prior.fulfilment_revision === fulfilment.revision && prior.catalog_revision === catalog.revision && prior.phase === phase,
      "Different or amended fulfilment binding");
    else check(!obligation.operation_id && ["pending", "blocked"].includes(obligation.state), "Only unbound pending obligations can be associated");
    const binding = await db.prepare("SELECT * FROM work_execution_bindings WHERE workspace_id=? AND obligation_id=?")
      .bind(workspace, obligation.id).first<Row>();
    check(!binding || binding.step_json === operation.step_json, "Existing required execution scope differs");
    if (binding) snapshots.push({ table: "work_execution_bindings", row: binding });
    if (prior) snapshots.push({ table: "work_fulfilment_execution", row: prior });
    links.push({ obligation, operation, step, fulfilment, catalog, phase });
  }

  const guard = id();
  const statements = snapshots.map(({ table, row }, i) => {
    const entries = Object.entries(row);
    return db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM ${table}
      WHERE ${entries.map(([k]) => `${k} IS ?`).join(" AND ")}) THEN 1 ELSE 0 END)`)
      .bind(`${guard}:${i}`, ...entries.map(([, v]) => v));
  });
  for (const { obligation, operation, fulfilment, catalog, phase } of links) {
    // Conflicting concurrent writers fail the CHECK and roll back the whole batch.
    statements.push(db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN
      NOT EXISTS(SELECT 1 FROM work_fulfilment_execution WHERE workspace_id=? AND obligation_id=? AND
        (plan_id<>? OR operation_id<>? OR work_revision<>? OR context_json<>?)) AND
      NOT EXISTS(SELECT 1 FROM work_execution_bindings WHERE workspace_id=? AND obligation_id=? AND step_json<>?)
      THEN 1 ELSE 0 END)`).bind(`${guard}:binding:${obligation.id}`, workspace, obligation.id,
      plan.id, operation.id, work.revision, work.context_json, workspace, obligation.id, operation.step_json));
    const authorizedStep: Step = JSON.parse(operation.step_json);
    statements.push(db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN
      NOT EXISTS(SELECT 1 FROM execution_grant_revocations WHERE workspace_id=? AND grant_id=? AND version=?) AND
      NOT EXISTS(SELECT 1 FROM execution_grants WHERE workspace_id=? AND id=? AND version>?)
      THEN 1 ELSE 0 END)`).bind(`${guard}:grant:${obligation.id}`, workspace, authorizedStep.grantId,
        authorizedStep.grantVersion, workspace, authorizedStep.grantId, authorizedStep.grantVersion));
    statements.push(db.prepare(`INSERT INTO work_fulfilment_execution VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,obligation_id) DO NOTHING`)
      .bind(workspace, obligation.id, work.id, work.revision, work.context_json, fulfilment.id, fulfilment.revision,
        catalog.revision, plan.id, operation.id, phase, now()));
    statements.push(db.prepare("INSERT OR IGNORE INTO work_execution_bindings VALUES(?,?,?,1)")
      .bind(workspace, obligation.id, operation.step_json));
    statements.push(db.prepare(`UPDATE work_obligations SET operation_id=?,is_expiry=?,
      state=CASE WHEN operation_id IS NULL THEN 'pending' ELSE state END,
      last_error=CASE WHEN operation_id IS NULL THEN NULL ELSE last_error END
      WHERE workspace_id=? AND id=?`).bind(operation.id, Number(phase === "expiry"), workspace, obligation.id));
  }
  statements.push(db.prepare("DELETE FROM work_fulfilment_link_guards WHERE id LIKE ?").bind(`${guard}:%`));
  try { await db.batch(statements); }
  catch (error) {
    if (String(error).includes("constraint") || String(error).includes("CHECK"))
      throw new ApiError(409, "fulfilment_execution_conflict", "Work or execution evidence changed during association");
    throw error;
  }
  return { workId: work.id, planId: plan.id, bindings: links.map(l => ({ obligationId: l.obligation.id,
    operationId: l.operation.id, phase: l.phase })), state: "linked" as const };
}

/** Read-only execution observation: no invented verified state, no redispatch. */
export async function inspectFulfilmentExecution(ctx: WorkContext, operationId: string) {
  const workspace = ctx.principal.workspaceId;
  const binding = await ctx.env.DB.prepare("SELECT * FROM work_fulfilment_execution WHERE workspace_id=? AND operation_id=?")
    .bind(workspace, operationId).first<Row>();
  if (!binding) return null;
  const work = await getWork(ctx, binding.work_id);
  const operation = await ctx.env.DB.prepare("SELECT * FROM execution_operations WHERE workspace_id=? AND id=? AND plan_id=?")
    .bind(workspace, operationId, binding.plan_id).first<Operation>();
  check(operation, "Bound execution operation missing; reconcile before replacement");
  // Cancellation does not revoke the independent security-removal duty. It may
  // still admit its own verified evidence, but never the original grant's outcome.
  // A chain of accepted expiry-only corrections preserves historical initial evidence.
  let historicalRevision = binding.work_revision, historicalFulfilment = binding.fulfilment_revision;
  if (binding.phase === "initial") {
    const amendments = (await ctx.env.DB.prepare("SELECT prior_json,result_json FROM work_fulfilment_amendments WHERE workspace_id=? AND fulfilment_id=? AND state='amended' ORDER BY CAST(json_extract(prior_json,'$.work.revision') AS INTEGER)")
      .bind(workspace,binding.fulfilment_id).all<{prior_json:string;result_json:string}>()).results;
    for(const amendment of amendments) {
      const prior=JSON.parse(amendment.prior_json),result=JSON.parse(amendment.result_json);
      if(prior.work.revision===historicalRevision && prior.fulfilment.revision===historicalFulfilment) {
        historicalRevision=result.workRevision; historicalFulfilment=result.fulfilmentRevision;
      }
    }
  }
  const cancellationExpiry = binding.phase === "expiry" && work.state === "cancelled" &&
    work.context_json === binding.context_json &&
    JSON.parse(operation.step_json).localBeneficiaryId === work.beneficiary_id;
  if ((!cancellationExpiry && work.revision !== historicalRevision) || work.context_json !== binding.context_json ||
    operation.cancel_requested || operation.state === "cancelled")
    return { state: "unknown" as const, reason: "Source changed or cancellation requested; reconcile existing effect and separately authorize compensation" };
  const plan = await ctx.env.DB.prepare("SELECT * FROM execution_plans WHERE workspace_id=? AND id=?")
    .bind(workspace, binding.plan_id).first<Plan>();
  const required = await ctx.env.DB.prepare("SELECT step_json FROM work_execution_bindings WHERE workspace_id=? AND obligation_id=?")
    .bind(workspace, binding.obligation_id).first<{ step_json: string }>();
  const fulfilment = await ctx.env.DB.prepare(`SELECT f.revision,c.revision catalog_revision FROM work_fulfilments f
    JOIN work_catalog c ON c.workspace_id=f.workspace_id AND c.id=f.catalog_id WHERE f.workspace_id=? AND f.id=?`)
    .bind(workspace, binding.fulfilment_id).first<{ revision: number; catalog_revision: number }>();
  if (!plan || plan.context_type !== "work" || plan.work_id !== work.id || plan.work_revision !== binding.work_revision ||
    plan.state !== "dispatched" || required?.step_json !== operation.step_json ||
    fulfilment?.revision !== historicalFulfilment || fulfilment?.catalog_revision !== binding.catalog_revision)
    return { state: "unknown" as const, reason: "Plan or required fulfilment binding changed; reconcile before replacement" };
  const step: Step = JSON.parse(operation.step_json);
  try {
    const mapping = await subjectMapping(ctx, step);
    check(mapping.id === step.mappingId && mapping.revision === step.mappingRevision, "Reviewed provider mapping changed");
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { state: "unknown" as const, reason: "Reviewed provider identity changed; reconcile current binding" };
  }
  if (operation.state === "verified") {
    const evidence = await ctx.env.DB.prepare(`SELECT 1 FROM execution_verifications WHERE workspace_id=? AND operation_id=?
      AND state='verified' AND target=? AND beneficiary_id=? AND action_version=? AND verifier_version=1`)
      .bind(workspace, operation.id, step.target, step.beneficiaryId, step.actionVersion).first();
    return evidence ? { state: "verified" as const, reason: "verified" } :
      { state: "unknown" as const, reason: "Independent workflow verification evidence missing" };
  }
  return { state: operation.state === "failed" ? "failed" as const :
    ["unknown", "cancel_requested"].includes(operation.state) ? "unknown" as const : "pending" as const,
    reason: operation.state };
}

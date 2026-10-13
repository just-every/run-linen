import type {
  ChangeExecutionPort,
  ChangeInvocation,
} from "../services/changes";
import { proposePlan, dispatchPlan } from "./plans";
import { runOperation, verifyOutcome, getOperation } from "./engine";
import { authorize, assert, privileged } from "./authority";
import type { CoreContext, Step } from "./types";
function stepFor(input: ChangeInvocation): Step {
  const implementation = input.implementation as any;
  assert(
    implementation &&
      typeof implementation.connectionId === "string" &&
      typeof implementation.target === "string" &&
      typeof implementation.beneficiaryId === "string" &&
      typeof implementation.verifierConnectionId === "string" &&
      Number.isInteger(implementation.connectionRevision) && implementation.connectionRevision > 0 &&
      Number.isInteger(implementation.verifierConnectionRevision) && implementation.verifierConnectionRevision > 0,
    "deployment_implementation_required",
    422,
  );
  const ref: any =
    input.grantReferences.find((r: any) => r.phase === input.phase) ||
    input.grantReferences[0];
  assert(
    ref?.id && Number.isInteger(ref.version),
    "grant_reference_required",
    422,
  );
  return {
    action: `deployment.${input.phase}`,
    actionVersion: 1,
    connectionId: implementation.connectionId,
    connectionRevision: implementation.connectionRevision,
    target: implementation.target,
    beneficiaryId: implementation.beneficiaryId,
    verifierConnectionId: implementation.verifierConnectionId,
    verifierConnectionRevision: implementation.verifierConnectionRevision,
    grantId: ref.id,
    grantVersion: ref.version,
    cohort: input.cohorts,
    payload: {
      ...implementation.payload,
      phase: input.phase,
      cohorts: input.cohorts,
      implementationRevision: input.implementationRevision,
    },
  };
}
export const changeExecutionPort: ChangeExecutionPort = {
  async authorize(env, p, change, phase) {
    await privileged({ env, principal: p });
    const implementation =
      phase === "compensate"
        ? change.data.compensation
        : change.data.implementation;
    const input = {
      id: "",
      changeId: change.id,
      changeRevision: change.revision,
      implementationRevision: change.data.implementationRevision,
      phase,
      implementation,
      cohorts:
        phase === "canary" ? change.data.canaryCohorts : change.data.cohorts,
      grantReferences: change.data.authorizations.at(-1).grantReferences,
      idempotencyKey: "",
    } as ChangeInvocation;
    await authorize(
      { env, principal: p },
      stepFor(input),
      "change:" + change.id,
    );
  },
  async invoke(env, p, input) {
    const ctx = { env, principal: p };
    const plan = await proposePlan(ctx, {
      workId: input.changeId,
      revision: input.changeRevision,
      steps: [stepFor(input)],
      idempotencyKey: "change:" + input.changeId + ":" + input.idempotencyKey,
      contextType: "change",
      contextSnapshot: {
        implementationRevision: input.implementationRevision,
        implementation: input.implementation,
        phase: input.phase,
      },
    });
    const operations = await dispatchPlan(ctx, {
      planId: plan.id,
      expectedRevision: plan.revision,
    });
    const operation: any = operations.find(
      (x: any) => x.parent_id === "initial",
    );
    assert(operation, "execution_intent_missing");
    const result = await runOperation(ctx, operation.id);
    return { executionId: operation.id, state: result.state };
  },
  async inspect(env, p, executionId) {
    const ctx: CoreContext = { env, principal: p };
    let operation = await getOperation(ctx, executionId);
    try {
      await verifyOutcome(ctx, {
        operationId: executionId,
        verifierVersion: 1,
      });
    } catch {}
    operation = await getOperation(ctx, executionId);
    const step: Step = JSON.parse(operation.step_json);
    const rows = await env.DB.prepare(
      "SELECT id,evidence_json FROM execution_verifications WHERE workspace_id=? AND operation_id=? AND state='verified' ORDER BY observed_at DESC LIMIT 1",
    )
      .bind(p.workspaceId, executionId)
      .all<{
        id: string;
        evidence_json: string;
      }>();
    const verified = operation.state === "verified" && rows.results.length > 0;
    return {
      state: operation.state,
      independent: verified,
      verifiedCohorts: verified ? step.cohort || [] : [],
      failedCohorts: operation.state === "failed" ? step.cohort || [] : [],
      unknownCohorts: verified ? [] : step.cohort || [],
      evidenceIds: verified ? rows.results.map((r) => r.id) : [],
    };
  },
};

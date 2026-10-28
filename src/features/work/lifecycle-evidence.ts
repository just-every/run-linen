import { ApiError, now } from "../../platform/http";
import { getWork, permit, type WorkContext } from "./core";
import { currentWorkPrincipal } from "./identity";
import type { Step } from "../execution/types";

type Row = Record<string, any>;
const select = (row: Row, columns: string) => Object.fromEntries(columns.split(",").map(key => [key, row[key]]));
const grantRef = (step: Step) => ({ id: step.grantId, version: step.grantVersion });

/** Export persisted evidence only. Exporting does not execute or re-verify an effect. */
export async function lifecycleEvidencePack(ctx: WorkContext, lifecycleId: string) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "hr"]);
  const db = ctx.env.DB, workspace = ctx.principal.workspaceId;
  const lifecycle = await db.prepare(`SELECT id,work_id,person_id,kind,effective_at,timezone,
    source,source_revision,revision,cancelled_at FROM work_lifecycle WHERE workspace_id=? AND id=?`)
    .bind(workspace, lifecycleId).first<Row>();
  if (!lifecycle) throw new ApiError(404, "not_found", "Lifecycle not found");
  const work = await getWork(ctx, lifecycle.work_id);
  const checkPrivacy = async () => {
    const erased = await db.prepare(`SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id IN (?,?,?,
      (SELECT source||':'||source_id FROM work_people WHERE workspace_id=? AND id=?))`)
      .bind(workspace, lifecycle.person_id, work.beneficiary_id, work.requester_id, workspace, lifecycle.person_id).first();
    if (erased) throw new ApiError(404, "not_found", "Lifecycle evidence unavailable after erasure");
  };
  await checkPrivacy();
  // Every plan revision and child operation is retained, including expiry and compensation.
  const operationScope = `SELECT o.id FROM execution_operations o JOIN execution_plans p
    ON p.workspace_id=o.workspace_id AND p.id=o.plan_id
    WHERE o.workspace_id=? AND p.context_type='work' AND p.work_id=?`;
  const history = (table: string, columns: string) => db.prepare(`SELECT ${columns} FROM ${table}
    WHERE workspace_id=? AND operation_id IN (${operationScope}) ORDER BY rowid`)
    .bind(workspace, workspace, work.id);
  const results = await db.batch([
    db.prepare(`SELECT id,kind,target,beneficiary_id,due_at,depends_on,state,owner_id,operation_id,revision,is_expiry
      FROM work_obligations WHERE workspace_id=? AND lifecycle_id=? AND kind<>'task.manual' ORDER BY due_at,id`).bind(workspace,lifecycleId),
    db.prepare(`SELECT o.id,o.plan_id,o.step_json,o.state,o.actor_id,o.parent_id,o.created_at,o.due_at,
      o.cancel_requested,o.last_checked_at,p.work_revision FROM execution_operations o
      JOIN execution_plans p ON p.workspace_id=o.workspace_id AND p.id=o.plan_id
      WHERE o.workspace_id=? AND p.context_type='work' AND p.work_id=? ORDER BY o.created_at,o.id`).bind(workspace,work.id),
    history("execution_attempts", "id,operation_id,fence,kind,state,started_at,finished_at,elapsed_ms"),
    history("execution_receipts", "id,operation_id,attempt_id,state,provider_status,created_at"),
    history("execution_verifications", "id,operation_id,verifier_version,action_version,target,beneficiary_id,state,evidence_json,observed_at"),
    db.prepare(`SELECT id,plan_id,operation_id,actor_id,grant_id,grant_version,allowed,reason,created_at
      FROM execution_decisions WHERE workspace_id=? AND plan_id IN
      (SELECT id FROM execution_plans WHERE workspace_id=? AND context_type='work' AND work_id=?) ORDER BY created_at,id`)
      .bind(workspace,workspace,work.id),
    db.prepare(`SELECT b.obligation_id,b.step_json,b.revision FROM work_execution_bindings b JOIN work_obligations o
      ON o.workspace_id=b.workspace_id AND o.id=b.obligation_id WHERE b.workspace_id=? AND o.lifecycle_id=?`)
      .bind(workspace,lifecycleId),
    db.prepare(`SELECT c.id,c.asset_id,c.actor_id,c.kind,c.person_id,c.created_at FROM work_custody c
      WHERE c.workspace_id=? AND c.person_id=? AND EXISTS(SELECT 1 FROM work_obligations o
      WHERE o.workspace_id=c.workspace_id AND o.lifecycle_id=? AND o.target=c.asset_id AND
      ((o.kind='device.return' AND c.kind='return') OR (o.kind='device.deliver' AND c.kind='receive')))
      ORDER BY c.created_at,c.id`).bind(workspace,lifecycle.person_id,lifecycleId),
  ]);
  const [duties, operations, attempts, receipts, verifications, decisions, bindings, custody] = results.map(r => r.results as Row[]);
  const refs = [...operations, ...bindings].map(row => grantRef(JSON.parse(row.step_json)))
    .concat(decisions.filter(d => d.grant_id).map(d => ({ id:d.grant_id, version:d.grant_version })));
  // Resolve exact historical versions and their delegated authority; never substitute today's grant.
  const grants = refs.length ? (await db.prepare(`WITH RECURSIVE authority(id,version) AS (
    SELECT json_extract(value,'$.id'),json_extract(value,'$.version') FROM json_each(?)
    UNION SELECT g.parent_id,g.parent_version FROM execution_grants g JOIN authority a ON g.id=a.id AND g.version=a.version
      WHERE g.workspace_id=? AND g.parent_id IS NOT NULL)
    SELECT g.id,g.version,g.issuer_id,g.principal_id,g.parent_id,g.parent_version,g.action,g.action_version,
      g.target,g.beneficiary_id,g.local_beneficiary_id,g.connection_id,g.connection_revision,g.valid_from,g.valid_until,g.created_at,
      r.actor_id revoked_by,r.created_at revoked_at FROM execution_grants g JOIN authority a ON a.id=g.id AND a.version=g.version
      LEFT JOIN execution_grant_revocations r ON r.workspace_id=g.workspace_id AND r.grant_id=g.id AND r.version=g.version
      WHERE g.workspace_id=? ORDER BY g.id,g.version`).bind(JSON.stringify(refs),workspace,workspace).all()).results : [];
  const effects = operations.map(operation => {
    const step: Step = JSON.parse(operation.step_json);
    const observations = verifications.filter(v => v.operation_id === operation.id).map(v => {
      const evidence = JSON.parse(v.evidence_json), effect = evidence.effect || evidence, workflow = evidence.workflow;
      // Raw provider bodies, payloads, credentials, cohort identities and probe nonces are never exported.
      return { ...select(v,"id,verifier_version,action_version,target,beneficiary_id,state,observed_at"),
        effect: { matches: effect.matches === true, present: typeof effect.present === "boolean" ? effect.present : null,
          observedAt: typeof effect.observedAt === "string" ? effect.observedAt : null },
        workflow: workflow ? { observedAt: workflow.observedAt, negativeControl: workflow.negativeControl === true,
          usableWorkflow: workflow.usableWorkflow === true } : null,
        independentlyVerified: v.state === "verified" && v.target === step.target && v.beneficiary_id === step.beneficiaryId
          && v.action_version === step.actionVersion && v.verifier_version === 1 && effect.matches === true
          && !!step.verifierConnectionId && step.verifierConnectionId !== step.connectionId
          && workflow?.negativeControl === true && workflow?.usableWorkflow === true,
      };
    });
    return { ...select(operation,"id,plan_id,work_revision,state,actor_id,parent_id,created_at,due_at,cancel_requested,last_checked_at"),
      id:operation.id, state:operation.state, actor_id:operation.actor_id, due_at:operation.due_at,
      action:step.action, actionVersion:step.actionVersion, target:step.target, beneficiaryId:step.beneficiaryId,
      connectionId:step.connectionId, connectionRevision:step.connectionRevision,
      verifierConnectionId:step.verifierConnectionId, verifierConnectionRevision:step.verifierConnectionRevision,
      grant:grantRef(step), attempts:attempts.filter(a => a.operation_id === operation.id),
      receipts:receipts.filter(r => r.operation_id === operation.id), verifications:observations,
      independentlyVerified:operation.state === "verified" && !operation.cancel_requested && observations.some(v => v.independentlyVerified),
    };
  });
  const outstandingDuties: Row[] = duties.filter(d => {
    if (d.state === "cancelled" && !d.operation_id) return false;
    if (d.kind.startsWith("device.")) return d.state !== "verified";
    return d.state !== "verified" || !effects.find(e => e.id === d.operation_id)?.independentlyVerified;
  }).map(d => ({ ...d, reason:d.state === "verified" ? "Independent execution evidence missing" : "Duty remains unresolved" }));
  for (const effect of effects) {
    if (!duties.some(d => d.operation_id === effect.id) && !effect.independentlyVerified && effect.state !== "cancelled")
      outstandingDuties.push({ operation_id:effect.id, kind:effect.action, target:effect.target, state:effect.state,
        owner_id:effect.actor_id, due_at:effect.due_at, reason:"Execution or compensation remains unresolved" });
  }
  // LIFE-008: template tasks are recorded team completions, never provider effects or independent verification.
  const teamTasks = (await db.prepare(`SELECT id,title,owner_id,group_id,due_at,remind_at,reminded_at,state,completed_by,completed_at,waived_by,waived_at,template_json
    FROM work_obligations WHERE workspace_id=? AND lifecycle_id=? AND kind='task.manual' ORDER BY due_at,id`).bind(workspace,lifecycleId).all<Row>()).results;
  // Revocation/erasure during a long export also closes this read door.
  await currentWorkPrincipal(ctx);
  permit(ctx,["owner","hr"]);
  await checkPrivacy();
  return { exportedAt:now(), workspaceId:workspace, lifecycle,
    work:{ id:work.id, revision:work.revision, state:work.state, createdAt:work.created_at },
    duties, teamTasks, effects, authority:{ grants, decisions,
      configuredBindings:bindings.map(b => ({ obligationId:b.obligation_id, revision:b.revision,
        grant:grantRef(JSON.parse(b.step_json)), status:"Configured authority; not proof of execution" })) },
    physicalCustody:{ records:custody, limitation:"Matching custody records; the physical admission does not retain its receipt ID. Physical completion does not verify security effects." },
    outstandingDuties,
    limitations:["Persisted evidence export; no new provider observation is performed.",
      "Receipts and attempt times record submission or observation, not an independently proven instant of effect.",
      "Connection-wide provider attempts have no operation association and are excluded to protect unrelated activity.",
      "This export is not compliance acceptance, SOC 2 certification, or legal hold storage."],
  };
}

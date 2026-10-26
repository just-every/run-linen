import { assertWorkFulfilmentAuthority } from "../work/fulfilment-authority";
import { assertIndependentGrantIssuer } from "./beneficiary-authority";
import { subjectMapping } from "./mappings";
import { hashToken } from "../../platform/crypto";
import { ApiError, id, now } from "../../platform/http";
import type { CoreContext, Step } from "./types";
export function assert(
  value: unknown,
  code: string,
  status = 409,
): asserts value {
  if (!value) throw new ApiError(status, code, code.replaceAll("_", " "));
}
export async function membership(
  ctx: CoreContext,
  userId = ctx.principal.userId,
) {
  const row = await ctx.env.DB.prepare(
    "SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1",
  )
    .bind(ctx.principal.workspaceId, userId)
    .first<{
      roles_json: string;
    }>();
  assert(row, "membership_required", 403);
  return JSON.parse(row.roles_json) as string[];
}
export async function privileged(ctx: CoreContext) {
  const roles = await membership(ctx);
  assert(
    roles.some((r) => ["owner", "operator", "integration"].includes(r)),
    "execution_role_required",
    403,
  );
}
export async function authorize(
  ctx: CoreContext,
  step: Step,
  planId: string,
  operationId?: string,
  at = now(),
  seen = new Set<string>(),
): Promise<void> {
  const db = ctx.env.DB,
    w = ctx.principal.workspaceId;
  let reason = "allowed";
  try {
    // Business policy belongs to the actual effect actor/leaf grant, not a delegated ancestor.
    if (seen.size === 0) await assertWorkFulfilmentAuthority(ctx, step, planId);
    assert(!seen.has(step.grantId), "delegation_cycle");
    seen.add(step.grantId);
    assert(seen.size <= 8, "delegation_depth");
    await membership(ctx);
    const g: any = await db
      .prepare(
        "SELECT * FROM execution_grants WHERE workspace_id=? AND id=? AND version=?",
      )
      .bind(w, step.grantId, step.grantVersion)
      .first();
    assert(g, "grant_missing", 403);
    await assertIndependentGrantIssuer(ctx, {
      issuerId: g.issuer_id,
      principalId: g.principal_id,
      connectionId: g.connection_id,
      beneficiaryId: g.beneficiary_id,
      localBeneficiaryId: g.local_beneficiary_id,
    });
    assert(
      (step.localBeneficiaryId || null) === g.local_beneficiary_id,
      "local_beneficiary_scope_denied",
      403,
    );
    if (g.local_beneficiary_id) {
      const mapping = await subjectMapping(ctx, step);
      assert(
        mapping.id === g.mapping_id &&
          mapping.revision === g.mapping_revision &&
          mapping.id === step.mappingId &&
          mapping.revision === step.mappingRevision,
        "provider_subject_mapping_changed",
        403,
      );
    }
    const connection: any = await db
      .prepare(
        "SELECT revision,status FROM connections WHERE id=? AND workspace_id=?",
      )
      .bind(step.connectionId, w)
      .first();
    assert(
      connection &&
        connection.revision === g.connection_revision &&
        (step.connectionRevision === undefined ||
          step.connectionRevision === connection.revision),
      "connection_changed",
      403,
    );
    assert(
      g.principal_id === ctx.principal.userId &&
        g.action === step.action &&
        g.action_version === step.actionVersion &&
        g.target === step.target &&
        g.beneficiary_id === step.beneficiaryId &&
        g.connection_id === step.connectionId,
      "grant_scope_denied",
      403,
    );
    assert(g.valid_from <= at && g.valid_until > at, "grant_expired", 403);
    const issuerRoles = await membership(ctx, g.issuer_id);
    assert(
      g.parent_id
        ? issuerRoles.includes("approver") || issuerRoles.includes("owner")
        : issuerRoles.includes("owner"),
      "issuer_authority_lost",
      403,
    );
    assert(
      !(await db
        .prepare(
          "SELECT 1 FROM execution_grant_revocations WHERE workspace_id=? AND grant_id=? AND version=?",
        )
        .bind(w, g.id, g.version)
        .first()),
      "grant_revoked",
      403,
    );
    assert(
      !(await db
        .prepare(
          "SELECT 1 FROM execution_grants WHERE workspace_id=? AND id=? AND version>?",
        )
        .bind(w, g.id, g.version)
        .first()),
      "grant_superseded",
      403,
    );
    const conditions = JSON.parse(g.conditions_json);
    assert(
      !conditions.verifierConnectionId ||
        (conditions.verifierConnectionId === step.verifierConnectionId &&
          conditions.verifierConnectionRevision ===
            step.verifierConnectionRevision),
      "verifier_authority_changed",
      403,
    );
    if (
      step.action.startsWith("deployment.") ||
      step.action === "identity.create" || step.action.startsWith("okta.")
    )
      assert(
        conditions.payloadHash &&
          conditions.payloadHash ===
            (await hashToken(JSON.stringify(step.payload || {}))),
        "payload_authority_denied",
        403,
      );
    assert(
      !conditions.workId ||
        conditions.workId ===
          ((
            await db
              .prepare(
                "SELECT work_id FROM execution_plans WHERE id=? AND workspace_id=?",
              )
              .bind(planId, w)
              .first<any>()
          )?.work_id ||
            (planId.startsWith("work:")
              ? (
                  await db
                    .prepare(
                      "SELECT id FROM work_records WHERE id=? AND workspace_id=?",
                    )
                    .bind(planId.slice(5), w)
                    .first<any>()
                )?.id
              : null)),
      "grant_condition_denied",
      403,
    );
    const uses = await db
      .prepare(
        "WITH RECURSIVE descendants(id) AS (SELECT ? UNION SELECT g.id FROM execution_grants g JOIN descendants d ON g.parent_id=d.id WHERE g.workspace_id=?) SELECT COUNT(*) n FROM execution_operations WHERE workspace_id=? AND json_extract(step_json,'$.grantId') IN (SELECT id FROM descendants) AND id!=? AND state NOT IN ('queued','cancelled','needs_configuration','blocked')",
      )
      .bind(g.id, w, w, operationId || "")
      .first<{
        n: number;
      }>();
    assert((uses?.n || 0) < g.max_uses, "grant_limit", 403);
    if (g.parent_id) {
      const parent: any = await db
        .prepare(
          "SELECT principal_id FROM execution_grants WHERE workspace_id=? AND id=? AND version=?",
        )
        .bind(w, g.parent_id, g.parent_version)
        .first();
      assert(parent?.principal_id === g.issuer_id, "delegation_invalid", 403);
      await authorize(
        { ...ctx, principal: { ...ctx.principal, userId: g.issuer_id } },
        { ...step, grantId: g.parent_id, grantVersion: g.parent_version },
        planId,
        operationId,
        at,
        seen,
      );
    }
  } catch (e) {
    reason = e instanceof ApiError ? e.code : "authority_unavailable";
    await db
      .prepare("INSERT INTO execution_decisions VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(
        id(),
        w,
        planId,
        operationId || null,
        ctx.principal.userId,
        step.grantId,
        step.grantVersion,
        0,
        reason,
        now(),
      )
      .run();
    throw e;
  }
  await db
    .prepare("INSERT INTO execution_decisions VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(
      id(),
      w,
      planId,
      operationId || null,
      ctx.principal.userId,
      step.grantId,
      step.grantVersion,
      1,
      reason,
      now(),
    )
    .run();
}

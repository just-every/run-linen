import { recordWorkManagerGrantApproval } from "../work/fulfilment-authority";
import { assertIndependentGrantIssuer } from "./beneficiary-authority";
import { subjectMapping } from "./mappings";
import { id, now, requiredString } from "../../platform/http";
import { assert, membership } from "./authority";
import { actions, type CoreContext } from "./types";
export async function createGrant(
  ctx: CoreContext,
  b: Record<string, unknown>,
) {
  const roles = await membership(ctx),
    w = ctx.principal.workspaceId;
  assert(
    roles.includes("owner") || roles.includes("approver"),
    "grant_issuer_denied",
    403,
  );
  const principal = requiredString(b.principalId, "principalId"),
    beneficiary = requiredString(b.beneficiaryId, "beneficiaryId");
  assert(
    principal !== ctx.principal.userId && beneficiary !== ctx.principal.userId,
    "self_approval_denied",
    403,
  );
  await membership(ctx, principal);
  assert(
    actions.includes(b.action as any) && b.actionVersion === 1,
    "invalid_action",
    422,
  );
  const start = requiredString(b.validFrom, "validFrom"),
    end = requiredString(b.validUntil, "validUntil");
  assert(
    new Date(start).toISOString() === start &&
      new Date(end).toISOString() === end &&
      start < end &&
      end > now(),
    "invalid_validity",
    422,
  );
  const max = Number(b.maxUses);
  assert(
    Number.isInteger(max) && max > 0 && max <= 100000,
    "invalid_limit",
    422,
  );
  const target = requiredString(b.target, "target"),
    connection = requiredString(b.connectionId, "connectionId");
  const connectionRow: any = await ctx.env.DB.prepare(
    "SELECT revision,config_json FROM connections WHERE id=? AND workspace_id=?",
  )
    .bind(connection, w)
    .first();
  assert(connectionRow, "connection_missing", 422);
  await assertIndependentGrantIssuer(ctx, {
    issuerId: ctx.principal.userId,
    principalId: principal,
    connectionId: connection,
    beneficiaryId: beneficiary,
    localBeneficiaryId: typeof b.localBeneficiaryId === "string" ? b.localBeneficiaryId : undefined,
  });
  let mapping: any = null;
  if (b.localBeneficiaryId) {
    assert(
      b.localBeneficiaryId !== ctx.principal.userId,
      "self_approval_denied",
      403,
    );
    mapping = await subjectMapping(ctx, {
      action: b.action,
      connectionId: connection,
      beneficiaryId: beneficiary,
      localBeneficiaryId: String(b.localBeneficiaryId),
    } as any);
  }
  const conditions = (b.conditions || {}) as Record<string, unknown>;
  assert(
    Object.keys(conditions).every((k) =>
      [
        "workId",
        "payloadHash",
        "verifierConnectionId",
        "verifierConnectionRevision",
      ].includes(k),
    ),
    "unsupported_condition",
    422,
  );
  if (b.verifierConnectionId)
    conditions.verifierConnectionId = b.verifierConnectionId;
  if (conditions.verifierConnectionId) {
    const verifier: any = await ctx.env.DB.prepare(
      "SELECT revision FROM connections WHERE id=? AND workspace_id=? AND provider='workflow-probe' AND status='active'",
    )
      .bind(conditions.verifierConnectionId, w)
      .first();
    assert(verifier, "verifier_configuration_required", 503);
    assert(
      conditions.verifierConnectionRevision === undefined ||
        conditions.verifierConnectionRevision === verifier.revision,
      "verifier_connection_changed",
    );
    conditions.verifierConnectionRevision = verifier.revision;
  }
  let parent: any = null;
  if (b.parentId) {
    parent = await ctx.env.DB.prepare(
      "SELECT * FROM execution_grants WHERE workspace_id=? AND id=? AND version=?",
    )
      .bind(w, b.parentId, b.parentVersion)
      .first();
    assert(
      parent &&
        parent.principal_id === ctx.principal.userId &&
        parent.action === b.action &&
        parent.target === target &&
        parent.beneficiary_id === beneficiary &&
        parent.connection_id === connection &&
        parent.valid_from <= start &&
        parent.valid_until >= end &&
        parent.max_uses >= max &&
        parent.conditions_json === JSON.stringify(conditions) &&
        parent.connection_revision === connectionRow.revision &&
        parent.local_beneficiary_id === (b.localBeneficiaryId || null) &&
        parent.mapping_id === (mapping?.id || null) &&
        parent.mapping_revision === (mapping?.revision || null),
      "delegation_scope_denied",
      403,
    );
    assert(
      !(await ctx.env.DB.prepare(
        "SELECT 1 FROM execution_grant_revocations WHERE workspace_id=? AND grant_id=? AND version=?",
      )
        .bind(w, parent.id, parent.version)
        .first()),
      "parent_revoked",
      403,
    );
  } else assert(roles.includes("owner"), "delegation_required", 403);
  const gid = typeof b.id === "string" ? b.id : id();
  const latest = await ctx.env.DB.prepare(
    "SELECT MAX(version) version FROM execution_grants WHERE workspace_id=? AND id=?",
  )
    .bind(w, gid)
    .first<{
      version: number | null;
    }>();
  const version = (latest?.version || 0) + 1;
  assert(
    !latest?.version || b.expectedVersion === latest.version,
    "grant_changed",
  );
  await ctx.env.DB.prepare(
    "INSERT INTO execution_grants VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      gid,
      w,
      version,
      ctx.principal.userId,
      principal,
      parent?.id || null,
      parent?.version || null,
      b.action,
      1,
      target,
      beneficiary,
      connection,
      start,
      end,
      max,
      JSON.stringify(conditions),
      now(),
      connectionRow.revision,
      b.localBeneficiaryId || null,
      mapping?.id || null,
      mapping?.revision || null,
    )
    .run();
  await recordWorkManagerGrantApproval(ctx, gid, version);
  return { id: gid, version };
}

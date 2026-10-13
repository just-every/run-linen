import type { StandingIntakeExecution } from "../intelligence/intake-execution";
import { getWork } from "../work/core";
import { authorize, membership } from "./authority";
import type { CoreContext, Step } from "./types";
export const standingIntakeExecution: StandingIntakeExecution = {
  async resolve(ctx, input) {
    const work = await getWork(ctx, input.workId);
    if (work.beneficiary_id !== input.beneficiaryId) return null;
    const action =
      input.kind === "access"
        ? "group.add"
        : input.kind === "software"
          ? "license.add"
          : null;
    if (!action) return null;
    const grants = await ctx.env.DB.prepare(
      `SELECT g.* FROM execution_grants g JOIN execution_subject_mappings m ON m.id=g.mapping_id AND m.workspace_id=g.workspace_id AND m.revision=g.mapping_revision AND m.active=1 JOIN connections c ON c.id=g.connection_id AND c.workspace_id=g.workspace_id AND c.revision=g.connection_revision AND c.status='active' WHERE g.workspace_id=? AND g.action=? AND g.target=? AND g.local_beneficiary_id=? AND g.valid_from<=? AND g.valid_until>? AND NOT EXISTS(SELECT 1 FROM execution_grant_revocations r WHERE r.workspace_id=g.workspace_id AND r.grant_id=g.id AND r.version=g.version) AND NOT EXISTS(SELECT 1 FROM execution_grants n WHERE n.workspace_id=g.workspace_id AND n.id=g.id AND n.version>g.version) ORDER BY g.created_at`,
    )
      .bind(
        ctx.principal.workspaceId,
        action,
        input.target,
        input.beneficiaryId,
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .all<any>();
    for (const grant of grants.results) {
      try {
        const roles = await membership(ctx, grant.principal_id);
        if (!roles.includes("integration")) continue;
        const conditions = JSON.parse(grant.conditions_json);
        if (!conditions.verifierConnectionId) continue;
        const verifier: any = await ctx.env.DB.prepare(
          "SELECT revision FROM connections WHERE id=? AND workspace_id=? AND provider='workflow-probe' AND status='active'",
        )
          .bind(conditions.verifierConnectionId, ctx.principal.workspaceId)
          .first();
        if (
          !verifier ||
          verifier.revision !== conditions.verifierConnectionRevision
        )
          continue;
        const actor: CoreContext = {
          env: ctx.env,
          principal: {
            workspaceId: ctx.principal.workspaceId,
            userId: grant.principal_id,
            roles: roles as any,
          },
        };
        const step: Step = {
          action,
          actionVersion: 1,
          connectionId: grant.connection_id,
          connectionRevision: grant.connection_revision,
          target: grant.target,
          beneficiaryId: grant.beneficiary_id,
          localBeneficiaryId: input.beneficiaryId,
          mappingId: grant.mapping_id,
          mappingRevision: grant.mapping_revision,
          grantId: grant.id,
          grantVersion: grant.version,
          verifierConnectionId: conditions.verifierConnectionId,
          verifierConnectionRevision: verifier.revision,
        };
        if (input.expiresAt) {
          const removals = await ctx.env.DB.prepare(
            "SELECT * FROM execution_grants WHERE workspace_id=? AND principal_id=? AND action=? AND target=? AND beneficiary_id=? AND local_beneficiary_id=? AND connection_id=? AND valid_from<=? AND valid_until>? ORDER BY version DESC",
          )
            .bind(
              ctx.principal.workspaceId,
              grant.principal_id,
              action.replace(".add", ".remove"),
              grant.target,
              grant.beneficiary_id,
              input.beneficiaryId,
              grant.connection_id,
              input.expiresAt,
              input.expiresAt,
            )
            .all<any>();
          for (const removal of removals.results) {
            try {
              await authorize(
                actor,
                {
                  ...step,
                  action: action.replace(".add", ".remove") as Step["action"],
                  grantId: removal.id,
                  grantVersion: removal.version,
                },
                "work:" + input.workId,
                undefined,
                input.expiresAt,
              );
              step.expiresAt = input.expiresAt;
              step.revocationGrantId = removal.id;
              break;
            } catch {}
          }
          if (!step.revocationGrantId) continue;
        }
        await authorize(actor, step, "work:" + input.workId);
        return { actorId: grant.principal_id, step };
      } catch {
        continue;
      }
    }
    return null;
  },
};

import { ApiError } from "../../platform/http";
import type { CoreContext } from "./types";

/** Identity is server-owned: an omitted caller hint cannot hide a known beneficiary. */
export async function assertIndependentGrantIssuer(
  ctx: CoreContext,
  input: {
    issuerId: string;
    principalId: string;
    connectionId: string;
    beneficiaryId: string;
    localBeneficiaryId?: string | null;
  },
) {
  const connection = await ctx.env.DB.prepare(
    "SELECT config_json FROM connections WHERE workspace_id=? AND id=?",
  ).bind(ctx.principal.workspaceId, input.connectionId).first<{ config_json: string }>();
  if (!connection) throw new ApiError(403, "connection_missing", "Connection missing");
  const mappings = await ctx.env.DB.prepare(`
    SELECT m.local_user_id FROM execution_subject_mappings m
    JOIN connections c ON c.workspace_id=m.workspace_id AND c.id=m.connection_id
      AND c.revision=m.connection_revision
    WHERE m.workspace_id=? AND m.connection_id=? AND m.provider_subject=? AND m.active=1
  `).bind(ctx.principal.workspaceId, input.connectionId, input.beneficiaryId)
    .all<{ local_user_id: string }>();
  const identities = new Set(mappings.results.map(row => row.local_user_id));
  const bindings = JSON.parse(connection.config_json).principalBindings || {};
  for (const [localId, subject] of Object.entries(bindings))
    if (subject === input.beneficiaryId) identities.add(localId);
  if (input.localBeneficiaryId) identities.add(input.localBeneficiaryId);
  if (input.principalId === input.issuerId || input.beneficiaryId === input.issuerId || identities.has(input.issuerId))
    throw new ApiError(403, "self_approval_denied", "Independent grant issuer required");
  if (identities.size > 1)
    throw new ApiError(403, "provider_subject_ambiguous", "Provider subject has conflicting current local identities");
}

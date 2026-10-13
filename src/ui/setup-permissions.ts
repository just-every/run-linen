import { request, type RecordValue } from "./api";
export interface ReviewedMapping {
  id: string; revision: number; localUserId: string; localName: string; localEmail: string | null;
  providerSubject: string; connectionId: string; connectionName: string; connectionRevision: number;
  currentConnectionRevision: number; active: boolean; current: boolean;
}
export interface ServiceActor { id: string; name: string; active: boolean }
export interface CatalogChoice { id: string; name: string; kind: string; target: string; revision: number }
export interface PermissionReview {
  actor: ServiceActor; mapping: ReviewedMapping; catalog: CatalogChoice;
  verifier: RecordValue; grants: RecordValue[]; expiresAt: string; attemptedIds?: string[];
}
export async function checkReview(review: PermissionReview) {
  const [mappings, actors, connections, catalog] = await Promise.all([
    request<ReviewedMapping[]>("/subject-mappings"), request<ServiceActor[]>("/automation-principals"),
    request<RecordValue[]>("/connections"), request<{ items: CatalogChoice[] }>("/catalog"),
  ]);
  const m = mappings.find(m => m.id === review.mapping.id);
  if (!m?.current || m.revision !== review.mapping.revision || m.providerSubject !== review.mapping.providerSubject ||
      m.connectionRevision !== review.mapping.connectionRevision || !actors.some(a => a.id === review.actor.id && a.active) ||
      !connections.some(c => c.id === review.verifier.id && c.status === "active" && c.revision === review.verifier.revision) ||
      !catalog.items.some(c => c.id === review.catalog.id && c.revision === review.catalog.revision && c.target === review.catalog.target))
    throw Error("Setup changed since this review. No further permissions were submitted. Review the current identities, service and connections again.");
}
export function recordedGrant(row: RecordValue, grant: RecordValue, review: PermissionReview) {
  const conditions = JSON.parse(String(row.conditions_json || "{}"));
  return row.id === grant.id && row.version === 1 && row.principal_id === grant.principalId &&
    row.beneficiary_id === grant.beneficiaryId && row.local_beneficiary_id === grant.localBeneficiaryId &&
    row.action === grant.action && row.target === grant.target && row.connection_id === grant.connectionId &&
    row.connection_revision === review.mapping.connectionRevision && row.mapping_id === review.mapping.id &&
    row.mapping_revision === review.mapping.revision && row.valid_from === grant.validFrom && row.valid_until === grant.validUntil &&
    row.max_uses === grant.maxUses && conditions.verifierConnectionId === review.verifier.id &&
    conditions.verifierConnectionRevision === review.verifier.revision;
}

import type { Principal } from '../../platform/types';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { date, mutate, number, type ServiceRecord } from './store';

/** Attributed operator evidence, never represented as an independent provider check. */
export async function recordOperationsObservation(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
  if (!['compliant', 'noncompliant', 'unknown'].includes(b.compliance))
    throw new ApiError(400, 'compliance', 'Choose compliant, noncompliant or unknown');
  const observedAt = date(b.observedAt, 'observedAt');
  if (Date.parse(observedAt) > Date.now()) throw new ApiError(400, 'observation', 'Future observations are not evidence');
  const observation = { id: id(), source: requiredString(b.source, 'source'), evidence: requiredString(b.evidence, 'evidence'),
    observedAt, freshnessMs: number(b.freshnessMs ?? 86400000, 'freshnessMs', 1), compliance: b.compliance,
    refreshAt: b.refreshAt === undefined ? (r.data.operationsObservations || []).at(-1)?.refreshAt || null : b.refreshAt === null ? null : date(b.refreshAt, 'refreshAt'),
    recordedBy: p.userId, recordedAt: now(), provenance: 'operator-recorded', independentlyVerified: false };
  return mutate(db, p, r, b.revision, { ...r.data, operationsObservations: [...(r.data.operationsObservations || []), observation] }, 'operations-observation-recorded');
}

import { assert } from './access';
import { getCommitment } from './commitments';
import type { Commitment, IntelligenceContext } from './types';

interface BoundCommitment { id: string; revision: number; observationIds: string[] }
export interface ProtocolBinding { rootCommitmentId: string; commitments: BoundCommitment[] }
interface Invalidation { commitmentId: string; reason: string }

/** F5: check the declared dependency closure and persisted probe provenance, never supplied provider claims. */
export async function checkProtocolBinding(ctx: IntelligenceContext, input: ProtocolBinding) {
  assert(input && typeof input.rootCommitmentId === 'string' && input.rootCommitmentId.length > 0 && input.rootCommitmentId.length <= 200,
    'protocol_binding_invalid');
  assert(Array.isArray(input.commitments) && input.commitments.length > 0 && input.commitments.length <= 100
    && input.commitments.every(b => b && typeof b.id === 'string' && b.id.length > 0 && b.id.length <= 200
      && Number.isSafeInteger(b.revision) && b.revision > 0 && Array.isArray(b.observationIds)
      && b.observationIds.length <= 100 && b.observationIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 200)
      && new Set(b.observationIds).size === b.observationIds.length)
    && new Set(input.commitments.map(b => b.id)).size === input.commitments.length, 'protocol_binding_invalid');
  // Resolve every supplied reference through its existing door before returning any evidence or invalidation.
  const records = new Map<string, Commitment>();
  for (const b of input.commitments) records.set(b.id, await getCommitment(ctx, b.id));
  const pending = [input.rootCommitmentId], visited = new Set<string>();
  const invalidations: Invalidation[] = [], at = Date.now();
  let expires = Infinity;
  const invalidate = (commitmentId: string, reason: string) => invalidations.push({ commitmentId, reason });
  while (pending.length) {
    const key = pending.pop()!;
    if (visited.has(key)) continue;
    visited.add(key);
    assert(visited.size <= 100, 'protocol_dependency_bounds');
    const c = records.get(key) ?? await getCommitment(ctx, key);
    pending.push(...c.data.dependencies);
    const bound = input.commitments.find(b => b.id === key);
    if (!bound) { invalidate(key, 'dependency_not_bound'); continue; }
    if (bound.revision !== c.revision) invalidate(key, 'commitment_changed');
    if (Date.parse(c.data.effectiveAt) > at || c.data.expiresAt && Date.parse(c.data.expiresAt) <= at)
      invalidate(key, 'commitment_inactive');
    if (c.data.expiresAt) expires = Math.min(expires, Date.parse(c.data.expiresAt));
    if (!c.data.observations.length || c.data.cohort.some(cohort =>
      !c.data.observations.some(s => (s.step.cohort ?? [s.step.beneficiaryId]).includes(cohort))))
      invalidate(key, 'observation_coverage_missing');
    const facts = (await ctx.env.DB.prepare(`SELECT id,spec_id,state,cohort_json,evidence_json,observed_at
      FROM intelligence_observations WHERE workspace_id=? AND commitment_id=? AND revision=?
      ORDER BY created_at DESC,rowid DESC`).bind(ctx.principal.workspaceId, key, c.revision).all<{
        id: string; spec_id: string; state: string; cohort_json: string; evidence_json: string; observed_at: string;
      }>()).results;
    const used = new Set<string>();
    for (const spec of c.data.observations) {
      for (const cohort of spec.step.cohort ?? [spec.step.beneficiaryId]) {
        const fact = facts.find(f => f.spec_id === spec.id && JSON.parse(f.cohort_json).includes(cohort));
        if (!fact) { invalidate(key, 'observation_missing'); continue; }
        used.add(fact.id);
        if (!bound.observationIds.includes(fact.id)) invalidate(key, 'observation_changed');
        const observed = Date.parse(fact.observed_at), until = observed + c.data.freshnessSeconds * 1000;
        expires = Math.min(expires, until);
        if (fact.state !== 'verified' || !Number.isFinite(observed) || observed > at || until <= at)
          invalidate(key, 'observation_unverified_or_stale');
        const proof = JSON.parse(fact.evidence_json), source = proof?.source;
        if (!source || source.connectionId !== spec.step.verifierConnectionId
          || source.provider !== 'workflow-probe' || !Number.isSafeInteger(source.revision)
          || proof.negativeControl !== true || proof.usableWorkflow !== true
          || proof.observedAt !== fact.observed_at || proof.target !== spec.step.target
          || proof.beneficiaryId !== spec.step.beneficiaryId)
          invalidate(key, 'observation_source_unbound');
        else {
          const current = await ctx.env.DB.prepare(`SELECT revision,provider,status FROM connections
            WHERE workspace_id=? AND id=?`).bind(ctx.principal.workspaceId, source.connectionId)
            .first<{ revision: number; provider: string; status: string }>();
          if (!current || current.status !== 'active' || current.provider !== source.provider
            || current.revision !== source.revision
            || spec.step.verifierConnectionRevision !== undefined && spec.step.verifierConnectionRevision !== source.revision)
            invalidate(key, 'observation_source_changed');
        }
      }
    }
    if (bound.observationIds.some(id => !used.has(id))) invalidate(key, 'observation_not_current');
  }
  if (input.commitments.some(b => !visited.has(b.id))) invalidate(input.rootCommitmentId, 'unrelated_binding');
  return { binding: input, invalidations, checkedAt: new Date(at).toISOString(),
    expiresAt: Number.isFinite(expires) ? new Date(expires).toISOString() : null };
}

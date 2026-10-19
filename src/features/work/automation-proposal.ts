/**
 * AGENT-006: name the next most valuable automation by human work it would
 * remove, from REPORT-004's owner-chosen windows. Value = current-window human
 * minutes per verified outcome × current verified outcomes; ties rank more
 * failures first, then request type. A type without a verified outcome in the
 * current window has not enough evidence and is never ranked.
 */
interface WindowLike {
  verified: number; failed: number; incoming: number; touches: number; activeMinutes: number;
  knownCostPerVerifiedOutcomeUsd: number | null; costComplete: boolean;
}
interface TypeRow { requestType: string; baseline: WindowLike | null; current: WindowLike | null }

export const proposalDefinition = 'Ranked by the human work automating each request type would remove: current-window human active minutes per verified outcome × current verified outcomes (ties: more failures first, then name). The realized saving per verified outcome (baseline minus current minutes) is shown as evidence. A type with no verified outcome in the current window has not enough evidence and is not ranked. This is a proposal; it authorizes nothing.';

export function automationProposal(rows: TypeRow[]) {
  const evidence = (w: WindowLike | null) => w && {
    verified: w.verified, failed: w.failed, incoming: w.incoming, touches: w.touches, activeMinutes: w.activeMinutes,
    minutesPerVerifiedOutcome: w.verified ? w.activeMinutes / w.verified : null,
    knownCostPerVerifiedOutcomeUsd: w.knownCostPerVerifiedOutcomeUsd, costComplete: w.costComplete,
  };
  const ranked = rows.filter(r => r.current && r.current.verified > 0).map(r => {
    const perOutcome = r.current!.activeMinutes / r.current!.verified;
    const baselinePerOutcome = r.baseline?.verified ? r.baseline.activeMinutes / r.baseline.verified : null;
    return {
      requestType: r.requestType, humanMinutesToRemove: perOutcome * r.current!.verified,
      realizedSavingMinutesPerOutcome: baselinePerOutcome === null ? null : baselinePerOutcome - perOutcome,
      evidence: { baseline: evidence(r.baseline), current: evidence(r.current) },
    };
  }).sort((a, b) => b.humanMinutesToRemove - a.humanMinutesToRemove
    || b.evidence.current!.failed - a.evidence.current!.failed || a.requestType.localeCompare(b.requestType))
    .map((r, index) => ({ rank: index + 1, ...r }));
  const next = ranked.find(r => r.humanMinutesToRemove > 0) ?? null;
  return {
    next: next && { requestType: next.requestType, humanMinutesToRemove: next.humanMinutesToRemove },
    ranked,
    notEnoughEvidence: rows.filter(r => !r.current || r.current.verified === 0).map(r => r.requestType),
    definition: proposalDefinition,
  };
}

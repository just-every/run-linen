// One reading of a request for every place that shows it: the queue row, the open request and the spaces
// that list requests. The row and the detail take "For", status and facts from these, never separately.
import type { RequestProgress, WorkRecord } from "./work";

const stopped = ["blocked", "failed", "needs_configuration", "budget_held", "necessary_question"];

/** The responsibility behind the red exception: the first that cannot continue, else the first waiting on a person. */
export function progressException(progress: RequestProgress[] = []) {
  return (
    progress.find((item) => stopped.includes(item.state)) ??
    progress.find((item) => item.needsAction && item.ownerLabel !== "Linen" && item.state !== "pending")
  );
}

/** The status pill: the exception's state while there is one, else the conversation's own. */
export const requestStatus = (work: WorkRecord, progress = work.progress) => progressException(progress)?.state ?? work.state;

/** The request's recorded context (who it is for, their team, the place, the date it is needed by). */
export function requestContext(work: WorkRecord): Record<string, unknown> {
  try {
    const value = JSON.parse(work.context_json ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
const named = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** The person a request is for: another account it was recorded for, else the person its context names, else the requester. */
export function requestFor(work: WorkRecord, personName: (id: unknown) => string) {
  if (work.beneficiary_id !== work.requester_id) return personName(work.beneficiary_id);
  return named(requestContext(work).requestedFor) ?? personName(work.beneficiary_id);
}

/** The person's recorded facts, each only when recorded. */
export function requestFacts(work: WorkRecord) {
  const context = requestContext(work);
  return { team: named(context.team), place: named(context.location), neededBy: named(context.neededBy) };
}

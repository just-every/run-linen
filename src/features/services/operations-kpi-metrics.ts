import type { ServiceRecord } from './store';

export interface KpiRecord {
  id: string; label: string; path: string; [key: string]: unknown;
}
export interface OperationsMetric {
  key: string; label: string; value: number | null; unit: string; definition: string;
  records: KpiRecord[]; unknown?: number; denominator?: number; numerator?: number;
}
export interface KpiRange { start: string; end: string; timezone: string }
export const inRange = (at: unknown, range: KpiRange) => typeof at === 'string' && Date.parse(at) >= Date.parse(range.start) && Date.parse(at) < Date.parse(range.end);
export const reference = (r: ServiceRecord, extra: Record<string, unknown> = {}): KpiRecord => ({
  id: r.id, label: r.data.title || r.data.name || r.id,
  path: `#/${({ incident: 'incidents', change: 'changes', problem: 'problems', asset: 'software-assets', supplier: 'suppliers' } as Record<string, string>)[r.kind] || 'services'}/${encodeURIComponent(r.id)}`,
  revision: r.revision, ...extra,
});
export const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export function metric(key: string, label: string, value: number | null, unit: string, definition: string, records: KpiRecord[], extra: Partial<OperationsMetric> = {}): OperationsMetric {
  return { key, label, value, unit, definition, records, ...extra };
}
export function elapsed(r: ServiceRecord, field: string): number | null {
  const at = Date.parse(r.data[field]);
  return Number.isFinite(at) && at >= Date.parse(r.createdAt) ? at - Date.parse(r.createdAt) : null;
}
export function restoredElapsed(r: ServiceRecord) {
  // restoredAt is written only after execution-admitted recovery across all cohorts.
  const covered = r.data.cohorts?.length && r.data.cohorts.every((cohort: string) => (r.data.recoveries || []).some((e: any) =>
    e.cohort === cohort && e.independent === true && e.usable === true && e.negativeChecksPassed === true && e.executionId && e.evidenceId));
  return r.data.status === 'restored' && covered ? elapsed(r, 'restoredAt') : null;
}
export function successfulChange(r: ServiceRecord) {
  return r.data.state === 'verified' && (r.data.invocations || []).some((i: any) =>
    i.phase === 'rollout' && i.implementationRevision === r.data.implementationRevision && i.state === 'verified'
    && i.executionId && i.evidenceIds?.length && !i.failedCohorts?.length && !i.unknownCohorts?.length
    && r.data.cohorts?.length && r.data.cohorts.every((c: string) => i.verifiedCohorts?.includes(c)));
}
function incidentRecords(items: ServiceRecord[]) {
  return items.map(r => reference(r, { priority: r.data.priority || 'unspecified', serviceId: r.data.serviceId,
    major: r.data.major === true, mttaMs: elapsed(r, 'acknowledgedAt'), mttrMs: restoredElapsed(r),
    acknowledgedAt: r.data.acknowledgedAt || null, restoredAt: restoredElapsed(r) === null ? null : r.data.restoredAt,
    status: r.data.status }));
}
export function incidentMetrics(incidents: ServiceRecord[], services: ServiceRecord[]) {
  const records = incidentRecords(incidents), values = (field: string) => records.map(r => r[field]).filter((x): x is number => typeof x === 'number');
  const mtta = 'Mean elapsed milliseconds from incident creation to its first recorded operator acknowledgement; incident creation cohort in [start,end). Unacknowledged incidents are excluded and disclosed.';
  const mttr = 'Mean elapsed milliseconds from incident creation to independently verified all-cohort restoration; incident creation cohort in [start,end). Unrestored incidents are excluded and disclosed. Manual closure is not restoration.';
  const metrics = [metric('incident.count', 'Incidents opened', incidents.length, 'count', 'Readable incidents created in [start,end), without a row limit.', records),
    metric('incident.mtta', 'Mean time to acknowledge', average(values('mttaMs')), 'ms', mtta, records, { denominator: values('mttaMs').length, unknown: incidents.length - values('mttaMs').length }),
    metric('incident.mttr', 'Mean time to restore', average(values('mttrMs')), 'ms', mttr, records, { denominator: values('mttrMs').length, unknown: incidents.length - values('mttrMs').length })];
  const incidentGroups = [];
  for (const dimension of ['priority', 'service'] as const) {
    const groupKeys = [...new Set(incidents.map(r => dimension === 'priority' ? r.data.priority || 'unspecified' : r.data.serviceId || 'unspecified'))].sort() as string[];
    for (const key of groupKeys) {
      const group = incidents.filter(r => (dimension === 'priority' ? r.data.priority || 'unspecified' : r.data.serviceId || 'unspecified') === key);
      const rows = incidentRecords(group), a = rows.filter(r => r.mttaMs !== null), t = rows.filter(r => r.mttrMs !== null);
      const label = dimension === 'priority' ? key : services.find(r => r.id === key)?.data.name || 'Service unavailable';
      const mttaMs = average(a.map(r => r.mttaMs as number)), mttrMs = average(t.map(r => r.mttrMs as number));
      incidentGroups.push({ dimension, key, label, count: group.length, mttaMs, mttrMs, acknowledged: a.length, restored: t.length,
        unacknowledged: group.length - a.length, unrestored: group.length - t.length, records: rows });
      metrics.push(metric(`incident.mtta.${dimension}.${key}`, `MTTA · ${label}`, mttaMs, 'ms', mtta, rows, { denominator: a.length, unknown: group.length - a.length }),
        metric(`incident.mttr.${dimension}.${key}`, `MTTR · ${label}`, mttrMs, 'ms', mttr, rows, { denominator: t.length, unknown: group.length - t.length }));
    }
  }
  const major = incidents.filter(r => r.data.major === true), majorRows = incidentRecords(major), durations = major.map(restoredElapsed).filter((n): n is number => n !== null);
  metrics.push(metric('major.count', 'Major incidents', major.length, 'count', 'Incidents in the creation cohort explicitly recorded as major; missing designations are not inferred from priority.', majorRows, { unknown: incidents.filter(r => typeof r.data.major !== 'boolean').length }),
    metric('major.duration', 'Mean major incident duration', average(durations), 'ms', mttr + ' Restricted to explicitly major incidents.', majorRows, { denominator: durations.length, unknown: major.length - durations.length }));
  return { metrics, incidentGroups };
}
export function changeProblemMetrics(changes: ServiceRecord[], incidents: ServiceRecord[], problems: ServiceRecord[], observedAt: string) {
  const successes = changes.filter(successfulChange), emergency = changes.filter(r => r.data.changeType === 'emergency' || r.data.emergency === true);
  const failed = (r: ServiceRecord) => ['failed', 'compensated', 'compensation-incomplete'].includes(r.data.state)
    || (r.data.invocations || []).some((i: any) => i.implementationRevision === r.data.implementationRevision && ['canary', 'rollout'].includes(i.phase) && i.state === 'failed');
  const changeRows = changes.map(r => reference(r, { status: r.data.state, successful: successfulChange(r), emergency: emergency.includes(r), outcome: successfulChange(r) ? 'verified-success' : failed(r) ? 'failed' : 'unknown' }));
  // An absent causal investigation cannot be treated as proof that no change caused an incident.
  const attributed = incidents.filter(r => r.data.changeCause?.state === 'confirmed' && r.data.changeCause?.evidenceIds?.length && changes.some(c => c.id === r.data.changeCause.changeId));
  const assessed = incidents.filter(r => (r.data.changeCause?.state === 'not-change-related' && r.data.changeCause?.evidenceIds?.length) || attributed.includes(r));
  const backlog = problems.filter(r => r.data.preventionState !== 'effectiveness-verified');
  const errors = backlog.filter(r => r.data.causeState === 'known-error');
  const problemRows = (items: ServiceRecord[]) => items.map(r => reference(r, { ageMs: Math.max(0, Date.parse(observedAt) - Date.parse(r.createdAt)), causeState: r.data.causeState, preventionState: r.data.preventionState || 'unverified' }));
  return [metric('change.success', 'Change success rate', changes.length ? successes.length / changes.length * 100 : null, '%',
    'Current independently verified rollout successes / all readable changes created in [start,end), ×100. Failed, pending and unknown changes remain in the denominator. Canary success or manual closure does not count.', changeRows,
    { numerator: successes.length, denominator: changes.length, unknown: changes.filter(r => !successfulChange(r) && !failed(r)).length }),
  metric('change.emergency', 'Emergency change share', changes.length ? emergency.length / changes.length * 100 : null, '%',
    'Changes explicitly designated emergency / all readable changes created in [start,end), ×100.', changeRows, { numerator: emergency.length, denominator: changes.length, unknown: changes.filter(r => typeof r.data.emergency !== 'boolean' && !r.data.changeType).length }),
  metric('change.caused-incidents', 'Change-caused incident rate', assessed.length ? attributed.length / assessed.length * 100 : null, '%',
    'Confirmed change-caused incidents with recorded causal evidence linked to a change in the change cohort / incidents in the incident cohort with an explicit evidenced causal assessment, ×100. Missing assessments are unknown; temporal proximity is not cause.',
    incidents.map(r => reference(r, { assessment: attributed.includes(r) ? 'confirmed-change-cause' : assessed.includes(r) ? 'not-change-related' : 'unknown' })), { numerator: attributed.length, denominator: assessed.length, unknown: incidents.length - assessed.length }),
  metric('problem.backlog', 'Problem backlog', backlog.length, 'count', 'Current readable problems without verified permanent-fix effectiveness. A deployed preventive change or a workaround alone does not clear the backlog.', problemRows(backlog)),
  metric('problem.age', 'Mean problem backlog age', average(backlog.map(r => Math.max(0, Date.parse(observedAt) - Date.parse(r.createdAt)))), 'ms', 'Mean current elapsed age since creation of problems in the unresolved backlog; not a historical end-of-range snapshot.', problemRows(backlog), { denominator: backlog.length }),
  metric('problem.known-errors', 'Known errors without a permanent fix', errors.length, 'count', 'Current reviewed known-error problems without verified permanent-fix effectiveness; workarounds and implementation alone are not a permanent fix.', problemRows(errors))];
}

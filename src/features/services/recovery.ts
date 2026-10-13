import type { Env, Principal } from '../../platform/types';
import { recordVerifiedRecovery, type RecoveryEvidence } from './incidents';
import { serviceWorkPort } from './work-port';
import { mutate, type ServiceRecord } from './store';

/** Fresh execution evidence advances each affected cohort without a human attestation. */
export async function observeIncidentRecovery(env: Env, principal: Principal, incident: ServiceRecord) {
  if (incident.data.status === 'closed') return incident;
  const rows = await env.DB.prepare(`SELECT v.id,v.operation_id,v.observed_at,v.verifier_version,v.evidence_json,o.step_json
    FROM execution_verifications v JOIN execution_operations o ON o.workspace_id=v.workspace_id AND o.id=v.operation_id
    WHERE v.workspace_id=? AND v.state='verified' AND o.state='verified' AND o.cancel_requested=0 AND v.observed_at>?
    ORDER BY v.observed_at DESC LIMIT 200`).bind(principal.workspaceId, new Date(Date.now() - 300000).toISOString()).all<any>();
  const evidence: RecoveryEvidence[] = [];
  for (const row of rows.results) {
    if (Date.parse(row.observed_at) < Date.parse(incident.createdAt)) continue;
    const proof = JSON.parse(row.evidence_json), step = JSON.parse(row.step_json);
    for (const cohort of incident.data.cohorts) {
      if (!proof.workflow?.cohort?.includes(cohort) || (incident.data.recoveries || []).some((e: RecoveryEvidence) => e.evidenceId === row.id && e.cohort === cohort)) continue;
      const candidate: RecoveryEvidence = { evidenceId: row.id, executionId: row.operation_id, incidentId: incident.id,
        serviceId: incident.data.serviceId, cohort, observedAt: row.observed_at,
        expiresAt: new Date(Date.parse(row.observed_at) + 300000).toISOString(), verifierVersion: String(row.verifier_version),
        independent: true, usable: true, negativeChecksPassed: true, source: step.verifierConnectionId };
      if (await serviceWorkPort.admitRecovery(env, principal, candidate)) evidence.push(candidate);
    }
  }
  if (evidence.length) return recordVerifiedRecovery(env.DB, principal, incident, evidence,
    e => serviceWorkPort.admitRecovery(env, principal, e));
  const missing = incident.data.cohorts.filter((cohort: string) => !(incident.data.recoveries || []).some((e: RecoveryEvidence) => e.cohort === cohort && Date.parse(e.expiresAt) > Date.now()));
  if (['restored', 'partially-restored'].includes(incident.data.status) && missing.length) {
    const status = missing.length === incident.data.cohorts.length ? 'investigating' : 'partially-restored';
    if (status !== incident.data.status || JSON.stringify(missing) !== JSON.stringify(incident.data.unresolvedCohorts))
      return mutate(env.DB, principal, incident, incident.revision, { ...incident.data, status,
        restoredAt: null, unresolvedCohorts: missing }, 'recovery-evidence-expired');
  }
  return incident;
}

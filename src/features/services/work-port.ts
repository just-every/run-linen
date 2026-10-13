import { getWork } from '../work/core';
import type { ServiceWorkPort } from './index';
import { getService } from './store';
export const serviceWorkPort: ServiceWorkPort = {
    async canLink(env, p, workId) {
        try {
            const work = await getWork({ env, principal: p }, workId);
            return work.kind === 'incident';
        }
        catch {
            return false;
        }
    },
    async admitRecovery(env, p, e) {
        const row = await env.DB.prepare("SELECT v.*,o.step_json,o.cancel_requested,o.state AS operation_state,pl.context_type,pl.work_id FROM execution_verifications v JOIN execution_operations o ON o.id=v.operation_id AND o.workspace_id=v.workspace_id JOIN execution_plans pl ON pl.id=o.plan_id AND pl.workspace_id=o.workspace_id WHERE v.workspace_id=? AND v.id=? AND v.operation_id=? AND v.state='verified'").bind(p.workspaceId, e.evidenceId, e.executionId).first<any>();
        if (!row || row.cancel_requested || row.operation_state !== 'verified' || row.observed_at !== e.observedAt || String(row.verifier_version) !== e.verifierVersion || Date.now() - Date.parse(row.observed_at) > 300000 || Date.parse(e.expiresAt) > Date.parse(row.observed_at) + 300000)
            return false;
        const incident = await getService(env.DB, p, e.incidentId, 'incident');
        if (incident.data.serviceId !== e.serviceId)
            return false;
        if (row.context_type === 'change') {
            const change = await getService(env.DB, p, row.work_id, 'change');
            if (!change.data.services.includes(e.serviceId))
                return false;
        }
        else {
            if (!incident.data.links.some((l: any) => l.employeeIncidentId === row.work_id))
                return false;
            await getWork({ env, principal: p }, row.work_id);
        }
        const proof = JSON.parse(row.evidence_json), step = JSON.parse(row.step_json);
        return proof.workflow?.negativeControl === true && proof.workflow?.usableWorkflow === true && proof.effect?.matches === true && proof.workflow.cohort?.includes(e.cohort) && step.verifierConnectionId && step.verifierConnectionId !== step.connectionId && e.source === step.verifierConnectionId;
    }
};

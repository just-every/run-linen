import { connection } from '../execution/connectors';
import { providerFetch } from '../execution/transport';
import { assert } from './access';
import type { IntelligenceContext, ObservationSpec } from './types';

/** Read-only observation admission. A negative outcome is evidence only after provenance passes. */
export async function observeProbe(ctx: IntelligenceContext, spec: ObservationSpec) {
    const step = spec.step;
    assert(step.verifierConnectionId && step.verifierConnectionId !== step.connectionId, 'verifier_configuration_required', 503);
    const source = await ctx.env.DB.prepare('SELECT revision FROM connections WHERE workspace_id=? AND id=?')
      .bind(ctx.principal.workspaceId, step.verifierConnectionId).first<{revision:number}>();
    assert(source, 'verifier_configuration_required', 503);
    const { config, secret } = await connection(ctx, step.verifierConnectionId, 'workflow-probe', true, step.verifierConnectionRevision ?? source.revision);
    assert(typeof config.url === 'string' && Array.isArray(config.allowedHosts) && secret.token, 'verifier_configuration_required', 503);
    const url = new URL(config.url);
    assert(url.protocol === 'https:' && !url.username && !url.password && config.allowedHosts.includes(url.hostname) && !/^([\d.]+|\[.*\]|localhost|.*\.local)$/.test(url.hostname), 'probe_host_denied', 403);
    const nonce = crypto.randomUUID(), start = Date.now();
    const desired = step.action.endsWith('.add') || step.action === 'identity.create' || step.action.startsWith('deployment.') ? 'usable' : 'denied';
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('target', step.target);
    url.searchParams.set('beneficiary', step.beneficiaryId);
    url.searchParams.set('desired', desired);
    const response = await providerFetch(ctx, step.verifierConnectionId, 'workflow_probe', url, { headers: { Authorization: `Bearer ${secret.token}`, 'Cache-Control': 'no-cache' }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
    assert(response.ok, 'probe_failed', 503);
    let v: any;
    try { v = await response.json(); } catch { assert(false, 'probe_malformed', 502); }
    const cohort = step.cohort || [step.beneficiaryId];
    assert(v && v.nonce === nonce && v.target === step.target && v.beneficiaryId === step.beneficiaryId && v.verifierVersion === 1 && v.actionVersion === 1 && typeof v.observedAt === 'string' && Date.parse(v.observedAt) >= start && Date.parse(v.observedAt) <= Date.now() && v.expectedOutcome === desired && typeof v.usableWorkflow === 'boolean' && v.negativeControl === true && Array.isArray(v.cohort) && v.cohort.length === cohort.length && cohort.every(p => v.cohort.includes(p)), 'probe_evidence_invalid', 502);
    const fresh = await ctx.env.DB.prepare('SELECT revision,status FROM connections WHERE workspace_id=? AND id=?')
      .bind(ctx.principal.workspaceId, step.verifierConnectionId).first<{revision:number;status:string}>();
    assert(fresh?.revision === source.revision && fresh.status === 'active', 'connection_changed', 409);
    // Only admitted, explicitly typed fields enter persistent facts; arbitrary provider text never does.
    return { source: { connectionId: step.verifierConnectionId, revision: source.revision, provider: 'workflow-probe' }, nonce, target: step.target, beneficiaryId: step.beneficiaryId, verifierVersion: 1, actionVersion: 1, expectedOutcome: desired, observedAt: v.observedAt as string, cohort, negativeControl: true, usableWorkflow: v.usableWorkflow as boolean };
}

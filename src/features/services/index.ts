import { registerEmployeeNotices } from './employee-notice-routes';
import { operationsKpis } from './operations-kpis';
import { recordOperationsObservation } from './operations-observations';
import { registerTemplateRoutes, bindChangeGrants, assertCatalogApproval } from './change-templates';
import { registerCalendarRoutes } from './calendar-routes';
import { registerReleaseRoutes } from './release-routes';
import { presentRelease } from './releases';
import { recurrenceContext } from './recurrence-context';
import { publishWorkaround, presentProblem } from './problem-knowledge';
import type { Hono } from 'hono';
import type { AppEnv, Env, Principal } from '../../platform/types';
import { ApiError, requiredString, jsonBody, requireRole, audit, now } from '../../platform/http';
import { create, date, getService, list, mutate, number, strings, type Kind, type ServiceRecord, staff } from './store';
import { serviceWorkPort } from './work-port';
import { advanceDecision, newDecision, decide, amendDecision } from './decisions';
import { changeExecutionPort } from '../execution/change-port';
import { setChangeExecutionPort } from './changes';
import { addEdge, serviceGraph } from './graph';
import { detectProblemProposals } from './problem-detection';
import { listProblemProposals, getProblemProposal, decideProblemProposal, problemEvidence } from './problem-proposals';
import { newConfigurationItem } from './configuration';
import { dependencyImpact } from './dependency-impact';
import { diagnosticFinding, incidentFollowup, newIncident, acknowledgeIncident, linkIncident, updateIncident, assignDiagnostic, incidentCandidates, recordVerifiedRecovery, type RecoveryEvidence } from './incidents';
import { newChange, editChange, authorizeChange, dispatchChange, verifyChange } from './changes';
import { supplierObservation,reviewSupplierOutcome,assignAsset, returnAsset, recordCharge, newSupplier, supplierCommitment, supplierHandoff, acceptHandoff, supplierBreaches, newAsset, assetTransition, assetUsage, reclamationDecision, serviceReport } from './economics';
import { newProblem, knownError, linkPrevention } from './problems';
import { reconcileNotification, ingestMonitoring, routeOnCall, processDueServices } from './integrations';
export { registerServiceWebhooks } from './webhooks';
export { eraseServicePerson } from './privacy';
export { restoreAdoptionRecord } from './adoption';
export { getService } from './store';
export { linkIncident, recordVerifiedRecovery } from './incidents';
export { changeGate, setChangeExecutionPort } from './changes';
export { processDueServices } from './integrations';
export interface ServiceWorkPort {
    canLink(env: Env, p: Principal, workId: string): Promise<boolean>;
    admitRecovery(env: Env, p: Principal, evidence: RecoveryEvidence): Promise<boolean>;
}
let workPort: ServiceWorkPort | undefined;
export function setServiceWorkPort(port: ServiceWorkPort) { workPort = port; }
async function presentRecord(env: Env, p: Principal, r: ServiceRecord) {
    // Cohort messages are read only through their membership and source gates.
    const { employeeNotices: _notices, ...data } = r.data;
    r = { ...r, data };
    if(r.kind==='change'&&r.data.changeType==='standard') {
        try {await assertCatalogApproval(env.DB,p,r);return {...r,data:{...r.data,catalogApprovalStatus:'retained'}};}
        catch(error) {if(!(error instanceof ApiError)||![403,404,409].includes(error.status))throw error;return {...r,data:{...r.data,catalogApprovalStatus:'unavailable'}};}
    }
    if(r.kind==='release')return presentRelease(env.DB,p,r);
    if(r.kind==='problem') { const shown=await presentProblem(env,p,r); return r.data.sourceProposalId ? {...shown,data:{...shown.data,recurrenceSources:await problemEvidence({env,principal:p},r.data.evidence)}} : shown; }
    if(r.kind==='supplier')return {...r,data:{...r.data,breaches:supplierBreaches(r)}};
    if (r.kind !== 'incident' || staff(p) || p.roles.includes('auditor'))
        return r;
    const links = [];
    for (const link of r.data.links || [])
        if (workPort && await workPort.canLink(env, p, link.employeeIncidentId))
            links.push(link);
    return { ...r, data: { ...r.data, links, diagnostics: [], recoveries: (r.data.recoveries || []).map((e: any) => ({ cohort: e.cohort, observedAt: e.observedAt, expiresAt: e.expiresAt })), updates: (r.data.updates || []).filter((u: any) => u.audience.includes(p.userId)).map((u: any) => ({ message: u.message, at: u.at })) } };
}
export function registerServiceRoutes(app: Hono<AppEnv>) {
    registerEmployeeNotices(app);
    registerCalendarRoutes(app);
    registerTemplateRoutes(app);
    registerReleaseRoutes(app);
    setChangeExecutionPort(changeExecutionPort);
    setServiceWorkPort(serviceWorkPort);
    app.get('/problem-proposals', async c => c.json(await listProblemProposals(c.env,c.get('principal'))));
    app.get('/problem-proposals/:id', async c => c.json(await getProblemProposal(c.env,c.get('principal'),c.req.param('id'))));
    app.post('/problem-proposals/detect', async c => c.json(await detectProblemProposals(c.env,c.get('principal'),await jsonBody(c))));
    for (const decision of ['accept','reject'] as const) app.post(`/problem-proposals/:id/${decision}`, async c => c.json(await decideProblemProposal(c.env,c.get('principal'),c.req.param('id'),await jsonBody(c) as any,decision)));
    const paths: Record<string, Kind> = { 'service-people': 'person', decisions: 'decision', services: 'service', incidents: 'incident', problems: 'problem', changes: 'change', releases: 'release', suppliers: 'supplier', 'software-assets': 'asset', monitors: 'monitor', 'oncall-rotations': 'oncall' };
    for (const [path, kind] of Object.entries(paths)) {
        app.get(`/${path}`, async (c) => { const items = await Promise.all((await list(c.env.DB, c.get('principal'), kind)).map(r => presentRecord(c.env, c.get('principal'), r))); return c.json({ items: items.map(r => kind === 'supplier' ? { ...r, breaches: supplierBreaches(r) } : r) }); });
        app.get(`/${path}/:id`, async (c) => {
            const r = await getService(c.env.DB, c.get('principal'), c.req.param('id'), kind);
            if (r.visibility === 'restricted')
                await audit(c, 'restricted-service-read', r.id);
            return c.json(await presentRecord(c.env, c.get('principal'), r));
        });
    }
    app.post('/decisions', async (c) => c.json(await newDecision(c.env.DB, requireRole(c, 'owner', 'operator'), await jsonBody(c)), 201));
    for (const cmd of ['choose', 'reject', 'defer'])
        app.post(`/decisions/:id/${cmd}`, async (c) => { const p = c.get('principal'); let decision = await decide(c.env.DB, p, await getService(c.env.DB, p, c.req.param('id'), 'decision'), await jsonBody(c), cmd); if (cmd === 'choose')
            decision = await advanceDecision(c.env, p, decision); return c.json(decision); });
    app.post('/decisions/:id/advance', async (c) => { const p = requireRole(c, 'owner', 'operator'); return c.json(await advanceDecision(c.env, p, await getService(c.env.DB, p, c.req.param('id'), 'decision'))); });
    app.post('/decisions/:id/amend', async (c) => { const p = c.get('principal'); return c.json(await amendDecision(c.env.DB, p, await getService(c.env.DB, p, c.req.param('id'), 'decision'), await jsonBody(c))); });
    app.post('/service-people', async (c) => { const p = requireRole(c, 'owner', 'operator', 'hr'), b = await jsonBody(c); return c.json(await create(c.env.DB, p, 'person', { name: requiredString(b.name, 'name'), externalId: requiredString(b.externalId, 'externalId'), source: requiredString(b.source, 'source'), sourceRevision: requiredString(b.sourceRevision, 'sourceRevision'), observedAt: date(b.observedAt, 'observedAt'), freshnessMs: number(b.freshnessMs, 'freshnessMs', 1), provenance: 'observed' }, { visibility: 'restricted', participants: b.participants as string[] }), 201); });
    app.post('/services', async c => c.json(await newConfigurationItem(c.env.DB, requireRole(c, 'owner', 'operator'), await jsonBody(c)), 201));
    for (const [path, kind] of [['services','service'],['incidents','incident'],['changes','change']] as const)
        app.get(`/${path}/:id/impact`, async c => { const p=c.get('principal'); return c.json(await dependencyImpact(c.env.DB,p,await getService(c.env.DB,p,c.req.param('id'),kind))); });
    app.get('/service-graph', async (c) => c.json(await serviceGraph(c.env.DB, c.get('principal'))));
    app.post('/service-graph/edges', async (c) => c.json(await addEdge(c.env.DB, requireRole(c, 'owner', 'operator'), await jsonBody(c)), 201));
    app.post('/incidents', async (c) => c.json(await newIncident(c.env.DB, requireRole(c, 'owner', 'operator'), await jsonBody(c)), 201));
    app.post('/incidents/:id/acknowledge', async c => { const p = requireRole(c, 'owner', 'operator'); return c.json(await acknowledgeIncident(c.env.DB, p, await getService(c.env.DB, p, c.req.param('id'), 'incident'), await jsonBody(c))); });
    app.get('/incidents/candidates/:serviceId', async (c) => c.json({ items: await incidentCandidates(c.env.DB, c.get('principal'), c.req.param('serviceId')) }));
    app.post('/incidents/:id/link', async (c) => {
        const p = c.get('principal'), b = await jsonBody(c), workId = requiredString(b.employeeIncidentId, 'employeeIncidentId');
        if (!workPort || !await workPort.canLink(c.env, p, workId))
            throw new ApiError(403, 'work_scope', 'Accessible employee work reference required');
        return c.json(await presentRecord(c.env, p, await linkIncident(c.env.DB, p, c.req.param('id'), number(b.revision, 'revision', 1), workId, b.correction === true)));
    });
    app.post('/incidents/:id/updates', async (c) => { const p = requireRole(c, 'owner', 'operator'); return c.json(await updateIncident(c.env.DB, p, await getService(c.env.DB, p, c.req.param('id'), 'incident'), await jsonBody(c))); });
    app.post('/incidents/:id/diagnostics', async (c) => { const p = requireRole(c, 'owner', 'operator'); return c.json(await assignDiagnostic(c.env.DB, p, await getService(c.env.DB, p, c.req.param('id'), 'incident'), await jsonBody(c))); });
    for (const [path, fn] of [['diagnostic-findings', diagnosticFinding], ['followup', incidentFollowup]] as const)
        app.post(`/incidents/:id/${path}`, async (c) => { const p = requireRole(c, 'owner', 'operator'); return c.json(await fn(c.env.DB, p, await getService(c.env.DB, p, c.req.param('id'), 'incident'), await jsonBody(c))); });
    app.post('/incidents/:id/oncall', async (c) => c.json(await routeOnCall(c.env, requireRole(c, 'owner', 'operator'), c.req.param('id'))));
    app.post('/incidents/:id/recovery', async (c) => {
        const p = requireRole(c, 'owner', 'operator'), r = await getService(c.env.DB, p, c.req.param('id'), 'incident'), b = await jsonBody(c);
        if (b.revision !== r.revision)
            throw new ApiError(409, 'revision_conflict', 'Reload current revision');
        if (!workPort || !Array.isArray(b.evidence))
            throw new ApiError(422, 'evidence', 'Execution-admitted evidence required');
        return c.json(await recordVerifiedRecovery(c.env.DB, p, r, b.evidence, e => workPort!.admitRecovery(c.env, p, e)));
    });
    app.post('/problems', async (c) => c.json(await newProblem(c.env.DB, requireRole(c, 'owner', 'operator'), await jsonBody(c)), 201));
    app.post('/problems/:id/workarounds', async c => { const p=requireRole(c,'owner','operator'); return c.json(await publishWorkaround(c.env,p,await getService(c.env.DB,p,c.req.param('id'),'problem'),await jsonBody(c))); });
    for (const [path, fn] of [['known-error', knownError], ['prevention', linkPrevention]] as const)
        app.post(`/problems/:id/${path}`, async (c) => { const p = requireRole(c, 'owner', 'operator'); return c.json(await fn(c.env.DB, p, await getService(c.env.DB, p, c.req.param('id'), 'problem'), await jsonBody(c))); });
    app.post('/changes', async (c) => c.json(await newChange(c.env.DB, requireRole(c, 'owner', 'operator'), await jsonBody(c)), 201));
    app.patch('/changes/:id', async (c) => { const p = requireRole(c, 'owner', 'operator'); return c.json(await editChange(c.env.DB, p, await getService(c.env.DB, p, c.req.param('id'), 'change'), await jsonBody(c))); });
    app.post('/changes/:id/grants', async c => { const p=requireRole(c,'owner','operator'); return c.json(await bindChangeGrants(c.env.DB,p,await getService(c.env.DB,p,c.req.param('id'),'change'),await jsonBody(c))); });
    app.post('/changes/:id/authorize', async (c) => { const p = requireRole(c, 'owner', 'approver'); return c.json(await authorizeChange(c.env.DB, p, await getService(c.env.DB, p, c.req.param('id'), 'change'), await jsonBody(c))); });
    app.post('/changes/:id/dispatch', async (c) => { const p = requireRole(c, 'owner', 'operator'); return c.json(await dispatchChange(c.env, p, await getService(c.env.DB, p, c.req.param('id'), 'change'), await jsonBody(c))); });
    app.post('/changes/:id/verify', async (c) => { const p = requireRole(c, 'owner', 'operator'); return c.json(await verifyChange(c.env, p, await getService(c.env.DB, p, c.req.param('id'), 'change'), await jsonBody(c))); });
    app.post('/suppliers', async (c) => c.json(await newSupplier(c.env.DB, requireRole(c, 'owner', 'operator'), await jsonBody(c)), 201));
    for (const [path, fn] of [['observations',supplierObservation],['review-outcome',reviewSupplierOutcome],['charges', recordCharge], ['commitments', supplierCommitment], ['handoffs', supplierHandoff], ['accept-handoff', acceptHandoff]] as const)
        app.post(`/suppliers/:id/${path}`, async (c) => { const p = requireRole(c, 'owner', 'operator'); return c.json(await fn(c.env.DB, p, await getService(c.env.DB, p, c.req.param('id'), 'supplier'), await jsonBody(c))); });
    app.post('/software-assets/:id/operations-observation', async c => { const p = requireRole(c, 'owner', 'operator'); return c.json(await recordOperationsObservation(c.env.DB, p, await getService(c.env.DB, p, c.req.param('id'), 'asset'), await jsonBody(c))); });
    app.post('/software-assets', async (c) => c.json(await newAsset(c.env.DB, requireRole(c, 'owner', 'operator'), await jsonBody(c)), 201));
    for (const [path, fn] of [['assign', assignAsset], ['return', returnAsset], ['charges', recordCharge], ['transition', assetTransition], ['usage', assetUsage], ['reclamation', reclamationDecision]] as const)
        app.post(`/software-assets/:id/${path}`, async (c) => { const p = requireRole(c, 'owner', 'operator'); return c.json(await fn(c.env.DB, p, await getService(c.env.DB, p, c.req.param('id'), 'asset'), await jsonBody(c))); });
    app.post('/monitors', async (c) => { const p = requireRole(c, 'owner', 'operator'), b = await jsonBody(c), service = await getService(c.env.DB, p, requiredString(b.serviceId, 'serviceId'), 'service'); return c.json(await create(c.env.DB, p, 'monitor', { name: requiredString(b.name, 'name'), serviceId: service.id, connectionId: requiredString(b.connectionId, 'connectionId'), freshnessMs: number(b.freshnessMs, 'freshnessMs', 1000), cohorts: strings(b.cohorts, 'cohorts'), context: recurrenceContext(b.context), status: 'unknown', observations: [] }, { visibility: 'operators', participants: b.participants as string[] }), 201); });
    app.post('/monitors/:id/events', async (c) => c.json(await ingestMonitoring(c.env, c.get('principal'), c.req.param('id'), await c.req.text(), c.req.header('X-Linen-Timestamp') || '', c.req.header('X-Linen-Signature') || '')));
    app.post('/oncall-rotations', async (c) => {
        const p = requireRole(c, 'owner', 'operator'), b = await jsonBody(c);
        await getService(c.env.DB, p, requiredString(b.serviceId, 'serviceId'), 'service');
        const start = date(b.startsAt, 'startsAt'), end = date(b.endsAt, 'endsAt');
        if (start >= end)
            throw new ApiError(400, 'window', 'Positive shift required');
        return c.json(await create(c.env.DB, p, 'oncall', { serviceId: b.serviceId, startsAt: start, endsAt: end, recipientIds: strings(b.recipientIds, 'recipientIds') }, { visibility: 'operators' }), 201);
    });
    app.get('/operations-kpis', async c => { const p = requireRole(c, 'owner', 'operator', 'auditor'); return c.json(await operationsKpis(c.env.DB, p, c.req.query('start') || '', c.req.query('end') || '', c.req.query('timezone') || '')); });
    app.get('/service-reports', async (c) => { requireRole(c, 'owner', 'operator', 'auditor'); return c.json(await serviceReport(c.env.DB, c.get('principal'), c.req.query('start') || new Date(Date.now() - 2592000000).toISOString(), c.req.query('end') || now())); });
    app.post('/services/process-due', async (c) => c.json(await processDueServices(c.env, requireRole(c, 'owner', 'operator'))));
    app.post('/service-notifications/:id/reconcile', async (c) => c.json(await reconcileNotification(c.env, requireRole(c, 'owner', 'operator'), c.req.param('id'))));
    app.get('/service-history/:id', async (c) => { const p = c.get('principal'); const record = await getService(c.env.DB, p, c.req.param('id')); if (!staff(p) && !p.roles.includes('auditor'))
        throw new ApiError(403, 'history', 'Scoped operator history required'); await audit(c, 'service-history-read', record.id); return c.json({ items: (await c.env.DB.prepare('SELECT id,actor_id,kind,data_json,created_at FROM svc_events WHERE workspace_id=? AND record_id=? ORDER BY created_at,id').bind(p.workspaceId, record.id).all()).results }); });
    app.get('/service-notifications', async (c) => {
        const p = requireRole(c, 'owner', 'operator');
        const rows = await c.env.DB.prepare('SELECT id,record_id,recipient_id,kind,state,attempts,next_at,error,provider_ref FROM svc_outbox WHERE workspace_id=? ORDER BY next_at DESC LIMIT 200').bind(p.workspaceId).all<any>();
        const accessible = [];
        for (const r of rows.results)
            try {
                await getService(c.env.DB, p, r.record_id);
                accessible.push(r);
            }
            catch { }
        return c.json({ items: accessible });
    });
}

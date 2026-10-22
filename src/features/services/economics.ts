import { currentPrincipal } from '../work/identity';
import { workReadable } from '../work/scope';
import type { Principal } from '../../platform/types';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { create, date, getService, list, mutate, number, strings, type ServiceRecord, dto, readable, type RecordRow } from './store';
export async function newSupplier(db: D1Database, p: Principal, b: Record<string, any>) {
    const services = strings(b.services, 'services');
    for (const key of services)
        await getService(db, p, key, 'service');
    return create(db, p, 'supplier', { name: requiredString(b.name, 'name'), services, contract: requiredString(b.contract, 'contract'), currency: requiredString(b.currency, 'currency'), cost: number(b.cost, 'cost'), costPeriod: requiredString(b.costPeriod, 'costPeriod'), renewalAt: date(b.renewalAt, 'renewalAt'), commitments: [], handoffs: [], charges: [], breaches: [] }, { visibility: b.visibility, participants: b.participants });
}
export async function supplierCommitment(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    const commitment = { id: id(), outcome: requiredString(b.outcome, 'outcome'), dueAt: date(b.dueAt, 'dueAt'), ownerId: requiredString(b.ownerId, 'ownerId'), state: 'pending', source: requiredString(b.source, 'source'), createdAt: now() };
    if (!await db.prepare('SELECT user_id FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(p.workspaceId, commitment.ownerId).first())
        throw new ApiError(400, 'owner', 'Active commitment owner required');
    return mutate(db, p, r, b.revision, { ...r.data, commitments: [...r.data.commitments, commitment] }, 'supplier-commitment');
}
export async function supplierHandoff(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) { const handoff = { id: id(), to: requiredString(b.to, 'to'), summary: requiredString(b.summary, 'summary'), outstanding: strings(b.outstanding, 'outstanding'), source: requiredString(b.source, 'source'), cost: number(b.cost ?? 0, 'cost'), state: 'offered', at: now() }; return mutate(db, p, r, b.revision, { ...r.data, handoffs: [...r.data.handoffs, handoff] }, 'supplier-handoff'); }
export async function acceptHandoff(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    const h = r.data.handoffs.find((x: any) => x.id === b.handoffId);
    if (!h || h.to !== p.userId)
        throw new ApiError(403, 'handoff', 'Only named receiving owner can accept');
    return mutate(db, p, r, b.revision, { ...r.data, handoffs: r.data.handoffs.map((x: any) => x.id === h.id ? { ...x, state: 'accepted', acceptedAt: now() } : x) }, 'handoff-accepted');
}
export function supplierBreaches(r: ServiceRecord, at = Date.now()) { return (r.data.commitments || []).filter((c: any) => c.state !== 'verified' && Date.parse(c.dueAt) < at).map((c: any) => ({ commitmentId: c.id, ownerId: c.ownerId, dueAt: c.dueAt, overdueMs: at - Date.parse(c.dueAt), state: c.state, source: c.source })); }
export async function newAsset(db: D1Database, p: Principal, b: Record<string, any>) { const service = await getService(db, p, requiredString(b.serviceId, 'serviceId'), 'service'); return create(db, p, 'asset', { name: requiredString(b.name, 'name'), serviceId: service.id, assetType: requiredString(b.assetType, 'assetType'), externalId: requiredString(b.externalId, 'externalId'), source: requiredString(b.source, 'source'), lifecycle: 'acquired', currency: requiredString(b.currency, 'currency'), acquisitionCost: number(b.acquisitionCost, 'acquisitionCost'), renewalAt: b.renewalAt ? date(b.renewalAt, 'renewalAt') : null, assignments: [], usage: [], costs: [], decisions: [], history: [], observedAt: date(b.observedAt, 'observedAt'), freshnessMs: number(b.freshnessMs ?? 86400000, 'freshnessMs', 1) }, { visibility: b.visibility, participants: b.participants }); }
const transitions: Record<string, string[]> = { acquired: ['assigned', 'returned', 'disposed'], assigned: ['repair', 'return-pending', 'reclamation-proposed'], repair: ['assigned', 'returned', 'disposed'], 'return-pending': ['returned'], returned: ['assigned', 'disposed'], 'reclamation-proposed': ['assigned', 'return-pending'], disposed: [] };
export async function assetTransition(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    if (!transitions[r.data.lifecycle]?.includes(b.state))
        throw new ApiError(409, 'lifecycle', 'Invalid lifecycle transition');
    if (b.state === 'disposed' && r.data.assignments.some((a: any) => !a.returnedAt))
        throw new ApiError(409, 'custody', 'Outstanding custody must be reconciled before disposal');
    const evidence = requiredString(b.evidence, 'evidence');
    if (b.state === 'assigned')
        throw new ApiError(409, 'assignment', 'Use assignment command with accountable beneficiary');
    return mutate(db, p, r, b.revision, { ...r.data, lifecycle: b.state, history: [...r.data.history, { from: r.data.lifecycle, to: b.state, evidence, actor: p.userId, at: now() }] }, 'asset-lifecycle');
}
export async function assetUsage(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    const observation = { id: id(), source: requiredString(b.source, 'source'), observedAt: date(b.observedAt, 'observedAt'), periodStart: date(b.periodStart, 'periodStart'), periodEnd: date(b.periodEnd, 'periodEnd'), activeUsers: number(b.activeUsers, 'activeUsers'), allocatedSeats: number(b.allocatedSeats, 'allocatedSeats'), cost: number(b.cost, 'cost'), currency: requiredString(b.currency, 'currency') };
    if (Date.parse(observation.periodEnd) <= Date.parse(observation.periodStart) || observation.activeUsers > observation.allocatedSeats)
        throw new ApiError(400, 'usage', 'Invalid usage period or denominator');
    return mutate(db, p, r, b.revision, { ...r.data, usage: [...r.data.usage, observation] }, 'usage-observed');
}
export async function reclamationDecision(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) { const decision = { id: id(), state: 'needs-decision', reason: requiredString(b.reason, 'reason'), affectedPeople: strings(b.affectedPeople, 'affectedPeople'), evidence: strings(b.evidence, 'evidence'), serviceId: r.data.serviceId, estimatedSaving: number(b.estimatedSaving, 'estimatedSaving'), savingStatus: 'hypothesis', createdAt: now() }; return mutate(db, p, r, b.revision, { ...r.data, decisions: [...r.data.decisions, decision] }, 'reclamation-proposed'); }
export async function serviceReport(db: D1Database, p: Principal, start: string, end: string) {
    const from = Date.parse(date(start, 'start')), to = Date.parse(date(end, 'end'));
    if (from >= to)
        throw new ApiError(400, 'range', 'Positive report range required');
    const incidents = (await db.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind='incident' AND created_at>=? AND created_at<?").bind(p.workspaceId, new Date(from).toISOString(), new Date(to).toISOString()).all<RecordRow>()).results.map(dto).filter(r => readable(p, r)), assets = await list(db, p, 'asset'), suppliers = await list(db, p, 'supplier');
    const verified = incidents.filter(r => r.data.status === 'restored');
    const completeFollowup = verified.filter(r => r.data.followup && Date.parse(r.data.followup.completeThrough) >= Date.parse(r.data.restoredAt) + r.data.followupWindowMs);
    const recurring = completeFollowup.filter(r => r.data.followup.recurrenceIncidentIds.length);
    const observedCosts = assets.flatMap(r => r.data.usage.filter((u: any) => Date.parse(u.periodStart) >= from && Date.parse(u.periodEnd) <= to).map((u: any) => ({ assetId: r.id, source: u.source, currency: u.currency, amount: u.cost })));
    return { range: { start: new Date(from).toISOString(), end: new Date(to).toISOString(), timezone: 'UTC' }, definitions: { verifiedOutcomeRate: 'Incidents independently restored across every declared cohort / all incidents opened in range', pendingExposure: 'Open incident cohort count; no inferred healthy missing scope', recurrence: 'Linked same-cause incidents; causal and complete-follow-up denominator remains explicit', cost: 'Observed usage charges only, separated by currency; missing invoices excluded and disclosed' }, incoming: incidents.length, verified: verified.length, verifiedOutcomeRate: incidents.length ? verified.length / incidents.length : null, pending: incidents.length - verified.length, pendingCohorts: incidents.filter(r => r.data.status !== 'restored').reduce((n, r) => n + (r.data.unresolvedCohorts || r.data.cohorts).length, 0), recurrence: { linked: recurring.length, completeFollowupDenominator: completeFollowup.length, rate: completeFollowup.length ? recurring.length / completeFollowup.length : null, exposureHours: completeFollowup.reduce((sum, r) => sum + r.data.followup.exposureHours, 0), missingFollowup: verified.length - completeFollowup.length, sources: completeFollowup.map(r => ({ id: r.id, source: r.data.followup.source, causeEvidence: r.data.followup.causeEvidence })), uncertainty: 'Recurrence uses attributed follow-up observations; absent follow-up is excluded and disclosed' }, costs: observedCosts, invoiceCharges: [...assets.flatMap(r => (r.data.costs || []).map((c: any) => ({ ...c, assetId: r.id }))), ...suppliers.flatMap(r => (r.data.charges || []).map((c: any) => ({ ...c, supplierId: r.id })))], unpricedAssets: assets.filter(r => !r.data.usage.length).map(r => r.id), supplierBreaches: suppliers.flatMap(r => supplierBreaches(r).map((b: any) => ({ ...b, supplierId: r.id }))), sources: incidents.map(r => ({ id: r.id, revision: r.revision })), truncated: false };
}
export async function assignAsset(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    p = await currentPrincipal(db, p);
    if (!['acquired', 'returned', 'assigned', 'repair'].includes(r.data.lifecycle))
        throw new ApiError(409, 'lifecycle', 'Asset is unavailable for assignment');
    const personId = requiredString(b.personId, 'personId');
    if (!await db.prepare('SELECT user_id FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(p.workspaceId, personId).first())
        throw new ApiError(400, 'person', 'Active beneficiary required');
    const workId=requiredString(b.workId,'workId');const work=await db.prepare('SELECT requester_id,beneficiary_id,sensitivity,department_id FROM work_records WHERE workspace_id=? AND id=?').bind(p.workspaceId,workId).first<any>();if(!work||(work.department_id&&!workReadable(p,work))||work.beneficiary_id!==personId||(work.sensitivity==='hr'&&!p.roles.some(role=>['owner','hr'].includes(role))))throw new ApiError(404,'work_scope','Matching accessible beneficiary work required');
    if (r.data.assignments.some((a: any) => !a.returnedAt))
        throw new ApiError(409, 'custody', 'Prior custody is unresolved');
    return mutate(db, p, r, b.revision, { ...r.data, lifecycle: 'assigned', assignments: [...r.data.assignments, { personId, workId: requiredString(b.workId, 'workId'), receipt: requiredString(b.receipt, 'receipt'), assignedAt: now(), source: requiredString(b.source, 'source') }] }, 'asset-assigned');
}
export async function returnAsset(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    if (!r.data.assignments.some((a: any) => !a.returnedAt))
        throw new ApiError(409, 'custody', 'No outstanding custody');
    const receipt = requiredString(b.receipt, 'receipt');
    return mutate(db, p, r, b.revision, { ...r.data, lifecycle: 'returned', assignments: r.data.assignments.map((a: any) => a.returnedAt ? a : { ...a, returnedAt: now(), returnReceipt: receipt }) }, 'asset-returned');
}
export async function recordCharge(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    const charge = { id: id(), source: requiredString(b.source, 'source'), invoice: requiredString(b.invoice, 'invoice'), amount: number(b.amount, 'amount'), currency: requiredString(b.currency, 'currency'), periodStart: date(b.periodStart, 'periodStart'), periodEnd: date(b.periodEnd, 'periodEnd'), recordedAt: now() };
    if (Date.parse(charge.periodStart) >= Date.parse(charge.periodEnd))
        throw new ApiError(400, 'period', 'Positive charge period required');
    const charges = r.data.charges || r.data.costs || [];
    if (charges.some((c: any) => c.invoice === charge.invoice))
        throw new ApiError(409, 'duplicate_invoice', 'Invoice already recorded');
    return mutate(db, p, r, b.revision, { ...r.data, [r.kind === 'supplier' ? 'charges' : 'costs']: [...charges, charge] }, 'charge-recorded');
}
export async function supplierObservation(db:D1Database,p:Principal,r:ServiceRecord,b:Record<string,any>){const commitment=r.data.commitments.find((c:any)=>c.id===b.commitmentId);if(!commitment)throw new ApiError(404,'commitment','Supplier commitment not found');if(!['met','missed','unknown'].includes(b.outcome))throw new ApiError(400,'outcome','Observed supplier outcome required');const observation={id:id(),outcome:b.outcome,source:requiredString(b.source,'source'),evidence:requiredString(b.evidence,'evidence'),observedAt:date(b.observedAt,'observedAt'),observer:p.userId,recordedAt:now()};if(Date.parse(observation.observedAt)>Date.now())throw new ApiError(400,'observation','Future observations are not evidence');return mutate(db,p,r,b.revision,{...r.data,commitments:r.data.commitments.map((c:any)=>c.id===commitment.id?{...c,state:b.outcome==='met'?'reported-met':b.outcome,observations:[...(c.observations||[]),observation]}:c)},'supplier-outcome-observed')}
export async function reviewSupplierOutcome(db:D1Database,p:Principal,r:ServiceRecord,b:Record<string,any>){const commitment=r.data.commitments.find((c:any)=>c.id===b.commitmentId),observation=commitment?.observations?.at(-1);if(!observation||observation.outcome!=='met'||observation.observer===p.userId)throw new ApiError(409,'independent_review','Separate reviewer and reported evidence of meeting commitment required');const evidence=requiredString(b.evidence,'evidence');return mutate(db,p,r,b.revision,{...r.data,commitments:r.data.commitments.map((c:any)=>c.id===commitment.id?{...c,state:'verified',review:{reviewer:p.userId,evidence,at:now(),kind:'independent-human-observation'}}:c)},'supplier-outcome-reviewed')}

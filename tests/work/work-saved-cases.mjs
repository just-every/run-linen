import assert from 'node:assert/strict';
/**
 * REPORT-004: automate a request type; the work-saved report shows prior and current
 * touches/minutes by role, model/provider/labor USD per verified outcome and the failures
 * in the same period, through public work, report and execution doors.
 */
export async function workSavedChecks({ api, ok, actor, db }) {
  const at = () => new Date().toISOString(), tick = () => new Promise(resolve => setTimeout(resolve, 15));
  // Request type is the catalog service name; a second provider group backs the same service.
  const catalogs = {};
  for (const target of ['design-tool', 'design-tool-regional'])
    catalogs[target] = await ok('/catalog', { name: 'Design tool access', kind: 'access', target, ownerId: 'owner' });
  catalogs['analytics-tool'] = await ok('/catalog', { name: 'Analytics access', kind: 'access', target: 'analytics-tool', ownerId: 'owner' });
  async function request(key, { classified = false, target = 'design-tool' } = {}) {
    let work = await ok('/work', { title: key, body: 'Design tool access for project work', deduplicationKey: key }, 'employee');
    // Automated intake classifies through the configured model before fulfilment is planned.
    if (classified) work = await classify(work);
    await ok(`/work/${work.id}/fulfilment`, { catalogId: catalogs[target].id, beneficiaryId: 'employee', purpose: 'Project work', expiresAt: null }, 'employee');
    await ok('/grants', { id: key, principalId: actor.id, action: 'group.add', actionVersion: 1, target,
      beneficiaryId: 'provider-employee-distinct', localBeneficiaryId: 'employee', connectionId: 'graph', verifierConnectionId: 'probe',
      validFrom: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 86_400_000).toISOString(), maxUses: 5, conditions: { workId: work.id } });
    const resolved = await ok('/test/standing', { workId: work.id, target, beneficiaryId: 'employee', kind: 'access', expiresAt: null }, 'employee');
    const plan = await ok('/plans/granted', { workId: work.id, revision: work.revision, steps: [resolved.step], idempotencyKey: key }, 'employee');
    assert.equal(plan.operations.length, 1);
    await ok('/test/link', { workId: work.id, planId: plan.planId, operationIds: plan.operations.map(o => o.id) }, 'employee');
    return { work, operation: plan.operations[0] };
  }
  async function fulfil({ operation }) {
    assert.equal((await ok('/test/run', { operationId: operation.id }, actor.id)).state, 'effect_verified');
    assert.equal((await ok('/test/verify', { operationId: operation.id, verifierVersion: 1 }, actor.id)).state, 'verified');
    await ok('/work/process-due', {});
  }
  async function classify(work) {
    const state = await ok(`/work/${work.id}/classification`, undefined, 'employee');
    await ok(`/work/${work.id}/classification/propose`, { revision: state.revision, workRevision: state.workRevision }, 'employee');
    return (await ok(`/work/${work.id}`, undefined, 'employee')).work;
  }
  const time = (work, key, minutes, user = 'owner', extra = {}) =>
    ok(`/work/${work.id}/time`, { source: 'manual', minutes, deduplicationKey: key, note: 'Handled design tool access', ...extra }, user);

  // Baseline: people review, dispatch and confirm the request by hand.
  const baselineFrom = at(); await tick();
  const manual = await request('report-baseline-design');
  await time(manual.work, 'report-employee-follow-up', 5, 'employee');
  await time(manual.work, 'report-agent-handling', 20);
  await time(manual.work, 'report-vendor-check', 10, 'owner', { effortRole: 'vendor' });
  await fulfil(manual);
  await tick(); const boundary = at(); await tick();

  // Current: the same request type is automated; one fulfils, one fails at the provider.
  await ok('/test/model-connection', {});
  const automated = await request('report-automated-design', { classified: true });
  await fulfil(automated);
  const failing = await request('report-automated-design unpriced', { classified: true, target: 'design-tool-regional' });
  await ok('/test/deny-write', { target: 'design-tool-regional' });
  assert.equal((await ok('/test/run', { operationId: failing.operation.id }, actor.id)).state, 'failed');
  await ok('/work/process-due', {});
  // AGENT-006: a second request type is still handled by hand in the current window.
  const analytics = await request('report-analytics-manual', { target: 'analytics-tool' });
  await time(analytics.work, 'report-analytics-handling', 25);
  await fulfil(analytics);
  // A real queued plan has human effort but no verified current-window outcome.
  catalogs['pending-tool'] = await ok('/catalog', { name: 'Pending tool access', kind: 'access', target: 'pending-tool', ownerId: 'owner' });
  const pending = await request('synthetic-linen-601', { target: 'pending-tool' });
  await time(pending.work, 'synthetic-linen-602', 120);
  // REPORT-004 point 5: reply, summary and employee-intake calls that named a request are charged to it. The request below
  // gets three priced calls, one dispatch whose usage the provider omits, and an unrelated call that names no request.
  const named = async (kind, omit = false) => {
    await ok('/test/model-usage', { omit });
    return ok(`/work/${pending.work.id}/response-assistance`, { kind, articleIds: [] });
  };
  const reply = await named('reply'), summary = await named('summary'), unpricedReply = await named('reply', true);
  await ok('/test/model-usage', { omit: false });
  for (const draft of [reply, summary, unpricedReply]) assert.equal(draft.sent, false);
  const interpreted = await ok(`/work/${pending.work.id}/interpret`, {}, 'employee');
  assert.equal(interpreted.state, 'proposed', JSON.stringify(interpreted));
  const unrelated = await ok('/intelligence/intake', { connectionId: 'model', text: 'Plan a printer fix' });
  assert.equal(unrelated.chargeStatus, 'estimated');
  await tick(); const currentTo = at();
  // A priced call made after the window closes names the same request but belongs to a later window.
  await named('summary');

  // Only the owner declares role rates; they are costing assumptions validated per role.
  assert.equal((await api('/reports/labor-rates', { rates: { agent: 60 } }, 'employee')).status, 403);
  assert.equal((await api('/reports/labor-rates', { rates: { owner: -1 } })).status, 422);
  assert.equal((await api('/reports/labor-rates', { rates: { intern: 10 } })).status, 422);
  assert.deepEqual((await ok('/reports/labor-rates', { rates: { owner: 90, employee: 40 } })).rates, { owner: 90, employee: 40 });
  const executionTables = ['execution_grants', 'execution_grant_revocations', 'execution_plans',
    'execution_decisions', 'execution_operations', 'execution_outbox', 'execution_attempts',
    'execution_provider_attempts', 'execution_receipts', 'execution_verifications', 'execution_fences'];
  const executionState = async () => Object.fromEntries(await Promise.all(executionTables.map(async table =>
    [table, (await db.prepare(`SELECT * FROM ${table} WHERE workspace_id='w' ORDER BY rowid`).all()).results])));
  const beforeProposalReads = await executionState(), beforeDispatches = await ok('/test/writes');
  for (const table of ['execution_grants', 'execution_plans', 'execution_operations', 'execution_attempts'])
    assert.ok(beforeProposalReads[table].length > 0, `${table}: the inert-read check uses populated execution records`);
  const path = `/reports/work-saved?baselineFrom=${baselineFrom}&baselineTo=${boundary}&currentFrom=${boundary}&currentTo=${currentTo}`;
  const read = async (type = 'Design tool access') => (await ok(path)).requestTypes.find(row => row.requestType === type);
  let row = await read();
  assert.deepEqual(row.baseline.labor.unpricedRoles, ['vendor'], 'an unpriced role is unknown cost, not $0');
  assert.equal(row.baseline.costComplete, false);
  await ok('/reports/labor-rates', { rates: { vendor: 60.004 } });
  row = await read();
  const { baseline, current } = row;
  // Prior human touches and minutes by role, at the declared rates.
  assert.equal(baseline.incoming, 1); assert.equal(baseline.touches, 3); assert.equal(baseline.activeMinutes, 35);
  assert.deepEqual(baseline.byRole, { employee: { touches: 1, activeMinutes: 5 }, owner: { touches: 1, activeMinutes: 20 }, vendor: { touches: 1, activeMinutes: 10 } });
  assert.deepEqual(baseline.labor.unpricedRoles, []);
  assert.ok(Math.abs(baseline.labor.usd - (5 / 60 * 40 + 20 / 60 * 90 + 10 / 60 * 60)) < 1e-9);
  assert.equal(baseline.verified, 1); assert.equal(baseline.failed, 0); assert.equal(baseline.model.attempts, 0);
  assert.ok(baseline.provider.attempts >= 1); assert.equal(baseline.provider.unknownCharges, baseline.provider.attempts);
  assert.ok(Math.abs(baseline.knownCostPerVerifiedOutcomeUsd - baseline.labor.usd) < 1e-9);
  assert.equal(baseline.costComplete, false, 'provider dispatches never receive an invented charge');
  // Current: no human touches, request-attributed model charges, and the failure in the same period.
  assert.equal(current.incoming, 2); assert.equal(current.touches, 0); assert.equal(current.activeMinutes, 0);
  assert.equal(current.verified, 1); assert.equal(current.failed, 1); assert.equal(current.pending, 0);
  assert.equal(current.model.attempts, 2); assert.equal(current.model.unknownCharges, 1);
  assert.ok(Math.abs(current.model.estimatedUsd - (120 * 1 + 70 * 2) / 1e6) < 1e-12);
  assert.ok(current.provider.attempts >= 2); assert.equal(current.provider.unknownCharges, current.provider.attempts);
  assert.ok(Math.abs(current.knownCostPerVerifiedOutcomeUsd - current.model.estimatedUsd) < 1e-12);
  assert.equal(current.costComplete, false);
  // Point 5: the request's model charge is its actual request-bound attempts at the configured prices; nothing else.
  const attemptRows = async work => (await db.prepare('SELECT request_id requestId,cost_usd costUsd,charge_status chargeStatus,created_at createdAt FROM intelligence_attempts WHERE workspace_id=? AND work_id=? ORDER BY created_at,rowid').bind('w', work.id).all()).results;
  const purposes = rows => rows.map(r => r.requestId.replace(/^fixture-|-\d+$/g, ''));
  const bound = await attemptRows(pending.work), inWindow = bound.filter(a => a.createdAt >= boundary && a.createdAt < currentTo);
  assert.deepEqual(purposes(bound), ['ticket_reply', 'ticket_summary', 'ticket_reply', 'employee_intake', 'ticket_summary'], 'reply, summary and employee-intake calls each left a request-bound attempt');
  assert.deepEqual(purposes(inWindow), purposes(bound).slice(0, 4), 'the call after the window is out of window');
  const price = (input, output) => (input * 1 + output * 2) / 1e6;
  assert.deepEqual(inWindow.map(a => a.chargeStatus), ['estimated', 'estimated', 'unknown', 'estimated']);
  assert.ok(Math.abs(inWindow[0].costUsd - price(150, 100)) < 1e-12); assert.ok(Math.abs(inWindow[1].costUsd - price(200, 60)) < 1e-12);
  assert.equal(inWindow[2].costUsd, null, 'a dispatch without usage records no invented price');
  assert.ok(Math.abs(inWindow[3].costUsd - price(90, 40)) < 1e-12);
  const pendingModel = (await read('Pending tool access')).current.model;
  assert.equal(pendingModel.attempts, 4); assert.equal(pendingModel.unknownCharges, 1);
  assert.ok(Math.abs(pendingModel.estimatedUsd - (price(150, 100) + price(200, 60) + price(90, 40))) < 1e-12, 'estimates add the configured-price cost of reply, summary and employee-intake');
  const pendingCost = (await read('Pending tool access')).current;
  assert.equal(pendingCost.costComplete, false, 'an unknown charge keeps the cost labelled known-only');
  assert.equal(pendingCost.knownCostPerVerifiedOutcomeUsd, null);
  assert.equal((await read('Pending tool access')).baseline, null, 'no call of the current window reaches the baseline window');
  const windowed = (await db.prepare("SELECT charge_status chargeStatus FROM intelligence_attempts WHERE workspace_id='w' AND work_id IS NULL AND created_at>=? AND created_at<?").bind(boundary, currentTo).all()).results;
  assert.equal(windowed.length, 1, 'the unrelated call named no request');
  assert.equal(windowed[0].chargeStatus, 'estimated');
  const reported = (await ok(path)).requestTypes.reduce((n, r) => n + r.current.model.attempts, 0);
  const requested = (await db.prepare("SELECT COUNT(*) n FROM intelligence_attempts WHERE workspace_id='w' AND work_id IS NOT NULL AND charge_status<>'not_dispatched' AND created_at>=? AND created_at<?").bind(boundary, currentTo).first()).n;
  assert.equal(reported, requested, 'the report counts every request-bound attempt in the window and not the unrelated call');
  // Audience, ranges and the effort member of /reports/work carry the same cost basis.
  assert.equal((await api(path, undefined, 'employee')).status, 403);
  assert.equal((await api(path, undefined, 'employee', 'other')).status, 403);
  assert.equal((await api(`/reports/work-saved?baselineFrom=${baselineFrom}&baselineTo=${currentTo}&currentFrom=${boundary}&currentTo=${currentTo}`)).status, 422);
  assert.equal((await api(`/reports/work-saved?baselineFrom=${boundary}&baselineTo=${baselineFrom}&currentFrom=${boundary}&currentTo=${currentTo}`)).status, 422);
  const effort = (await ok(`/reports/effort?from=${boundary}&to=${currentTo}`)).byRequestType.find(r => r.requestType === 'Design tool access');
  assert.equal(effort.failed, 1); assert.equal(effort.model.unknownCharges, 1);
  // AGENT-006: REPORT-004's report for two request types names the next automation by human work it removes.
  const report = await ok(path), proposal = report.automationProposal;
  const pendingRow = report.requestTypes.find(r => r.requestType === 'Pending tool access');
  assert.equal(pendingRow.current.incoming, 1);
  assert.equal(pendingRow.current.pending, 1);
  assert.equal(pendingRow.current.verified, 0);
  assert.equal(pendingRow.current.activeMinutes, 120);
  assert.ok(proposal.notEnoughEvidence.includes(pendingRow.requestType));
  assert.ok(proposal.ranked.every(r => r.requestType !== pendingRow.requestType));
  assert.notEqual(proposal.next?.requestType, pendingRow.requestType);
  assert.deepEqual(proposal.ranked.map(r => [r.rank, r.requestType, r.humanMinutesToRemove]), [[1, 'Analytics access', 25], [2, 'Design tool access', 0]],
    'AGENT-006 ranks by human minutes per verified outcome × verified outcomes, not tickets closed');
  assert.deepEqual(proposal.next, { requestType: 'Analytics access', humanMinutesToRemove: 25 });
  assert.equal(proposal.ranked[1].realizedSavingMinutesPerOutcome, 35, 'AGENT-006 the automated type shows its realized saving as evidence');
  assert.equal(proposal.ranked[1].evidence.current.failed, 1);
  assert.equal(proposal.ranked[0].evidence.baseline, null);
  assert.ok('knownCostPerVerifiedOutcomeUsd' in proposal.ranked[0].evidence.current, 'AGENT-006 cost per verified outcome is evidence');
  const audited = (await ok(path, undefined, 'auditor')).automationProposal;
  assert.deepEqual(audited, proposal, 'AGENT-006 the proposal has REPORT-004\'s audience: an auditor reads the same ranking and evidence');
  const cohort = await ok(`${path}&requestType=${encodeURIComponent('Design tool access')}`);
  assert.deepEqual(cohort.requestTypes.map(r => r.requestType), ['Design tool access'], 'AGENT-006 the owner chooses the cohort');
  assert.deepEqual(cohort.automationProposal.ranked.map(r => r.requestType), ['Design tool access']);
  const empty = (await ok(`/reports/work-saved?baselineFrom=${baselineFrom}&baselineTo=${boundary}&currentFrom=${currentTo}&currentTo=${new Date(Date.parse(currentTo) + 1000).toISOString()}`)).automationProposal;
  assert.deepEqual(empty.ranked, []); assert.equal(empty.next, null);
  const pendingOnly = (await ok(`${path}&requestType=${encodeURIComponent(pendingRow.requestType)}`)).automationProposal;
  assert.deepEqual(pendingOnly.notEnoughEvidence, [pendingRow.requestType]);
  assert.deepEqual(pendingOnly.ranked, []); assert.equal(pendingOnly.next, null);
  assert.deepEqual(await executionState(), beforeProposalReads,
    'proposal reads never issue grants, create or approve plans, enqueue outbox work or change dispatch records');
  assert.deepEqual(await ok('/test/writes'), beforeDispatches, 'proposal reads never dispatch a provider write');
  await ok('/reports/labor-rates', { rates: { vendor: null } });
  assert.deepEqual((await ok('/reports/labor-rates')).rates, { owner: 90, employee: 40 });
  assert.deepEqual((await read()).baseline.labor.unpricedRoles, ['vendor']);
  return { baseline, current };
}

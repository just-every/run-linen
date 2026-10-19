import assert from 'node:assert/strict';
/**
 * REPORT-004: automate a request type; the work-saved report shows prior and current
 * touches/minutes by role, model/provider/labor USD per verified outcome and the failures
 * in the same period, through public work, report and execution doors.
 */
export async function workSavedChecks({ api, ok, actor }) {
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
  await tick(); const currentTo = at();

  // Only the owner declares role rates; they are costing assumptions validated per role.
  assert.equal((await api('/reports/labor-rates', { rates: { agent: 60 } }, 'employee')).status, 403);
  assert.equal((await api('/reports/labor-rates', { rates: { owner: -1 } })).status, 422);
  assert.equal((await api('/reports/labor-rates', { rates: { intern: 10 } })).status, 422);
  assert.deepEqual((await ok('/reports/labor-rates', { rates: { owner: 90, employee: 40 } })).rates, { owner: 90, employee: 40 });
  const path = `/reports/work-saved?baselineFrom=${baselineFrom}&baselineTo=${boundary}&currentFrom=${boundary}&currentTo=${currentTo}`;
  const read = async () => (await ok(path)).requestTypes.find(row => row.requestType === 'Design tool access');
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
  // Audience, ranges and the effort member of /reports/work carry the same cost basis.
  assert.equal((await api(path, undefined, 'employee')).status, 403);
  assert.equal((await api(path, undefined, 'employee', 'other')).status, 403);
  assert.equal((await api(`/reports/work-saved?baselineFrom=${baselineFrom}&baselineTo=${currentTo}&currentFrom=${boundary}&currentTo=${currentTo}`)).status, 422);
  assert.equal((await api(`/reports/work-saved?baselineFrom=${boundary}&baselineTo=${baselineFrom}&currentFrom=${boundary}&currentTo=${currentTo}`)).status, 422);
  const effort = (await ok(`/reports/effort?from=${boundary}&to=${currentTo}`)).byRequestType.find(r => r.requestType === 'Design tool access');
  assert.equal(effort.failed, 1); assert.equal(effort.model.unknownCharges, 1);
  // AGENT-006: REPORT-004's report for two request types names the next automation by human work it removes.
  const proposal = (await ok(path)).automationProposal;
  assert.deepEqual(proposal.ranked.map(r => [r.rank, r.requestType, r.humanMinutesToRemove]), [[1, 'Analytics access', 25], [2, 'Design tool access', 0]],
    'AGENT-006 ranks by human minutes per verified outcome × verified outcomes, not tickets closed');
  assert.deepEqual(proposal.next, { requestType: 'Analytics access', humanMinutesToRemove: 25 });
  assert.equal(proposal.ranked[1].realizedSavingMinutesPerOutcome, 35, 'AGENT-006 the automated type shows its realized saving as evidence');
  assert.equal(proposal.ranked[1].evidence.current.failed, 1);
  assert.equal(proposal.ranked[0].evidence.baseline, null);
  assert.ok('knownCostPerVerifiedOutcomeUsd' in proposal.ranked[0].evidence.current, 'AGENT-006 the owner sees cost evidence');
  const audited = (await ok(path, undefined, 'auditor')).automationProposal;
  assert.deepEqual(audited.ranked.map(r => r.requestType), proposal.ranked.map(r => r.requestType));
  assert.ok(!('knownCostPerVerifiedOutcomeUsd' in audited.ranked[0].evidence.current), 'AGENT-006 non-owners see the ranking without monetary values');
  const cohort = await ok(`${path}&requestType=${encodeURIComponent('Design tool access')}`);
  assert.deepEqual(cohort.requestTypes.map(r => r.requestType), ['Design tool access'], 'AGENT-006 the owner chooses the cohort');
  assert.deepEqual(cohort.automationProposal.ranked.map(r => r.requestType), ['Design tool access']);
  const empty = (await ok(`/reports/work-saved?baselineFrom=${baselineFrom}&baselineTo=${boundary}&currentFrom=${currentTo}&currentTo=${new Date(Date.parse(currentTo) + 1000).toISOString()}`)).automationProposal;
  assert.deepEqual(empty.ranked, []); assert.equal(empty.next, null);
  await ok('/reports/labor-rates', { rates: { vendor: null } });
  assert.deepEqual((await ok('/reports/labor-rates')).rates, { owner: 90, employee: 40 });
  assert.deepEqual((await read()).baseline.labor.unpricedRoles, ['vendor']);
  return { baseline, current };
}

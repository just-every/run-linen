import assert from 'node:assert/strict';

/** F5: real authenticated protocol door; deterministic local replay, never external-service verification. */
export async function protocolChecks({ api, owner, employee, harness, restart, workspaceId, userId }) {
  const assumptions = { singleAtomicStore: true, monotonicFences: true, independentReadback: true, currentAuthorityAtAdmission: true };
  const event = (kind, actor = 'coordinator-a', fence = 1, extra = {}) => ({ kind, actor, fence, ...extra });
  const safe = [event('claim'), event('dispatch'), event('reconcile', undefined, undefined, { effect: 'present' }), event('admit')];
  const submit = async (events, extra = {}, auth = owner) => {
    const response = await api('/intelligence/protocol/check', 'POST', { assumptions, events, ...extra }, auth);
    assert.equal(response.status, 200, 'F5 authenticated protocol replay ' + JSON.stringify(response.value));
    return response.value;
  };
  const good = await submit(safe);
  assert.equal(good.valid, true, 'F5 fresh readback permits the authorized coordinator to admit');
  assert.deepEqual(good.trace.map(step => step.event), safe, 'F5 evidence retains the supplied replay');
  const ids = [good.id];
  for (const actor of ['coordinator-a', 'coordinator-b']) for (const fence of [0, 1, 2]) {
    const counterexample = await submit([event('claim'), event('dispatch'), event('timeout'), event('takeover', actor, fence)]);
    ids.push(counterexample.id);
    assert.equal(counterexample.valid, false, 'F5 uncertain effects prevent takeover in every selected interleaving');
    assert.equal(counterexample.counterexample.at(-1).violation, 'unknown_effect_requires_reconciliation');
    assert.equal(counterexample.counterexample.at(-1).state.unknown, true);
  }
  const reclaimed = await submit([event('claim'), event('dispatch'), event('timeout'), event('reconcile', undefined, undefined, { effect: 'absent' }),
    event('takeover', 'coordinator-b', 2), event('dispatch', 'coordinator-b', 2), event('reconcile', 'coordinator-b', 2, { effect: 'present' }), event('admit', 'coordinator-b', 2)]);
  ids.push(reclaimed.id);
  assert.equal(reclaimed.valid, true, 'F5 absent readback and a newer fence allow safe takeover');
  const revoked = [...safe.slice(0, 3), event('revoke'), event('admit')];
  const blocked = await submit(revoked), mutant = await submit(revoked, { mutation: true });
  ids.push(blocked.id, mutant.id);
  assert.equal(blocked.valid, false, 'F5 revoked admission is rejected');
  assert.equal(blocked.counterexample.at(-1).violation, 'unsafe_admission');
  assert.equal(mutant.valid, false, 'F5 independent invariant catches a deliberately bypassed admission guard');
  assert.equal(mutant.counterexample.at(-1).violation, 'invariant_broken_by_mutation');
  const count = async () => (await (await harness.db).prepare('SELECT COUNT(*) total FROM intelligence_protocol_runs WHERE workspace_id=?').bind(workspaceId).first()).total;
  const before = await count();
  for (const missing of [false, undefined]) {
    const invalid = { ...assumptions, independentReadback: missing };
    const response = await api('/intelligence/protocol/check', 'POST', { assumptions: invalid, events: safe }, owner);
    assert.equal(response.status, 400, 'F5 absent or violated assumption invalidates the conclusion');
  }
  assert.equal((await api('/intelligence/protocol/check', 'POST', { assumptions, events: safe }, employee)).status, 403, 'F5 employee cannot record a protocol conclusion');
  assert.equal((await api('/intelligence/protocol/check', 'POST', { assumptions, events: safe })).status, 401, 'F5 session required');
  assert.equal(await count(), before, 'F5 refused checks do not persist a conclusion');
  const stored = await (await harness.db).prepare('SELECT * FROM intelligence_protocol_runs WHERE id=?').bind(good.id).first();
  assert.equal(stored.workspace_id, workspaceId, 'F5 result belongs to the authenticated workspace');
  assert.equal(stored.actor_id, userId, 'F5 result retains the authenticated actor');
  assert.deepEqual(JSON.parse(stored.input_json), { assumptions, events: safe });
  assert.deepEqual(JSON.parse(stored.result_json).trace, good.trace);
  await restart();
  const retained = await (await harness.db).prepare('SELECT id FROM intelligence_protocol_runs WHERE workspace_id=?').bind(workspaceId).all();
  assert.ok(ids.every(id => retained.results.some(row => row.id === id)), 'F5 safe, counterexample and mutant records survive restart');
  const afterRestart = await api('/intelligence/protocol/check', 'POST', { assumptions, events: safe }, owner);
  assert.equal(afterRestart.status, 200, 'F5 native session and protocol door remain usable after restart');
  console.log('PASS F5 public protocol door: useful uncertainty/authority properties, selected competing interleavings, reconciliation, counterexamples, mutation, false/missing assumptions, current role, attributed D1 evidence and restart persistence; local replay only');
}

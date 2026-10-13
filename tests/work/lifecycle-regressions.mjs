import assert from 'node:assert/strict';

export async function lifecycleReplayChecks(api, input, lifecycleId) {
  const before = (await api(`/lifecycle/${lifecycleId}`)).value;
  const mutations = {
    added: [...input.added, 'unapproved-new-right'], removed: ['new-removal'], retained: ['independent-right'],
    deviceIds: [...input.deviceIds, 'different-device'], ownerId: 'different-owner',
    identityTarget: 'different@example.test', urgent: true, expiresAt: '2027-01-01T00:00:00Z',
    effectiveAt: '2026-10-01T00:00:00Z', timezone: 'UTC', kind: 'move',
  };
  for (const [field, value] of Object.entries(mutations)) {
    const changed = await api('/lifecycle', { ...input, [field]: value });
    assert.equal(changed.status, 409, `${field} must not change an admitted HR revision: ${JSON.stringify(changed)}`);
    assert.deepEqual((await api(`/lifecycle/${lifecycleId}`)).value, before, `${field} must have no partial side effect`);
  }
  const replay = await api('/lifecycle', input);
  assert.equal(replay.status, 201, JSON.stringify(replay));
  assert.equal(replay.value.lifecycleId, lifecycleId);
  assert.deepEqual((await api(`/lifecycle/${lifecycleId}`)).value, before, 'Exact replay never recreates or resets cancelled duties');
}

export async function lifecycleIntegrationChecks(api, db, input) {
  await db.prepare("INSERT INTO users VALUES('hr-feed','hr-feed@test','HR feed','unused','2026-01-01')").run();
  await db.prepare("INSERT INTO memberships VALUES('a','hr-feed','[\"integration\"]',1)").run();
  await db.prepare("INSERT INTO workspace_settings(workspace_id,settings_json,revision) VALUES('a',?,1) ON CONFLICT(workspace_id) DO UPDATE SET settings_json=excluded.settings_json")
    .bind(JSON.stringify({ hrSourceConnectionId: 'selected-hr' })).run();
  const principal = { 'x-user': 'hr-feed', 'x-roles': '["integration"]' };
  const selected = { ...input, source: 'selected-hr', sourceRevision: 1 };
  assert.equal((await api('/lifecycle', { ...selected, source: 'unselected-hr' }, principal)).status, 403);
  const result = await api('/lifecycle', selected, principal);
  assert.equal(result.status, 201, JSON.stringify(result));
  assert.equal(result.value.work.beneficiary_id, input.personId);
  assert.equal(result.value.work.requester_id, 'hr-feed');
  assert.equal((await api('/work', { title: 'Unauthorised cross-person work', body: 'No general authority', beneficiaryId: input.personId, deduplicationKey: 'integration-escape' }, principal)).status, 403);
  assert.equal((await api('/lifecycle', { ...selected, added: ['another-right'] }, principal)).status, 409);
  const rows = await db.prepare('SELECT * FROM work_obligations WHERE lifecycle_id=?').bind(result.value.lifecycleId).all();
  assert.equal(rows.results.length, 3);
  // Two deliveries racing for the same source cannot commit a second work/intake/duty set.
  const concurrent = await Promise.all([1, 2].map(() => api('/lifecycle', { ...selected, sourceRevision: 2 }, principal)));
  assert.ok(concurrent.every(r => [201, 409].includes(r.status)), JSON.stringify(concurrent));
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM work_lifecycle WHERE source='selected-hr' AND source_revision=2").first()).n, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM work_records WHERE dedup_key=?").bind(`hr:selected-hr:${input.personId}:2`).first()).n, 1);
  const leave = await api('/lifecycle', {...input, source:'leave-with-contract-end',kind:'leave',added:[],deviceIds:[],expiresAt:'2027-01-01T00:00:00Z'});
  assert.equal(leave.status,201,JSON.stringify(leave));
  const security=(await api('/lifecycle/'+leave.value.lifecycleId)).value.obligations;
  assert.equal(security.length,2,'A later contract end never duplicates or delays departure security duties');
  assert.ok(security.every(o=>o.due_at===new Date(input.effectiveAt).toISOString()));
  console.log('PASS HR material replay before/after cancellation, selected-source integration and atomic race');
}

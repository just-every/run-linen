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
  const leave = await api('/lifecycle', {...input, source:'leave-with-contract-end',kind:'leave',added:[],deviceIds:[],expiresAt:'2027-01-01T00:00:00Z',sponsorId:'owner'});
  assert.equal(leave.status,201,JSON.stringify(leave));
  const security=(await api('/lifecycle/'+leave.value.lifecycleId)).value.obligations;
  assert.equal(security.length,2,'A later contract end never duplicates or delays departure security duties');
  assert.ok(security.every(o=>o.due_at===new Date(input.effectiveAt).toISOString()));
  console.log('PASS HR material replay before/after cancellation, selected-source integration and atomic race');
}

/** LIFE-006: a contractor end date names a sponsor, who is reminded 72 hours before and alone re-attests. */
export async function contractorSponsorChecks(api, db, input) {
  const sponsor = { 'x-user': 'employee', 'x-roles': '["employee"]' };
  const iso = ms => new Date(Date.now() + ms).toISOString();
  const contractor = { ...input, source: 'contractor-hr', kind: 'move', added: [], removed: [], retained: [], deviceIds: [], effectiveAt: iso(-60000), timezone: 'UTC' };
  assert.equal((await api('/lifecycle', { ...contractor, expiresAt: iso(71 * 3600000) })).status, 422, 'LIFE-006 an end date without a sponsor is refused');
  assert.equal((await api('/lifecycle', { ...contractor, expiresAt: iso(71 * 3600000), sponsorId: 'nobody' })).status, 422);
  const ending = iso(71 * 3600000);
  const life = await api('/lifecycle', { ...contractor, expiresAt: ending, sponsorId: 'employee' });
  assert.equal(life.status, 201, JSON.stringify(life));
  const id = life.value.lifecycleId;
  const reminded = (await api('/work/process-due', {})).value.items.find(r => r.id === id);
  assert.equal(reminded?.state, 'sponsor_reminded', 'LIFE-006 an end date within three days reminds the sponsor');
  const reminder = await api(`/work/${reminded.workId}`, undefined, sponsor);
  assert.equal(reminder.status, 200, 'LIFE-006 the reminder reaches the sponsor in their own requests');
  assert.equal(JSON.parse(reminder.value.work.context_json).sponsorReminder.lifecycleId, id);
  assert.ok(!(await api('/work/process-due', {})).value.items.some(r => r.id === id), 'LIFE-006 one reminder per end date');
  assert.equal((await api('/lifecycle/sponsored', undefined, sponsor)).value.items.find(i => i.lifecycleId === id).expiresAt, ending);
  assert.equal((await api(`/lifecycle/${id}/reattest`, { expiresAt: iso(10 * 86400000) })).status, 404, 'LIFE-006 only the sponsor re-attests');
  assert.equal((await api(`/lifecycle/${id}/reattest`, { expiresAt: iso(3600000) }, sponsor)).status, 422);
  const extended = iso(10 * 86400000);
  const reattested = await api(`/lifecycle/${id}/reattest`, { expiresAt: extended }, sponsor);
  assert.equal(reattested.status, 200, JSON.stringify(reattested));
  const moved = (await db.prepare('SELECT due_at FROM work_obligations WHERE lifecycle_id=? AND is_expiry=1').bind(id).all()).results;
  assert.ok(moved.length === 2 && moved.every(o => o.due_at === extended), 'LIFE-006 re-attestation moves both expiry duties');
  assert.ok(await db.prepare("SELECT 1 FROM audit_events WHERE action='lifecycle.sponsor_reattested' AND target=?").bind(id).first());
  // The end instant must still be ahead after admission and the first process-due on a slow runner.
  const endAt = iso(6000);
  const lapse = await api('/lifecycle', { ...contractor, source: 'contractor-hr-lapse', expiresAt: endAt, sponsorId: 'employee' });
  assert.equal(lapse.status, 201, JSON.stringify(lapse));
  const duties = async () => (await db.prepare('SELECT id,kind,state,due_at,depends_on FROM work_obligations WHERE lifecycle_id=? AND is_expiry=1 ORDER BY kind').bind(lapse.value.lifecycleId).all()).results;
  await api('/work/process-due', {});
  assert.ok((await duties()).every(o => o.state === 'pending' && o.due_at === endAt), 'LIFE-006 access stays until the end instant');
  await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(endAt) - Date.now() + 100)));
  await api('/work/process-due', {});
  const [disable, revoke] = await duties();
  assert.equal(disable.kind, 'identity.disable'); assert.notEqual(disable.state, 'pending', 'LIFE-006 without re-attestation the account disable starts at the end instant');
  assert.equal(revoke.depends_on, disable.id, 'LIFE-006 session revocation follows the verified disable on the same account');
  assert.equal((await api(`/lifecycle/${lapse.value.lifecycleId}/reattest`, { expiresAt: iso(86400000) }, sponsor)).status, 404, 'LIFE-006 a started expiry cannot be re-attested');
  await db.exec(`INSERT INTO users VALUES('departing-sponsor','departing@test','Departing sponsor','unused','2026-01-01'); INSERT INTO memberships VALUES('a','departing-sponsor','["employee"]',1);`);
  const orphan = await api('/lifecycle', { ...contractor, source: 'contractor-hr-orphan', expiresAt: iso(70 * 3600000), sponsorId: 'departing-sponsor' });
  assert.equal(orphan.status, 201, JSON.stringify(orphan));
  assert.equal((await api('/work/process-due', {})).value.items.find(r => r.id === orphan.value.lifecycleId)?.state, 'sponsor_reminded');
  await db.prepare("UPDATE memberships SET active=0 WHERE workspace_id='a' AND user_id='departing-sponsor'").run();
  const handed = (await api('/work/process-due', {})).value.items.find(r => r.id === orphan.value.lifecycleId);
  assert.equal(handed?.state, 'owner_reminded', 'LIFE-006 a departed sponsor hands the reminder to the owner');
  assert.match((await api(`/work/${handed.workId}`)).value.work.title, /^Sponsor left; owner to reassign or re-attest/);
  assert.equal((await api(`/lifecycle/${orphan.value.lifecycleId}/sponsor`, { sponsorId: 'employee' }, sponsor)).status, 403);
  assert.equal((await api(`/lifecycle/${orphan.value.lifecycleId}/sponsor`, { sponsorId: 'departing-sponsor' })).status, 422);
  assert.equal((await api(`/lifecycle/${orphan.value.lifecycleId}/reattest`, { expiresAt: iso(20 * 86400000) })).status, 200, 'LIFE-006 the owner re-attests once the sponsor has left');
  assert.equal((await api(`/lifecycle/${orphan.value.lifecycleId}/sponsor`, { sponsorId: 'employee' })).status, 200);
  assert.equal((await api(`/lifecycle/${orphan.value.lifecycleId}/reattest`, { expiresAt: iso(30 * 86400000) })).status, 404, 'LIFE-006 with an active sponsor again, only that sponsor re-attests');
  console.log('PASS LIFE-006 public routes: sponsor required, 72-hour reminder in the sponsor\'s requests, sponsor-only re-attestation moving expiry duties, removal starting at the end instant');
}

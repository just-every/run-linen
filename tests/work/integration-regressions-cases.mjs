import assert from 'node:assert/strict';

export async function runIntegrationRegressions({ db, api, ok, journey, actor }) {
  const payload = { title: 'Material request', body: 'Full original content', deduplicationKey: 'material',
    context: { channel: 'portal', routing: { team: 'it', urgency: 2 }, privacy: { audience: ['employee'] } } };
  const original = await ok('/requests', payload, 'employee');
  const equivalent = { ...payload, kind: 'request', beneficiaryId: 'employee', sensitivity: 'normal',
    context: { privacy: { audience: ['employee'] }, routing: { urgency: 2, team: 'it' }, channel: 'portal' } };
  assert.equal((await ok('/requests', equivalent, 'employee')).id, original.id);
  for (const change of [
    { title: 'changed' }, { body: 'changed' }, { kind: 'incident' }, { sensitivity: 'restricted' },
    { context: { ...payload.context, channel: 'mail' } },
    { context: { ...payload.context, routing: { team: 'security', urgency: 2 } } },
    { context: { ...payload.context, privacy: { audience: ['operator'] } } },
    { context: { ...payload.context, extra: true } },
  ]) assert.equal((await api('/requests', { ...payload, ...change }, 'employee')).status, 409, JSON.stringify(change));
  const ownerPayload = { ...payload, deduplicationKey: 'owner-material', beneficiaryId: 'employee' };
  await ok('/requests', ownerPayload);
  assert.equal((await api('/requests', { ...ownerPayload, beneficiaryId: 'stranger' })).status, 409);
  await ok(`/work/${original.id}/commands`, { revision: 1, command: 'reopen', reason: 'Work evolved' }, 'employee');
  assert.equal((await ok('/requests', payload, 'employee')).id, original.id, 'retry uses immutable input, not current work revision');
  const races = await Promise.all(Array.from({ length: 12 }, (_, i) => api('/requests', {
    ...payload, deduplicationKey: 'race-material', context: { channel: i % 2 ? 'portal' : 'mail' },
  }, 'employee')));
  assert.ok(races.some(r => r.status === 201)); assert.ok(races.some(r => r.status === 409));
  assert.ok(races.every(r => [201, 409].includes(r.status)));
  const accepted = races.filter(r => r.status === 201);
  assert.equal(new Set(accepted.map(r => r.value.id)).size, 1);
  assert.equal(new Set(accepted.map(r => r.value.context_json)).size, 1);
  const raced = accepted[0].value;
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_messages WHERE work_id=?').bind(raced.id).first()).n, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_intake_events WHERE work_id=?').bind(raced.id).first()).n, 1);

  // Real initial apply/verification, user cancellation, independently authorized removal.
  for (const ambiguous of [false, true]) {
    const key = ambiguous ? 'unknown-then-cancel' : 'verified-then-cancel';
    const expiry = new Date(Date.now() + 1600).toISOString();
    const item = await journey(key, { expiresAt: expiry });
    await ok('/test/link', item.input, 'employee');
    if (ambiguous) await ok('/test/lose-response', { target: key });
    const beforeWrites = (await ok('/test/writes')).writes;
    const initial = await ok('/test/run', { operationId: item.initial.id }, actor.id);
    assert.equal(initial.state, ambiguous ? 'unknown' : 'effect_verified');
    if (!ambiguous) await ok('/test/verify', { operationId: item.initial.id, verifierVersion: 1 }, actor.id);
    await ok('/work/process-due', {});
    await ok(`/work/${item.work.id}/commands`, { revision: 1, command: 'cancel', reason: 'No longer needed' }, 'employee');
    const removal = await db.prepare('SELECT * FROM execution_operations WHERE id=?').bind(item.removal.id).first();
    assert.equal(removal.cancel_requested, 0); assert.equal(removal.state, 'queued');
    assert.equal(JSON.parse(removal.step_json).grantId, key + '-remove');
    const inspect = await ok('/test/inspect', { operationId: item.initial.id }, 'employee');
    assert.equal(inspect.state, 'unknown', 'cancel is not evidence of undo');
    assert.equal((await ok('/test/writes')).writes, beforeWrites + 1);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(expiry) - Date.now() + 30)));
    assert.equal((await ok('/test/run', { operationId: item.removal.id }, actor.id)).state, 'effect_verified');
    assert.equal((await ok('/test/inspect', { operationId: item.removal.id }, 'employee')).state, 'pending');
    await ok('/test/verify', { operationId: item.removal.id, verifierVersion: 1 }, actor.id);
    await ok('/work/process-due', {});
    const duties = (await ok(`/work/${item.work.id}/obligations`, undefined, 'employee')).items;
    assert.equal(duties.find(o => o.kind === 'access.revoke').state, 'verified');
    if (ambiguous) assert.notEqual(duties.find(o => o.kind === 'access.grant').state, 'verified');
    const n = (await db.prepare('SELECT COUNT(*) n FROM execution_operations WHERE plan_id=?').bind(item.plan.planId).first()).n;
    await ok('/work/process-due', {}); await ok('/test/run', { operationId: item.removal.id }, actor.id);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM execution_operations WHERE plan_id=?').bind(item.plan.planId).first()).n, n);
    assert.equal((await ok('/test/writes')).writes, beforeWrites + 2, 'one grant, one removal; reconciliation must not repeat effects');
  }

  // Compensation is delegated to execution and checked against its separate grant.
  const compensated = await journey('cancel-compensation', { compensation: true });
  await ok('/test/link', compensated.input, 'employee');
  await ok('/test/run', { operationId: compensated.initial.id }, actor.id);
  await ok('/test/verify', { operationId: compensated.initial.id, verifierVersion: 1 }, actor.id);
  const compWrites = (await ok('/test/writes')).writes;
  await ok(`/work/${compensated.work.id}/commands`, { revision: 1, command: 'cancel', reason: 'Authorized compensation' }, 'employee');
  const compRemoval = await db.prepare('SELECT * FROM execution_operations WHERE id=?').bind(compensated.removal.id).first();
  assert.equal(compRemoval.cancel_requested, 0); assert.equal(compRemoval.state, 'queued');
  assert.ok(compRemoval.due_at <= new Date().toISOString());
  assert.equal(JSON.parse(compRemoval.step_json).grantId, 'cancel-compensation-remove');
  assert.equal((await ok('/test/run', { operationId: compRemoval.id }, actor.id)).state, 'effect_verified');
  assert.equal((await ok('/test/verify', { operationId: compRemoval.id, verifierVersion: 1 }, actor.id)).state, 'verified');
  assert.equal((await ok('/test/writes')).writes, compWrites + 1);
  assert.equal((await ok('/test/inspect', { operationId: compensated.initial.id }, 'employee')).state, 'unknown');
  // An amended compensation scope is never silently admitted as the original expiry binding.
  assert.equal((await ok('/test/inspect', { operationId: compensated.removal.id }, 'employee')).state, 'unknown');

  const revoked = await journey('revoked-before-link');
  await ok('/grants/revoked-before-link-remove/revoke', { version: 1 });
  assert.equal((await api('/test/link', revoked.input, 'employee')).status, 403);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_fulfilment_execution WHERE work_id=?').bind(revoked.work.id).first()).n, 0);

  // All independent duties run even when the earlier security duty has no connector binding.
  const mixed = await ok('/work', { title: 'Offboarding', body: 'Remove access and recover laptop', deduplicationKey: 'mixed' });
  for (const [id, kind, depends, at] of [
    ['mixed-security', 'access.revoke', null, '2026-01-01'],
    ['mixed-return', 'device.return', null, '2026-01-02'],
    ['mixed-dependent', 'device.return', 'mixed-security', '2026-01-03'],
  ]) await db.prepare(`INSERT INTO work_obligations(id,workspace_id,work_id,kind,target,beneficiary_id,due_at,owner_id,depends_on)
    VALUES(?,'w',?,?,?,'employee',?,'owner',?)`).bind(id, mixed.id, kind, id, at, depends).run();
  const processed = (await ok('/work/process-due', {})).items;
  assert.equal(processed.find(r => r.id === 'mixed-security').state, 'blocked');
  assert.equal(processed.find(r => r.id === 'mixed-return').state, 'physical_pending');
  assert.equal(processed.find(r => r.id === 'mixed-dependent'), undefined);
  const mixedRows = (await ok(`/work/${mixed.id}/obligations`)).items;
  assert.match(mixedRows.find(r => r.id === 'mixed-security').last_error, /configure/);
  assert.match(mixedRows.find(r => r.id === 'mixed-return').last_error, /Physical handoff/);
  assert.equal(mixedRows.find(r => r.id === 'mixed-dependent').state, 'pending');
  const failedExpiry = new Date(Date.now() + 1400).toISOString();
  const failed = await journey('provider-denied-security', { expiresAt: failedExpiry });
  await ok('/test/link', failed.input, 'employee');
  await ok('/test/run', { operationId: failed.initial.id }, actor.id);
  await ok('/test/verify', { operationId: failed.initial.id, verifierVersion: 1 }, actor.id);
  await ok('/test/deny-write', { target: 'provider-denied-security' });
  await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(failedExpiry) - Date.now() + 30)));
  assert.equal((await ok('/test/run', { operationId: failed.removal.id }, actor.id)).state, 'failed');
  await db.prepare(`INSERT INTO work_obligations(id,workspace_id,work_id,kind,target,beneficiary_id,due_at,owner_id)
    VALUES('failed-independent-return','w',?,'device.return','laptop','employee','2026-01-01','owner')`).bind(failed.work.id).run();
  const failedProcessed = (await ok('/work/process-due', {})).items;
  const failedDuty = (await ok(`/work/${failed.work.id}/obligations`, undefined, 'employee')).items.find(o => o.kind === 'access.revoke');
  assert.equal(failedDuty.state, 'failed'); assert.equal(failedDuty.last_error, 'failed');
  assert.equal(failedProcessed.find(o => o.id === 'failed-independent-return').state, 'physical_pending');
  const inactive = await journey('actor-revoked-before-cancel');
  await ok('/test/link', inactive.input, 'employee');
  await ok('/test/lose-response', { target: 'actor-revoked-before-cancel' });
  assert.equal((await ok('/test/run', { operationId: inactive.initial.id }, actor.id)).state, 'unknown');
  const inactiveWrites = (await ok('/test/writes')).writes;
  await db.prepare("UPDATE memberships SET active=0 WHERE workspace_id='w' AND user_id=?").bind(actor.id).run();
  await ok(`/work/${inactive.work.id}/commands`, { revision: 1, command: 'cancel', reason: 'Actor no longer active' }, 'employee');
  const inactiveDuties = (await ok(`/work/${inactive.work.id}/obligations`, undefined, 'employee')).items;
  assert.equal(inactiveDuties.find(o => o.kind === 'access.grant').state, 'unknown');
  assert.match(inactiveDuties.find(o => o.kind === 'access.grant').last_error, /execution_actor_unavailable/);
  assert.equal((await db.prepare('SELECT cancel_requested FROM execution_operations WHERE id=?').bind(inactive.removal.id).first()).cancel_requested, 0);
  assert.equal((await ok('/test/writes')).writes, inactiveWrites);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit_events WHERE target=? AND action='work.execution_cancel_pending'").bind(inactive.initial.id).first()).n, 1);
  await db.prepare("UPDATE memberships SET active=1 WHERE workspace_id='w' AND user_id=?").bind(actor.id).run();
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_fulfilment_link_guards').first()).n, 0);
  console.log('INTEGRATION REGRESSIONS passed: real D1/workerd; material identity/privacy/channel/routing conflicts and canonical exact retry; concurrent conflicts atomic; current actor and grant validation; authorized compensation; verified and lost-response initial -> cancellation -> independent verified removal without duplicate effects; failed security duty does not strand independent physical return; dependencies retained');
}

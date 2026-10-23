import assert from 'node:assert/strict';
/** CHANNEL-007 through public routes: a RingCentral line turns mapped callers' calls into tickets; the walk-up desk checks people in by name or badge and resolves visits. */
export async function walkupPhoneChecks(api, db) {
  const ok = (r, status = 200) => { assert.equal(r.status, status, 'CHANNEL-007 ' + JSON.stringify(r)); return r.value; };
  const agent = { 'x-user': 'synthetic-linen-9503', 'x-roles': '["operator"]' }, other = { 'x-user': 'synthetic-linen-9504', 'x-roles': '["operator"]' };
  const priya = { 'x-user': 'synthetic-linen-9501', 'x-roles': '["employee"]' };
  for (const [id, name, role] of [['synthetic-linen-9501', 'Priya Nair', 'employee'], ['synthetic-linen-9502', 'Tomas Eze', 'employee'], ['synthetic-linen-9503', 'Agent One', 'operator'], ['synthetic-linen-9504', 'Agent Two', 'operator'], ['synthetic-linen-9505', 'Sam Okoye', 'employee'], ['synthetic-linen-9506', 'Sam Okoye', 'employee']])
    await db.batch([db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(id, id + '@example.test', name, 'unused', '2026-01-01'), db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a', id, JSON.stringify([role]))]);
  const key = await crypto.subtle.importKey('raw', Buffer.alloc(32), 'AES-GCM', false, ['encrypt']), iv = crypto.getRandomValues(new Uint8Array(12));
  const secret = Buffer.from(iv).toString('base64') + '.' + Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify({ clientId: 'synthetic-linen-9510', clientSecret: 'synthetic-linen-9511', jwt: 'synthetic-linen-9512' })))).toString('base64');
  const at = new Date().toISOString(), line = 'synthetic-linen-9513';
  await db.prepare("INSERT INTO connections VALUES(?,'a','ringcentral','IT line',?,?,'unverified',1,?,?)").bind(line, JSON.stringify({ line: '+1 303 555 0100', environment: 'sandbox' }), secret, at, at).run();
  ok(await api('/test/mail', { reset: true }));
  const rcCalls = async kind => ok(await api('/test/mail')).calls.filter(c => c.kind === kind);
  // The credential reaches one extension, read-only, before any call is taken.
  assert.deepEqual([(await api('/calls/events', { connectionId: line, callId: 'synthetic-linen-9514', from: '+13035550142' })).status], [503], 'an unverified line takes no calls');
  const verified = ok(await api(`/connections/${line}/test`, { revision: 1 }));
  assert.equal(verified.status, 'active'); assert.equal(verified.evidence.extensionId, '1234');
  assert.deepEqual((await rcCalls('rc-token')).map(c => [c.grant, c.basic]), [['urn:ietf:params:oauth:grant-type:jwt-bearer', true]]);
  // Owner-mapped numbers and badges; nothing is inferred from a name or number alone.
  const mapping = { kind: 'phone', value: '(303) 555-0142', userId: 'synthetic-linen-9501' };
  ok(await api('/contact-points', mapping, agent), 403);
  assert.equal(ok(await api('/contact-points', mapping)).state, 'mapped');
  ok(await api('/contact-points', { ...mapping, userId: 'synthetic-linen-9502' }), 409);
  ok(await api('/contact-points', { ...mapping, value: '12' }), 422); ok(await api('/contact-points', { ...mapping, userId: 'synthetic-linen-9999' }), 422);
  ok(await api('/contact-points', { kind: 'badge', value: 'b-7731', userId: 'synthetic-linen-9502' }));
  assert.deepEqual(ok(await api('/contact-points')).items.map(i => [i.kind, i.value, i.name]).sort(), [['badge', 'B-7731', 'Tomas Eze'], ['phone', '+13035550142', 'Priya Nair']]);
  ok(await api('/contact-points', undefined, agent), 403);
  // A call from a mapped number becomes one ticket for that caller with a staff-only transcript and the recording link.
  const call = { connectionId: line, callId: 'synthetic-linen-9515', from: '+1 (303) 555-0142', startedAt: '2026-10-23T10:00:00Z', durationSeconds: 95, recordingUrl: 'https://platform.devtest.ringcentral.com/recording/synthetic-linen-9516', transcript: 'synthetic-linen-9517 my laptop will not wake up' };
  ok(await api('/calls/events', call, priya), 403); ok(await api('/calls/events', { ...call, recordingUrl: 'http://insecure.example.test/x' }), 422);
  const first = ok(await api('/calls/events', call), 201); assert.equal(first.state, 'ticketed');
  assert.equal(ok(await api('/calls/events', call), 201).workId, first.workId, 'a replayed call changes nothing');
  const ticket = ok(await api(`/work/${first.workId}`));
  assert.equal(ticket.work.requester_id, 'synthetic-linen-9501'); assert.ok(ticket.messages.some(m => m.visibility === 'private' && m.body.includes(call.transcript) && m.body.includes(call.recordingUrl)), 'CHANNEL-007 caller, recording link and transcript are on the ticket');
  assert.ok(!JSON.stringify(ok(await api(`/work/${first.workId}`, undefined, priya))).includes(call.transcript), 'the caller never sees the staff transcript');
  const again = ok(await api('/calls/events', { ...call, callId: 'synthetic-linen-9518', transcript: 'synthetic-linen-9519 still broken' }), 201);
  assert.deepEqual([again.workId, again.updated], [first.workId, true], 'a second call within a day updates the open ticket');
  // An unknown number is held without a ticket or transcript; the owner can dismiss it.
  const stranger = ok(await api('/calls/events', { ...call, callId: 'synthetic-linen-9520', from: '+13035559999' }), 201);
  assert.deepEqual([stranger.state, stranger.workId], ['unmatched', null]);
  assert.deepEqual(ok(await api('/calls/held')).items.map(i => i.caller), ['+13035559999']);
  assert.equal((await db.prepare("SELECT count(*) n FROM work_records WHERE title='Phone call to the IT line'").first()).n, 1);
  ok(await api(`/calls/${line}/synthetic-linen-9520/dismiss`, {})); assert.deepEqual(ok(await api('/calls/held')).items, []); ok(await api(`/calls/${line}/synthetic-linen-9520/dismiss`, {}), 404);
  // Polling the RingCentral call log takes new inbound calls once, with the recording link and no invented transcript.
  ok(await api('/test/mail', { rc: [{ id: 'synthetic-linen-9521', startTime: '2026-10-23T11:00:00Z', duration: 30, from: { phoneNumber: '+13035550142' }, recording: { contentUri: 'https://platform.devtest.ringcentral.com/recording/synthetic-linen-9522' } }, { id: 'synthetic-linen-9515', from: { phoneNumber: '+13035550142' } }] }));
  assert.deepEqual(ok(await api('/calls/poll', {})).items, [{ id: line, state: 'ok', seen: 1 }]);
  assert.deepEqual((await rcCalls('rc-log')).map(c => [c.direction, c.recordings]), [['Inbound', 'true']]);
  assert.equal((await db.prepare("SELECT count(*) n FROM work_messages WHERE body LIKE '%No transcript was supplied%'").first()).n, 1);
  assert.equal(ok(await api('/calls/poll', {})).items[0].seen, 0);
  // The walk-up desk: check in by name or badge, serve and resolve.
  const visit = { site: 'Denver IT bar', name: 'priya nair', idempotencyKey: 'synthetic-linen-9530' };
  ok(await api('/walkups', visit, priya), 403); ok(await api('/walkups', undefined, priya), 403);
  const v1 = ok(await api('/walkups', visit, agent), 201); assert.equal(v1.state, 'waiting');
  assert.equal(ok(await api('/walkups', visit, agent), 201).id, v1.id, 'a repeated check-in is the same visit');
  ok(await api('/walkups', { ...visit, idempotencyKey: 'synthetic-linen-9531' }, agent), 409);
  ok(await api('/walkups', { site: 'Denver IT bar', name: 'sam okoye', idempotencyKey: 'synthetic-linen-9532' }, agent), 409);
  ok(await api('/walkups', { site: 'Denver IT bar', name: 'nobody here', idempotencyKey: 'synthetic-linen-9533' }, agent), 404);
  const v2 = ok(await api('/walkups', { site: 'Denver IT bar', badge: ' b-7731 ', idempotencyKey: 'synthetic-linen-9534' }, agent), 201);
  ok(await api('/walkups', { site: 'Denver IT bar', badge: 'B-0000', idempotencyKey: 'synthetic-linen-9535' }, agent), 404);
  assert.deepEqual(ok(await api('/walkups', undefined, agent)).items.map(i => [i.person, i.state]), [['Priya Nair', 'waiting'], ['Tomas Eze', 'waiting']], 'first in, first served');
  assert.equal(ok(await api(`/walkups/${v1.id}/start`, {}, agent)).state, 'serving');
  ok(await api(`/walkups/${v1.id}/start`, {}, other), 409);
  ok(await api(`/walkups/${v1.id}/finish`, { outcome: 'synthetic-linen-9536 swapped the dock' }, other), 403);
  ok(await api(`/walkups/${v2.id}/finish`, { outcome: 'synthetic-linen-9537 resolved' }, agent), 409);
  const done = ok(await api(`/walkups/${v1.id}/finish`, { outcome: 'synthetic-linen-9536 swapped the dock' }, agent)); assert.equal(done.state, 'resolved');
  const resolved = ok(await api(`/work/${v1.work_id}`, undefined, priya));
  assert.equal(resolved.work.state, 'closed'); assert.ok(resolved.messages.some(m => m.body === 'Resolved at the desk: synthetic-linen-9536 swapped the dock'), 'the employee sees how the visit ended');
  assert.equal(ok(await api(`/walkups/${v2.id}/finish`, { left: true, outcome: 'synthetic-linen-9538 left the queue' }, agent)).state, 'left');
  assert.equal(ok(await api(`/work/${v2.work_id}`)).work.state, 'cancelled');
  // Erasing a person clears their number, badge, visit and call identity.
  ok(await api('/people/synthetic-linen-9501/erase', { revision: 1, reason: 'synthetic-linen-9539 erasure' }));
  assert.equal((await db.prepare("SELECT count(*) n FROM work_contact_points WHERE user_id='synthetic-linen-9501'").first()).n, 0);
  assert.equal((await db.prepare("SELECT count(*) n FROM work_calls WHERE caller='+13035550142' OR user_id='synthetic-linen-9501'").first()).n, 0);
  assert.equal((await db.prepare("SELECT person_id,outcome FROM work_walkups WHERE id=?").bind(v1.id).first()).person_id, '[erased]');
}

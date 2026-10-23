import assert from 'node:assert/strict';
/** CHANNEL-006 portal handoff through public routes: an available agent accepts during business hours; otherwise the conversation stays a ticket with a stated reply time. */
export async function handoffChecks(api, db) {
  const ok = (r, status = 200) => { assert.equal(r.status, status, 'CHANNEL-006 ' + JSON.stringify(r)); return r.value; };
  const ana = { 'x-user': 'synthetic-linen-9701', 'x-roles': '["employee"]' }, ben = { 'x-user': 'synthetic-linen-9702', 'x-roles': '["employee"]' }, agent = { 'x-user': 'synthetic-linen-9703', 'x-roles': '["operator"]' }, late = { 'x-user': 'synthetic-linen-9704', 'x-roles': '["operator"]' };
  for (const [id, name, role] of [['synthetic-linen-9701', 'Ana Ruiz', 'employee'], ['synthetic-linen-9702', 'Ben Cole', 'employee'], ['synthetic-linen-9703', 'Agent Rowan', 'operator'], ['synthetic-linen-9704', 'Agent Late', 'operator']])
    await db.batch([db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(id, id + '@example.test', name, 'unused', '2026-01-01'), db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a', id, JSON.stringify([role]))]);
  // A zone no other flow in this suite uses, so no "one unambiguous calendar" lookup elsewhere sees these.
  const zone = 'Pacific/Kiritimati';
  const open = ok(await api('/calendars', { name: 'synthetic-linen-9705 always', timezone: zone, weekdays: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 24, holidays: [] }), 201);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date()), closed = ok(await api('/calendars', { name: 'synthetic-linen-9706 closed today', timezone: zone, weekdays: [0, 1, 2, 3, 4, 5, 6], startHour: 9, endHour: 17, holidays: [today] }), 201);
  const ask = async (headers, text) => { const t = ok(await api('/work', { title: text, body: text + ' body', deduplicationKey: crypto.randomUUID() }, headers), 201); return t.id; };
  const calendarId = r => r.calendarId ?? r.id;
  let workId = await ask(ana, 'synthetic-linen-9707 laptop slow');
  ok(await api(`/work/${workId}/handoff`, {}, ana), 503);
  const config = { calendarId: calendarId(open), acceptSeconds: 60, responseMinutes: 240 };
  ok(await api('/handoff-config', config, agent), 403); ok(await api('/handoff-config', { ...config, acceptSeconds: 1 }), 422); ok(await api('/handoff-config', { ...config, calendarId: 'missing' }), 422);
  ok(await api('/handoff-config', config), 200);
  assert.ok([403, 404].includes((await api(`/work/${workId}/handoff`, {}, ben)).status), 'only the person who asked can ask for an agent');
  // No agent is present: the same conversation stays a ticket and says when to expect a reply.
  const none = ok(await api(`/work/${workId}/handoff`, {}, ana), 201); assert.equal(none.state, 'ticketed'); assert.ok(Date.parse(none.expected_at) > Date.now());
  let thread = ok(await api(`/work/${workId}`, undefined, ana));
  assert.ok(thread.messages.some(m => m.body === 'I would like to talk to a person.') && thread.messages.some(m => m.body.startsWith('Linen: No agent is available right now.') && m.body.includes('We will reply by')), 'CHANNEL-006 the transcript carries the request and the expected reply time');
  // An available agent accepts inside business hours and replies in the same conversation, transcript in view.
  workId = await ask(ana, 'synthetic-linen-9708 monitor flicker');
  ok(await api('/agents/presence', { available: true }, agent)); assert.equal(ok(await api('/agents/presence', undefined, agent)).available, true);
  const requested = ok(await api(`/work/${workId}/handoff`, {}, ana), 201); assert.equal(requested.state, 'requested');
  assert.equal(ok(await api(`/work/${workId}/handoff`, {}, ana), 201).id, requested.id, 'asking twice is the same request');
  assert.deepEqual(ok(await api('/handoffs', undefined, agent)).items.map(i => [i.id, i.requester]), [[requested.id, 'Ana Ruiz']]);
  ok(await api('/handoffs', undefined, ana), 403); ok(await api(`/handoffs/${requested.id}/accept`, {}, ana), 403);
  const live = ok(await api(`/handoffs/${requested.id}/accept`, {}, agent)); assert.equal(live.state, 'live');
  ok(await api(`/handoffs/${requested.id}/accept`, {}, late), 409);
  ok(await api(`/work/${workId}/messages`, { body: 'synthetic-linen-9709 which monitor is it?', visibility: 'public', sourceMessageId: 'synthetic-linen-9710' }, agent), 201);
  thread = ok(await api(`/work/${workId}`, undefined, ana)); assert.equal(thread.work.assignee_id, 'synthetic-linen-9703');
  assert.deepEqual(thread.messages.map(m => m.body).filter(b => /talk to a person|joined this conversation|which monitor/.test(b)), ['I would like to talk to a person.', 'Agent Rowan joined this conversation.', 'synthetic-linen-9709 which monitor is it?']);
  assert.equal(ok(await api(`/work/${workId}/handoff`, undefined, ana)).handoff.state, 'live');
  ok(await api(`/handoffs/${requested.id}/end`, {}, ben), 404); assert.equal(ok(await api(`/handoffs/${requested.id}/end`, {}, ana)).state, 'ended');
  // An agent who does not accept in time: the request files as a ticket and a late accept is refused.
  workId = await ask(ana, 'synthetic-linen-9711 vpn');
  const waiting = ok(await api(`/work/${workId}/handoff`, {}, ana), 201); assert.equal(waiting.state, 'requested');
  await db.prepare('UPDATE work_handoffs SET expires_at=? WHERE id=?').bind(new Date(Date.now() - 1000).toISOString(), waiting.id).run();
  ok(await api(`/handoffs/${waiting.id}/accept`, {}, agent), 409);
  assert.equal(ok(await api(`/work/${workId}/handoff`, undefined, ana)).handoff.state, 'ticketed');
  assert.ok(ok(await api(`/work/${workId}`, undefined, ana)).messages.some(m => m.body.startsWith('Linen: No agent accepted in time.')));
  // Stale presence is not availability, and outside business hours the request files at once with the next opening.
  await db.prepare('UPDATE work_agent_presence SET seen_at=?').bind(new Date(Date.now() - 3_600_000).toISOString()).run();
  workId = await ask(ana, 'synthetic-linen-9712 printer');
  assert.equal(ok(await api(`/work/${workId}/handoff`, {}, ana), 201).state, 'ticketed');
  await db.prepare('UPDATE work_agent_presence SET seen_at=?').bind(new Date().toISOString()).run();
  ok(await api('/handoff-config', { ...config, calendarId: calendarId(closed) }));
  workId = await ask(ana, 'synthetic-linen-9713 badge reader');
  const after = ok(await api(`/work/${workId}/handoff`, {}, ana), 201); assert.equal(after.state, 'ticketed');
  assert.ok(Date.parse(after.expected_at) > Date.parse(today + 'T23:59:59+14:00'), 'the promised reply is after the next opening, not today');
  assert.ok(ok(await api(`/work/${workId}`, undefined, ana)).messages.some(m => m.body.startsWith('Linen: The service desk is outside its business hours.')));
  assert.equal((await api('/handoffs', undefined, agent)).value.items.length, 0);
  // Erasure removes presence and the person from handoff records.
  ok(await api('/people/synthetic-linen-9703/erase', { revision: 1, reason: 'synthetic-linen-9714 erasure' }));
  assert.equal((await db.prepare("SELECT count(*) n FROM work_agent_presence WHERE user_id='synthetic-linen-9703'").first()).n, 0);
  assert.equal((await db.prepare("SELECT count(*) n FROM work_handoffs WHERE agent_id='synthetic-linen-9703'").first()).n, 0);
}

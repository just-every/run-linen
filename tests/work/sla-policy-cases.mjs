import assert from 'node:assert/strict';
/** DESK-004: ordered SLA policies, the US federal holiday catalog, waiting-on pauses and visible breaches through public routes. */
export async function slaPolicyChecks(api, db) {
  const employee = { 'x-user': 'employee', 'x-roles': '["employee"]' }, requester = { 'x-user': 'stranger', 'x-roles': '["employee"]' };
  const check = (r, status = 200) => { assert.equal(r.status, status, 'DESK-004 ' + JSON.stringify(r)); return r.value; };
  const ny = { name: 'New York office', location: 'New York', timezone: 'America/New_York', weekdays: [1, 2, 3, 4, 5], startHour: 9, endHour: 17, holidays: [], holidayCatalog: 'us-federal' };
  check(await api('/calendars', { ...ny, holidayCatalog: 'uk-bank' }), 422);
  const calendar = check(await api('/calendars', ny), 201);
  const executives = check(await api('/requester-groups', { name: 'Executives', memberIds: ['employee'] }), 201);
  check(await api('/requester-groups', { name: 'Executives', memberIds: ['employee'] }), 409);
  const p2 = { name: 'P2 business hours', position: 2, priority: 'P2', calendarId: calendar.id, firstResponseMinutes: 60, nextResponseMinutes: 120, resolutionMinutes: 240, pauseOn: ['requester', 'vendor'] };
  check(await api('/sla-policies', p2, employee), 403);
  check(await api('/sla-policies', { ...p2, calendarId: 'missing' }), 422);
  check(await api('/sla-policies', { ...p2, resolutionMinutes: 0 }), 422);
  check(await api('/sla-policies', p2), 201);
  check(await api('/sla-policies', { ...p2, name: 'Same position' }), 409);
  check(await api('/sla-policies', { name: 'Executive P2', position: 1, priority: 'P2', requesterGroupId: executives.id, firstResponseMinutes: 30, nextResponseMinutes: 60, resolutionMinutes: 120 }), 201);
  check(await api('/sla-policies', { name: 'Everything else', position: 3, firstResponseMinutes: 480, nextResponseMinutes: 480, resolutionMinutes: 2880 }), 201);
  assert.deepEqual(check(await api('/sla-policies')).items.map(p => p.name), ['Executive P2', 'P2 business hours', 'Everything else']);

  // Friday 16 January 2026, 4:30 pm in New York; Monday 19 January is Martin Luther King Jr. Day.
  const fridayAfternoon = '2026-01-16T21:30:00.000Z';
  async function ticket(key, headers) {
    const work = check(await api('/work', { title: `Printer down ${key}`, body: 'The floor printer is offline.', deduplicationKey: `sla-${key}` }, headers), 201);
    // Test time fixture: the ticket was opened on the Friday afternoon.
    await db.prepare('UPDATE work_records SET created_at=? WHERE id=?').bind(fridayAfternoon, work.id).run();
    const current = check(await api(`/work/${work.id}`)).work;
    check(await api(`/work/${work.id}/classification/override`, { type: 'incident', category: 'hardware', subcategory: 'printer', impact: 'medium', urgency: 'high', priority: 'P2', revision: 0, workRevision: current.revision, reason: 'Floor printer is down for a team.' }));
    return check(await api(`/work/${work.id}`)).work;
  }
  const sla = id => api(`/work/${id}/sla`);
  const a = await ticket('a', requester);
  check(await api(`/work/${a.id}/sla`, undefined, requester), 403);
  let clock = check(await sla(a.id));
  assert.equal(clock.policy.name, 'P2 business hours');
  assert.equal(clock.policy.calendar.location, 'New York');
  assert.equal(clock.firstResponse.dueAt, '2026-01-20T14:30:00.000Z', 'DESK-004 first response skips the weekend and the federal holiday: Tuesday 9:30 am');
  assert.equal(clock.resolution.dueAt, '2026-01-20T17:30:00.000Z', 'DESK-004 the P2 is due Tuesday 12:30 pm in New York');
  assert.equal(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long' }).format(new Date(clock.resolution.dueAt)), 'Tuesday');
  assert.equal(clock.resolution.state, 'breached');
  assert.equal(clock.resolution.breachedAt, clock.resolution.dueAt, 'DESK-004 the ticket shows when its target was breached');

  // A requester in the Executives group matches the earlier policy, which runs on calendar hours.
  const executive = await ticket('exec', employee);
  clock = check(await sla(executive.id));
  assert.equal(clock.policy.name, 'Executive P2');
  assert.equal(clock.policy.hours, 'calendar');
  assert.equal(clock.resolution.dueAt, '2026-01-16T23:30:00.000Z');

  // Awaiting the requester stops the clock; an internal hold without a waiting-on party does not.
  const b = await ticket('b', requester);
  let revision = b.revision;
  check(await api(`/work/${b.id}/commands`, { revision, command: 'resume', reason: 'x', waitingOn: 'requester' }), 422);
  check(await api(`/work/${b.id}/commands`, { revision, command: 'pause', reason: 'Asked which floor the printer is on', waitingOn: 'requester' }));
  clock = check(await sla(b.id));
  assert.equal(clock.resolution.state, 'breached', 'DESK-004 a pause after the due time never clears a breach');
  revision = check(await api(`/work/${b.id}`)).work.revision;
  check(await api(`/work/${b.id}/commands`, { revision, command: 'resume', reason: 'Requester answered' }));
  revision = check(await api(`/work/${b.id}`)).work.revision;
  check(await api(`/work/${b.id}/commands`, { revision, command: 'pause', reason: 'Internal hold' }));
  revision = check(await api(`/work/${b.id}`)).work.revision;
  check(await api(`/work/${b.id}/commands`, { revision, command: 'resume', reason: 'Hold over' }));
  // Test time fixture: the requester pause ran 10-11 am and the internal hold 11 am-noon on Tuesday.
  await db.prepare("UPDATE work_sla_pauses SET paused_at='2026-01-20T15:00:00.000Z',resumed_at='2026-01-20T16:00:00.000Z' WHERE work_id=? AND waiting_on='requester'").bind(b.id).run();
  await db.prepare("UPDATE work_sla_pauses SET paused_at='2026-01-20T16:00:00.000Z',resumed_at='2026-01-20T17:00:00.000Z' WHERE work_id=? AND waiting_on IS NULL").bind(b.id).run();
  clock = check(await sla(b.id));
  assert.equal(clock.firstResponse.dueAt, '2026-01-20T14:30:00.000Z');
  assert.equal(clock.resolution.dueAt, '2026-01-20T18:30:00.000Z', 'DESK-004 pausing for the requester extends the due time by the paused business hour');
  assert.deepEqual(clock.pauses.map(p => [p.waiting_on, p.stopsClock]), [['requester', true], [null, false]]);

  // Next response: each requester message after an agent reply starts a target the next agent reply meets.
  check(await api(`/work/${a.id}/messages`, { body: 'Looking at the printer now.', visibility: 'public', sourceMessageId: 'sla-agent-1' }), 201);
  check(await api(`/work/${a.id}/messages`, { body: 'It is still offline.', visibility: 'public', sourceMessageId: 'sla-requester-1' }, requester), 201);
  clock = check(await sla(a.id));
  assert.equal(clock.firstResponse.state, 'breached'); assert.ok(clock.firstResponse.metAt > clock.firstResponse.dueAt);
  assert.equal(clock.nextResponses.length, 1); assert.equal(clock.nextResponses[0].metAt, null);
  assert.ok(clock.nextResponses[0].dueAt > clock.nextResponses[0].startedAt);
  check(await api(`/work/${a.id}/messages`, { body: 'Replaced the fuser; try again.', visibility: 'public', sourceMessageId: 'sla-agent-2' }), 201);
  clock = check(await sla(a.id));
  assert.equal(clock.nextResponses[0].state, 'met');

  // The breach shows on the report beside its denominator.
  const report = check(await api('/reports/work?from=2026-01-16T00:00:00.000Z&to=2026-01-17T00:00:00.000Z&timezone=America/New_York'));
  const rows = report.sla.rows.filter(r => [a.id, b.id, executive.id].includes(r.workId));
  assert.equal(rows.length, 3);
  assert.ok(rows.every(r => r.resolution.state === 'breached' && r.resolution.breachedAt));
  assert.ok(report.sla.counts.resolution.breached >= 3 && report.sla.denominator >= 3);
  check(await api('/reports/work?from=2026-01-16T00:00:00.000Z&to=2026-01-17T00:00:00.000Z&timezone=America/New_York', undefined, requester), 403);
  console.log('PASS DESK-004 public routes: ordered policies by priority/category/requester group, business or calendar hours, US federal holiday catalog per location calendar, first/next/resolution targets, waiting-on pauses, breaches on ticket and report');
}

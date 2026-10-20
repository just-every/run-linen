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

/** DESK-005: escalation levels before and after an SLA breach and the awaiting-requester reminder rule, through public routes and the scheduler duty. */
export async function escalationChecks(workspaceApi, db) {
  // An own workspace keeps these rules from escalating or resolving other suites' tickets.
  const api = (path, body, headers = {}) => workspaceApi(path, body, { 'x-workspace': 'desk005', ...headers });
  const check = (r, status = 200) => { assert.equal(r.status, status, 'DESK-005 ' + JSON.stringify(r)); return r.value; };
  const employee = { 'x-user': 'employee', 'x-roles': '["employee"]' };
  await db.exec(`INSERT INTO workspaces VALUES('desk005','Desk 005','2026-01-01'); INSERT INTO users VALUES('desk-agent','agent@test','Avery Agent','unused','2026-01-01'); INSERT INTO users VALUES('desk-lead','lead@test','Lee Lead','unused','2026-01-01'); INSERT INTO users VALUES('it-manager','manager@test','Morgan Manager','unused','2026-01-01'); INSERT INTO memberships VALUES('desk005','owner','["owner"]',1); INSERT INTO memberships VALUES('desk005','employee','["employee"]',1); INSERT INTO memberships VALUES('desk005','desk-agent','["operator"]',1); INSERT INTO memberships VALUES('desk005','desk-lead','["operator"]',1); INSERT INTO memberships VALUES('desk005','it-manager','["operator"]',1);`);
  const calendar = check(await api('/calendars', { name: 'New York office', location: 'New York', timezone: 'America/New_York', weekdays: [1, 2, 3, 4, 5], startHour: 9, endHour: 17, holidays: [], holidayCatalog: 'us-federal' }), 201);
  check(await api('/sla-policies', { name: 'P2 business hours', position: 1, priority: 'P2', calendarId: calendar.id, firstResponseMinutes: 60, nextResponseMinutes: 120, resolutionMinutes: 240 }), 201);
  check(await api('/sla-policies', { name: 'Everything else', position: 2, firstResponseMinutes: 480, nextResponseMinutes: 480, resolutionMinutes: 2880 }), 201);
  const level = (n, offsetMinutes, notify, label) => ({ target: 'first_response', level: n, offsetMinutes, notify, label });
  check(await api('/escalation-levels', level(1, -15, 'assignee', 'Agent'), employee), 403);
  check(await api('/escalation-levels', level(2, -5, 'employee', 'Group lead')), 422);
  check(await api('/escalation-levels', level(1, -15, 'assignee', 'Agent')));
  check(await api('/escalation-levels', level(2, -5, 'desk-lead', 'Group lead')));
  check(await api('/escalation-levels', level(3, 30, 'it-manager', 'IT manager')));
  check(await api('/waiting-rule', { remindBusinessDays: 5, resolveBusinessDays: 3 }), 422);
  const rules = check(await api('/waiting-rule', { remindBusinessDays: 3, resolveBusinessDays: 5 }));
  assert.deepEqual(rules.levels.map(l => [l.level, l.offset_minutes, l.notify]), [[1, -15, 'assignee'], [2, -5, 'desk-lead'], [3, 30, 'it-manager']]);
  const minutesAgo = m => new Date(Date.now() - m * 60000).toISOString(), daysAgo = d => minutesAgo(d * 1440 + 10);
  async function ticket(key, priority, impact) {
    const work = check(await api('/work', { title: `Escalation ${key}`, body: 'Payroll export fails.', deduplicationKey: `desk005-${key}` }, employee), 201);
    const current = check(await api(`/work/${work.id}`)).work;
    check(await api(`/work/${work.id}/classification/override`, { type: 'incident', category: 'software', subcategory: 'application', impact, urgency: 'high', priority, revision: 0, workRevision: current.revision, reason: 'Payroll cannot run.' }));
    return check(await api(`/work/${work.id}`)).work;
  }
  const tick = () => api('/work/process-due', {});
  const followups = async id => check(await api(`/work/${id}/followups`)).items;
  const notes = async (id, headers) => check(await api(`/work/${id}`, undefined, headers)).messages;

  // A P1 nears its first-response target: level 1 (agent) fires 15 minutes before, level 2 (group lead) 5 minutes before, level 3 after the breach.
  let p1 = await ticket('p1', 'P1', 'high');
  p1 = check(await api(`/work/${p1.id}/commands`, { revision: p1.revision, command: 'assign', reason: 'On shift', assigneeId: 'desk-agent' }));
  const due = check(await api(`/work/${p1.id}/sla`)).firstResponse;
  const minutesToDue = 470;
  await db.prepare('UPDATE work_records SET created_at=? WHERE id=?').bind(minutesAgo(minutesToDue), p1.id).run();
  check(await tick());
  let rows = (await followups(p1.id)).filter(r => r.kind === 'escalation');
  assert.deepEqual(rows.map(r => [r.level, r.state]), [[1, 'fired'], [2, 'scheduled'], [3, 'scheduled']], 'DESK-005 level 1 fires before the P1 response target, level 2 is persisted with its next due time');
  assert.equal(rows[0].notify_id, 'desk-agent');
  assert.ok(rows[1].next_due_at > new Date().toISOString(), 'DESK-005 level 2 waits for its own due time');
  assert.ok(due.dueAt, 'DESK-004 target exists');
  await db.prepare('UPDATE work_records SET created_at=? WHERE id=?').bind(minutesAgo(477), p1.id).run();
  check(await tick());
  rows = (await followups(p1.id)).filter(r => r.kind === 'escalation');
  assert.deepEqual(rows.map(r => [r.level, r.state]), [[1, 'fired'], [2, 'fired'], [3, 'scheduled']], 'DESK-005 level 2 follows level 1');
  const escalationNotes = (await notes(p1.id)).filter(m => m.body.includes('escalation'));
  assert.deepEqual(escalationNotes.map(m => m.visibility), ['private', 'private']);
  assert.match(escalationNotes[0].body, /^Level 1 escalation \(Agent: Avery Agent\): first response due /);
  assert.match(escalationNotes[1].body, /^Level 2 escalation \(Group lead: Lee Lead\)/);
  assert.equal((await notes(p1.id, employee)).filter(m => m.body.includes('escalation')).length, 0, 'DESK-005 the requester never sees escalations');
  check(await tick());
  assert.equal((await notes(p1.id)).filter(m => m.body.includes('escalation')).length, 2, 'DESK-005 each level fires once');
  check(await api(`/work/${p1.id}/messages`, { body: 'Looking at the payroll export now.', visibility: 'public', sourceMessageId: 'desk005-agent-reply' }, { 'x-user': 'desk-agent', 'x-roles': '["operator"]' }), 201);
  check(await tick());
  rows = (await followups(p1.id)).filter(r => r.kind === 'escalation');
  assert.deepEqual([rows[2].state, rows[2].stop_reason], ['stopped', 'target met'], 'DESK-005 an agent response stops the remaining level');

  // Awaiting the requester: reminder after 3 business days, resolution with disclosure after 5.
  const pauseFor = async (work, key) => check(await api(`/work/${work.id}/commands`, { revision: work.revision, command: 'pause', reason: `Asked for the error text ${key}`, waitingOn: 'requester' }));
  // Test time fixture: the ticket, its messages so far and its pause move back together.
  const pausedAt = async (id, at) => {
    const pause = await db.prepare('SELECT paused_at FROM work_sla_pauses WHERE work_id=? AND resumed_at IS NULL').bind(id).first();
    const shift = Date.parse(pause.paused_at) - Date.parse(at);
    for (const [table, column, key] of [['work_records', 'created_at', 'id'], ['work_messages', 'created_at', 'work_id'], ['work_sla_pauses', 'paused_at', 'work_id']])
      await db.prepare(`UPDATE ${table} SET ${column}=strftime('%Y-%m-%dT%H:%M:%fZ', julianday(${column}) - ?/86400000.0) WHERE ${key}=? AND ${column}<=?`).bind(shift, id, pause.paused_at).run();
  };
  let quiet = await ticket('quiet', 'P3', 'medium');
  quiet = await pauseFor(quiet, 'quiet');
  await pausedAt(quiet.id, daysAgo(3));
  check(await tick());
  let reminders = (await followups(quiet.id)).filter(r => r.kind === 'requester_reminder');
  assert.deepEqual(reminders.map(r => [r.level, r.state]), [[1, 'fired'], [2, 'scheduled']], 'DESK-005 the reminder fires and the resolution stays persisted with its due time');
  const reminder = (await notes(quiet.id, employee)).find(m => m.body.startsWith('Reminder: we are waiting for your reply.'));
  assert.ok(reminder && reminder.visibility === 'public', 'DESK-005 the requester sees the reminder');
  assert.equal(check(await api(`/work/${quiet.id}`)).work.state, 'paused');
  await pausedAt(quiet.id, daysAgo(5));
  check(await tick());
  const closed = check(await api(`/work/${quiet.id}`, undefined, employee));
  assert.equal(closed.work.state, 'closed', 'DESK-005 the ticket resolves after 5 business days without a reply');
  assert.ok(closed.messages.some(m => m.visibility === 'public' && m.body.startsWith('Closed: Resolved without a reply: no reply arrived within 5 business days')), 'DESK-005 the resolution is disclosed to the requester');

  let answered = await ticket('answered', 'P3', 'medium');
  answered = await pauseFor(answered, 'answered');
  await pausedAt(answered.id, daysAgo(2));
  check(await tick());
  assert.deepEqual((await followups(answered.id)).filter(r => r.kind === 'requester_reminder').map(r => r.state), ['scheduled', 'scheduled']);
  check(await api(`/work/${answered.id}/messages`, { body: 'The error says export locked.', visibility: 'public', sourceMessageId: 'desk005-requester-reply' }, employee), 201);
  check(await tick());
  await pausedAt(answered.id, daysAgo(6));
  check(await tick());
  reminders = (await followups(answered.id)).filter(r => r.kind === 'requester_reminder');
  assert.deepEqual(reminders.map(r => [r.state, r.stop_reason]), [['stopped', 'requester replied'], ['stopped', 'requester replied']], 'DESK-005 a reply before the due time stops both');
  assert.equal(check(await api(`/work/${answered.id}`)).work.state, 'paused');
  assert.equal((await notes(answered.id, employee)).filter(m => m.body.startsWith('Reminder:')).length, 0);

  // Business days follow the ticket's SLA calendar: Friday 15 January 2027, 4:30 pm in New York; Monday 18 January is a federal holiday.
  let business = await ticket('business', 'P2', 'medium');
  business = await pauseFor(business, 'business');
  await pausedAt(business.id, '2027-01-15T21:30:00.000Z');
  check(await tick());
  reminders = (await followups(business.id)).filter(r => r.kind === 'requester_reminder');
  assert.deepEqual(reminders.map(r => r.next_due_at), ['2027-01-21T21:30:00.000Z', '2027-01-25T21:30:00.000Z'], 'DESK-005 three and five business days skip the weekend and the holiday on the New York calendar');
  console.log('PASS DESK-005 public routes: P1 level-1 then level-2 escalation before the response target, private to agents, level 3 stopped by the response; awaiting-requester reminder then disclosed resolution; a reply before the due time stops both; business days on the SLA calendar');
}

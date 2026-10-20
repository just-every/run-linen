import assert from 'node:assert/strict';
/** DESK-003: support-group and owner-ordered rule routing (category, requester, requester group such as VIP), and
 * round-robin, load, skill and shift-aware assignment, with every reassignment kept in the ticket's history. */
export async function deskRoutingChecks(workspaceApi, db) {
  const api = (path, body, headers = {}) => workspaceApi(path, body, { 'x-workspace': 'desk003', ...headers });
  const check = (r, status = 200) => { assert.equal(r.status, status, 'DESK-003 ' + JSON.stringify(r)); return r.value; };
  const as = (user, roles) => ({ 'x-user': user, 'x-roles': JSON.stringify(roles) });
  const employee = as('d3-employee', ['employee']), ceo = as('d3-ceo', ['employee']), agentC = as('d3-cara', ['operator']);
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  await db.exec(`INSERT INTO workspaces VALUES('desk003','Desk 003','2026-01-01'); INSERT INTO memberships VALUES('desk003','owner','["owner"]',1); INSERT INTO users VALUES('d3-employee','d3-employee@test','Eli Employee','unused','2026-01-01'); INSERT INTO memberships VALUES('desk003','d3-employee','["employee"]',1); INSERT INTO users VALUES('d3-ceo','d3-ceo@test','Cora Chief','unused','2026-01-01'); INSERT INTO memberships VALUES('desk003','d3-ceo','["employee"]',1); INSERT INTO users VALUES('d3-ann','d3-ann@test','Ann Offshift','unused','2026-01-01'); INSERT INTO memberships VALUES('desk003','d3-ann','["operator"]',1); INSERT INTO users VALUES('d3-ben','d3-ben@test','Ben Busy','unused','2026-01-01'); INSERT INTO memberships VALUES('desk003','d3-ben','["operator"]',1); INSERT INTO users VALUES('d3-cara','d3-cara@test','Cara Free','unused','2026-01-01'); INSERT INTO memberships VALUES('desk003','d3-cara','["operator"]',1); INSERT INTO users VALUES('d3-exec','d3-exec@test','Evan Exec','unused','2026-01-01'); INSERT INTO memberships VALUES('desk003','d3-exec','["operator"]',1); INSERT INTO users VALUES('d3-pay','d3-pay@test','Pia Payroll','unused','2026-01-01'); INSERT INTO memberships VALUES('desk003','d3-pay','["operator"]',1); INSERT INTO users VALUES('d3-hw','d3-hw@test','Hal Hardware','unused','2026-01-01'); INSERT INTO memberships VALUES('desk003','d3-hw','["operator"]',1); INSERT INTO users VALUES('d3-net','d3-net@test','Nell Network','unused','2026-01-01'); INSERT INTO memberships VALUES('desk003','d3-net','["operator"]',1);`);
  const group = async (name, members) => {
    const g = check(await api('/work-groups', { name }), 201);
    for (const userId of members) check(await api(`/work-groups/${g.id}/members`, { userId }));
    return g;
  };
  const desk = await group('Service Desk', ['d3-ann', 'd3-ben', 'd3-cara']), exec = await group('Executive Support', ['d3-exec']);
  const payrollTeam = await group('Payroll Support', ['d3-pay']), hardware = await group('Hardware', ['d3-hw']), network = await group('Network', ['d3-net']);
  const ticket = async (key, headers = employee, extra = {}) =>
    check(await api('/work', { title: `DESK-003 ${key}`, body: `Ticket ${key}`, kind: 'incident', deduplicationKey: `desk003-${key}`, ...extra }, headers), 201);
  const current = async (work) => check(await api(`/work/${work.id}`)).work;

  // Ben already owns two open tickets (the overloaded agent); Ann's shift calendar is off today (the off-shift agent).
  for (const key of ['ben-1', 'ben-2']) {
    const w = await ticket(key);
    check(await api(`/work/${w.id}/commands`, { revision: (await current(w)).revision, command: 'assign', assigneeId: 'd3-ben', reason: 'Existing load' }));
  }
  const offShift = check(await api('/calendars', { name: 'Ann shift', timezone: 'UTC', weekdays: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 24, holidays: [day(-1), day(0), day(1)] }), 201);
  check(await api('/work-routing/agents/d3-ann', { calendarId: offShift.id, skills: ['mac'] }, agentC), 403);
  check(await api('/work-routing/agents/d3-employee', { skills: [] }), 422);
  check(await api('/work-routing/agents/d3-ann', { calendarId: offShift.id, skills: ['mac'] }));
  check(await api('/work-routing/agents/d3-cara', { skills: ['windows'] }));

  // Only the owner (acting for admin) writes rules; a VIP requester group routes to Executive Support ahead of the catch-all.
  const vip = check(await api('/requester-groups', { name: 'VIP', memberIds: ['d3-ceo'] }), 201);
  check(await api('/work-routing/rules', { name: 'Everyone', position: 10, groupId: desk.id }, agentC), 403);
  check(await api('/work-routing/rules', { name: 'Bad', position: 5, category: 'plumbing', groupId: desk.id }), 422);
  check(await api('/work-routing/rules', { name: 'VIP', position: 1, requesterGroupId: vip.id, groupId: exec.id }), 201);
  check(await api('/work-routing/rules', { name: 'Network', position: 2, category: 'network', groupId: network.id }), 201);
  check(await api('/work-routing/rules', { name: 'Everyone', position: 10, groupId: desk.id }), 201);
  check(await api('/work-routing/rules', { name: 'Duplicate position', position: 10, groupId: desk.id }), 409);
  check(await api(`/work-groups/${desk.id}/assignment`, { mode: 'round_robin', maxOpen: 2 }));
  check(await api(`/work-groups/${exec.id}/assignment`, { mode: 'round_robin' }));

  // Round-robin starts with Ann, who is off shift, passes Ben, who is at his cap of two, and assigns Cara.
  const rr = await ticket('round-robin');
  assert.deepEqual([rr.group_id, rr.assignee_id], [desk.id, 'd3-cara'], 'DESK-003 round-robin assigns the available agent');
  // Load-based (no cap): Ben holds two open tickets, Cara one, Ann is off shift: Cara again.
  check(await api(`/work-groups/${desk.id}/assignment`, { mode: 'load', maxOpen: 9 }));
  const byLoad = await ticket('by-load');
  assert.deepEqual([byLoad.group_id, byLoad.assignee_id], [desk.id, 'd3-cara'], 'DESK-003 load-based assigns the least-loaded available agent');
  const vipTicket = await ticket('vip', ceo);
  assert.deepEqual([vipTicket.group_id, vipTicket.assignee_id], [exec.id, 'd3-exec'], 'DESK-003 a VIP request routes to Executive Support');
  // A requester rule names one person; a restricted ticket is placed in its group but never handed to an agent.
  check(await api('/work-routing/rules', { name: 'Eli to Hardware', position: 3, requesterId: 'd3-employee', groupId: hardware.id }), 201);
  check(await api(`/work-groups/${hardware.id}/assignment`, { mode: 'round_robin' }));
  const eli = await ticket('eli'), secret = await ticket('secret', employee, { sensitivity: 'restricted' });
  assert.deepEqual([eli.group_id, eli.assignee_id], [hardware.id, 'd3-hw']);
  const secretRow = await current(secret);
  assert.deepEqual([secretRow.group_id, secretRow.assignee_id], [hardware.id, null], 'DESK-003 restricted tickets are never auto-assigned');

  // Support groups: a ticket against the Payroll service routes to Payroll Support, against a laptop CI to Hardware,
  // ahead of every rule; the owner names them.
  const observedAt = new Date().toISOString();
  const item = async (name, ciType) => check(await api('/services', { name, ciType, description: name, businessImpact: 'Work unavailable', provenance: 'observed', source: 'Configuration register', observedAt, freshnessMs: 86400000 }), 201);
  const payroll = await item('Payroll', 'business_service'), laptop = await item('DESK-003 laptop', 'hardware');
  check(await api(`/work-routing/support-groups/${payroll.id}`, { groupId: payrollTeam.id }, agentC), 403);
  check(await api(`/work-routing/support-groups/${payroll.id}`, { groupId: payrollTeam.id }));
  check(await api(`/work-routing/support-groups/${laptop.id}`, { groupId: hardware.id }));
  check(await api(`/work-routing/support-groups/missing-item`, { groupId: hardware.id }), 422);
  const payTicket = await ticket('payroll', ceo, { context: { serviceId: payroll.id } });
  const laptopTicket = await ticket('laptop', ceo, { context: { serviceId: laptop.id } });
  assert.equal(payTicket.group_id, payrollTeam.id, "DESK-003 a Payroll service ticket routes to Payroll's support group, ahead of the VIP rule");
  assert.equal(laptopTicket.group_id, hardware.id, "DESK-003 a laptop CI ticket routes to that CI's support group");

  // Category: classifying an unplaced ticket as network routes it to Network. A skill rule picks only a skilled agent.
  check(await api('/work-routing/rules/' + check(await api('/work-routing')).rules.find(r => r.name === 'Eli to Hardware').id + '/remove', {}));
  check(await api('/work-routing/rules', { name: 'Mac', position: 4, requesterId: 'd3-employee', skill: 'windows', groupId: desk.id }), 201);
  const skilled = await ticket('skilled');
  assert.equal(skilled.assignee_id, 'd3-cara', 'DESK-003 a skill rule assigns an agent holding the skill');
  const noRuleTicket = await ticket('pending-category', ceo, { context: { serviceId: 'unmapped' } });
  check(await api('/work-routing/rules/' + check(await api('/work-routing')).rules.find(r => r.name === 'VIP').id + '/remove', {}));
  check(await api('/work-routing/rules/' + check(await api('/work-routing')).rules.find(r => r.name === 'Everyone').id + '/remove', {}));
  const vpn = await ticket('vpn', ceo);
  assert.equal(vpn.group_id, null, 'DESK-003 no rule matches before classification');
  const before = await current(vpn);
  check(await api(`/work/${vpn.id}/classification/override`, { type: 'incident', category: 'network', subcategory: 'vpn', impact: 'high', urgency: 'high', priority: 'P1', revision: 0, workRevision: before.revision, reason: 'Triage' }));
  assert.equal((await current(vpn)).group_id, network.id, 'DESK-003 the network category routes to Network');
  assert.equal(noRuleTicket.group_id, exec.id, 'DESK-003 an unmapped item falls through to the rules');

  // Reassignment keeps history: routing, an agent's re-route and a manual reassignment are each recorded in order.
  check(await api(`/work/${rr.id}/route`, { revision: 0 }, agentC), 409);
  check(await api(`/work/${rr.id}/route`, { revision: (await current(rr)).revision }, employee), 403);
  const unmatched = await ticket('unmatched', ceo);
  check(await api(`/work/${unmatched.id}/route`, { revision: (await current(unmatched)).revision }, agentC), 422);
  check(await api(`/work/${rr.id}/commands`, { revision: (await current(rr)).revision, command: 'assign', assigneeId: 'd3-ben', reason: 'Ben knows this printer' }, agentC));
  const rerouted = check(await api(`/work/${rr.id}/route`, { revision: (await current(rr)).revision }, agentC));
  assert.equal(rerouted.work.assignee_id, 'd3-cara', 'DESK-003 an agent re-routes by the current rules');
  const history = check(await api(`/work/${rr.id}/assignments`, undefined, agentC)).items;
  assert.deepEqual(history.map(h => [h.action, h.to.groupId ?? null, h.to.assigneeId, h.from.assigneeId]),
    [['work.routed', desk.id, 'd3-cara', null], ['work.assigned', null, 'd3-ben', 'd3-cara'], ['work.routed', desk.id, 'd3-cara', 'd3-ben']], 'DESK-003 reassignment keeps history');
  assert.ok(history.every(h => h.actorId && h.at), 'DESK-003 each history entry names its actor and time');
  assert.equal(history[0].method, 'round_robin');
  check(await api(`/work/${rr.id}/assignments`, undefined, employee), 403);
  assert.equal(check(await api('/work', undefined, employee)).items.find(i => i.id === rr.id).group_name, undefined, 'DESK-003 requesters do not read routing');
  console.log('PASS DESK-003 public routes: support group of the Payroll service and a laptop CI ahead of owner-ordered rules by VIP requester group, requester, category and skill; round-robin and load-based assignment skip the off-shift and overloaded agents; restricted tickets never auto-assigned; reassignment history');
}

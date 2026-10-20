import assert from 'node:assert/strict';
/** DESK-001: agent groups created by the owner (acting for admin) with named leads, one accountable group and an owner
 * who is a member of it on each ticket, and a group lead's view that lists only the group's non-restricted tickets. */
export async function deskGroupChecks(workspaceApi, db) {
  const api = (path, body, headers = {}) => workspaceApi(path, body, { 'x-workspace': 'desk001', ...headers });
  const check = (r, status = 200) => { assert.equal(r.status, status, 'DESK-001 ' + JSON.stringify(r)); return r.value; };
  const as = (user, roles) => ({ 'x-user': user, 'x-roles': JSON.stringify(roles) });
  const employee = as('employee', ['employee']), netLead = as('d1-net-lead', ['operator']), netAgent = as('d1-net-agent', ['operator']), hwAgent = as('d1-hw-agent', ['operator']);
  await db.exec(`INSERT INTO workspaces VALUES('desk001','Desk 001','2026-01-01');
    INSERT INTO users VALUES('d1-net-lead','netlead001@test','Nia Lead','unused','2026-01-01'); INSERT INTO users VALUES('d1-net-agent','netagent001@test','Noel Agent','unused','2026-01-01'); INSERT INTO users VALUES('d1-hw-agent','hwagent001@test','Hana Agent','unused','2026-01-01');
    INSERT INTO memberships VALUES('desk001','owner','["owner"]',1); INSERT INTO memberships VALUES('desk001','employee','["employee"]',1);
    INSERT INTO memberships VALUES('desk001','d1-net-lead','["operator"]',1); INSERT INTO memberships VALUES('desk001','d1-net-agent','["operator"]',1); INSERT INTO memberships VALUES('desk001','d1-hw-agent','["operator"]',1);`);

  // The owner creates two groups and names their members and leads; agents and employees cannot.
  check(await api('/work-groups', { name: 'Network' }, netLead), 403);
  const network = check(await api('/work-groups', { name: 'Network' }), 201), hardware = check(await api('/work-groups', { name: 'Hardware' }), 201);
  check(await api('/work-groups', { name: 'Network' }), 409);
  check(await api(`/work-groups/${network.id}/members`, { userId: 'employee' }), 422);
  check(await api(`/work-groups/${network.id}/members`, { userId: 'd1-net-agent' }, netLead), 403);
  check(await api(`/work-groups/${network.id}/members`, { userId: 'd1-net-lead', lead: true }));
  check(await api(`/work-groups/${network.id}/members`, { userId: 'd1-net-agent' }));
  check(await api(`/work-groups/${hardware.id}/members`, { userId: 'd1-hw-agent' }));
  check(await api(`/work-groups/${hardware.id}/members`, { userId: 'owner', lead: true }));
  const groups = check(await api('/work-groups', undefined, netAgent)).items;
  assert.deepEqual(groups.map(g => [g.name, g.members.map(m => [m.name, m.lead])]), [['Hardware', [['Hana Agent', false], ['Owner', true]]], ['Network', [['Nia Lead', true], ['Noel Agent', false]]]]);
  check(await api('/work-groups', undefined, employee), 403);

  const ticket = async (key, sensitivity = 'normal') => check(await api('/work', { title: `DESK-001 ${key}`, body: `Ticket ${key}`, kind: 'incident', sensitivity, deduplicationKey: `desk001-${key}` }, employee), 201);
  const place = async (work, groupId, extra = {}, headers = {}, status = 200) => {
    const current = check(await api(`/work/${work.id}`)).work;
    return check(await api(`/work/${work.id}/group`, { groupId, revision: current.revision, ...extra }, headers), status);
  };
  const vpn = await ticket('vpn'), wifi = await ticket('wifi'), netSecret = await ticket('net-secret', 'restricted');
  const dock = await ticket('dock'), hwSecret = await ticket('hw-secret', 'restricted');

  // Each ticket has one accountable group; its owner must be an agent in that group, on placement and on assignment.
  await place(vpn, network.id, {}, employee, 403);
  await place(vpn, network.id, { assigneeId: 'd1-hw-agent' }, netAgent, 422);
  const placed = await place(vpn, network.id, { assigneeId: 'd1-net-agent' }, netAgent);
  assert.deepEqual([placed.group_id, placed.assignee_id], [network.id, 'd1-net-agent']);
  await place(vpn, hardware.id, {}, netAgent, 422);
  const reassign = async (work, assigneeId, status) => {
    const current = check(await api(`/work/${work.id}`)).work;
    return check(await api(`/work/${work.id}/commands`, { revision: current.revision, command: 'assign', assigneeId, reason: 'Triage' }, netLead), status);
  };
  assert.match((await reassign(vpn, 'd1-hw-agent', 422)).error, /agent in its group/);
  await reassign(vpn, 'd1-net-lead', 200);
  check(await api(`/work-groups/${network.id}/members/d1-net-lead/remove`, {}), 409);
  await place(wifi, network.id, {}, netAgent);
  await place(netSecret, network.id);
  await place(dock, hardware.id, { assigneeId: 'd1-hw-agent' }, hwAgent);
  await place(hwSecret, hardware.id);
  const audit = await db.prepare("SELECT COUNT(*) n FROM audit_events WHERE workspace_id='desk001' AND action='work.group_set'").first();
  assert.equal(audit.n, 5, 'DESK-001 each group placement is audited');

  // The Network lead's view lists Network's non-restricted tickets only: never Hardware's restricted ticket.
  const view = async (groupId, headers, status = 200) => check(await api(`/work-groups/${groupId}/queue`, undefined, headers), status);
  const titles = (items) => items.map(i => i.title).sort();
  assert.deepEqual(titles((await view(network.id, netLead)).items), ['DESK-001 vpn', 'DESK-001 wifi'], "DESK-001 the lead's view excludes another group's tickets and restricted tickets");
  await view(network.id, netAgent, 403);
  await view(hardware.id, netLead, 403);
  // The owner reads every restricted ticket elsewhere, yet the Hardware lead view still leaves restricted tickets out.
  assert.deepEqual(titles((await view(hardware.id, {})).items), ['DESK-001 dock']);
  assert.ok(check(await api('/work')).items.some(i => i.id === hwSecret.id), 'DESK-001 the owner still reads the restricted ticket');
  assert.ok(!check(await api('/work', undefined, netLead)).items.some(i => i.sensitivity === 'restricted'), 'DESK-001 no widening: agents never list restricted tickets');
  check(await api(`/work/${hwSecret.id}`, undefined, netLead), 404);
  // The queue names each ticket's group and priority for agents only; the requester's own listing does not.
  assert.equal(check(await api('/work', undefined, netLead)).items.find(i => i.id === vpn.id).group_name, 'Network');
  assert.equal(check(await api('/work', undefined, employee)).items.find(i => i.id === vpn.id).group_name, undefined);
  console.log("PASS DESK-001 groups: owner-created groups with leads, one accountable group with a member owner, a lead's view of the group's non-restricted tickets");
}

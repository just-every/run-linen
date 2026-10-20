import assert from 'node:assert/strict';
/** PROJECT-001: an IT team project with milestones, dependent tasks, linked relocations/changes/tickets, timeline flags and combined workload, through public routes. */
export async function projectChecks(api) {
  const employee = { 'x-user': 'employee', 'x-roles': '["employee"]' }, agent = { 'x-user': 'search-agent', 'x-roles': '["operator"]' };
  const make = async (path, body, headers, status = 201) => { const r = await api(path, body, headers); assert.equal(r.status, status, 'PROJECT-001 ' + JSON.stringify(r)); return r.value; };
  await make('/projects', { name: 'Denver office move' }, employee, 403);
  assert.equal((await api('/projects', undefined, employee)).status, 403);
  const created = await make('/projects', { name: 'Denver office move', description: 'Move the Denver office from the 3rd to the 5th floor.', ownerId: 'owner' });
  const projectId = created.project.id;
  await make(`/projects/${projectId}/milestones`, { name: 'Network ready', dueDate: '2030-03-01' });
  await make(`/projects/${projectId}/milestones`, { name: 'Network ready', dueDate: 'March' }, undefined, 422);
  const milestones = (await make(`/projects/${projectId}`, undefined, undefined, 200)).milestones;
  const move = await make(`/projects/${projectId}/milestones`, { name: 'Move day', dueDate: '2030-03-15' });
  const titles = ['Survey 5th floor', 'Book movers', 'Order switches', 'Label desks', 'Run cabling', 'Test Wi-Fi',
    'Pack monitors', 'Move laptops', 'Relocate printers', 'Update seating map', 'Patch new switches', 'Close 3rd floor'];
  const tasks = [];
  for (const [i, title] of titles.entries())
    tasks.push((await make(`/projects/${projectId}/tasks`, { title, milestoneId: i < 6 ? milestones[0].id : move.id, ownerId: i % 2 ? 'search-agent' : 'owner',
      dueDate: i === 2 ? '2030-03-12' : `2030-0${i < 6 ? 2 : 3}-${String(10 + i).padStart(2, '0')}` })).id);
  await make(`/projects/${projectId}/tasks`, { title: 'Unowned', ownerId: 'employee', dueDate: '2030-02-01' }, undefined, 422);
  // "Patch new switches", due 11 March, depends on "Order switches", due 12 March: flagged blocked. "Label desks" waits on the earlier survey.
  let read = await make(`/projects/${projectId}`, undefined, undefined, 200);
  const patch = read.tasks.find(t => t.id === tasks[10]);
  read = await make(`/projects/${projectId}/tasks/${tasks[10]}`, { revision: patch.revision, dependsOn: [tasks[2]], dueDate: '2030-03-11' }, undefined, 200);
  const label = read.tasks.find(t => t.id === tasks[3]);
  read = await make(`/projects/${projectId}/tasks/${tasks[3]}`, { revision: label.revision, dependsOn: [tasks[0]] }, undefined, 200);
  await make(`/projects/${projectId}/tasks/${tasks[0]}`, { revision: 1, dependsOn: [tasks[0]] }, undefined, 422);
  assert.equal(read.tasks.length, 12);
  assert.deepEqual([...new Set(read.tasks.map(t => t.milestone_id))].length, 2);
  const flagged = read.tasks.find(t => t.id === tasks[10]);
  assert.equal(flagged.dependency.state, 'blocked', 'PROJECT-001 the timeline flags a dependency due after its dependent task');
  assert.deepEqual(flagged.dependency.blockedBy, [tasks[2]]);
  assert.equal(read.tasks.find(t => t.id === tasks[3]).dependency.state, 'waiting');
  assert.deepEqual(read.tasks.map(t => t.due_date), [...read.tasks.map(t => t.due_date)].sort(), 'PROJECT-001 timeline ordered by due date');
  await make(`/projects/${projectId}/tasks/${tasks[10]}`, { revision: flagged.revision, status: 'done' }, undefined, 409);
  const survey = read.tasks.find(t => t.id === tasks[0]);
  read = await make(`/projects/${projectId}/tasks/${tasks[0]}`, { revision: survey.revision, status: 'done' }, undefined, 200);
  assert.equal(read.tasks.find(t => t.id === tasks[3]).dependency.state, 'clear');
  assert.equal(read.board.done.length, 1); assert.equal(read.board.todo.length, 11);

  // Thirty asset relocations, two changes and a ticket link to the project.
  const assets = [];
  for (let i = 0; i < 30; i++) assets.push((await make('/assets', { serial: `DEN-MOVE-${i}`, source: 'Denver move inventory', location: 'Denver 3rd floor' })).id);
  const service = await make('/services', { name: 'Denver office network', description: 'Office connectivity', businessImpact: 'Office work blocked', source: 'Reviewed CI register', observedAt: new Date().toISOString(), visibility: 'workspace' });
  const change = title => make('/changes', { title, services: [service.id], risk: 'low', impact: 'Denver office', cohorts: ['Denver'], canaryCohorts: ['Denver'], window: { start: '2030-03-14T01:00:00Z', end: '2030-03-14T02:00:00Z' }, implementation: { action: title }, compensation: { action: 'restore' } });
  const changes = [await change('Cut over Denver switches'), await change('Move Denver Wi-Fi SSID')];
  const ticket = await make('/work', { title: 'Need a desk on the 5th floor', body: 'Where do I sit after the move?', deduplicationKey: 'project-ticket' }, employee);
  await make(`/work/${ticket.id}/commands`, { revision: ticket.revision, command: 'assign', reason: 'Seating plan owner', assigneeId: 'search-agent' }, undefined, 200);
  const hrTicket = await make('/work', { title: 'Relocation accommodation', body: 'Private', sensitivity: 'hr', deduplicationKey: 'project-hr' });
  await make(`/projects/${projectId}/links`, { items: [{ kind: 'ticket', targetId: hrTicket.id }] }, undefined, 422);
  await make(`/projects/${projectId}/links`, { items: [{ kind: 'asset', targetId: 'missing' }] }, undefined, 422);
  read = await make(`/projects/${projectId}/links`, { items: [
    ...assets.map(targetId => ({ kind: 'asset', targetId, taskId: tasks[7], detail: 'Denver 3rd floor -> Denver 5th floor' })),
    ...changes.map(c => ({ kind: 'change', targetId: c.id })), { kind: 'ticket', targetId: ticket.id },
  ] }, undefined, 200);
  assert.equal(read.links.filter(l => l.kind === 'asset' && l.detail.includes('5th floor')).length, 30, 'PROJECT-001 thirty asset relocations link to the project');
  assert.deepEqual(read.links.filter(l => l.kind === 'change').map(l => l.label).sort(), ['Cut over Denver switches', 'Move Denver Wi-Fi SSID']);
  assert.ok(read.links.some(l => l.kind === 'ticket' && l.target_id === ticket.id));
  // Audience: an employee is refused every project route and API, reads and writes alike, and changes nothing.
  const before = await make(`/projects/${projectId}`, undefined, undefined, 200);
  for (const [path, body] of [['/projects'], ['/projects', { name: 'Employee project' }], [`/projects/${projectId}`], ['/workload'],
    [`/projects/${projectId}/status`, { revision: before.project.revision, status: 'on_hold' }], [`/projects/${projectId}/milestones`, { name: 'Employee milestone', dueDate: '2030-04-01' }],
    [`/projects/${projectId}/tasks`, { title: 'Employee task', ownerId: 'owner', dueDate: '2030-04-01' }], [`/projects/${projectId}/tasks/${tasks[1]}`, { revision: 1, status: 'done' }],
    [`/projects/${projectId}/links`, { items: [{ kind: 'ticket', targetId: ticket.id }] }]]) {
    const r = await api(path, body, employee);
    assert.equal(r.status, 403, `PROJECT-001 an employee is refused ${body ? 'POST' : 'GET'} ${path}`);
  }
  const after = await make(`/projects/${projectId}`, undefined, undefined, 200);
  assert.deepEqual([after.project.status, after.milestones.length, after.tasks.length, after.links.length], [before.project.status, before.milestones.length, before.tasks.length, before.links.length], 'PROJECT-001 refused employee calls change nothing');

  const load = (await make('/workload', undefined, undefined, 200)).items.find(r => r.userId === 'search-agent');
  assert.ok(load.openTickets >= 1 && load.openProjectTasks === 6 && load.total === load.openTickets + 6, 'PROJECT-001 workload combines project tasks and tickets');
  console.log('PASS PROJECT-001 public routes: two milestones and 12 owned tasks, dependency waiting/blocked timeline flags and done refusal, board, 30 asset relocations + 2 changes + ticket links (HR ticket refused), an employee refused every project route and the workload API with nothing changed, agent workload with tickets and project tasks');
}

import assert from 'node:assert/strict';
/** PROJECT-001: an IT team project with milestones, dependent tasks, linked relocations/changes/tickets, timeline flags and combined workload, through public routes. */
export async function projectChecks(api, db) {
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
  const reverse=(await make(`/assets/${assets[0]}/history`,undefined,undefined,200)).events.filter(e=>e.action==='asset_linked');
  assert.equal(reverse.length,1,'DESK-017 task-to-asset link appends one reverse asset event');
  assert.deepEqual(reverse[0].changes,[{field:'link',before:null,after:{kind:'task',id:tasks[7]}}],'Reverse history freezes the task identity without source titles');
  await make(`/projects/${projectId}/links`,{items:[{kind:'asset',targetId:assets[0],taskId:tasks[7]}]},undefined,200);
  assert.deepEqual((await make(`/assets/${assets[0]}/history`,undefined,undefined,200)).events.filter(e=>e.action==='asset_linked'),reverse,'A replay preserves the same original asset event');

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
  // DESK-017: every current project-task write emits original field values, never a live reconstruction.
  const historyPath = `/projects/${projectId}/tasks/${tasks[7]}/activity`;
  const history = async (headers) => (await make(historyPath, undefined, headers, 200)).items;
  let events = await history();
  assert.equal(events.length, 31, 'DESK-017 creation plus thirty task-specific asset links');
  assert.deepEqual(events[0].changes, [
    { field: 'title', before: null, after: 'Move laptops' }, { field: 'state', before: null, after: 'todo' },
    { field: 'owner', before: null, after: 'search-agent' }, { field: 'dueDate', before: null, after: '2030-03-17' },
    { field: 'milestone', before: null, after: move.id }, { field: 'dependencies', before: null, after: [] },
  ], 'DESK-017 complete task creation snapshot');
  assert.equal(events[1].changes[0].field, 'asset link');
  assert.ok(assets.includes(events[1].changes[0].after));
  assert.equal(events[0].actor, 'Owner'); assert.equal(events[0].actorKind, 'person');
  assert.ok(events.every(e => e.visibility === 'private' && Number.isFinite(Date.parse(e.at))));
  const prior = structuredClone(events);
  const readTask = async () => (await make(`/projects/${projectId}`, undefined, undefined, 200)).tasks.find(t => t.id === tasks[7]);
  let task = await readTask();
  const body = { revision: task.revision, status: 'in_progress', ownerId: 'owner', dueDate: '2030-03-18', dependsOn: [tasks[0]] };
  await make(`/projects/${projectId}/tasks/${task.id}`, body, agent, 200);
  events = await history();
  assert.deepEqual(events.slice(0, prior.length), prior, 'DESK-017 later writes leave earlier entries unchanged');
  assert.deepEqual(events.at(-1).changes, [
    { field: 'state', before: 'todo', after: 'in_progress' }, { field: 'owner', before: 'search-agent', after: 'owner' },
    { field: 'dueDate', before: '2030-03-17', after: '2030-03-18' }, { field: 'dependencies', before: [], after: [tasks[0]] },
  ]);
  assert.equal(events.at(-1).actor, (await db.prepare("SELECT name FROM users WHERE id='search-agent'").first()).name);
  // Stale commands, invalid ownership, open dependencies and repeated links cannot invent history.
  await make(`/projects/${projectId}/tasks/${task.id}`, body, agent, 409);
  task = await readTask();
  await make(`/projects/${projectId}/tasks/${task.id}`, { revision: task.revision, ownerId: 'employee' }, undefined, 422);
  await make(`/projects/${projectId}/tasks/${tasks[10]}`, { revision: flagged.revision, status: 'done' }, undefined, 409);
  await make(`/projects/${projectId}/links`, { items: [{ kind: 'asset', targetId: assets[0], taskId: task.id }] }, undefined, 200);
  await make(`/projects/${projectId}/tasks/${task.id}`, { revision: task.revision, status: task.status }, undefined, 200);
  assert.deepEqual(await history(), events, 'DESK-017 refused, duplicate and no-op writes append no field event');
  // A failing audit insert rolls the task mutation back; history cannot silently miss a successful write.
  task = await readTask();
  await db.exec("CREATE TRIGGER task_audit_fault BEFORE INSERT ON audit_events WHEN NEW.action='work.project_task_updated' BEGIN SELECT RAISE(ABORT,'fixture audit unavailable'); END");
  try { await make(`/projects/${projectId}/tasks/${task.id}`, { revision: task.revision, status: 'blocked' }, undefined, 500); }
  finally { await db.exec('DROP TRIGGER task_audit_fault'); }
  assert.deepEqual(await readTask(), task, 'DESK-017 audit failure rolls back the state and revision');
  assert.deepEqual(await history(), events);
  // Exactly one simultaneous revision wins and contributes exactly one history entry.
  const writes = await Promise.all(['blocked', 'done'].map(status => api(`/projects/${projectId}/tasks/${task.id}`, { revision: task.revision, status })));
  assert.deepEqual(writes.map(r => r.status).sort(), [200, 409]);
  const finalHistory = await history();
  assert.equal(finalHistory.length, events.length + 1, 'DESK-017 only the committed CAS gets an event');
  assert.deepEqual(finalHistory.map(e => e.at), finalHistory.map(e => e.at).sort());
  assert.deepEqual(finalHistory.slice(0, events.length), events);
  // Same current role/tenant/project boundaries as the ordinary project read, including forged role headers.
  for (const headers of [employee, { ...employee, 'x-roles': '["owner"]' }])
    assert.equal((await api(historyPath, undefined, headers)).status, 403, 'DESK-017 employee cannot read task history');
  assert.equal((await api(historyPath, undefined, { 'x-workspace': 'elsewhere' })).status, 404);
  const other = await make('/projects', { name: 'Another project' });
  assert.equal((await api(`/projects/${other.project.id}/tasks/${task.id}/activity`)).status, 404);
  await db.prepare("INSERT INTO users VALUES('task-auditor','auditor@test','Task Auditor','unused','2026-01-01')").run();
  await db.prepare(`INSERT INTO memberships VALUES('a','task-auditor','["auditor"]',1)`).run();
  const auditor = { 'x-user': 'task-auditor', 'x-roles': '["auditor"]' };
  assert.deepEqual(await history(auditor), finalHistory);
  const privilegedRead = await db.prepare("SELECT 1 FROM audit_events WHERE actor_id='task-auditor' AND action='work.project_task_activity_read' AND target=?").bind(task.id).first();
  assert.ok(privilegedRead, 'DESK-017 privileged history read is audited without copying values');
  await db.prepare("UPDATE memberships SET active=0 WHERE user_id='task-auditor'").run();
  assert.equal((await api(historyPath, undefined, auditor)).status, 404, 'DESK-017 deactivation applies to the next read');
  console.log('PASS DESK-017 project tasks: original creation/edit/link values, actor/time, append-only chronology, no-op/duplicate/refusal, simultaneous CAS, atomic audit rollback, live employee/auditor/project/tenant boundaries');
  console.log('PASS PROJECT-001 public routes: two milestones and 12 owned tasks, dependency waiting/blocked timeline flags and done refusal, board, 30 asset relocations + 2 changes + ticket links (HR ticket refused), an employee refused every project route and the workload API with nothing changed, agent workload with tickets and project tasks');
  return { historyPath, items: finalHistory };
}

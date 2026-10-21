import assert from 'node:assert/strict';
/** DESK-015: group-scoped scenarios offered only to the group, run as one audited action with each change's before and
 * after, refused whole when a step is outside the runner's role, run in bulk, and a record template's ticket draft. */
export async function deskScenarioChecks(workspaceApi, db) {
  const api = (path, body, headers = {}) => workspaceApi(path, body, { 'x-workspace': 'desk015', ...headers });
  const check = (r, status = 200) => { assert.equal(r.status, status, 'DESK-015 ' + JSON.stringify(r)); return r.value; };
  const as = (user, roles) => ({ 'x-user': user, 'x-roles': JSON.stringify(roles) });
  const employee = as('d15-employee', ['employee']), desk = as('d15-desk', ['operator']), outsider = as('d15-outsider', ['operator']), hr = as('d15-hr', ['hr']);
  await db.exec(`INSERT INTO workspaces VALUES('desk015','Desk 015','2026-01-01'); INSERT INTO memberships VALUES('desk015','owner','["owner"]',1);
    INSERT INTO users VALUES('d15-employee','d15-employee@test','Erin Employee','unused','2026-01-01'); INSERT INTO memberships VALUES('desk015','d15-employee','["employee"]',1);
    INSERT INTO users VALUES('d15-desk','d15-desk@test','Dana Desk','unused','2026-01-01'); INSERT INTO memberships VALUES('desk015','d15-desk','["operator"]',1);
    INSERT INTO users VALUES('d15-outsider','d15-outsider@test','Omar Outside','unused','2026-01-01'); INSERT INTO memberships VALUES('desk015','d15-outsider','["operator"]',1);
    INSERT INTO users VALUES('d15-net','d15-net@test','Nora Network','unused','2026-01-01'); INSERT INTO memberships VALUES('desk015','d15-net','["operator"]',1);
    INSERT INTO users VALUES('d15-hr','d15-hr@test','Hollis HR','unused','2026-01-01'); INSERT INTO memberships VALUES('desk015','d15-hr','["hr"]',1);`);
  const serviceDesk = check(await api('/work-groups', { name: 'Service Desk' }), 201), networkL2 = check(await api('/work-groups', { name: 'Network L2' }), 201);
  check(await api(`/work-groups/${serviceDesk.id}/members`, { userId: 'd15-desk' }));
  check(await api(`/work-groups/${networkL2.id}/members`, { userId: 'd15-net', lead: true }));
  const ticket = async (key, extra = {}) => check(await api('/work', { title: `DESK-015 ${key}`, body: `Ticket ${key}`, kind: 'incident', deduplicationKey: `desk015-${key}`, ...extra }, employee), 201);

  // A Service Desk agent saves the group-scoped "Escalate to Network L2"; an outsider cannot save into that group.
  const escalate = {
    name: 'Escalate to Network L2', scope: 'group', groupId: serviceDesk.id,
    steps: {
      classification: { type: 'incident', category: 'network', subcategory: 'vpn', impact: 'high', urgency: 'medium', priority: 'P2' },
      group: { groupId: networkL2.id, assigneeId: null },
      message: { visibility: 'private', body: 'Escalated to Network L2: tunnel drops after the client update.' },
      status: { command: 'pause', reason: 'Waiting on Network L2', waitingOn: 'vendor' },
    },
  };
  check(await api('/work-scenarios', escalate, outsider), 403);
  check(await api('/work-scenarios', { ...escalate, scope: 'workspace' }, desk), 403);
  check(await api('/work-scenarios', { ...escalate, steps: { watchers: [] } }, desk), 422);
  const scenario = check(await api('/work-scenarios', escalate, desk), 201);
  assert.deepEqual(check(await api('/work-scenarios', undefined, desk)).items.map(s => s.name), ['Escalate to Network L2']);
  assert.deepEqual(check(await api('/work-scenarios', undefined, outsider)).items, [], 'DESK-015 an agent outside the group is not offered it');
  check(await api('/work-scenarios', undefined, employee), 403);

  const vpn = await ticket('vpn');
  const before = check(await api(`/work/${vpn.id}`, undefined, desk)).work;
  check(await api(`/work/${vpn.id}/scenario-runs`, { scenarioId: scenario.id, revision: before.revision }, outsider), 404);
  assert.equal(check(await api(`/work/${vpn.id}`, undefined, desk)).work.revision, before.revision, 'DESK-015 the refused direct call changes nothing');
  const run = check(await api(`/work/${vpn.id}/scenario-runs`, { scenarioId: scenario.id, revision: before.revision }, desk));
  assert.deepEqual([run.work.group_id, run.work.state], [networkL2.id, 'paused']);
  const runs = check(await api(`/work/${vpn.id}/scenario-runs`, undefined, desk)).items;
  assert.equal(runs.length, 1, 'DESK-015 one audit entry per run');
  const change = (field) => runs[0].changes.find(c => c.field === field);
  assert.deepEqual([change('category').before, change('category').after], [null, 'network']);
  assert.deepEqual([change('priority').after, change('group').after, change('state').before, change('state').after], ['P2', networkL2.id, 'open', 'paused']);
  assert.deepEqual([change('private note').after, runs[0].actorId, runs[0].name], ['added', 'd15-desk', 'Escalate to Network L2']);
  const agentView = check(await api(`/work/${vpn.id}`, undefined, desk)).messages, requesterView = check(await api(`/work/${vpn.id}`, undefined, employee)).messages;
  assert.ok(agentView.some(m => m.visibility === 'private' && m.body.includes('Network L2')));
  assert.ok(!requesterView.some(m => m.body.includes('tunnel drops')), 'DESK-015 the requester sees no note');
  check(await api(`/work/${vpn.id}/scenario-runs`, undefined, employee), 403);

  // A workspace scenario with a classification step is offered to an HR agent, but running it applies nothing.
  const triage = check(await api('/work-scenarios', { name: 'Hardware triage', scope: 'workspace', steps: {
    classification: { type: 'incident', category: 'hardware', subcategory: 'laptop', impact: 'medium', urgency: 'medium' },
    fields: [], status: { command: 'pause', reason: 'Waiting for parts' } } }), 422);
  assert.ok(triage.error);
  const workspaceScenario = check(await api('/work-scenarios', { name: 'Hardware triage', scope: 'workspace', steps: {
    classification: { type: 'incident', category: 'hardware', subcategory: 'laptop', impact: 'medium', urgency: 'medium' },
    status: { command: 'pause', reason: 'Waiting for parts' } } }), 201);
  const dock = await ticket('dock');
  const dockBefore = check(await api(`/work/${dock.id}`)).work;
  assert.ok(check(await api('/work-scenarios', undefined, hr)).items.some(s => s.id === workspaceScenario.id));
  const refused = check(await api(`/work/${dock.id}/scenario-runs`, { scenarioId: workspaceScenario.id }, hr), 403);
  assert.match(refused.error, /nothing was applied/);
  const dockAfter = check(await api(`/work/${dock.id}`)).work;
  assert.deepEqual([dockAfter.state, dockAfter.revision], [dockBefore.state, dockBefore.revision], 'DESK-015 a step outside the role applies nothing');
  assert.equal(check(await api(`/work/${dock.id}/classification`)).current, null);

  // The bulk-update door runs the scenario on each chosen ticket under the single-ticket rules.
  const a = await ticket('bulk-a'), b = await ticket('bulk-b');
  const bulk = check(await api('/work/bulk-commands', { workIds: [a.id, b.id], command: 'scenario', scenarioId: workspaceScenario.id, reason: 'Bulk triage' }, desk));
  assert.deepEqual([bulk.changed, bulk.refused], [2, 0]);
  assert.equal(check(await api(`/work/${a.id}`)).work.state, 'paused');
  assert.equal(check(await api('/work/bulk-commands', { workIds: [a.id], command: 'scenario', scenarioId: scenario.id, reason: 'Not offered' }, outsider)).refused, 1);

  // A "New laptop setup" record template pre-fills a new ticket's fields.
  check(await api('/work-templates', { name: 'New laptop setup', kind: 'service_request', title: 'Set up a new laptop', body: 'Model, start date and apps to install:' }, employee), 403);
  const laptop = check(await api('/work-templates', { name: 'New laptop setup', kind: 'service_request', title: 'Set up a new laptop', body: 'Model, start date and apps to install:', context: { deviceModel: 'MacBook Pro 14' } }, desk), 201);
  const { draft } = check(await api(`/work-templates/${laptop.id}`, undefined, employee));
  assert.deepEqual(draft, { kind: 'service_request', title: 'Set up a new laptop', body: 'Model, start date and apps to install:', context: { deviceModel: 'MacBook Pro 14' } });
  const created = await ticket('from-template', { ...draft, body: `${draft.body} MacBook Pro 14, Monday, Figma` });
  assert.deepEqual([created.kind, created.title, JSON.parse(created.context_json).deviceModel], ['service_request', 'Set up a new laptop', 'MacBook Pro 14']);
  // DESK-015 fields, classification, assignment, canned public replies and all status commands.
  const office = check(await api('/desk-fields', { name: 'Office', type: 'dropdown', options: ['Denver', 'Austin'], kinds: ['incident'] }), 201);
  const response = check(await api('/canned-responses', { title: 'Scenario reply', body: 'Hello {{requester.name}}, we are checking {{ticket.title}}.' }, desk), 201);
  const full = check(await api('/work-scenarios', { name: 'Assign and reply', scope: 'author', steps: {
    classification: { type: 'incident', category: 'hardware', subcategory: 'laptop', impact: 'medium', urgency: 'high', priority: 'P2' },
    group: { groupId: networkL2.id, assigneeId: 'd15-net' }, fields: [{ fieldId: office.id, value: 'Denver' }],
    message: { visibility: 'public', templateId: response.id }, status: { command: 'pause', reason: 'Waiting on vendor', waitingOn: 'vendor' }
  } }, desk), 201);
  const fullTicket = await ticket('full-scenario');
  const fullRun = check(await api(`/work/${fullTicket.id}/scenario-runs`, { scenarioId: full.id }, desk));
  assert.deepEqual(check(await api(`/work/${fullTicket.id}/classification`)).current,
    { type: 'incident', category: 'hardware', subcategory: 'laptop', impact: 'medium', urgency: 'high', priority: 'P2' });
  assert.equal(fullRun.work.assignee_id, 'd15-net');
  for (const [field, after] of Object.entries({ type: 'incident', category: 'hardware', subcategory: 'laptop', impact: 'medium', urgency: 'high', priority: 'P2', owner: 'd15-net' })) {
    const change = fullRun.changes.find(c => c.field === field);
    assert.deepEqual([change.before, change.after], [null, after], `DESK-015 audited ${field} before and after`);
  }
  assert.deepEqual(fullRun.changes.find(c => c.field === 'Office'), { step: 'fields', field: 'Office', before: null, after: 'Denver' });
  assert.ok(check(await api(`/work/${fullTicket.id}`, undefined, employee)).messages.some(m => m.body === 'Hello Erin Employee, we are checking DESK-015 full-scenario.'));
  const resume = check(await api('/work-scenarios', { name: 'Resume', scope: 'workspace', steps: { status: { command: 'resume', reason: 'Vendor answered' } } }), 201);
  assert.equal(check(await api(`/work/${fullTicket.id}/scenario-runs`, { scenarioId: resume.id }, desk)).work.state, 'open');
  const close = check(await api('/work-scenarios', { name: 'Close with resolution', scope: 'workspace', steps: { status: { command: 'close', reason: 'Replaced the laptop adapter', resolutionCode: 'Solved (permanent fix)' } } }), 201);
  assert.equal(check(await api(`/work/${fullTicket.id}/scenario-runs`, { scenarioId: close.id }, desk)).work.state, 'closed');
  assert.equal(check(await api(`/work/${fullTicket.id}/desk`)).resolution.code, 'Solved (permanent fix)');
  const stopTicket = await ticket('stopped-run');
  const stop = check(await api('/work-scenarios', { name: 'Missing close code', scope: 'workspace', steps: {
    classification: { type: 'incident', category: 'hardware', subcategory: 'laptop', impact: 'medium', urgency: 'high', priority: 'P2' },
    status: { command: 'close', reason: 'Missing resolution code' }
  } }), 201);
  check(await api(`/work/${stopTicket.id}/scenario-runs`, { scenarioId: stop.id }, desk), 422);
  const stopped = check(await api(`/work/${stopTicket.id}/scenario-runs`, undefined, desk)).items;
  assert.equal(stopped.length, 1, 'DESK-015 a data refusal still leaves one honest audited run');
  assert.ok(stopped[0].errorCode);
  assert.ok(stopped[0].changes.some(c => c.field === 'category' && c.after === 'hardware'));
  assert.ok(!stopped[0].changes.some(c => c.field === 'state'));
  assert.equal(check(await api(`/work/${stopTicket.id}`)).work.state, 'open');
  // DESK-015 task plans use the existing PROJECT-001 doors; all permission checks precede field changes.
  const planTicket = await ticket('task-plan');
  const plan = check(await api('/work-scenarios', { name: 'Prepare laptop duties', scope: 'author', steps: {
    taskPlan: { name: 'Laptop preparation', tasks: [{ title: 'Install approved tools', ownerId: 'd15-net', dueDate: '2026-11-01' }] }
  } }, desk), 201);
  assert.ok(!check(await api('/work-scenarios', undefined, outsider)).items.some(s => s.id === plan.id), 'DESK-015 author scope');
  const started = check(await api(`/work/${planTicket.id}/scenario-runs`, { scenarioId: plan.id }, desk));
  const projectId = started.changes.find(c => c.field === 'task plan').after;
  const project = check(await api(`/projects/${projectId}`, undefined, desk));
  assert.equal(project.project.name, 'Laptop preparation');
  const taskHistory = check(await api(`/projects/${projectId}/tasks/${project.tasks[0].id}/activity`, undefined, desk)).items;
  assert.equal(taskHistory.length, 1, 'DESK-017 scenario task creation is recorded once');
  assert.equal(taskHistory[0].actorKind, 'scenario');
  assert.ok(taskHistory[0].initiatedBy && taskHistory[0].at);
  assert.ok(taskHistory[0].changes.some(c => c.field === 'title' && c.before === null && c.after === 'Install approved tools'), 'DESK-017 scenario task keeps original field values');
  assert.deepEqual(project.tasks.map(t => [t.title, t.owner_id, t.due_date]), [['Install approved tools', 'd15-net', '2026-11-01']]);
  assert.ok(project.links.some(l => l.kind === 'ticket' && l.target_id === planTicket.id));
  const link = check(await api('/work-scenarios', { name: 'Link laptop plan', scope: 'workspace', steps: { taskPlan: { projectId } } }), 201);
  check(await api(`/work/${dock.id}/scenario-runs`, { scenarioId: link.id }, desk));
  assert.ok(check(await api(`/projects/${projectId}`)).links.some(l => l.target_id === dock.id));
  const restricted = await ticket('restricted-plan', { sensitivity: 'restricted' });
  const restrictedBefore = check(await api(`/work/${restricted.id}`)).work;
  check(await api(`/work/${restricted.id}/scenario-runs`, { scenarioId: link.id }), 422);
  assert.equal(check(await api(`/work/${restricted.id}`)).work.revision, restrictedBefore.revision, 'DESK-015 project normal-ticket boundary inherited');
  const deniedPlan = check(await api('/work-scenarios', { name: 'HR cannot start an IT plan', scope: 'workspace', steps: {
    fields: [{ fieldId: 'not-applied', value: 'no' }], taskPlan: { projectId }
  } }), 201);
  check(await api(`/work/${dock.id}/scenario-runs`, { scenarioId: deniedPlan.id }, hr), 403);
  assert.equal(check(await api(`/work/${dock.id}/scenario-runs`)).items.length, 1, 'DESK-015 a forbidden task-plan step applies no earlier steps');
  const invalidPlan = check(await api('/work-scenarios', { name: 'Invalid duty owner', scope: 'workspace', steps: {
    classification: { category: 'must-not-apply' }, taskPlan: { name: 'Invalid plan', tasks: [{ title: 'Duty', ownerId: 'd15-employee', dueDate: '2026-11-01' }] }
  } }), 201);
  const invalidTicket = await ticket('invalid-plan');
  check(await api(`/work/${invalidTicket.id}/scenario-runs`, { scenarioId: invalidPlan.id }), 422);
  assert.equal(check(await api(`/work/${invalidTicket.id}/classification`)).current, null, 'DESK-015 task-plan validation precedes classification');
  // DESK-015 task templates pre-fill editable drafts submitted through the ordinary project task door.
  const taskTemplate = check(await api('/work-templates', { name: 'Install laptop tools', kind: 'task', title: 'Install approved tools', body: 'Local duty', context: { ownerId: 'd15-net', dueDate: '2026-11-01' } }, desk), 201);
  assert.ok(!check(await api('/work-templates', undefined, employee)).items.some(t => t.id === taskTemplate.id));
  check(await api(`/work-templates/${taskTemplate.id}`, undefined, employee), 404);
  check(await api(`/work-templates/${taskTemplate.id}`, undefined, { 'x-workspace': 'a' }), 404);
  const taskDraft = check(await api(`/work-templates/${taskTemplate.id}`, undefined, desk)).draft;
  const task = check(await api(`/projects/${projectId}/tasks`, { title: taskDraft.title + ' and verify', ...taskDraft.context }, desk), 201);
  assert.equal(check(await api(`/projects/${projectId}`)).tasks.find(t => t.id === task.id).title, 'Install approved tools and verify');
  console.log('PASS DESK-015 public routes: group-scoped "Escalate to Network L2" offered only to its group and refused to an outsider by API, one audited run listing category, priority, group, owner, private note and status before/after with no note for the requester, a role-refused step applying nothing, bulk runs, and a "New laptop setup" ticket template draft');
}

/** DESK-017 ticket-history slice: public commands supply every change; no audit rows are manufactured. */
export async function deskActivityChecks(workspaceApi) {
  const api = (path, body, headers = {}) => workspaceApi(path, body, { 'x-workspace': 'desk015', ...headers });
  const check = (r, status = 200) => { assert.equal(r.status, status, 'DESK-017 ' + JSON.stringify(r)); return r.value; };
  const employee = { 'x-user': 'd15-employee', 'x-roles': '["employee"]' };
  const work = check(await api('/work', { title: 'DESK-017 VPN reconnects', body: 'VPN drops during payroll upload', kind: 'incident', deduplicationKey: 'desk017-history' }, employee), 201);
  const classify = async (priority) => {
    const c = check(await api(`/work/${work.id}/classification`));
    return check(await api(`/work/${work.id}/classification/override`, { type: 'incident', category: 'general', subcategory: 'other', impact: 'low', urgency: 'medium', priority,
      reason: 'Business impact confirmed', revision: c.revision, workRevision: c.workRevision }));
  };
  await classify('P3'); await classify('P2');
  const scenario = check(await api('/work-scenarios', { name: 'Hardware escalation', scope: 'workspace', steps: {
    classification: { category: 'hardware', subcategory: 'laptop' },
    message: { visibility: 'private', body: 'Internal hardware diagnostic' },
    status: { command: 'pause', reason: 'Waiting for vendor diagnosis', waitingOn: 'vendor' },
  } }), 201);
  check(await api(`/work/${work.id}/scenario-runs`, { scenarioId: scenario.id }));
  const group = check(await api('/work-groups', { name: 'DESK-017 Device Support' }), 201);
  check(await api(`/work-groups/${group.id}/members`, { userId: 'd15-net' }));
  check(await api(`/work-groups/${group.id}/assignment`, { mode: 'round_robin' }));
  const rule = check(await api('/work-routing/rules', { name: 'Hardware history route', position: 1, category: 'hardware', groupId: group.id }), 201);
  const beforeRoute = check(await api(`/work/${work.id}`)).work;
  check(await api(`/work/${work.id}/route`, { revision: beforeRoute.revision }));
  const field = check(await api('/desk-fields', { name: 'Diagnostic code', type: 'text', kinds: ['incident'], requiredOn: [] }), 201);
  check(await api(`/work/${work.id}/fields`, { fieldId: field.id, value: 'VPN-42' }));
  check(await api(`/work/${work.id}/fields`, { fieldId: field.id, value: 'VPN-43' }));
  check(await api(`/work/${work.id}/messages`, { body: 'We are investigating your laptop', visibility: 'public', sourceMessageId: 'history-public' }), 201);
  const history = check(await api(`/work/${work.id}/activity`)).items;
  const priority = history.find(e => e.changes.some(c => c.field === 'priority' && c.before === 'P3' && c.after === 'P2'));
  assert.equal(priority.actor, 'Owner', 'DESK-017 human priority actor');
  assert.equal(priority.actorKind, 'person');
  const run = history.find(e => e.actorKind === 'scenario');
  assert.ok(run.changes.some(c => c.field === 'category' && c.before === 'general' && c.after === 'hardware'), 'DESK-017 scenario category before/after');
  const route = history.find(e => e.actorKind === 'rule');
  assert.ok(route.changes.some(c => c.field === 'assigneeId' && c.before === null && c.after === 'd15-net'), 'DESK-017 routing owner before/after');
  assert.ok(history.some(e => e.changes.some(c => c.field === 'Diagnostic code' && c.before === 'VPN-42' && c.after === 'VPN-43')), 'DESK-017 custom field before/after');
  assert.ok(history.some(e => e.changes.some(c => c.field === 'state' && c.before === 'open' && c.after === 'paused')), 'DESK-017 state before/after');
  assert.ok(history.every(e => Number.isFinite(Date.parse(e.at))), 'DESK-017 attributed timestamps');
  assert.deepEqual(history.map(e => e.at), history.map(e => e.at).sort(), 'DESK-017 chronological timeline');
  const publicHistory = check(await api(`/work/${work.id}/activity`, undefined, employee)).items;
  assert.ok(publicHistory.every(e => e.kind === 'message' && e.visibility === 'public'), 'DESK-017 employee public events only');
  assert.ok(publicHistory.some(e => e.body.includes('Paused:')), 'DESK-017 employee public status');
  assert.ok(!JSON.stringify(publicHistory).includes('Internal hardware') && !JSON.stringify(publicHistory).includes('VPN-43'), 'DESK-017 no internal fields or notes');
  check(await api(`/work/${work.id}/activity`, undefined, { 'x-workspace': 'a' }), 404);
  const beforeStale = history.map(e => e.id);
  check(await api(`/work/${work.id}/commands`, { revision: 1, command: 'resume', reason: 'Stale revision' }), 409);
  assert.deepEqual(check(await api(`/work/${work.id}/activity`)).items.map(e => e.id), beforeStale, 'DESK-017 rejected write adds no history');
  // Later writes append and retain the prior entries verbatim.
  const current = check(await api(`/work/${work.id}`)).work;
  check(await api(`/work/${work.id}/commands`, { revision: current.revision, command: 'resume', reason: 'Vendor responded' }));
  const later = check(await api(`/work/${work.id}/activity`)).items;
  assert.deepEqual(later.filter(e => beforeStale.includes(e.id)), history, 'DESK-017 later writes preserve prior entries');
  check(await api(`/work-routing/rules/${rule.id}/remove`, {}));
  console.log('PASS DESK-017 ticket activity: person/scenario/rule actor, time and before/after, custom fields, chronological append, stale-write fencing, employee public-only and cross-workspace denial');
}

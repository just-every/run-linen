import assert from 'node:assert/strict';

/** LIFE-002: owner templates by department, location, role and employment type become dated team tasks with business-day reminders. */
export async function lifecycleTemplateChecks(api, db) {
  const ok = async (path, body, headers = {}) => { const r = await api(path, body, headers); assert.ok(r.status < 300, `${path}: ${JSON.stringify(r)}`); return r.value; };
  const as = (user, role) => ({ 'x-user': user, 'x-roles': JSON.stringify([role]) });
  for (const [user, role] of [['synthetic-linen-1', 'hr'], ['synthetic-linen-2', 'employee'], ['synthetic-linen-3', 'employee'], ['synthetic-linen-4', 'operator'], ['synthetic-linen-5', 'operator'], ['synthetic-linen-6', 'integration']]) {
    await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(user, user + '@example.test', user, 'synthetic-linen-7', '2026-01-01').run();
    await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a', user, JSON.stringify([role])).run();
  }
  const group = async (name, member) => { const g = await ok('/work-groups', { name }); if (member) await ok(`/work-groups/${g.id}/members`, { userId: member, lead: true }); return g; };
  const it = await group('Life IT', 'synthetic-linen-4'), hr = await group('Life HR'), facilities = await group('Life Facilities');
  const value = (dimension, label) => ok('/catalog-values', { dimension, label });
  const sales = await value('department', 'Life Sales'), austin = await value('location', 'Life Austin'), ae = await value('title', 'Life Account executive');
  const w2 = await value('employmentType', 'Life W-2'), c1099 = await value('employmentType', 'Life 1099'), intern = await value('employmentType', 'Life intern');
  const task = (key, title, assignee, offsetDays, remindDays = null, anchor = 'start') => ({ key, title, assignee, anchor, offsetDays, remindDays });
  assert.equal((await api('/lifecycle-templates', { name: 'x', kind: 'join', match: { location: [austin.id] }, tasks: [task('a', 'A', { type: 'owner' }, 0)] }, as('synthetic-linen-1', 'hr'))).status, 403, 'LIFE-002 only the owner writes templates');
  assert.equal((await api('/lifecycle-templates', undefined, as('synthetic-linen-2', 'employee'))).status, 403, 'LIFE-002 employees cannot read templates');
  for (const [label, body] of [['unknown value', { match: { department: ['nope'] }, tasks: [task('a', 'A', { type: 'owner' }, 0)] }], ['no tasks', { match: {}, tasks: [] }],
    ['unknown team', { match: {}, tasks: [task('a', 'A', { type: 'group', groupId: 'nope' }, 0)] }], ['fraction', { match: {}, tasks: [task('a', 'A', { type: 'owner' }, 1.5)] }],
    ['bad key', { match: {}, tasks: [task('A!', 'A', { type: 'owner' }, 0)] }], ['unknown kind', { kind: 'rehire', match: {}, tasks: [task('a', 'A', { type: 'owner' }, 0)] }]])
    assert.ok([409, 422].includes((await api('/lifecycle-templates', { name: 'Refused ' + label, kind: 'join', ...body })).status), `LIFE-002 refuses ${label}`);

  const template = (name, kind, match, tasks) => ok('/lifecycle-templates', { name, kind, match, tasks });
  const salesAustin = await template('Sales Austin onboarding', 'join', { department: [sales.id], location: [austin.id] }, [
    task('laptop', 'Order the laptop', { type: 'group', groupId: it.id }, -5, 2),
    task('buddy', 'Buddy assigned', { type: 'manager' }, 0, 2),
    task('quota', 'Set the quota plan', { type: 'owner' }, 3)]);
  const austinDesk = await template('Austin desk setup', 'join', { location: [austin.id] }, [task('desk', 'Prepare the desk', { type: 'group', groupId: facilities.id }, -3, 1)]);
  const benefits = await template('W-2 benefits', 'join', { employmentType: [w2.id] }, [task('benefits', 'Enrol in benefits', { type: 'group', groupId: hr.id }, 5)]);
  const contractor = await template('1099 contractor onboarding', 'join', { employmentType: [c1099.id] }, [task('msa', 'Countersign the services agreement', { type: 'group', groupId: hr.id }, -2), task('wrapup', 'Close out the contract', { type: 'owner' }, 0, null, 'end')]);
  await template('Account executive role', 'join', { title: [ae.id], department: [sales.id] }, [task('crm', 'Provision the CRM seat', { type: 'group', groupId: it.id }, 1)]);
  await template('Intern programme', 'join', { employmentType: [intern.id] }, [task('mentor', 'Introduce the intern mentor', { type: 'manager' }, 2)]);
  await template('Offboarding', 'leave', { department: [sales.id] }, [task('collect', 'Collect the laptop', { type: 'group', groupId: it.id }, 0)]);
  assert.equal((await ok('/lifecycle-templates', undefined, as('synthetic-linen-1', 'hr'))).items.length, 7, 'LIFE-002 HR reads the templates it reviews');
  assert.equal((await api(`/lifecycle-templates/${austinDesk.id}`, { revision: 9, active: true, name: austinDesk.name, kind: 'join', match: austinDesk.match, tasks: austinDesk.tasks })).status, 409, 'LIFE-002 stale template edits refuse');

  const person = (name, attributes, manager = 'synthetic-linen-3') => ok('/people', { source: 'synthetic-linen-8', sourceId: name, name, managerId: manager, effectiveAt: '2026-01-01T00:00:00.000Z', observedAt: '2026-01-01T00:00:00.000Z', attributes });
  const admit = (p, source, extra = {}) => api('/lifecycle', { personId: p.id, kind: 'join', effectiveAt: '2027-03-08T09:00:00-06:00', timezone: 'America/Chicago', source, sourceRevision: 1, ownerId: 'owner', identityTarget: p.id, retained: [], added: [], removed: [], deviceIds: [], ...extra }, as('synthetic-linen-1', 'hr'));
  const tasksOf = async lifecycleId => (await ok(`/lifecycle/${lifecycleId}`)).obligations.filter(o => o.kind === 'task.manual').sort((a, b) => a.title < b.title ? -1 : 1);

  // A hire in Sales in Austin starting Monday gets the Sales/Austin template and the W-2 benefits tasks.
  const sam = await person('Life Sam', { department: sales.id, location: austin.id, title: ae.id, employmentType: w2.id });
  const join = await admit(sam, 'synthetic-linen-9'); assert.equal(join.status, 201, JSON.stringify(join.value));
  const samTasks = await tasksOf(join.value.lifecycleId);
  assert.deepEqual(samTasks.map(t => t.title), ['Buddy assigned', 'Enrol in benefits', 'Order the laptop', 'Prepare the desk', 'Provision the CRM seat', 'Set the quota plan'],
    'LIFE-002 department, location, role and employment type each add their template tasks');
  const byTitle = Object.fromEntries(samTasks.map(t => [t.title, t]));
  assert.equal(byTitle['Buddy assigned'].due_at, '2027-03-08T15:00:00.000Z', 'LIFE-002 a start-dated task is due at the start');
  assert.equal(byTitle['Buddy assigned'].remind_at, '2027-03-04T15:00:00.000Z', "LIFE-002 the manager's buddy task is reminded two business days before the Monday start (Thursday)");
  assert.equal(byTitle['Order the laptop'].due_at, '2027-03-01T15:00:00.000Z', 'LIFE-002 five business days before a Monday start is the Monday before');
  assert.equal(byTitle['Order the laptop'].remind_at, '2027-02-25T15:00:00.000Z', 'LIFE-002 a reminder is business days before the due date');
  assert.equal(byTitle['Prepare the desk'].due_at, '2027-03-03T15:00:00.000Z');
  assert.equal(byTitle['Enrol in benefits'].due_at, '2027-03-15T14:00:00.000Z', 'LIFE-002 business days across the DST change keep the opening hour');
  assert.deepEqual([byTitle['Order the laptop'].group_name, byTitle['Enrol in benefits'].group_name, byTitle['Prepare the desk'].group_name], ['Life IT', 'Life HR', 'Life Facilities'], 'LIFE-002 tasks are for IT, HR and Facilities');
  assert.equal(byTitle['Buddy assigned'].owner_id, 'synthetic-linen-3', 'LIFE-002 a manager task is the person\'s manager\'s');
  const context = JSON.parse((await ok(`/work/${join.value.work.id}`)).work.context_json);
  assert.deepEqual(context.templates.applied.map(t => t.name).sort(), ['Account executive role', 'Austin desk setup', 'Sales Austin onboarding', 'W-2 benefits'], 'LIFE-002 the record names the templates it applied');

  // A 1099 template omits benefits tasks; an end-anchored task with no end date is listed as skipped, not invented.
  const cam = await person('Life Cam', { department: sales.id, location: austin.id, employmentType: c1099.id });
  const contractRecord = await admit(cam, 'synthetic-linen-11'); assert.equal(contractRecord.status, 201, JSON.stringify(contractRecord.value));
  const camTasks = (await tasksOf(contractRecord.value.lifecycleId)).map(t => t.title);
  assert.ok(!camTasks.includes('Enrol in benefits'), 'LIFE-002 a 1099 hire gets no benefits task');
  assert.ok(camTasks.includes('Countersign the services agreement') && camTasks.includes('Buddy assigned'), 'LIFE-002 the 1099 template and the shared Sales/Austin template both apply');
  assert.ok(!camTasks.includes('Close out the contract'));
  const camContext = JSON.parse((await ok(`/work/${contractRecord.value.work.id}`)).work.context_json);
  assert.deepEqual(camContext.templates.skipped.map(s => s.key), ['wrapup'], 'LIFE-002 a task with no end date to anchor on is listed as skipped');
  const withEnd = await admit(await person('Life Dee', { employmentType: c1099.id }), 'synthetic-linen-10', { expiresAt: '2027-06-30T17:00:00-05:00', sponsorId: 'owner' });
  assert.equal(withEnd.status, 201, JSON.stringify(withEnd.value));
  assert.equal((await tasksOf(withEnd.value.lifecycleId)).find(t => t.title === 'Close out the contract').due_at, '2027-06-30T22:00:00.000Z', 'LIFE-002 an end-dated task is due at the contract end');
  // Interns and leaves are matched on their own kind and values.
  const ivy = await person('Life Ivy', { employmentType: intern.id }, null);
  const internTasks = await tasksOf((await admit(ivy, 'synthetic-linen-12')).value.lifecycleId);
  assert.deepEqual(internTasks.map(t => [t.title, t.owner_id]), [['Introduce the intern mentor', 'owner']], 'LIFE-002 an intern template applies, and a missing manager falls back to the accountable owner with its reason');
  assert.match(internTasks[0].last_error, /No manager is recorded/);
  const leave = await admit(sam, 'synthetic-linen-13', { kind: 'leave', effectiveAt: '2027-09-01T17:00:00-05:00', baseline: { from: { department: sales.id } } });
  assert.deepEqual((await tasksOf(leave.value.lifecycleId)).map(t => t.title), ['Collect the laptop'], 'LIFE-002 a leave matches leave templates only');

  // Who does a task, who sees it, and what a completion is.
  const open = id => db.prepare('SELECT state,revision FROM work_obligations WHERE id=?').bind(id).first();
  const buddy = byTitle['Buddy assigned'], laptop = byTitle['Order the laptop'];
  const mine = (await ok('/lifecycle-tasks', undefined, as('synthetic-linen-3', 'employee'))).items;
  assert.ok(mine.some(t => t.id === buddy.id) && !mine.some(t => t.id === laptop.id), "LIFE-002 the manager sees their own tasks, not the IT team's");
  assert.ok(Object.keys(mine[0]).every(k => ['id', 'title', 'person', 'change', 'effectiveAt', 'dueAt', 'remindAt', 'revision'].includes(k)), 'LIFE-002 a task shows the minimum business scope');
  assert.equal((await api(`/lifecycle-tasks/${buddy.id}/complete`, { revision: buddy.revision }, as('synthetic-linen-2', 'employee'))).status, 404, 'LIFE-002 an unrelated employee cannot see or complete a task');
  assert.equal((await api(`/lifecycle-tasks/${laptop.id}/complete`, { revision: laptop.revision }, as('synthetic-linen-5', 'operator'))).status, 404, "LIFE-002 another team's member cannot complete it");
  assert.equal((await api(`/lifecycle-tasks/${laptop.id}/complete`, { revision: laptop.revision }, as('synthetic-linen-6', 'integration'))).status, 404, 'LIFE-002 integrations cannot complete tasks');
  await ok(`/lifecycle-tasks/${laptop.id}/complete`, { revision: laptop.revision }, as('synthetic-linen-4', 'operator'));
  assert.equal((await open(laptop.id)).state, 'done', 'LIFE-002 a member of the named team completes the task');
  assert.equal((await api(`/lifecycle-tasks/${laptop.id}/complete`, { revision: laptop.revision }, as('synthetic-linen-4', 'operator'))).status, 409, 'LIFE-002 a done task cannot be completed twice');
  assert.equal((await api(`/lifecycle-tasks/${buddy.id}/waive`, { revision: buddy.revision, reason: 'Not needed' }, as('synthetic-linen-3', 'employee'))).status, 403, 'LIFE-002 only the owner waives a task');
  await ok(`/lifecycle-tasks/${buddy.id}/waive`, { revision: buddy.revision, reason: 'The buddy programme is paused' });
  assert.equal((await open(buddy.id)).state, 'waived');
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action IN ('lifecycle.task_completed','lifecycle.task_waived')").first()).n, 2, 'LIFE-002 completions and waivers are audited');
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM execution_grants WHERE target LIKE 'template:%'").first()).n, 0, 'LIFE-002 a task grants no provider authority');

  // Re-dating and cancelling follow the effective date.
  const crm = byTitle['Provision the CRM seat'];
  await ok(`/lifecycle/${join.value.lifecycleId}/amend`, { revision: (await ok(`/lifecycle/${join.value.lifecycleId}`)).lifecycle.revision, effectiveAt: '2027-03-15T09:00:00-05:00' });
  const moved = Object.fromEntries((await tasksOf(join.value.lifecycleId)).map(t => [t.title, t]));
  assert.equal(moved['Provision the CRM seat'].due_at, '2027-03-16T14:00:00.000Z', 'LIFE-002 an effective-date change re-dates open tasks from their anchor');
  assert.equal(moved['Order the laptop'].state, 'done', 'LIFE-002 a task already done keeps its state');
  assert.notEqual(moved['Provision the CRM seat'].due_at, crm.due_at);
  const cancelled = await admit(await person('Life Cancel', { location: austin.id }), 'synthetic-linen-14');
  await ok(`/lifecycle/${cancelled.value.lifecycleId}/amend`, { revision: 1, cancel: true });
  assert.ok((await tasksOf(cancelled.value.lifecycleId)).every(t => t.state === 'cancelled'), 'LIFE-002 a cancelled change cancels its open tasks');
  // Template edits are versioned and never rewrite an admitted record.
  const edited = await ok(`/lifecycle-templates/${austinDesk.id}`, { revision: 1, active: true, name: austinDesk.name, kind: 'join', match: austinDesk.match, tasks: [task('desk', 'Prepare two desks', { type: 'group', groupId: facilities.id }, -3, 1)] });
  assert.equal(edited.revision, 2, 'LIFE-002 a template edit is a new revision');
  assert.ok((await tasksOf(join.value.lifecycleId)).some(t => t.title === 'Prepare the desk'), 'LIFE-002 an edited template never rewrites an admitted record');
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action IN ('lifecycle_template.created','lifecycle_template.edited')").first()).n, 8, 'LIFE-002 template changes are audited');

  // Reminders reach each responsible person in their own requests, once.
  const now = Date.now(), soon = new Date(now + 3600_000).toISOString().replace(/\.\d+Z$/, 'Z');
  const fern = await person('Life Fern', { department: sales.id, location: austin.id, employmentType: w2.id });
  const imminent = await admit(fern, 'synthetic-linen-15', { effectiveAt: soon, timezone: 'UTC' });
  assert.equal(imminent.status, 201, JSON.stringify(imminent.value));
  const due = (await api('/work/process-due', {})).value.items.filter(r => r.state === 'task_reminded');
  assert.ok(due.length >= 2, `LIFE-002 imminent starts remind their open tasks: ${JSON.stringify(due)}`);
  const managerQueue = (await ok('/work', undefined, as('synthetic-linen-3', 'employee'))).items.filter(w => w.title.startsWith('Reminder: Buddy assigned for Life Fern'));
  assert.equal(managerQueue.length, 1, "LIFE-002 the manager is reminded in their own requests");
  assert.equal(JSON.parse((await ok(`/work/${managerQueue[0].id}`, undefined, as('synthetic-linen-3', 'employee'))).work.context_json).lifecycleTaskReminder.title, 'Buddy assigned');
  assert.equal((await ok('/work', undefined, as('synthetic-linen-4', 'operator'))).items.filter(w => w.title.startsWith('Reminder: Order the laptop for Life Fern')).length, 1, "LIFE-002 a team task reminds the team's lead");
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM work_records WHERE beneficiary_id='synthetic-linen-5' AND title LIKE 'Reminder:%'").first()).n, 0, 'LIFE-002 other teams are not reminded');
  assert.ok(!(await api('/work/process-due', {})).value.items.some(r => r.state === 'task_reminded' && r.id === due[0].id), 'LIFE-002 one reminder per task');
  const fernTasks = await tasksOf(imminent.value.lifecycleId);
  const fernBuddy = fernTasks.find(t => t.title === 'Buddy assigned');
  await ok(`/lifecycle-tasks/${fernBuddy.id}/complete`, { revision: fernBuddy.revision }, as('synthetic-linen-3', 'employee'));
  assert.equal((await open(fernBuddy.id)).state, 'done', 'LIFE-002 the manager completes their reminded task through the task route');
  await db.prepare("UPDATE memberships SET active=0 WHERE workspace_id='a' AND user_id='synthetic-linen-4'").run();
  assert.equal((await api('/lifecycle-tasks', undefined, as('synthetic-linen-4', 'operator'))).status, 404,
    'LIFE-002 a deactivated assignee loses the task read door');
  await db.prepare("UPDATE memberships SET active=1 WHERE workspace_id='a' AND user_id='synthetic-linen-4'").run();
  await ok(`/people/${fern.id}/erase`, { revision: fern.revision, reason: 'synthetic-linen-16' });
  const erasedReminder = await ok(`/work/${managerQueue[0].id}`, undefined, as('synthetic-linen-3', 'employee'));
  assert.equal(erasedReminder.work.title, '[erased]', 'LIFE-002 erasure clears a reminder even though its recipient is the manager');
  assert.deepEqual(JSON.parse(erasedReminder.work.context_json), {}, 'LIFE-002 erased reminder context cannot retain the subject name or task');
  assert.ok(!(await ok('/lifecycle-tasks', undefined, as('synthetic-linen-3', 'employee'))).items.some(t => t.person === 'Life Fern'),
    'LIFE-002 erased subjects disappear from the assignee task door');
  assert.equal((await api(`/lifecycle-tasks/${fernBuddy.id}/complete`, { revision: fernBuddy.revision }, as('synthetic-linen-3', 'employee'))).status, 404,
    'LIFE-002 erased subject tasks cannot be completed or replayed');
  assert.ok(!(await api('/work/process-due', {})).value.items.some(r => r.state === 'task_reminded' && fernTasks.some(t => t.id === r.id)),
    'LIFE-002 erasure prevents reminder recreation');
  for (const t of [salesAustin, austinDesk, benefits, contractor]) await db.prepare('UPDATE work_lifecycle_templates SET active=0 WHERE id=?').bind(t.id).run();
  await db.prepare('UPDATE work_lifecycle_templates SET active=0').run();
  console.log('PASS LIFE-002 templates by department, location, role and employment type: dated team tasks for IT, HR, manager, Facilities and owner, business-day due and reminder instants, 1099 omits benefits, assignee-only completion, owner waiver, re-dating, cancellation, audit and portal reminders');
}

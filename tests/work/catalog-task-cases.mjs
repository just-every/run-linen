import assert from 'node:assert/strict';
/** CATALOG-003: an item's team task plan beside its automated step, through the public routes of the manager-approval harness. */
export async function catalogTaskChecks({ ok, api, db, actor, future }) {
  const holder = (await db.prepare("SELECT manager_id FROM work_people WHERE id='employee'").first()).manager_id;
  for (const user of ['task-net', 'task-hw', 'task-other'])
    await db.exec(`INSERT INTO users VALUES('${user}','${user}@test','${user}','unused','2026-01-01'); INSERT INTO memberships VALUES('w','${user}','["operator"]',1);`);
  const network = await ok('/work-groups', { name: 'Workplace IT' }), facilities = await ok('/work-groups', { name: 'Facilities' });
  await ok(`/work-groups/${network.id}/members`, { userId: 'task-net' });
  await ok(`/work-groups/${facilities.id}/members`, { userId: 'task-hw' });
  const plan = [
    { key: 'configure', title: 'Configure the licence', groupId: network.id, after: ['automated'], dueHours: 48 },
    { key: 'seat', title: 'Prepare a desk seat', groupId: facilities.id, dueHours: 24 },
    { key: 'brief', title: 'Brief the employee', groupId: network.id, after: ['configure', 'seat'], dueHours: 72 },
  ];
  for (const bad of [[{ ...plan[0], groupId: 'no-such-group' }], [{ ...plan[2] }], [plan[1], { ...plan[1] }], [{ ...plan[1], dueHours: 0 }], [{ ...plan[1], extra: 1 }]])
    assert.equal((await api('/catalog', { name: 'Bad plan', kind: 'software', target: 'bad-plan', ownerId: 'owner', tasks: bad })).status, 422, 'CATALOG-003 a plan names real teams, earlier steps and whole hours');
  const item = await ok('/catalog', { name: 'Design software', kind: 'software', target: 'task-licence', ownerId: 'owner', requiresManager: true, tasks: plan });
  assert.equal((await api(`/catalog/${item.id}/tasks`, { revision: 1, tasks: [] }, 'employee')).status, 403, 'CATALOG-003 only the owner edits a task plan');
  assert.equal((await ok('/catalog', undefined, 'employee')).items.find(i => i.id === item.id).tasks, undefined, 'CATALOG-003 employees see the item, not its internal plan');

  const open = async (key, user = 'employee') => {
    const work = await ok('/work', { title: `Design software ${key}`, body: 'I need the design tool', deduplicationKey: `task-${key}` }, user);
    const request = await ok(`/work/${work.id}/fulfilment`, { catalogId: item.id, beneficiaryId: 'employee', purpose: 'Design work' }, user);
    return { workId: work.id, request };
  };
  const duties = async (workId, user = 'owner') => (await ok(`/work/${workId}/obligations`, undefined, user)).items;
  const task = (items, key) => items.find(o => o.kind === 'task.manual' && o.title === plan.find(t => t.key === key).title);
  const complete = (workId, row, user) => api(`/work/${workId}/tasks/${row.id}/complete`, { revision: row.revision }, user);
  const { workId, request } = await open('verified');
  assert.equal(request.state, 'blocked', 'CATALOG-003 the software request waits for its manager approval');
  let items = await duties(workId);
  assert.deepEqual(items.map(o => o.kind).sort(), ['access.grant', 'task.manual', 'task.manual', 'task.manual'], 'CATALOG-003 one request creates the automated step and one task per plan entry');
  assert.deepEqual([task(items, 'configure').owner_id, task(items, 'configure').group_name, task(items, 'seat').group_name], ['owner', 'Workplace IT', 'Facilities'], 'CATALOG-003 the item owner is accountable and each task names its team');
  const created = Date.parse(task(items, 'seat').due_at) - Date.now();
  assert.ok(Math.abs(created - 24 * 3600_000) < 60_000 && Math.abs(Date.parse(task(items, 'brief').due_at) - Date.now() - 72 * 3600_000) < 60_000, 'CATALOG-003 due dates are elapsed hours from the request');
  assert.equal((await duties(workId, 'employee')).find(o => o.kind === 'task.manual').group_name, undefined, 'CATALOG-003 the requester sees task titles but not team names');
  assert.equal((await complete(workId, task(items, 'seat'), 'task-hw')).value.code, 'task_not_ready', 'CATALOG-003 no team works a request before its manager approval');

  const queue = (await ok('/fulfilment-decisions', undefined, holder)).items.filter(i => i.workId === workId);
  await ok(`/work/${workId}/fulfilment/approve`, { ...queue[0], expectedHolderId: queue[0].holderId, idempotencyKey: 'task-approve' }, holder);
  items = await duties(workId);
  assert.equal((await duties(workId, 'task-hw')).find(o => o.title === 'Prepare a desk seat').can_complete, true);
  assert.equal((await duties(workId, 'task-net')).find(o => o.title === 'Prepare a desk seat').can_complete, false, 'CATALOG-003 another team cannot complete a task');
  for (const [user, status] of [['employee', 403], ['task-net', 403], ['task-other', 403]])
    assert.equal((await complete(workId, task(items, 'seat'), user)).status, status, 'CATALOG-003 only the named team (or the workspace owner) completes a task');
  assert.equal((await complete(workId, task(items, 'configure'), 'task-net')).value.code, 'task_waiting', 'CATALOG-003 a task waits for the automated step it follows');
  assert.equal((await complete(workId, task(items, 'brief'), 'task-net')).value.code, 'task_waiting', 'CATALOG-003 a task waits for every earlier task');
  assert.equal((await api(`/work/${workId}/tasks/${task(items, 'seat').id}/complete`, { revision: 99 }, 'task-hw')).status, 409, 'CATALOG-003 a stale revision is refused');
  assert.equal((await complete(workId, task(items, 'seat'), 'task-hw')).status, 200, 'CATALOG-003 parallel tasks run while the automated step is still open');
  assert.equal((await complete(workId, task(items, 'seat'), 'task-hw')).status, 409, 'CATALOG-003 a done task is not completed twice');

  // The automated step still verifies independently (the CATALOG-004 provider boundary).
  await ok('/grants', { id: 'task-licence-grant', principalId: actor.id, action: 'license.add', actionVersion: 1, target: 'task-licence', beneficiaryId: 'provider-employee-distinct',
    localBeneficiaryId: 'employee', connectionId: 'graph', verifierConnectionId: 'probe', validFrom: future(-60000), validUntil: future(86400000), maxUses: 5, conditions: { workId } }, holder);
  const resolved = await ok('/test/standing', { workId, target: 'task-licence', beneficiaryId: 'employee', kind: 'software' }, 'employee');
  const planned = await ok('/plans/granted', { workId, revision: 1, steps: [resolved.step], idempotencyKey: 'task-licence' }, 'employee');
  await ok('/test/link', { workId, planId: planned.planId, operationIds: planned.operations.map(o => o.id) }, 'employee');
  const operationId = planned.operations.find(o => o.parent_id === 'initial').id;
  assert.equal((await ok('/test/run', { operationId }, actor.id)).state, 'effect_verified');
  await ok('/test/verify', { operationId, verifierVersion: 1 }, actor.id);
  await ok('/work/process-due', {});
  items = await duties(workId);
  assert.equal(items.find(o => o.kind === 'access.grant').state, 'verified');
  const current = async id => (await ok(`/work/${id}`)).work;
  const close = async id => api(`/work/${id}/commands`, { command: 'close', reason: 'Everything is done', revision: (await current(id)).revision });
  assert.equal((await close(workId)).value.code, 'obligations_open', 'CATALOG-003 the request stays open while a team task is unfinished');
  assert.equal((await complete(workId, task(items, 'brief'), 'task-net')).value.code, 'task_waiting', 'CATALOG-003 the last task still waits for the configuration task');
  assert.equal((await complete(workId, task(items, 'configure'), 'task-net')).status, 200, 'CATALOG-003 the configuration task follows the verified automated step');
  items = await duties(workId);
  assert.equal((await complete(workId, task(items, 'brief'), 'owner')).status, 200, 'CATALOG-003 the workspace owner acts for any team');
  assert.equal((await close(workId)).status, 200, 'CATALOG-003 the request closes once every responsibility is verified or done');
  items = await duties(workId, 'employee');
  assert.deepEqual(items.filter(o => o.kind === 'task.manual').map(o => [o.state, o.completed_by]).sort(), [['done', 'owner'], ['done', 'task-hw'], ['done', 'task-net']], 'CATALOG-003 each task records who completed it');

  // The automated step fails: the request stays open and the failure is owned by the item's owner until it is resolved or waived.
  const failing = await open('failure');
  const failedQueue = (await ok('/fulfilment-decisions', undefined, holder)).items.filter(i => i.workId === failing.workId);
  await ok(`/work/${failing.workId}/fulfilment/approve`, { ...failedQueue[0], expectedHolderId: failedQueue[0].holderId, idempotencyKey: 'task-approve-failure' }, holder);
  await ok('/work/process-due', {});
  items = await duties(failing.workId);
  const step = items.find(o => o.kind === 'access.grant');
  assert.notEqual(step.state, 'verified', 'CATALOG-003 without authority the automated step does not verify');
  assert.equal(step.owner_id, 'owner', 'CATALOG-003 the failed automated step is owned by the item owner');
  assert.ok((await ok(`/work/${failing.workId}/conversation`, undefined, 'employee')).progress.some(p => p.ownerId === 'owner' && p.state !== 'verified' && p.needsAction), 'CATALOG-003 the requester sees the owned, unfinished step');
  assert.equal((await close(failing.workId)).value.code, 'obligations_open', 'CATALOG-003 the request stays open while the automated step has failed');
  assert.equal((await complete(failing.workId, task(items, 'seat'), 'task-hw')).status, 200);
  assert.equal((await complete(failing.workId, task(items, 'configure'), 'task-net')).value.code, 'task_waiting', 'CATALOG-003 a task after a failed automated step keeps waiting');
  const waive = (row, user, reason = 'The licence is bought outside Linen') => api(`/work/${failing.workId}/obligations/${row.id}/waive`, { revision: row.revision, reason }, user);
  for (const user of ['employee', 'task-net', 'task-hw'])
    assert.equal((await waive(step, user)).status, 403, 'CATALOG-003 only the responsibility owner or workspace owner waives it');
  assert.equal((await waive(step, 'owner', ' ')).status, 422, 'CATALOG-003 a waiver needs a reason');
  assert.equal((await waive(task(items, 'seat'), 'owner')).status, 409, 'CATALOG-003 a done task is not waived');
  assert.equal((await waive(step, 'owner')).status, 200, 'CATALOG-003 the owner waives the failed automated step with a reason');
  assert.equal((await waive(step, 'owner')).status, 409);
  const waiver = await db.prepare("SELECT detail_json FROM audit_events WHERE action='work.obligation_waived' AND target=?").bind(step.id).first();
  assert.equal(JSON.parse(waiver.detail_json).reason, 'The licence is bought outside Linen', 'CATALOG-003 the waiver and its reason are audited');
  items = await duties(failing.workId, 'employee');
  assert.deepEqual([items.find(o => o.kind === 'access.grant').state, items.find(o => o.kind === 'access.grant').waived_by], ['waived', 'owner'], 'CATALOG-003 a waived step is shown as waived, never as verified');
  assert.equal((await complete(failing.workId, task(items, 'configure'), 'task-net')).status, 200, 'CATALOG-003 a waived step releases the tasks that follow it');
  assert.equal((await close(failing.workId)).value.code, 'obligations_open', 'CATALOG-003 the last task is still open');
  assert.equal((await waive(task(items, 'brief'), 'owner', 'Briefing is not needed for a contractor')).status, 200);
  assert.equal((await close(failing.workId)).status, 200, 'CATALOG-003 verified, done and waived responsibilities together let the request close');

  // Editing the item's plan does not change a request that already copied it; a cancelled request cancels its open tasks only.
  const pending = await open('cancel');
  const before = await duties(pending.workId);
  const revision = (await ok('/catalog')).items.find(i => i.id === item.id).revision;
  await ok(`/catalog/${item.id}/tasks`, { revision, tasks: [{ key: 'only', title: 'A different plan', groupId: network.id, dueHours: 1 }] });
  assert.equal((await api(`/catalog/${item.id}/tasks`, { revision, tasks: [] })).status, 409, 'CATALOG-003 a stale plan edit is refused');
  assert.deepEqual((await duties(pending.workId)).map(o => [o.id, o.title, o.due_at]), before.map(o => [o.id, o.title, o.due_at]), 'CATALOG-003 in-flight requests keep the tasks they were created with');
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='catalog.tasks_edited' AND target=?").bind(item.id).first()).n, 1, 'CATALOG-003 plan edits are audited');
  await ok(`/work/${pending.workId}/commands`, { command: 'cancel', reason: 'No longer needed', revision: (await current(pending.workId)).revision }, 'employee');
  assert.deepEqual([...new Set((await duties(pending.workId)).filter(o => o.kind === 'task.manual').map(o => o.state))], ['cancelled'], 'CATALOG-003 cancelling a request cancels its open tasks');
  assert.equal((await db.prepare("SELECT state FROM work_obligations WHERE work_id=? AND state='done' LIMIT 1").bind(workId).first()).state, 'done', 'CATALOG-003 completed tasks stay recorded');

  // Erasing a person who completed a task keeps the record and removes who did it.
  await ok('/people/task-net/erase', { revision: 0, reason: 'Left the company' });
  assert.deepEqual([...new Set((await db.prepare("SELECT completed_by FROM work_obligations WHERE work_id=? AND kind='task.manual' AND state='done'").bind(workId).all()).results.map(r => r.completed_by))].sort(), ['[erased]', 'owner', 'task-hw'], 'CATALOG-003 erasure keeps the completed task and drops the person');
  console.log('PASS CATALOG-003 public routes: owner-edited team task plan beside the automated step, manager approval before any team works, ordered and parallel tasks with elapsed-hour due dates, team-only completion, failed automated step owned and request open, owner waiver with reason, close only when every responsibility is verified, done or waived, in-flight copies unchanged, cancel and erasure');
}


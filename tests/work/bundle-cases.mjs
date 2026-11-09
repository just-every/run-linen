import assert from 'node:assert/strict';
/** CATALOG-004: one bundle request, one manager decision, five child fulfilments, complete only when every child verifies. */
export async function bundleChecks({ ok, api, db, actor, future }) {
  const holder = (await db.prepare("SELECT manager_id FROM work_people WHERE id='employee'").first()).manager_id;
  // Native admission and business decisions must preserve each child's facts and capacity, without issuing execution authority.
  const executionSnapshot = async () => {
    const snapshot = {};
    for (const table of ['execution_grants', 'execution_plans', 'execution_operations', 'work_fulfilment_execution'])
      snapshot[table] = (await db.prepare(`SELECT * FROM ${table} ORDER BY 1,2,3`).all()).results;
    snapshot.provider = (await db.prepare('SELECT * FROM test_provider ORDER BY target').all()).results;
    return snapshot;
  };
  const existingExecution = await executionSnapshot();
  assert.ok(existingExecution.execution_grants.length > 0, 'the no-created-grant probe starts with existing grant identities');
  const capacities = [2, 0, 1, 0], capacityItems = [];
  for (const [index, kind] of ['device', 'device', 'software', 'software'].entries()) {
    capacityItems.push(await ok('/catalog', { name: `Bundle capacity ${index}`, kind, target: `synthetic-linen-bundle-${index}`,
      ownerId: 'owner', requiresManager: true, capacity: capacities[index] }));
  }
  const capacityBundle = await ok('/catalog-bundles', { name: 'Independent child capacity', catalogIds: capacityItems.map(i => i.id) });
  const reservations = async () => (await db.prepare(`SELECT catalog_id,work_id,beneficiary_id,released_at
    FROM work_catalog_reservations WHERE workspace_id='w' AND catalog_id IN (SELECT value FROM json_each(?))
    ORDER BY catalog_id,work_id`).bind(JSON.stringify(capacityItems.map(i => i.id))).all()).results;
  const expectedReservations = [];
  for (let round = 0; round < 3; round++) {
    const submitted = { beneficiaryId: 'employee', purpose: `Time-limited engineering kit ${round}`, expiresAt: future(86400000 + round * 3600000) };
    const input = { ...submitted, expectedRevision: capacityBundle.revision, deduplicationKey: `synthetic-linen-bundle-capacity-${round}` };
    // The owner files for a different person, so a fallback to the filer cannot satisfy the assertion.
    const requested = await ok(`/catalog-bundles/${capacityBundle.id}/request`, input);
    assert.equal(requested.children.length, capacityItems.length);
    const readChildren = async () => {
      const children = [];
      for (const item of capacityItems) {
        const child = await ok(`/work/${requested.workId}/fulfilments/${item.id}`, undefined, 'employee');
        assert.equal(child.workId, requested.workId);
        assert.equal(child.catalogId, item.id);
        assert.deepEqual({ beneficiaryId: child.beneficiaryId, purpose: child.purpose, expiresAt: child.expiresAt }, submitted,
          'CATALOG-004 every child retains the submitted person, purpose and expiry');
        const stored = await db.prepare('SELECT beneficiary_id,purpose,expires_at FROM work_fulfilments WHERE workspace_id=? AND id=?')
          .bind('w', child.id).first();
        assert.deepEqual(stored, { beneficiary_id: 'employee', purpose: submitted.purpose, expires_at: submitted.expiresAt });
        children.push(child);
      }
      return children;
    };
    const childrenBefore = await readChildren();
    const expiryDuties = (await ok(`/work/${requested.workId}/obligations`, undefined, 'employee')).items
      .filter(o => o.kind === 'access.revoke');
    assert.equal(expiryDuties.length, 2, 'each software child keeps its own expiry duty even when capacity is held');
    for (const item of capacityItems.slice(2)) {
      const duty = expiryDuties.find(o => o.target === `synthetic-linen-bundle-${capacityItems.indexOf(item)}`);
      assert.ok(duty, 'each software child has an expiry responsibility');
      assert.equal(duty.beneficiary_id, submitted.beneficiaryId);
      assert.equal(duty.due_at, submitted.expiresAt, 'the native expiry responsibility retains the submitted expiry');
    }
    // The first request reserves a device and a licence; the second has stock but no licence; the third has neither.
    const reserved = round === 0 ? [0, 2] : round === 1 ? [0] : [];
    for (const index of reserved) expectedReservations.push({ catalog_id: capacityItems[index].id, work_id: requested.workId, beneficiary_id: 'employee', released_at: null });
    const sortedReservations = () => [...expectedReservations].sort((a, b) => a.catalog_id.localeCompare(b.catalog_id) || a.work_id.localeCompare(b.work_id));
    assert.deepEqual(await reservations(), sortedReservations(), 'CATALOG-004 each child reserves only its own remaining stock or licence capacity');
    assert.deepEqual(await executionSnapshot(), existingExecution, 'CATALOG-004 requesting a bundle preserves existing execution grants and dispatch state');
    assert.deepEqual(await ok(`/catalog-bundles/${capacityBundle.id}/request`, input), requested,
      'replaying the bundle request keeps the same ticket and child responsibilities');
    assert.deepEqual(await readChildren(), childrenBefore, 'request replay keeps the same child identities and shared facts');
    assert.deepEqual(await reservations(), sortedReservations(), 'request replay consumes no extra child capacity');
    const changedReplay = await api(`/catalog-bundles/${capacityBundle.id}/request`, { ...input, expiresAt: future(172800000) });
    assert.equal(changedReplay.status, 409, 'a captured request cannot be replayed with a different expiry');
    assert.deepEqual(await readChildren(), childrenBefore, 'refused replay preserves every original child expiry');
    assert.deepEqual(await reservations(), sortedReservations(), 'refused replay changes no child reservation');
    assert.deepEqual(await executionSnapshot(), existingExecution, 'request replays supply no execution authority');
    const queue = (await ok('/fulfilment-decisions', undefined, holder)).items.filter(i => i.workId === requested.workId);
    assert.equal(queue.length, capacityItems.length);
    const decision = { idempotencyKey: `synthetic-linen-bundle-approval-${round}`, approvals: queue.map(q => ({ ...q, expectedHolderId: q.holderId })) };
    assert.ok(queue.every(q => q.holderId === holder && q.beneficiaryId === 'employee'));
    assert.equal((await api(`/work/${requested.workId}/bundle/approve`, decision, 'owner')).status, 403,
      'only the current manager can approve the shared child facts');
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_fulfilment_approvals WHERE work_id=?').bind(requested.workId).first()).n, 0);
    assert.deepEqual(await readChildren(), childrenBefore, 'a refused bundle decision changes no child facts');
    assert.deepEqual(await reservations(), sortedReservations(), 'a refused bundle decision changes no child reservation');
    assert.deepEqual(await executionSnapshot(), existingExecution, 'a refused bundle decision supplies no execution authority');
    const approved = await ok(`/work/${requested.workId}/bundle/approve`, decision, holder);
    assert.equal(approved.decisions, 1);
    assert.ok(approved.children.every(c => c.approval === 'recorded' && c.delivery !== 'verified'));
    assert.equal(approved.state, 'in_progress');
    assert.deepEqual(await readChildren(), childrenBefore, 'CATALOG-004 manager approval preserves every submitted child fact');
    const approvals = (await db.prepare(`SELECT beneficiary_id,purpose,expires_at,holder_id,grant_id,grant_version
      FROM work_fulfilment_approvals WHERE workspace_id='w' AND work_id=?`).bind(requested.workId).all()).results;
    assert.equal(approvals.length, capacityItems.length);
    for (const approval of approvals) assert.deepEqual(approval, { beneficiary_id: 'employee', purpose: submitted.purpose,
      expires_at: submitted.expiresAt, holder_id: holder, grant_id: null, grant_version: null }, 'business approval binds the child facts without a provider grant');
    for (const [index, item] of capacityItems.entries()) {
      const child = await ok(`/work/${requested.workId}/fulfilment`, { ...submitted, catalogId: item.id });
      assert.equal(child.state, reserved.includes(index) ? 'pending' : 'blocked', 'CATALOG-004 approval cannot borrow another child capacity');
      assert.equal(child.reason, reserved.includes(index) ? null : index < 2 ? 'No stock; acquisition owner required' : 'No license capacity; license owner required');
    }
    assert.deepEqual(await reservations(), sortedReservations(), 'CATALOG-004 approval neither borrows capacity nor reserves a child twice');
    assert.deepEqual(await ok(`/work/${requested.workId}/bundle/approve`, decision, holder), approved,
      'approval replay keeps one bundle decision and the same exact child approval identities');
    assert.deepEqual(await readChildren(), childrenBefore, 'approval replay preserves every submitted child fact');
    assert.deepEqual(await reservations(), sortedReservations(), 'approval replay consumes no extra child capacity');
    assert.deepEqual(await executionSnapshot(), existingExecution, 'CATALOG-004 manager approval leaves all existing execution-grant identities and effects unchanged');
  }
  console.log('PASS CATALOG-004 native child facts and capacity: shared submitted person, purpose and expiry; independent stock and licence exhaustion; current-manager approval creates no grant or dispatch');
  const asset = await ok('/assets', { serial: 'BUNDLE-LAPTOP', source: 'purchase' });
  await ok(`/assets/${asset.id}/commands`, { revision: 1, command: 'assign', personId: 'employee', evidence: 'Bundle laptop allocated' });
  const received = await ok(`/assets/${asset.id}/commands`, { revision: 2, command: 'receive', personId: 'employee', evidence: 'Engineer signed the receipt' });
  const catalog = (name, kind, target, requiresManager = false) => ok('/catalog', { name, kind, target, ownerId: 'owner', requiresManager });
  const items = [await catalog('Engineer laptop', 'device', asset.id), await catalog('IDE licence', 'software', 'bundle-ide'),
    await catalog('GitHub organization', 'access', 'bundle-github', true), await catalog('Production read', 'access', 'bundle-prod', true),
    await catalog('Engineering chat', 'access', 'bundle-chat')];
  assert.equal((await api('/catalog-bundles', { name: 'New engineer', catalogIds: items.map(i => i.id) }, 'employee')).status, 403, 'CATALOG-004 only the owner builds bundles');
  const bundle = await ok('/catalog-bundles', { name: 'New engineer', catalogIds: items.map(i => i.id) });
  assert.deepEqual(bundle.items.map(i => i.kind), ['device', 'software', 'access', 'access', 'access'], 'CATALOG-004 a bundle combines hardware, software and access items');
  let status = await ok(`/catalog-bundles/${bundle.id}/request`, { expectedRevision: bundle.revision, purpose: 'Joining the platform team', deduplicationKey: 'bundle-engineer' }, 'employee');
  const workId = status.workId;
  assert.equal(status.children.length, 5, 'CATALOG-004 requesting the bundle opens five child fulfilments on one ticket');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_fulfilments WHERE work_id=?').bind(workId).first()).n, 5);
  assert.equal(status.state, 'in_progress');
  const queue = (await ok('/fulfilment-decisions', undefined, holder)).items.filter(i => i.workId === workId);
  assert.equal(queue.length, 2);
  const decision = queue.map(q => ({ ...q, expectedHolderId: q.holderId }));
  assert.equal((await api(`/work/${workId}/bundle/approve`, { idempotencyKey: 'bundle-decision', approvals: decision.slice(0, 1) }, holder)).status, 422, 'CATALOG-004 one decision covers every gated child, never part of them');
  assert.equal((await api(`/work/${workId}/bundle/approve`, { idempotencyKey: 'bundle-decision', approvals: decision }, 'owner')).status, 403);
  assert.equal((await api(`/work/${workId}/fulfilment/approve`, { ...decision[0], idempotencyKey: 'one-child' }, holder)).value.code, 'bundle_decision_required', 'CATALOG-004 bundle children are not approved one at a time');
  assert.ok(queue.every(q => q.bundleName === 'New engineer'));
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_fulfilment_approvals WHERE work_id=?').bind(workId).first()).n, 0, 'CATALOG-004 a refused decision records nothing');
  status = await ok(`/work/${workId}/bundle/approve`, { idempotencyKey: 'bundle-decision', approvals: decision }, holder);
  const childApprovals=(await db.prepare('SELECT a.*,f.catalog_id FROM work_fulfilment_approvals a JOIN work_fulfilments f ON f.workspace_id=a.workspace_id AND f.id=a.fulfilment_id WHERE a.work_id=? ORDER BY a.id').bind(workId).all()).results;
  const approvalHistory=(await ok(`/work/${workId}/activity`)).items.filter(e=>e.changes.some(c=>c.field==='approval'));
  assert.equal(approvalHistory.length,2,'DESK-017 one bundle decision records history for both manager-gated children');
  for(const child of childApprovals) {
    const audit=await db.prepare("SELECT id,created_at FROM audit_events WHERE action='work.fulfilment_approved' AND target=?").bind(child.id).first();
    const event=approvalHistory.find(e=>e.id===audit.id);
    assert.ok(event,'DESK-017 each child approval has its own event');
    const childDecision=decision.find(d=>d.catalogId===child.catalog_id);
    assert.ok(childDecision);
    assert.equal(event.actor,childDecision.holderName);
    assert.equal(event.at,audit.created_at);
    assert.deepEqual(event.changes,[{field:'approval',before:null,after:{approvalId:child.id,catalogId:child.catalog_id,
      workRevision:child.work_revision,fulfilmentRevision:child.fulfilment_revision,catalogRevision:child.catalog_revision,holderId:holder}}]);
  }
  assert.equal((await ok(`/work/${workId}/activity`,undefined,'employee')).items.some(e=>e.changes.some(c=>c.field==='approval')),false,'DESK-017 bundle requester sees no internal approval history');
  assert.equal((await api(`/work/${workId}/activity`,undefined,'stranger')).status,404,'DESK-017 unrelated employees cannot read bundle approval history');
  assert.equal(status.decisions, 1, 'CATALOG-004 the bundle shows one approval');
  assert.deepEqual(status.children.map(c => c.approval), ['not_required', 'not_required', 'recorded', 'recorded', 'not_required']);
  for (const [index, kind] of [[1, 'software'], [2, 'access'], [3, 'access'], [4, 'access']]) {
    const target = status.children[index].target, action = kind === 'software' ? 'license.add' : 'group.add';
    await ok('/grants', { id: `bundle-${target}`, principalId: actor.id, action, actionVersion: 1, target, beneficiaryId: 'provider-employee-distinct', localBeneficiaryId: 'employee',
      connectionId: 'graph', verifierConnectionId: 'probe', validFrom: future(-60000), validUntil: future(86400000), maxUses: 5, conditions: { workId } }, holder);
    const resolved = await ok('/test/standing', { workId, target, beneficiaryId: 'employee', kind }, 'employee');
    const plan = await ok('/plans/granted', { workId, revision: 1, steps: [resolved.step], idempotencyKey: `bundle-${target}` }, 'employee');
    await ok('/test/link', { workId, planId: plan.planId, operationIds: plan.operations.map(o => o.id) }, 'employee');
    const operationId = plan.operations.find(o => o.parent_id === 'initial').id;
    assert.equal((await ok('/test/run', { operationId }, actor.id)).state, 'effect_verified');
    await ok('/test/verify', { operationId, verifierVersion: 1 }, actor.id);
  }
  await ok('/work/process-due', {});
  status = await ok(`/work/${workId}/bundle`, undefined, 'employee');
  assert.deepEqual(status.children.slice(1).map(c => c.delivery), ['verified', 'verified', 'verified', 'verified']);
  assert.notEqual(status.children[0].delivery, 'verified', 'the laptop waits for its physical handoff');
  assert.equal(status.state, 'in_progress', 'CATALOG-004 the bundle is not complete while one child is unverified');
  const laptop = status.children[0];
  await ok(`/obligations/${laptop.obligationId}/physical`, { revision: laptop.obligationRevision, custodyEventId: received.custodyEventId });
  status = await ok(`/work/${workId}/bundle`, undefined, 'employee');
  assert.equal(status.state, 'complete', 'CATALOG-004 the bundle completes only when all five children verify');
  await db.prepare('UPDATE work_catalog SET revision=revision+1 WHERE id=?').bind(items[4].id).run();
  assert.equal((await api(`/catalog-bundles/${bundle.id}/request`, { expectedRevision: bundle.revision, purpose: 'Second engineer', deduplicationKey: 'bundle-stale' }, 'employee')).value.code, 'bundle_changed', 'CATALOG-004 a changed item refuses the old bundle snapshot');
  console.log('PASS CATALOG-004 public routes: owner-built hardware/software/access bundle, one ticket with five child fulfilments, one atomic manager decision, per-child grants and verification, complete only after the last child verifies, stale snapshot refused');
}

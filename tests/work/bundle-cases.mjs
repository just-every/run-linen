import assert from 'node:assert/strict';
/** CATALOG-004: one bundle request, one manager decision, five child fulfilments, complete only when every child verifies. */
export async function bundleChecks({ ok, api, db, actor, future }) {
  const holder = (await db.prepare("SELECT manager_id FROM work_people WHERE id='employee'").first()).manager_id;
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

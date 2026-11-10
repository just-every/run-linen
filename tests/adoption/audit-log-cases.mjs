import assert from 'node:assert/strict';

const SHAPE = ['action', 'actorId', 'at', 'grantVersion', 'id', 'target'];
/** An owner changes a grant and completes a native export; a distinct auditor reads both persisted events. */
export async function auditLogChecks({ ok, request, auth, tenantOwner, foreignOwner, database }) {
  const db = await database(), tenantUser = (await ok('/session', 'GET', undefined, tenantOwner)).principal;
  const password = 'synthetic-audit-proof-2026';
  const member = async (name, roles) => {
    const email = `audit-${name}@example.test`, created = await ok('/members', 'POST', { email, name, password, roles }, tenantOwner, 201);
    return { id: created.id, session: await auth(await request('/login', 'POST', { email, password })) };
  };
  const auditor = await member('auditor', ['auditor']), employee = await member('employee', ['employee']), operator = await member('operator', ['operator']);
  const connection = await ok('/connections', 'POST', { provider: 'audit-proof', name: 'Audit proof connection' }, tenantOwner, 201);
  const grantBody = (extra = {}) => ({ principalId: operator.id, beneficiaryId: 'audit-provider-subject', action: 'group.add', actionVersion: 1, target: 'audit-group', connectionId: connection.id, validFrom: new Date(Date.now() - 60000).toISOString(), validUntil: new Date(Date.now() + 86400000).toISOString(), maxUses: 3, ...extra });
  const events = async (query = '', who = auditor.session) => (await ok('/audit-events' + query, 'GET', undefined, who)).events;
  const grantEvents = async () => (await events('?action=execution.grant_version.created&limit=200')).filter(e => e.grantVersion);

  // Rejected grant changes leave no success event and no grant row.
  assert.deepEqual(await grantEvents(), []);
  const grantCount = async () => (await db.prepare('SELECT COUNT(*) n FROM execution_grants WHERE workspace_id=?').bind(tenantUser.workspaceId).first()).n;
  assert.equal((await request('/grants', 'POST', grantBody(), employee.session)).status, 403, 'An employee cannot issue a grant');
  assert.equal((await request('/grants', 'POST', grantBody({ principalId: tenantUser.userId }), tenantOwner)).status, 403, 'Self approval is refused');
  assert.equal((await request('/grants', 'POST', grantBody({ validUntil: new Date(Date.now() - 1000).toISOString() }), tenantOwner)).status, 422, 'An expired grant is refused');
  assert.equal(await grantCount(), 0);
  assert.deepEqual(await grantEvents(), [], 'Rejected grant changes produce no success event');

  // A native owner creates a grant and then a second version of it.
  const first = await ok('/grants', 'POST', grantBody(), tenantOwner, 201);
  assert.equal(first.version, 1);
  assert.equal((await request('/grants', 'POST', grantBody({ id: first.id, expectedVersion: 7 }), tenantOwner)).status, 409, 'A stale grant change is refused');
  assert.equal((await grantEvents()).length, 1, 'A stale change adds no event');
  const second = await ok('/grants', 'POST', grantBody({ id: first.id, expectedVersion: 1, maxUses: 2 }), tenantOwner, 201);
  assert.deepEqual([second.id, second.version], [first.id, 2]);

  // A real native export, run to its ready manifest.
  const exportRun = await ok('/exports', 'POST', { idempotencyKey: 'audit-log-export' }, tenantOwner, 201);
  let ready;
  for (let n = 0; n < 60 && !ready; n++) { const r = await ok(`/exports/${exportRun.id}/advance`, 'POST', {}, tenantOwner); if (r.state === 'ready') ready = r; }
  assert.ok(ready, 'The export completes');

  // The persisted rows exist, and the distinct auditor reads exactly them.
  const persisted = (await db.prepare("SELECT action,target,actor_id FROM audit_events WHERE workspace_id=? AND (action LIKE 'adoption.export.%' OR action='execution.grant_version.created')").bind(tenantUser.workspaceId).all()).results;
  for (const [action, target] of [['execution.grant_version.created', first.id], ['adoption.export.snapshot', exportRun.id], ['adoption.export.ready', exportRun.id]])
    assert.ok(persisted.some(r => r.action === action && r.target === target && r.actor_id === tenantUser.userId), `${action} is persisted for the owner`);
  assert.notEqual(auditor.id, tenantUser.userId);
  const read = await events('?limit=200');
  for (const e of read) { assert.deepEqual(Object.keys(e).sort(), SHAPE, 'Only allowlisted fields are returned'); assert.ok(Number.isFinite(Date.parse(e.at))); }
  const grants = read.filter(e => e.action === 'execution.grant_version.created');
  assert.deepEqual(grants.map(e => e.grantVersion).sort((a, b) => a.version - b.version), [{ grantId: first.id, version: 1 }, { grantId: first.id, version: 2 }]);
  for (const e of grants) assert.deepEqual([e.actorId, e.target], [tenantUser.userId, first.id]);
  for (const action of ['adoption.export.snapshot', 'adoption.export.ready']) {
    const [e] = read.filter(x => x.action === action);
    assert.ok(e, `${action} is readable`);
    assert.deepEqual([e.actorId, e.target, e.grantVersion], [tenantUser.userId, exportRun.id, null]);
  }
  assert.ok(!JSON.stringify(read).includes('detail'), 'Raw detail payloads are never returned');
  assert.deepEqual((await events('?action=adoption.export.ready')).map(e => e.target), [exportRun.id]);
  assert.equal((await ok('/audit-events', 'GET', undefined, tenantOwner)).events.length > 0, true, 'The owner reads too');

  // Bounded, newest first and pageable.
  const page = await ok('/audit-events?limit=2', 'GET', undefined, auditor.session);
  assert.equal(page.events.length, 2); assert.ok(page.nextBefore);
  const older = await ok(`/audit-events?limit=2&before=${page.nextBefore}`, 'GET', undefined, auditor.session);
  assert.ok(older.events.length > 0 && older.events.every(e => !page.events.some(p => p.id === e.id)));
  for (const query of ['?limit=0', '?limit=201', '?limit=x', '?before=-1', '?action=']) assert.equal((await request('/audit-events' + query, 'GET', undefined, auditor.session)).status, 400, query);

  // Employee, operator, signed-out and foreign-workspace readers are refused or see nothing of this workspace.
  assert.equal((await request('/audit-events', 'GET', undefined, employee.session)).status, 403);
  assert.equal((await request('/audit-events', 'GET', undefined, operator.session)).status, 403);
  assert.equal((await request('/audit-events', 'GET')).status, 401);
  const foreign = await ok(`/audit-events?limit=200&workspaceId=${tenantUser.workspaceId}`, 'GET', undefined, foreignOwner);
  assert.ok(!foreign.events.some(e => [first.id, exportRun.id].includes(e.target)), 'Another workspace never reads these events');

  // A withdrawn auditor role or membership ends access at once, and restoring the role restores it.
  const signIn = async () => auth(await request('/login', 'POST', { email: 'audit-auditor@example.test', password }));
  await ok(`/members/${auditor.id}`, 'PATCH', { roles: ['employee'] }, tenantOwner);
  assert.equal((await request('/audit-events', 'GET', undefined, auditor.session)).status, 401, 'A session held before the role was withdrawn is refused');
  assert.equal((await request('/audit-events', 'GET', undefined, await signIn())).status, 403, 'A withdrawn auditor role is refused');
  await ok(`/members/${auditor.id}`, 'PATCH', { roles: ['auditor'] }, tenantOwner);
  const restored = await signIn();
  assert.equal((await request('/audit-events', 'GET', undefined, restored)).status, 200);
  await ok(`/members/${auditor.id}`, 'PATCH', { roles: ['auditor'], active: false }, tenantOwner);
  assert.equal((await request('/audit-events', 'GET', undefined, restored)).status, 401, 'A withdrawn membership is refused');
  assert.notEqual((await request('/login', 'POST', { email: 'audit-auditor@example.test', password })).status, 200, 'A withdrawn membership cannot sign in');
  console.log('PASS AUDIT-001 native auditor reads: owner grant versions and a completed export are persisted and read by a distinct auditor with allowlisted fields only; employee, operator, signed-out, foreign-workspace, withdrawn-role and withdrawn-membership readers are refused; rejected grant changes leave no event');
}

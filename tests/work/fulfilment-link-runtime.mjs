import assert from 'node:assert/strict';
import { workSavedChecks } from './work-saved-cases.mjs';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), root = new URL('../../', import.meta.url).pathname;
const packages = await readdir(join(root, 'node_modules/.pnpm'));
const dependency = name => require(join(root, 'node_modules/.pnpm', packages.find(x => x.startsWith(name + '@')), 'node_modules', name));
const { build } = dependency('esbuild'), { Miniflare, convertV4MiniflareOptions } = dependency('miniflare');
const port = Number(process.env.LINEN_TEST_WORKER_PORT || 0);
const dir = await mkdtemp(join(tmpdir(), 'linen-fulfilment-link-'));
const built = await build({ entryPoints: [join(root, 'tests/work/fulfilment-link-worker.ts')], bundle: true, format: 'esm', platform: 'browser', write: false });
const mf = new Miniflare({ ...convertV4MiniflareOptions({ port, workers: [{ name: 'test', modules: true,
  script: built.outputFiles[0].text, compatibilityDate: '2026-09-01', d1Databases: { DB: 'fulfilment-link' },
  bindings: { ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64') } }], d1Persist: join(dir, 'd1') }), resourcePersistencePath: dir });
async function api(path, body, user = 'owner', workspace = 'w') {
  const response = await mf.dispatchFetch(`http://localhost${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-user': user, 'x-workspace': workspace }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, value: await response.json() };
}
async function ok(path, body, user = 'owner') {
  const result = await api(path, body, user); assert.ok(result.status < 300, `${path}: ${JSON.stringify(result)}`); return result.value;
}
try {
  const db = await mf.getD1Database('DB');
  for (const file of (await readdir(join(root, 'migrations'))).filter(x => x.endsWith('.sql')).sort())
    await db.exec((await readFile(join(root, 'migrations', file), 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' '));
  await db.exec(`INSERT INTO workspaces VALUES('w','Fixture','2026-01-01');
    INSERT INTO workspaces VALUES('other','Other','2026-01-01');
    INSERT INTO users VALUES('owner','owner@test','Owner','unused','2026-01-01');
    INSERT INTO users VALUES('employee','employee@test','Employee','unused','2026-01-01');
    INSERT INTO users VALUES('stranger','stranger@test','Stranger','unused','2026-01-01');
    INSERT INTO memberships VALUES('w','owner','["owner"]',1);
    INSERT INTO memberships VALUES('w','employee','["employee"]',1);
    INSERT INTO memberships VALUES('w','stranger','["employee"]',1);
    INSERT INTO users VALUES('auditor','auditor@test','Auditor','unused','2026-01-01');
    INSERT INTO memberships VALUES('w','auditor','["auditor"]',1);
    INSERT INTO memberships VALUES('other','employee','["employee"]',1);`);
  await ok('/test/connections', {});
  const actor = await ok('/automation-principals', { name: 'Fixture automation', idempotencyKey: 'actor' });
  await ok('/subject-mappings', { connectionId: 'graph', localUserId: 'employee', providerSubject: 'provider-employee-distinct' });
  const expiry = new Date(Date.now() + 3_600_000).toISOString();
  async function journey(key, { expiresAt = expiry, fulfil = true } = {}) {
    const work = await ok('/work', { title: key, body: 'Temporary project access', deduplicationKey: key }, 'employee');
    const catalog = await ok('/catalog', { name: key, kind: 'access', target: key, ownerId: 'owner' });
    if (fulfil) await ok(`/work/${work.id}/fulfilment`, { catalogId: catalog.id, beneficiaryId: 'employee', purpose: 'Project work', expiresAt }, 'employee');
    for (const [action, suffix] of [['group.add', 'add'], ['group.remove', 'remove']])
      await ok('/grants', { id: key + '-' + suffix, principalId: actor.id, action, actionVersion: 1, target: key,
        beneficiaryId: 'provider-employee-distinct', localBeneficiaryId: 'employee', connectionId: 'graph',
        verifierConnectionId: 'probe', validFrom: new Date(Date.now() - 60_000).toISOString(),
        validUntil: new Date(Date.now() + 86_400_000).toISOString(), maxUses: 30, conditions: { workId: work.id } });
    const resolved = await ok('/test/standing', { workId: work.id, target: key, beneficiaryId: 'employee', kind: 'access', expiresAt }, 'employee');
    assert.equal(resolved.actorId, actor.id); assert.equal(resolved.step.localBeneficiaryId, 'employee');
    assert.equal(resolved.step.beneficiaryId, 'provider-employee-distinct');
    const plan = await ok('/plans/granted', { workId: work.id, revision: work.revision, steps: [resolved.step], idempotencyKey: key }, 'employee');
    const initial = plan.operations.find(o => o.parent_id === 'initial'), removal = plan.operations.find(o => o.parent_id === initial.id);
    assert.equal(plan.operations.length, expiresAt ? 2 : 1);
    const input = { workId: work.id, planId: plan.planId, operationIds: plan.operations.map(o => o.id) };
    return { work, catalog, plan, initial, removal, input };
  }
  const first = await journey('project-access');
  assert.equal((await api('/test/link', first.input, 'stranger')).status, 404);
  assert.equal((await api('/test/link', first.input, 'employee', 'other')).status, 404);
  assert.equal((await api('/test/link', { ...first.input, operationIds: [first.initial.id] }, 'employee')).status, 409);
  const linked = await ok('/test/link', first.input, 'employee');
  assert.equal(linked.bindings.length, 2);
  assert.deepEqual(await ok('/test/link', { ...first.input, operationIds: [...first.input.operationIds].reverse() }, 'employee'), linked);
  const duties = () => ok(`/work/${first.work.id}/obligations`, undefined, 'employee');
  let rows = (await duties()).items;
  assert.equal(rows.find(o => o.kind === 'access.grant').operation_id, first.initial.id);
  assert.equal(rows.find(o => o.kind === 'access.revoke').operation_id, first.removal.id);
  const removeStep = JSON.parse((await db.prepare('SELECT step_json FROM work_execution_bindings WHERE obligation_id=?').bind(rows.find(o => o.kind === 'access.revoke').id).first()).step_json);
  assert.equal(removeStep.grantId, 'project-access-remove'); assert.equal(removeStep.action, 'group.remove');
  const count = async () => (await db.prepare('SELECT COUNT(*) n FROM execution_operations').first()).n;
  const before = await count();
  await ok('/work/process-due', {}); await ok('/work/process-due', {});
  assert.equal(await count(), before, 'due loop must reuse actual dispatched operations');
  assert.equal((await ok('/test/run', { operationId: first.initial.id }, actor.id)).state, 'effect_verified');
  assert.equal((await ok('/test/inspect', { operationId: first.initial.id }, 'employee')).state, 'pending', 'effect readback is not useful-work verification');
  assert.equal((await ok('/test/verify', { operationId: first.initial.id, verifierVersion: 1 }, actor.id)).state, 'verified');
  await ok('/work/process-due', {});
  rows = (await duties()).items;
  assert.equal(rows.find(o => o.kind === 'access.grant').state, 'verified');
  assert.equal(rows.find(o => o.kind === 'access.revoke').state, 'pending', 'verified initial never completes expiry');
  assert.deepEqual(await ok('/test/link', first.input, 'employee'), linked, 'exact replay after verification');
  const second = await journey('different-work');
  assert.equal((await api('/test/link', { ...second.input, planId: first.plan.planId, operationIds: first.input.operationIds }, 'employee')).status, 409);
  assert.equal((await api('/test/link', { ...second.input, operationIds: first.input.operationIds }, 'employee')).status, 409);
  // An execution operation from a changed provider scope cannot borrow a work association.
  const saved = second.initial.step_json;
  await db.prepare('UPDATE execution_operations SET step_json=? WHERE id=?').bind(JSON.stringify({ ...JSON.parse(saved), beneficiaryId: 'other-provider-person' }), second.initial.id).run();
  assert.equal((await api('/test/link', second.input, 'employee')).status, 409);
  await db.prepare('UPDATE execution_operations SET step_json=? WHERE id=?').bind(saved, second.initial.id).run();
  await db.prepare("UPDATE execution_plans SET context_type='change' WHERE id=?").bind(second.plan.planId).run();
  assert.equal((await api('/test/link', second.input, 'employee')).status, 409);
  await db.prepare("UPDATE execution_plans SET context_type='work' WHERE id=?").bind(second.plan.planId).run();
  await ok(`/work/${second.work.id}/commands`, { revision: 1, command: 'reopen', reason: 'Amended request' }, 'employee');
  assert.equal((await api('/test/link', second.input, 'employee')).status, 409);
  const unbound = await db.prepare('SELECT COUNT(*) n FROM work_obligations WHERE work_id=? AND operation_id IS NOT NULL').bind(second.work.id).first();
  assert.equal(unbound.n, 0, 'failed association leaves no partial bindings');
  const absent = await journey('missing-fulfilment', { fulfil: false });
  assert.equal((await api('/test/link', absent.input, 'employee')).status, 409);
  const missing = await journey('missing-secret');
  await ok('/test/link', missing.input, 'employee');
  const secret = (await db.prepare("SELECT secret_ciphertext FROM connections WHERE id='graph'").first()).secret_ciphertext;
  await db.prepare("UPDATE connections SET secret_ciphertext=NULL WHERE id='graph'").run();
  assert.equal((await ok('/test/run', { operationId: missing.initial.id }, actor.id)).state, 'needs_configuration');
  const inspection = await ok('/test/inspect', { operationId: missing.initial.id }, 'employee');
  assert.deepEqual(inspection, { state: 'pending', reason: 'needs_configuration' });
  const countMissing = await count(); await ok('/work/process-due', {}); assert.equal(await count(), countMissing);
  await db.prepare("UPDATE connections SET secret_ciphertext=? WHERE id='graph'").bind(secret).run();
  // Test-only state fixture: an unproven verified flag must not become work evidence.
  await db.prepare("UPDATE execution_operations SET state='verified' WHERE id=?").bind(missing.initial.id).run();
  assert.equal((await ok('/test/inspect', { operationId: missing.initial.id }, 'employee')).state, 'unknown');
  await db.prepare("UPDATE execution_operations SET state='unknown' WHERE id=?").bind(missing.initial.id).run();
  assert.equal((await ok('/test/inspect', { operationId: missing.initial.id }, 'employee')).state, 'unknown');
  await ok(`/work/${missing.work.id}/commands`, { revision: 1, command: 'cancel', reason: 'No longer needed' }, 'employee');
  const cancelled = await ok('/test/inspect', { operationId: missing.initial.id }, 'employee');
  assert.equal(cancelled.state, 'unknown'); assert.match(cancelled.reason, /separately authorize compensation/);
  assert.equal((await api('/test/link', missing.input, 'employee')).status, 409);
  // Real execution-engine expiry at the declared instant, with only test provider traffic.
  // Room for four requests before the expiry on a slow runner: the removal must still be queued, then the test waits it out.
  const expirySoon = new Date(Date.now() + 8000).toISOString();
  const expiring = await journey('actual-expiry', { expiresAt: expirySoon });
  await ok('/test/link', expiring.input, 'employee');
  await ok('/test/run', { operationId: expiring.initial.id }, actor.id);
  await ok('/test/verify', { operationId: expiring.initial.id, verifierVersion: 1 }, actor.id);
  assert.equal((await ok('/test/run', { operationId: expiring.removal.id }, actor.id)).state, 'queued');
  await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(expirySoon) - Date.now() + 25)));
  assert.equal((await ok('/test/run', { operationId: expiring.removal.id }, actor.id)).state, 'effect_verified');
  assert.equal((await ok('/test/inspect', { operationId: expiring.removal.id }, 'employee')).state, 'pending');
  await ok('/test/verify', { operationId: expiring.removal.id, verifierVersion: 1 }, actor.id);
  await ok('/work/process-due', {});
  const expiredDuties = (await ok(`/work/${expiring.work.id}/obligations`, undefined, 'employee')).items;
  assert.ok(expiredDuties.every(o => o.state === 'verified'));
  const expiryCount = await count(); await ok('/work/process-due', {}); assert.equal(await count(), expiryCount);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_fulfilment_link_guards').first()).n, 0);
  await workSavedChecks({ api, ok, actor });
  console.log('REPORT-004 passed: baseline vs automated request type, role minutes at declared rates, request-attributed model charges, unknown provider charges and the failure in the same period');
  console.log('FULFILMENT LINK passed: real D1/workerd; employee + automation/grants + reviewed distinct provider mapping; initial/expiry atomic binding and replay; stranger/workspace/work/provider/change/amendment rejection; no duplicate dispatch; independent verification and pending revocation; truthful missing configuration/unknown/cancellation; no external provider traffic');
} finally { await mf.dispose(); await rm(dir, { recursive: true, force: true }); }

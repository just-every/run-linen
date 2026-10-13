import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), root = new URL('../../', import.meta.url).pathname;
const packages = await readdir(join(root, 'node_modules/.pnpm'));
const dependency = name => require(join(root, 'node_modules/.pnpm', packages.find(x => x.startsWith(name + '@')), 'node_modules', name));
const { build } = dependency('esbuild'), { Miniflare, convertV4MiniflareOptions } = dependency('miniflare');
const port = Number(process.env.LINEN_TEST_WORKER_PORT || 0);
const dir = await mkdtemp(join(tmpdir(), 'linen-work-integration-'));
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
    INSERT INTO memberships VALUES('other','employee','["employee"]',1);`);
  await ok('/test/connections', {});
  const actor = await ok('/automation-principals', { name: 'Fixture automation', idempotencyKey: 'actor' });
  await ok('/subject-mappings', { connectionId: 'graph', localUserId: 'employee', providerSubject: 'provider-employee-distinct' });
  const expiry = new Date(Date.now() + 3_600_000).toISOString();
  async function journey(key, { expiresAt = expiry, fulfil = true, compensation = false } = {}) {
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
    if (compensation) resolved.step.compensationGrantId = key + '-remove';
    const plan = await ok('/plans/granted', { workId: work.id, revision: work.revision, steps: [resolved.step], idempotencyKey: key }, 'employee');
    const initial = plan.operations.find(o => o.parent_id === 'initial'), removal = plan.operations.find(o => o.parent_id === initial.id);
    assert.equal(plan.operations.length, expiresAt ? 2 : 1);
    const input = { workId: work.id, planId: plan.planId, operationIds: plan.operations.map(o => o.id) };
    return { work, catalog, plan, initial, removal, input };
  }
  const { runIntegrationRegressions } = await import('./integration-regressions-cases.mjs');
  await runIntegrationRegressions({ db, api, ok, journey, actor });

} finally { await mf.dispose(); await rm(dir, { recursive: true, force: true }); }

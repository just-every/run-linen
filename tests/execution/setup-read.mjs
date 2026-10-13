import { applyMigrations } from '../sql-migrations.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url), wr = createRequire(require.resolve('wrangler/package.json'));
const { build } = wr('esbuild'), { Miniflare, convertV4MiniflareOptions } = wr('miniflare');
const dir = await mkdtemp(join(tmpdir(), 'linen-setup-read-')); let mf;
try {
  await build({ entryPoints: ['tests/execution/worker.ts'], outfile: join(dir, 'worker.mjs'), bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent' });
  mf = new Miniflare(convertV4MiniflareOptions({ port: Number(process.env.LINEN_TEST_WORKER_PORT || 0),  modules: true, script: await readFile(join(dir, 'worker.mjs'), 'utf8'), compatibilityDate: '2026-09-01', d1Databases: ['DB'], r2Buckets: ['ATTACHMENTS'], bindings: { ENCRYPTION_KEY: btoa('x'.repeat(32)), SESSION_SECRET: 'test-only' } }));
  const db = await mf.getD1Database('DB');
  await applyMigrations(db);
  const now = new Date().toISOString();
  for (const w of ['w', 'foreign']) await db.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(w, w, now).run();
  for (const u of ['issuer', 'employee', 'elsewhere']) {
    await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(u, u + '@example.test', u, 'secret-password-sentinel', now).run();
    await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind(u === 'elsewhere' ? 'foreign' : 'w', u, JSON.stringify([u === 'employee' ? 'employee' : 'owner'])).run();
  }
  for (const [w, c] of [['w', 'graph'], ['foreign', 'foreign-graph']]) {
    await db.prepare('INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)').bind(c, w, 'microsoft-graph', c, '{}', 'secret-sentinel', 'active', now, now).run();
    const u = w === 'w' ? 'employee' : 'elsewhere';
    await db.prepare('INSERT INTO execution_subject_mappings VALUES(?,?,?,?,?,?,1,1,?,?,?,?)').bind(c + '-mapping', w, c, 1, u, 'provider-' + u, now, u, 'member', JSON.stringify({ userId: u })).run();
  }
  async function call(path, user = 'issuer', workspace = 'w', body) {
    const r = await mf.dispatchFetch('http://localhost' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'Test-User': user, 'Test-Workspace': workspace }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  }
  const machine = await call('/automation-principals', 'issuer', 'w', { name: 'Named setup actor', idempotencyKey: 'setup' });
  assert.equal(machine.status, 201);
  let rows = (await call('/subject-mappings')).body;
  assert.equal(rows.length, 1); assert.equal(rows[0].localName, 'employee'); assert.equal(rows[0].current, true); assert.equal(rows[0].revision, 1); assert.equal(rows[0].currentConnectionRevision, 1);
  assert.ok(!JSON.stringify(rows).includes('secret')); assert.ok(!JSON.stringify(rows).includes('elsewhere'));
  assert.equal((await call('/subject-mappings', 'employee')).status, 403);
  assert.equal((await call('/automation-principals', 'employee')).status, 403);
  assert.equal((await call('/subject-mappings', 'issuer', 'foreign')).status, 403);
  assert.equal((await call('/subject-mappings', 'elsewhere', 'foreign')).body[0].localName, 'elsewhere');
  const actors = (await call('/automation-principals')).body;
  assert.equal(actors.length, 1); assert.equal(actors[0].name, 'Named setup actor'); assert.equal(actors[0].active, true); assert.ok(!JSON.stringify(actors).includes('secret'));
  await db.prepare("UPDATE memberships SET roles_json='[\"operator\"]' WHERE user_id='issuer'").run();
  for (const path of ['/subject-mappings', '/automation-principals']) assert.equal((await call(path)).status, 403, 'stale owner principal does not survive persisted role downgrade');
  await db.prepare("UPDATE memberships SET roles_json='[\"owner\"]' WHERE user_id='issuer'").run();
  await db.prepare("UPDATE connections SET revision=2 WHERE id='graph'").run();
  rows = (await call('/subject-mappings')).body; assert.equal(rows[0].current, false); assert.equal(rows[0].connectionRevision, 1); assert.equal(rows[0].currentConnectionRevision, 2);
  await db.prepare("UPDATE execution_subject_mappings SET connection_revision=2,revision=2 WHERE connection_id='graph'").run();
  assert.equal((await call('/subject-mappings')).body[0].current, true);
  await db.prepare("UPDATE connections SET status='unverified' WHERE id='graph'").run();
  assert.equal((await call('/subject-mappings')).body[0].current, false);
  await db.prepare("UPDATE connections SET status='active' WHERE id='graph'").run();
  await db.prepare("UPDATE memberships SET active=0 WHERE user_id='employee'").run();
  assert.equal((await call('/subject-mappings')).body[0].current, false);
  await db.prepare("UPDATE memberships SET active=1 WHERE user_id='employee'").run();
  await db.prepare("UPDATE execution_subject_mappings SET local_source_json='{}' WHERE connection_id='graph'").run();
  assert.equal((await call('/subject-mappings')).body[0].current, false);
  await db.prepare("UPDATE memberships SET roles_json='[\"employee\"]' WHERE user_id=?").bind(machine.body.id).run();
  assert.equal((await call('/automation-principals')).body[0].active, false);
  const secret = (await call('/fixture/secret', 'issuer', 'w', { clientId: 'fixture', clientSecret: 'fixture-only' })).body.secret;
  await db.prepare("UPDATE connections SET config_json=?,secret_ciphertext=? WHERE id='graph'").bind(JSON.stringify({tenantId:'fixture'}), secret).run();
  const remapped = await call('/subject-mappings', 'issuer', 'w', { connectionId:'graph', localUserId:'employee', providerSubject:'provider-employee', expectedRevision:2 });
  assert.equal(remapped.status, 201, JSON.stringify(remapped));
  const readBack = (await call('/subject-mappings')).body.find(m => m.id === remapped.body.id);
  assert.equal(readBack.revision, 3); assert.equal(readBack.current, true); assert.equal(readBack.providerSubject, 'provider-employee');
  await db.prepare("INSERT INTO work_people(id,workspace_id,source,source_id,name,manager_id,active,merged_into,revision,observed_at,effective_at) VALUES('hr-person','w','hr','hr-17','HR Colleague',NULL,1,NULL,1,?,?)").bind(now,now).run();
  await db.prepare("INSERT INTO execution_subject_mappings VALUES('hr-map','w','graph',2,'hr-person','provider-hr',1,1,?,'issuer','person',?)").bind(now,JSON.stringify({personId:'hr-person',source:'hr',sourceId:'hr-17'})).run();
  assert.equal((await call('/subject-mappings')).body.find(m => m.id === 'hr-map').current, true);
  await db.prepare("UPDATE work_people SET source_id='changed' WHERE id='hr-person'").run();
  assert.equal((await call('/subject-mappings')).body.find(m => m.id === 'hr-map').current, false);
  await db.prepare("UPDATE memberships SET active=0 WHERE user_id='issuer'").run();
  assert.equal((await call('/subject-mappings')).status, 403);
  console.log('Setup read D1 checks passed: workspace isolation, secret exclusion, persisted role downgrade/revocation, mapping provenance, local inactivity, connection revision/status drift and service actor downgrade.');
} finally { await mf?.dispose(); await rm(dir, { recursive: true, force: true }); }

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { priorDataHarness } from './prior-data-harness.mjs';
import { populatePriorData } from './prior-data-populate.mjs';

const archive = process.env.LINEN_PRIOR_SOURCE;
if (!archive) throw Error('LINEN_PRIOR_SOURCE must name the read-only archived last-commit Linen checkout');
const out = resolve(process.env.LINEN_TEST_OUTPUT || '/tmp/linen-prior-data-evidence');
await mkdir(out, { recursive: true });
const h = await priorDataHarness(resolve(archive));
const checks = [];
try {
  await h.start(resolve(archive));
  const originalMigrations = await h.migrate(resolve(archive));
  const data = await populatePriorData(h);
  const paths = ['/workspace', '/members', '/settings', '/adoption/retention', '/work/' + data.work.id,
    '/work/' + data.work.id + '/obligations', '/lifecycle/' + data.lifecycle.lifecycleId,
    '/people', '/assets', '/catalog', '/knowledge', '/grants', '/operations', '/plans'];
  const readbacks = new Map();
  for (const path of paths) readbacks.set(path, await h.ok(path, undefined, data.owner));
  await writeFile(join(out, 'native-before-upgrade.json'), JSON.stringify(Object.fromEntries(readbacks), null, 2));
  const employeeConversation = await h.ok('/work/' + data.work.id, undefined, data.employee);
  assert.ok(!JSON.stringify(employeeConversation).includes('Private operator assessment'));
  const effects = await h.ok('/__fixture/evidence');
  assert.equal(effects.calls.filter(c => c.kind === 'entitlement-write').length, 1);
  const before = await h.snapshot();
  await h.stop();
  const setupCommand = await h.setupUpgrade(out);
  await h.start(resolve('.'));
  const after = await h.snapshot();
  const addedMigrations = after.d1_migrations.map(row => JSON.parse(row).name).filter(name => !originalMigrations.includes(name));
  assert.ok(addedMigrations.length, 'Supported rer setup must apply actual new additive migrations to the retained store');
  assert.deepEqual(await h.migrate(resolve('.')), [], 'Supported setup must already have applied every current migration');
  for (const [table, rows] of Object.entries(before)) {
    if (table === 'sessions') {
      assert.deepEqual(after.sessions, [], 'Legacy sessions must be retired, never assigned current authority');
    } else if (table === 'd1_migrations') {
      for (const row of rows) assert.ok(after[table].includes(row), 'Applied migration history changed');
    } else if (rows.length) {
      // Additive migrations may add columns; every original field and relationship
      // must still match exactly, without treating a wider row as lost data.
      const columns = Object.keys(JSON.parse(rows[0]));
      const retained = (after[table] ?? []).map(row => {
        const value = JSON.parse(row);
        return JSON.stringify(Object.fromEntries(columns.map(key => [key, value[key]])));
      });
      for (const row of rows) assert.ok(retained.includes(row), 'Prior row or relationship changed in ' + table);
    }
  }
  checks.push('Supported rer setup upgraded the archived native store. Except deliberately retired unproved sessions, every prior application/provider-fixture row retains every original field value and relationship after setup; every prior migration record and SQL source remains unchanged.');
  assert.equal((await h.request('/session', undefined, data.owner)).status, 401);
  assert.equal((await h.request('/session', undefined, data.employee)).status, 401);
  data.owner = await h.login('upgrade-owner@example.test', data.password);
  data.employee = await h.login('upgrade-employee@example.test', data.password);
  const upgradedReadbacks = {};
  for (const [path, expected] of readbacks) {
    upgradedReadbacks[path] = await h.ok(path, undefined, data.owner);
    const retained = path === '/people' ? {
      ...upgradedReadbacks[path],
      items: upgradedReadbacks[path].items.map(({ member_id, binding_id, ...person }) => {
        assert.equal(member_id, null, 'Upgrade cannot invent a member binding for retained HR observations');
        assert.equal(binding_id, null, 'Upgrade cannot invent reviewed binding authority');
        return person;
      }),
    } : upgradedReadbacks[path];
    assert.deepEqual(retained, expected, 'Native stable readback changed: ' + path);
  }
  await writeFile(join(out, 'native-after-upgrade.json'), JSON.stringify(upgradedReadbacks, null, 2));
  assert.deepEqual(await h.ok('/work/' + data.work.id, undefined, data.employee), employeeConversation);
  checks.push('After fresh sign-in, prior native owner and employee accounts retain exact workspace, users, roles, policies, conversations, lifecycle duties, custody, knowledge, plans, grants and unknown-operation readbacks.');
  const employeeKnowledge = await h.ok('/knowledge?q=Prior', undefined, data.employee);
  assert.ok(employeeKnowledge.items.some(article => article.id === data.knowledge.id));
  assert.ok(!JSON.stringify(employeeKnowledge).includes('Private owner instructions'));
  const report = await h.ok('/reports/work?from=2026-01-01T00:00:00.000Z&to=2099-01-01T00:00:00.000Z&timezone=Australia%2FBrisbane', undefined, data.owner);
  assert.ok(report.rows.some(row => row.id === data.work.id));
  assert.ok(report.calendars.some(calendar => calendar.work_id === data.work.id));
  assert.equal(report.verifiedOutcomeCount, null, 'Administrative reporting must not invent verified fulfilment');
  assert.equal((await h.request('/reports/work?from=2026-01-01&to=2099-01-01&timezone=UTC', undefined, data.employee)).status, 403);
  checks.push('Native knowledge search retains reviewed public guidance and hides private articles; management report retains work/calendar links with separate verification coverage and employee denial.');
  for (const attachment of data.attachments) {
    const response = await h.request('/attachments/' + attachment.id, undefined, data.owner);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), attachment.bytes);
    const employeeResponse = await h.request('/attachments/' + attachment.id, undefined, data.employee);
    assert.equal(employeeResponse.status, attachment.visibility === 'public' ? 200 : 404);
    if (attachment.visibility === 'public') assert.deepEqual(Buffer.from(await employeeResponse.arrayBuffer()), attachment.bytes);
  }
  checks.push('Public and private attachment bytes survive in real R2; employee public access and private denial remain enforced.');
  const signedIn = await h.login('upgrade-owner@example.test', data.password);
  assert.equal(signedIn.userId, data.owner.userId);
  const issuer = await h.login('upgrade-issuer@example.test', data.password);
  assert.deepEqual(issuer.roles, data.issuer.roles);
  assert.equal((await h.request('/session', undefined, data.retiredSession)).status, 401);
  assert.equal((await h.request('/login', { email: 'upgrade-retired@example.test', password: data.password })).status, 401);
  assert.equal((await h.request('/setup', { name: 'Replacement', workspaceName: 'Not permitted', email: 'replace@example.test', password: data.password })).status, 409);
  assert.equal((await h.request('/people', data.erasedInput, data.owner)).status, 409);
  assert.equal((await h.request('/connections', undefined, data.employee)).status, 403);
  checks.push('Unchanged passwords work; revoked membership/session stays denied; setup cannot replace existing ownership; erased HR identity cannot replay; employee retains no connection authority.');
  const unknownBefore = (await h.ok('/operations', undefined, data.owner)).find(o => o.id === data.operation.id);
  await h.ok('/execution/process', {}, data.owner);
  const unknownAfter = (await h.ok('/operations', undefined, data.owner)).find(o => o.id === data.operation.id);
  assert.ok(!['verified', 'effect_verified'].includes(unknownAfter.state));
  assert.equal(unknownAfter.id, unknownBefore.id);
  const effectsAfter = await h.ok('/__fixture/evidence');
  assert.equal(effectsAfter.calls.filter(c => c.kind === 'entitlement-write').length, 1, 'Unknown effect must not replay after upgrade');
  assert.equal((await h.ok('/settings', undefined, data.owner)).settings.executionHeld, true);
  checks.push('Prior unknown effect remains unresolved with the same operation identity, revoked grant and owner execution hold; processing sends no second provider write.');
  const evidence = { label: 'Archived native public API -> retained real local D1/R2 -> additive migration -> current native API; external network fixtures only',
    setupCommand, originalMigrations, addedMigrations, priorTables: Object.fromEntries(Object.entries(before).map(([table, rows]) => [table, rows.length])), checks,
    limits: ['No hosted, real-provider or owner acceptance.', 'Native API proof uses actual source composition roots, not a browser or emitted bundle.', 'The separate Base setup/auth suite covers new setup screens.'] };
  await writeFile(join(out, 'upgrade-results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await writeFile(join(out, 'upgrade-failure.txt'), String(error.stack || error));
  throw error;
} finally { await h.close(); }

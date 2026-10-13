import assert from 'node:assert/strict';
import { createHash, pbkdf2Sync } from 'node:crypto';
import { resolve } from 'node:path';
import { priorDataHarness } from '../adoption/prior-data-harness.mjs';

// One public-door upgrade flow on real D1, starting with the pre-bridge schema.
const root = resolve('.'), h = await priorDataHarness(root);
const password = 'Legacy upgrade fixture password';
const passwordHash = 'fixture-salt:' + pbkdf2Sync(password, 'fixture-salt', 100000, 32, 'sha256').toString('hex');
const hash = value => createHash('sha256').update(value).digest('hex');
const legacy = { cookie: 'linen_session=legacy-employee', csrf: 'legacy-csrf' };
const legacyOwner = { cookie: 'linen_session=legacy-owner', csrf: 'legacy-csrf' };
const baseSession = auth => h.fetch('/auth/session', { headers: { Cookie: auth.cookie } });
async function refused(auth) {
  const before = await h.snapshot();
  assert.equal((await h.request('/session', undefined, auth)).status, 401);
  assert.equal((await baseSession(auth)).status, 401);
  assert.equal((await h.request('/requests', { title: 'Revoked credential attempt', body: 'Must not create work', deduplicationKey: 'revoked-attempt' }, auth)).status, 401);
  assert.equal((await h.request('/password', { currentPassword: password, password: 'Must never replace the password' }, auth)).status, 401);
  assert.deepEqual(await h.snapshot(), before, 'Refused credentials must leave the complete store unchanged');
}
try {
  await h.start(root, { baseAuth: true });
  await h.migrate(root, '0570_platform_privacy_guards.sql');
  const db = await h.db(), stamp = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT INTO bootstrap_lock VALUES(1)'),
    db.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind('prior-workspace', 'Prior workspace', stamp),
    db.prepare('INSERT INTO workspace_settings(workspace_id) VALUES(?)').bind('prior-workspace'),
  ]);
  for (const role of ['owner', 'employee']) {
    await db.batch([
      db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(role, role + '@example.test', 'Prior ' + role, passwordHash, stamp),
      db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('prior-workspace', role, JSON.stringify([role])),
      db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)').bind('legacy-' + role, role, 'prior-workspace', hash('legacy-' + role), 'legacy-csrf', '2099-01-01T00:00:00.000Z', stamp),
    ]);
  }
  // Model an installation already upgraded to the bridge, but not retirement.
  await h.migrate(root, '0710_person_member_binding.sql');
  const owner = await h.login('owner@example.test', password);
  const proved = await h.login('employee@example.test', password);
  await refused(legacy);
  await refused(legacyOwner);
  const before = await h.snapshot();
  await h.migrate(root);
  const after = await h.snapshot();
  assert.equal(after.sessions.length, before.sessions.length - 2, 'Only the two legacy sessions are retired');
  for (const row of after.sessions) assert.ok(before.sessions.includes(row), 'Migration cannot issue or rewrite a session');
  for (const [table, rows] of Object.entries(before)) {
    if (table === 'sessions') continue;
    if (table === 'd1_migrations') for (const row of rows) assert.ok(after[table].includes(row), 'Applied migration history must remain intact');
    else assert.deepEqual(after[table], rows, 'Upgrade changed prior data in ' + table);
  }
  assert.equal((await h.request('/session', undefined, owner)).status, 200, 'Proved owner session survives');
  assert.equal((await baseSession(proved)).status, 200, 'Proved employee session survives');
  await refused(legacy);
  await h.ok('/members/employee', { roles: ['employee'], active: false }, owner, 'PATCH');
  await refused(legacy);
  await refused(proved);
  await h.ok('/members/employee', { roles: ['employee'], active: true }, owner, 'PATCH');
  await refused(legacy);
  await refused(proved);
  const fresh = await h.login('employee@example.test', password);
  assert.equal((await baseSession(fresh)).status, 200);
  const created = await h.ok('/requests', { title: 'Freshly authenticated request', body: 'Same retained employee account', deduplicationKey: 'fresh-login' }, fresh, 'POST', 201);
  assert.ok(created.id);
  assert.equal(fresh.userId, 'employee');
  assert.equal(fresh.workspaceId, 'prior-workspace');
  console.log('PASS legacy upgrade: unproved native/Base credentials denied before cleanup; only legacy sessions retired; proved sessions and all other data/history preserved; deactivate/reactivate cannot revive either old cookie; fresh login creates work');
} finally { await h.close(); }

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash, pbkdf2Sync } from 'node:crypto'
import { createServer } from 'node:net'
const dir = await mkdtemp(join(tmpdir(), 'linen-tombstone-'))
const socket = createServer(); await new Promise(r => socket.listen(Number(process.env.LINEN_TEST_PORT || 0), '127.0.0.1', r))
const port = socket.address().port; await new Promise(r => socket.close(r))
const origin = `http://127.0.0.1:${port}`, config = join(dir, 'wrangler.json')
const hash = value => createHash('sha256').update(value).digest('hex')
const password = 'fixture safe long password', credential = 'salt:' + pbkdf2Sync(password, 'salt', 100000, 32, 'sha256').toString('hex')
await writeFile(config, JSON.stringify({ name: 'linen-tombstone-test', main: resolve('tests/platform/tombstone-worker.ts'), compatibility_date: '2026-09-08', compatibility_flags: ['nodejs_compat'], d1_databases: [{ binding: 'DB', database_name: 'linen', database_id: 'local-linen' }], r2_buckets: [{ binding: 'ATTACHMENTS', bucket_name: 'linen-tombstone-fixture' }], vars: { SESSION_SECRET: 'fixture-only', ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') } }))
const migrations = (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort()
const sqlFile = join(dir, 'migrations.sql')
await writeFile(sqlFile, (await Promise.all(migrations.map(f => readFile('migrations/' + f, 'utf8')))).join('\n'))
const migration = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--config', config, '--local', '--persist-to', dir, '--file', sqlFile], { encoding: 'utf8' })
assert.equal(migration.status, 0, migration.stdout + migration.stderr)
let worker, output = ''
async function fixture(body, status = 200) {
 const r = await fetch(origin + '/fixture', { method: 'POST', body: JSON.stringify(body) }), data = await r.json()
 assert.equal(r.status, status, JSON.stringify(data)); return data
}
const sql = (sql, ...args) => fixture({ sql, args })
const renewed = new Map()
const request = (path, method = 'GET', body, user = 'owner', workspace = 'a', extra = {}) => fetch(origin + '/api/v1' + path, { method, headers: { Origin: origin, Cookie: `linen_session=${workspace}-${user}`, 'X-Linen-CSRF': 'csrf', 'Content-Type': 'application/json', ...renewed.get(workspace + '-' + user), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) })
async function rejected(response, status = 409, code = 'identity_erased') { const r = await response, b = await r.json(); assert.equal(r.status, status, JSON.stringify(b)); assert.equal(b.error.code, code); assert.equal(r.headers.get('set-cookie'), null) }
async function person(id, email = id + '@example.test', workspaces = ['a'], active = 1, role = 'employee') {
 await sql('INSERT INTO users VALUES(?,?,?,?,?)', id, email, id, credential, '2026')
 for (const w of workspaces) {
  await sql('INSERT INTO memberships VALUES(?,?,?,?)', w, id, JSON.stringify([role]), active)
  await sql('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)', w + '-' + id, id, w, hash(w + '-' + id), 'csrf', '2099', '2026')
 }
 await sql("INSERT INTO platform_auth_session_proofs(session_id,kind,version) SELECT s.id,'password',v.version FROM sessions s JOIN platform_auth_versions v ON v.user_id=s.user_id WHERE s.user_id=?", id)
}
async function signIn(user) {
 const login = await request('/login', 'POST', { email: user + '@example.test', password })
 assert.equal(login.status, 200)
 const Cookie = login.headers.get('set-cookie').split(';')[0]
 const session = await (await request('/session', 'GET', undefined, user, 'a', { Cookie })).json()
 renewed.set('a-' + user, { Cookie, 'X-Linen-CSRF': session.csrfToken })
}
const payload = email => ({ email, name: 'New person', password, roles: ['employee'] })
async function race(key, path, method, body, statement, identity, options = {}) {
 const pending = request(path, method, body, options.actor ?? 'owner', 'a', { 'X-Test-Race': key, 'X-Test-Statement': statement })
 try {
  let ready = false
  for (let i = 0; i < 150; i++) { if ((await fixture({ raceState: key })).ready) { ready = true; break } await new Promise(r => setTimeout(r, 20)) }
  assert.ok(ready, 'Actual application SQL did not reach race barrier: ' + key)
  if(options.commit)await options.commit();else await fixture({ tombstone: identity })
 } finally { await fixture({ releaseRace: key }) }
 await rejected(pending,options.status ?? 409,options.code ?? 'identity_erased')
}
try {
 worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--config', config, '--local', '--persist-to', dir, '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] })
 worker.stdout.on('data', x => output += x); worker.stderr.on('data', x => output += x)
 let ready = false
 for (let i = 0; i < 150; i++) { try { if ((await fetch(origin + '/health')).ok) { ready = true; break } } catch {} if (worker.exitCode !== null) throw Error(output); await new Promise(r => setTimeout(r, 200)) }
 assert.ok(ready, output)
 for (const w of ['a', 'b']) { await sql('INSERT INTO workspaces VALUES(?,?,?)', w, w, '2026'); await sql('INSERT INTO workspace_settings(workspace_id) VALUES(?)', w) }
 await person('owner', undefined, ['a'], 1, 'owner'); await person('other-owner', undefined, ['b'], 1, 'owner')
 await person('shared', ' Shared.Person+tag@Example.Test ', ['a', 'b'])
 assert.equal((await request('/session', 'GET', undefined, 'shared')).status, 200)
 for (const alias of ['owner', 'owner@example.test']) {
  assert.deepEqual(await fixture({ preflight: alias }, 409), { error: 'self_tombstone_import_denied' })
  assert.deepEqual(await fixture({ fullErase: alias }, 409), { error: 'different_owner_required_for_self_erasure' })
 }
 assert.deepEqual(await sql('SELECT * FROM adoption_tombstones'), []); assert.deepEqual(await sql('SELECT * FROM adoption_erasure_jobs'), [])
 assert.equal((await request('/session')).status, 200)
 assert.deepEqual(await fixture({ preflight: 'other-owner@example.test' }), [])
 assert.deepEqual(await fixture({ preflight: 'absent@example.test' }), [])
 assert.deepEqual(await fixture({ preflight: 'shared.person+tag@example.test' }), ['shared'])
 await fixture({ tombstone: 'shared.person+tag@example.test' })
 // Import arrival invalidates an already-existing session, even while domain cleanup remains pending.
 await rejected(request('/session', 'GET', undefined, 'shared'))
 await rejected(request('/settings', 'PATCH', { revision: 1, settings: { retentionDays: 40 } }, 'shared'))
 assert.equal((await sql("SELECT active FROM memberships WHERE workspace_id='a' AND user_id='shared'"))[0].active, 1)
 assert.equal((await request('/session', 'GET', undefined, 'shared', 'b')).status, 200)
 assert.equal((await sql("SELECT email FROM users WHERE id='shared'"))[0].email, ' Shared.Person+tag@Example.Test ')
 await rejected(request('/members/shared', 'PATCH', { roles: ['owner'], active: true }))
 for (const alias of ['fresh@example.test', 'raw@example.test']) {
  await fixture({ tombstone: alias }); await rejected(request('/members', 'POST', payload('  ' + alias.toUpperCase() + '  ')))
  assert.deepEqual(await sql('SELECT id FROM users WHERE email=?', alias), [])
 }
 await fixture({ tombstone: ' Raw.New@Example.Test ' }); await rejected(request('/members', 'POST', payload(' Raw.New@Example.Test ')))
 await person('exact', 'Exact@Example.Test'); await fixture({ tombstone: 'Exact@Example.Test' }); await rejected(request('/session', 'GET', undefined, 'exact'))
 await person('uid-only'); await fixture({ tombstone: 'uid-only' }); await rejected(request('/session', 'GET', undefined, 'uid-only'))
 // No provider-specific alias collapsing, and no workspace leakage.
 for (const [blocked, admitted, workspace] of [['person@example.test', 'person+tag@example.test', 'a'], ['first.last@example.test', 'firstlast@example.test', 'a'], ['foreign-only@example.test', 'foreign-only@example.test', 'b']]) {
  await fixture({ tombstone: blocked, workspace }); const r = await request('/members', 'POST', payload(admitted)); assert.equal(r.status, 201, await r.text())
 }
 // Actual receipt without its tombstone still blocks hashed email replay under a new UUID.
 await fixture({ tombstone: 'receipt@example.test' })
 await sql('INSERT INTO platform_identity_erasures VALUES(?,?,?,?,?)', 'a', hash('receipt@example.test'), null, 'owner', '2026')
 await sql('DELETE FROM adoption_tombstones WHERE workspace_id=? AND identity_hash=?', 'a', hash('receipt@example.test'))
 await rejected(request('/members', 'POST', payload('receipt@example.test')))
 await person('receipt-uid'); await fixture({ tombstone: 'receipt-uid' })
 await sql('INSERT INTO platform_identity_erasures VALUES(?,?,?,?,?)', 'a', hash('receipt-uid'), 'receipt-uid', 'owner', '2026')
 await sql('DELETE FROM adoption_tombstones WHERE workspace_id=? AND identity_hash=?', 'a', hash('receipt-uid'))
 await rejected(request('/session', 'GET', undefined, 'receipt-uid'))
 const beforeAudits = await sql('SELECT * FROM audit_events ORDER BY id')
 await race('create', '/members', 'POST', payload('race-create@example.test'), 'INSERT INTO users', 'race-create@example.test')
 assert.deepEqual(await sql("SELECT id FROM users WHERE email='race-create@example.test'"), [])
 await person('race-reactivate', undefined, ['a'], 0)
 await race('reactivate', '/members/race-reactivate', 'PATCH', { roles: ['owner'], active: true }, 'UPDATE memberships', 'race-reactivate')
 assert.deepEqual(await sql("SELECT roles_json,active FROM memberships WHERE user_id='race-reactivate'"), [{ roles_json: '["employee"]', active: 0 }])
 await person('race-session'); await sql("DELETE FROM sessions WHERE user_id='race-session'")
 await race('session', '/login', 'POST', { email: 'race-session@example.test', password }, 'INSERT INTO sessions', 'race-session@example.test')
 assert.deepEqual(await sql("SELECT * FROM sessions WHERE user_id='race-session'"), [])
 assert.deepEqual(await sql('SELECT * FROM audit_events ORDER BY id'), beforeAudits)
 await person('race-actor', undefined, ['a'], 1, 'owner')
 await race('actor-create', '/members', 'POST', payload('actor-denied@example.test'), 'INSERT INTO users', null, { actor: 'race-actor', status: 403, code: 'forbidden', commit: () => sql("UPDATE memberships SET roles_json='[\"employee\"]' WHERE user_id='race-actor'") })
 assert.deepEqual(await sql("SELECT id FROM users WHERE email='actor-denied@example.test'"), [])
 await sql("UPDATE memberships SET roles_json='[\"owner\"]' WHERE user_id='race-actor'")
 await signIn('race-actor')
 await race('last-owner-demotion', '/members/owner', 'PATCH', { roles: ['employee'], active: false }, 'UPDATE memberships', null, { actor: 'race-actor', status: 403, code: 'forbidden', commit: () => sql("UPDATE memberships SET roles_json='[\"employee\"]' WHERE user_id='race-actor'") })
 assert.deepEqual(await sql("SELECT roles_json,active FROM memberships WHERE user_id='owner'"), [{ roles_json: '["owner"]', active: 1 }])
 assert.deepEqual(await sql('SELECT * FROM audit_events ORDER BY id'), beforeAudits)
 // The opposite serialization: admission commits, then tombstone immediately revokes that issued session.
 await person('admitted-first'); const login = await request('/login', 'POST', { email: 'admitted-first@example.test', password }); assert.equal(login.status, 200)
 const cookie = login.headers.get('set-cookie').split(';')[0]; await fixture({ tombstone: 'admitted-first' })
 await rejected(request('/session', 'GET', undefined, 'owner', 'a', { Cookie: cookie }))
 // Current roles come from D1 on every session; self change and scoped absence stay safe.
 await person('demoted', undefined, ['a'], 1, 'owner'); await sql("UPDATE memberships SET roles_json='[\"employee\"]' WHERE user_id='demoted'")
 await rejected(request('/members', 'POST', payload('forbidden@example.test'), 'demoted'), 401, 'unauthenticated')
 await signIn('demoted')
 await rejected(request('/members', 'POST', payload('forbidden@example.test'), 'demoted'), 403, 'forbidden')
 await rejected(request('/members/owner', 'PATCH', { roles: ['employee'] }), 409, 'self_change')
 for (const uid of ['other-owner', 'absent']) await rejected(request('/members/' + uid, 'PATCH', { roles: ['employee'] }), 404, 'not_found')
 // Scoped erasure retains the other tenant's profile, but the global version
 // invalidates earlier sessions. Only a newly issued session has current authority.
 await fixture({ tombstone: 'shared' }); await fixture({ erase: 'shared' })
 assert.deepEqual(await sql("SELECT workspace_id FROM memberships WHERE user_id='shared'"), [{ workspace_id: 'b' }])
 assert.equal((await request('/session', 'GET', undefined, 'shared', 'b')).status, 401)
 const freshShared = 'b-shared-after-erasure'
 await sql('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)', freshShared, 'shared', 'b', hash(freshShared), 'csrf', '2099', '2026')
 await sql("INSERT INTO platform_auth_session_proofs(session_id,kind,version) SELECT ?,'password',version FROM platform_auth_versions WHERE user_id='shared'", freshShared)
 renewed.set('b-shared', { Cookie: 'linen_session=' + freshShared })
 assert.equal((await request('/session', 'GET', undefined, 'shared', 'b')).status, 200)
 await rejected(request('/members', 'POST', payload('shared.person+tag@example.test')))
 assert.equal((await sql("SELECT email FROM users WHERE id='shared'"))[0].email, ' Shared.Person+tag@Example.Test ')
 assert.deepEqual(await sql('PRAGMA foreign_key_check'), [])
 console.log('PASS tombstone admission real D1/application: imported existing session denial, UID/raw/canonical aliases, receipt-only new UUID denial, insert/reactivate/session commit races, reverse serialization revocation, no denied audit/orphan, current roles, self/last-owner preflight, scoped absence, other-workspace retained profile with fresh session, no plus/dot folding')
} catch (error) { console.error(output); throw error } finally {
 if (worker?.exitCode === null) { worker.kill('SIGTERM'); await new Promise(r => worker.once('exit', r)) }
 await rm(dir, { recursive: true, force: true })
}

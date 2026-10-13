import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cp, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';

// Native upgrade harness. Both sides use their actual application composition root;
// only external network protocols use the existing explicit provider fixture.
export async function priorDataHarness(archive) {
  const root = resolve('.');
  const require = createRequire(await realpath('node_modules/wrangler/package.json'));
  const { build } = require('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const scratch = await mkdtemp(join(tmpdir(), 'linen-prior-data-'));
  const installation = join(scratch, 'installation');
  const persistence = join(installation, '.wrangler/state/v3');
  const archivedMigrations = new Set((await readdir(join(archive, 'migrations'))).filter(file => file.endsWith('.sql')));
  let mf, origin;
  async function start(source, { baseAuth = false } = {}) {
    let port = 0;
    if (baseAuth) {
      const socket = createServer();
      await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
      port = socket.address().port;
      await new Promise(resolve => socket.close(resolve));
    }
    origin = baseAuth ? 'http://127.0.0.1:' + port : 'http://localhost';
    const compiled = await build({ stdin: { contents: `
      import {createApplication} from ${JSON.stringify(join(source, 'src/application.ts'))};
      import {bind,fixtureRequest} from ${JSON.stringify(join(root, 'tests/ui/provider-boundary.mjs'))};
      ${baseAuth ? `import {baseAuthResponse} from ${JSON.stringify(join(root, 'src/platform/base-auth/http.ts'))};` : ''}
      const app=createApplication();
      export default {async fetch(request,env,ctx){bind(env);return await fixtureRequest(request,env)||${baseAuth ? 'await baseAuthResponse(request,env)||' : ''}app.fetch(request,env,ctx)}};
    `, resolveDir: root, loader: 'ts' }, nodePaths: [join(root, 'node_modules')],
      bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:*'] });
    mf = new Miniflare({ ...convertV4MiniflareOptions({ port, host: '127.0.0.1', modules: true,
      script: compiled.outputFiles[0].text, compatibilityDate: '2026-09-08',
      compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'local-linen' }, r2Buckets: { ATTACHMENTS: 'linen-attachments' },
      bindings: { SESSION_SECRET: 'upgrade-test-only-session-secret-at-least-thirty-two', ENCRYPTION_KEY: Buffer.alloc(32, 17).toString('base64'),
        AUTH_ORIGIN: origin, APP_ORIGIN: origin, AUTH_LOCAL: 'true', MAIL_PROVIDER: 'development', OWNER_EMAIL: 'upgrade-owner@example.test' },
    }), resourcePersistencePath: persistence });
    await mf.ready;
  }
  async function migrate(source, through) {
    const db = await mf.getD1Database('DB');
    await db.prepare("CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)").run();
    const applied = new Set((await db.prepare('SELECT name FROM d1_migrations').all()).results.map(r => r.name));
    const files = (await readdir(join(source, 'migrations'))).filter(f => f.endsWith('.sql') && (!through || f <= through)).sort();
    const added = [];
    for (const file of files) {
      if (applied.has(file)) {
        if (source !== archive && archivedMigrations.has(file)) assert.equal(await readFile(join(source, 'migrations', file), 'utf8'), await readFile(join(archive, 'migrations', file), 'utf8'), 'Applied migration changed: ' + file);
        continue;
      }
      const parsed = spawnSync('python3', ['-c', `import sqlite3,json,sys
out=[];pending=''
for c in sys.stdin.read():
 pending+=c
 if c==';' and sqlite3.complete_statement(pending):out.append(pending);pending=''
if pending.strip() and not all(not l.strip() or l.strip().startswith('--') for l in pending.splitlines()):raise ValueError('Incomplete SQL')
print(json.dumps(out))`], { input: await readFile(join(source, 'migrations', file), 'utf8'), encoding: 'utf8' });
      assert.equal(parsed.status, 0, parsed.stderr);
      await db.batch([...JSON.parse(parsed.stdout).map(sql => db.prepare(sql)), db.prepare('INSERT INTO d1_migrations(name) VALUES(?)').bind(file)]);
      added.push(file);
    }
    return added;
  }
  async function snapshot() {
    const db = await mf.getD1Database('DB');
    const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results;
    const result = {};
    for (const { name } of tables) result[name] = (await db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()).results.map(row => JSON.stringify(row)).sort();
    return result;
  }
  async function request(path, body, auth = {}, method = body === undefined ? 'GET' : 'POST', headers = {}) {
    return mf.dispatchFetch(origin + (path.startsWith('/__fixture/') ? '' : '/api/v1') + path, {
      method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(auth.cookie ? { Cookie: auth.cookie, 'X-Linen-CSRF': auth.csrf } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body),
    });
  }
  async function ok(path, body, auth, method, expected) {
    const response = await request(path, body, auth, method);
    assert.equal(response.status, expected ?? (body === undefined ? 200 : 200), path + ': ' + await response.clone().text());
    return response.json();
  }
  async function login(email, password) {
    const response = await request('/login', { email, password });
    assert.equal(response.status, 200, await response.clone().text());
    return authenticate(response);
  }
  async function authenticate(response) {
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const state = await ok('/session', undefined, { cookie });
    return { cookie, csrf: state.csrfToken, ...state.principal };
  }
  async function setupUpgrade(out) {
    await mkdir(installation, { recursive: true });
    const excluded = new Set(['.git', '.wrangler', 'node_modules', 'dist', '.dev.vars', '.dev.vars.previous', '.env', '.env.local']);
    await cp(root, installation, { recursive: true, filter: path => !excluded.has(path.slice(root.length + 1).split('/')[0]) });
    await symlink(join(root, 'node_modules'), join(installation, 'node_modules'), 'dir');
    const socket = createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    await writeFile(join(installation, '.dev.vars'), `SESSION_SECRET=upgrade-test-only-session-secret-at-least-thirty-two\nENCRYPTION_KEY=${Buffer.alloc(32, 17).toString('base64')}\nAUTH_LOCAL=true\nAUTH_ORIGIN=http://127.0.0.1:${port}\nAPP_ORIGIN=http://127.0.0.1:${port}\nMAIL_PROVIDER=development\nOWNER_EMAIL=upgrade-owner@example.test\n`, { mode: 0o600 });
    const log = await open(join(out, 'retained-rer-setup.log'), 'w');
    // Setup owns the copied installation's state, not the parent verifier's lease.
    const environment = { ...process.env };
    delete environment.RER_LOCAL_OPERATION;
    try {
      const args = ['exec', 'rer', 'setup', '--owner-email', 'upgrade-owner@example.test', '--port', String(port), '--non-interactive'];
      await new Promise((resolve, reject) => {
        const child = spawn('pnpm', args, { cwd: installation, stdio: ['ignore', log.fd, log.fd], env: environment });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(Error('Retained rer setup exited ' + code + '; inspect retained-rer-setup.log')));
      });
      return ['pnpm', ...args];
    } finally { await log.close(); }
  }
  return { start, migrate, snapshot, request, ok, login, authenticate, setupUpgrade,
    db: () => mf.getD1Database('DB'), fetch: async (path, options) => fetch(new URL(path, await mf.ready), options),
    stop: async () => { await mf.dispose(); mf = undefined; }, close: async () => { if (mf) await mf.dispose(); await rm(scratch, { recursive: true, force: true }); } };
}

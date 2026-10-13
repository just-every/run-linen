import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

const socket = createServer()
await new Promise(resolve => socket.listen(Number(process.env.LINEN_TEST_PORT || 0), '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const scratch = await mkdtemp(join(tmpdir(), 'linen-emitted-http-'))
let worker
let output = ''
const origin = `http://127.0.0.1:${port}`
try {
  await cp('dist', join(scratch, 'dist'), {recursive:true})
  await writeFile(join(scratch, 'dist/server/.dev.vars'), `AUTH_ORIGIN=${origin}\nAPP_ORIGIN=${origin}\nAUTH_LOCAL=true\nMAIL_PROVIDER=development\nSESSION_SECRET=${randomBytes(32).toString('hex')}\nENCRYPTION_KEY=${randomBytes(32).toString('base64')}\n`, {mode:0o600})
  const migration = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', join(scratch, 'state'), '--config', 'wrangler.jsonc'], {encoding:'utf8'})
  assert.equal(migration.status, 0, migration.stdout + migration.stderr)
  worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--config', join(scratch, 'dist/server/wrangler.json'), '--persist-to', join(scratch, 'state'), '--port', String(port), '--inspector-port', '0'], { stdio: ['ignore', 'pipe', 'pipe'], detached:true })
  worker.stdout.on('data', chunk => { output += chunk })
  worker.stderr.on('data', chunk => { output += chunk })
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    if (worker.exitCode !== null) throw new Error(output)
    try { ready = (await fetch(`${origin}/health`)).ok } catch {}
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.ok(ready, output)
  assert.deepEqual(await (await fetch(`${origin}/health`)).json(), {
    status: 'ok', ok: true,
    deployment: { sourceSha: null, fingerprint: null, versionId: null },
  })
  const branding = JSON.parse(await readFile(new URL('../src/branding.json', import.meta.url)))
  for (const path of ['/', '/app']) {
    const document = await fetch(origin + path)
    assert.equal(document.status, 200, path)
    assert.ok((await document.text()).includes(branding.name), path + ' serves the owned Linen document')
  }
  for (const path of ['/missing', '/health/extra', '/api', '/api/missing']) {
    assert.equal((await fetch(`${origin}${path}`)).status, 404, path)
  }
  console.log('HTTP-001 passed against emitted local Worker: health, Base Lobby and Linen app documents, HTTP and document 404s')
} finally {
  if (worker?.exitCode === null) {
    process.kill(-worker.pid, 'SIGTERM')
    await new Promise(resolve => worker.exitCode !== null ? resolve() : worker.once('exit', resolve))
  }
  await rm(scratch, {recursive:true,force:true})
}

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Run persistent-runtime checks sequentially to bound disk and Worker usage.
// Provider credentials and chargeable provider smoke tests are never implicit.
const root = resolve(import.meta.dirname, '..')
const output = resolve(process.env.LINEN_VERIFY_OUTPUT || '.wrangler/verification')
const checks = [
  ['production build', 'pnpm', ['run','build:app']],
  ['Base native auth', process.execPath, ['tests/platform/base-auth-runtime.mjs']],
  ['Legacy session retirement', process.execPath, ['tests/platform/legacy-session-runtime.mjs']],
  ['Native archive transfer', process.execPath, ['tests/platform/base-auth-transfer.mjs']],
  ['TypeScript', 'pnpm', ['typecheck']],
  ['emitted Worker', process.execPath, ['tests/runtime.mjs']],
  ['platform', process.execPath, ['tests/platform/runtime.mjs']],
  ['configuration', process.execPath, ['tests/platform/config-runtime.mjs']],
  ['native admission', process.execPath, ['tests/platform/admission-runtime.mjs']],
  ['erasure admission races', process.execPath, ['tests/platform/tombstone-runtime.mjs']],
  ['migration order and retained history', process.execPath, ['tests/platform/migration-order.mjs']],
  ['identity erasure', process.execPath, ['tests/platform/privacy-runtime.mjs']],
  ['work and lifecycle', process.execPath, ['tests/work/runtime.mjs']],
  ['request status static UI', process.execPath, ['tests/ui/request-status-render.mjs']],
  ['stale remote response ordering', process.execPath, ['tests/ui/remote-response-runtime.mjs']],
  ['request progress and accountable owner', process.execPath, ['tests/work/progress-runtime.mjs']],
  ['fulfilment binding', process.execPath, ['tests/work/fulfilment-link-runtime.mjs']],
  ['work integration regressions', process.execPath, ['tests/work/integration-regressions-runtime.mjs']],
  ['fulfilment correction and restart', process.execPath, ['tests/work/amend-runtime.mjs']],
  ['reviewed person member flow', process.execPath, ['tests/work/person-binding-runtime.mjs']],
  ['current manager decisions', process.execPath, ['tests/work/amend-manager-runtime.mjs']],
  ['decision queue names the beneficiary', process.execPath, ['tests/work/decision-queue-beneficiary-runtime.mjs']],
  ['historical person erasure', process.execPath, ['tests/work/historical-runtime.mjs']],
  ['execution and reconciliation', process.execPath, ['tests/execution/runtime.mjs']],
  ['current effect authority', process.execPath, ['tests/execution/authority-runtime.mjs']],
  ['named setup read scope', process.execPath, ['tests/execution/setup-read.mjs']],
  ['services', process.execPath, ['tests/services/run.mjs']],
  ['service integration', process.execPath, ['tests/services/integration.mjs']],
  ['connection discovery', process.execPath, ['tests/connections/runtime.mjs']],
  ['email provider configuration', process.execPath, ['tests/connections/sendgrid-runtime.mjs']],
  ['native network transport', process.execPath, ['tests/transport/runtime.mjs']],
  ['intelligence contracts', process.execPath, ['tests/intelligence/contracts.mjs']],
  ['engineering companion', process.execPath, ['tests/intelligence/companion.mjs']],
  ['intelligence runtime', process.execPath, ['tests/intelligence/runtime.mjs']],
  ['connected frontier journey', process.execPath, ['tests/intelligence/frontier.mjs']],
  ['ordinary intake and independent evidence', process.execPath, ['tests/intelligence/repair-runtime.mjs']],
  ['Freshservice native migration', process.execPath, ['tests/adoption/freshservice-import.mjs']],
  ['adoption and recovery', process.execPath, ['tests/adoption/runtime.mjs']],
  ['coexistence and imported erasure', process.execPath, ['tests/adoption/runtime.mjs'], { LINEN_ADOPTION_HISTORIC: '1' }],
  ['browser journeys', process.execPath, ['tests/ui/run.mjs']],
  ['native connected provider journeys', process.execPath, ['tests/ui/connected-run.mjs']],
  ['connection and authority setup', process.execPath, ['tests/ui/setup-run.mjs']],
]
await mkdir(output, { recursive: true })
const results = []
for (const [name, executable, argv, checkEnvironment = {}] of checks) {
  console.log(`\nChecking ${name}`)
  const started = Date.now()
  const code = await new Promise((done, reject) => {
    const child = spawn(executable, argv, {
      cwd: root, stdio: 'inherit',
      env: { ...process.env, LINEN_TEST_PORT: process.env.LINEN_TEST_PORT || "8810",
        LINEN_TEST_WORKER_PORT: process.env.LINEN_TEST_WORKER_PORT || "8812",
        LINEN_TEST_PROVIDER_PORT: process.env.LINEN_TEST_PROVIDER_PORT || "8813",
        ...checkEnvironment, LINEN_TEST_OUTPUT: resolve(output, name.replaceAll(' ', '-')) },
    })
    child.once('error', reject)
    child.once('exit', (code) => done(code ?? 1))
  })
  results.push({ name, command: [executable, ...argv], environment: checkEnvironment, exitCode: code, elapsedMs: Date.now() - started })
  await writeFile(resolve(output, 'results.json'), JSON.stringify({
    completedAt: new Date().toISOString(),
    label: 'Local checks; test provider responses are fixtures, not live provider acceptance.',
    complete: results.length === checks.length && results.every(r => r.exitCode === 0),
    results,
  }, null, 2) + '\n')
  if (code !== 0) process.exit(code)
}
console.log(`\nPASS ${results.length} local checks. Evidence: ${output}`)

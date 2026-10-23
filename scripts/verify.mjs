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
  ['browser journeys', process.execPath, ['tests/ui/run.mjs']],
  ['emitted Worker', process.execPath, ['tests/runtime.mjs']],
  ['platform', process.execPath, ['tests/platform/runtime.mjs']],
  ['configuration', process.execPath, ['tests/platform/config-runtime.mjs']],
  ['native admission', process.execPath, ['tests/platform/admission-runtime.mjs']],
  ['erasure admission races', process.execPath, ['tests/platform/tombstone-runtime.mjs']],
  ['migration order and retained history', process.execPath, ['tests/platform/migration-order.mjs']],
  ['identity erasure', process.execPath, ['tests/platform/privacy-runtime.mjs']],
  ['work and lifecycle', process.execPath, ['tests/work/runtime.mjs']],
  ['knowledge drafts', process.execPath, ['tests/work/knowledge-draft-runtime.mjs']],
  ['request status static UI', process.execPath, ['tests/ui/request-status-render.mjs']],
  ['stale remote response ordering', process.execPath, ['tests/ui/remote-response-runtime.mjs']],
  ['request progress and accountable owner', process.execPath, ['tests/work/progress-runtime.mjs']],
  ['fulfilment binding', process.execPath, ['tests/work/fulfilment-link-runtime.mjs']],
  ['work integration regressions', process.execPath, ['tests/work/integration-regressions-runtime.mjs']],
  ['fulfilment correction and restart', process.execPath, ['tests/work/amend-runtime.mjs']],
  ['reviewed person member flow', process.execPath, ['tests/work/person-binding-runtime.mjs']],
  ['pending person services', process.execPath, ['tests/work/pending-person-runtime.mjs']],
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
  ['Freshservice and Snipe-IT native migration', process.execPath, ['tests/adoption/freshservice-import.mjs']],
  ['adoption and recovery', process.execPath, ['tests/adoption/runtime.mjs']],
  ['coexistence and imported erasure', process.execPath, ['tests/adoption/runtime.mjs'], { LINEN_ADOPTION_HISTORIC: '1' }],
  ['run site', process.execPath, ['--test', 'tests/site/site.test.mjs']],
  ['pending person browser', process.execPath, ['tests/ui/run.mjs', 'tests/ui/pending-person-browser.mjs']],
  ['desk groups and views browser', process.execPath, ['tests/ui/run.mjs', 'tests/ui/desk-group-browser.mjs']],
  ['catalog team tasks browser', process.execPath, ['tests/ui/run.mjs', 'tests/ui/catalog-task-browser.mjs']],
  ['lifecycle templates browser', process.execPath, ['tests/ui/run.mjs', 'tests/ui/lifecycle-template-journey.mjs']],
  ['desk scenarios and templates browser', process.execPath, ['tests/ui/run.mjs', 'tests/ui/desk-scenario-browser.mjs']],
  ['department workspaces browser', process.execPath, ['tests/ui/run.mjs', 'tests/ui/department-browser.mjs']],
  ['native connected provider journeys', process.execPath, ['tests/ui/connected-run.mjs']],
  ['connection and authority setup', process.execPath, ['tests/ui/setup-run.mjs']],
  ['release browser', process.execPath, ['tests/ui/connected-run.mjs', 'tests/ui/release-journey.mjs']],
  ['service notice browser', process.execPath, ['tests/ui/connected-run.mjs', 'tests/ui/service-notice-journey.mjs']],
  ['mailbox browser', process.execPath, ['tests/ui/connected-run.mjs', 'tests/ui/mailbox-journey.mjs']],
  ['operations KPI browser', process.execPath, ['tests/ui/connected-run.mjs', 'tests/ui/kpi-journey.mjs']],
  ['MCP native conversation', process.execPath, ['tests/ui/run.mjs', 'tests/ui/mcp-journey.mjs']],
]
const shardValue = process.env.LINEN_VERIFY_SHARD
let shard
if (shardValue !== undefined) {
  if (!/^[1-9]\d*\/[1-9]\d*$/.test(shardValue)) {
    throw new Error('LINEN_VERIFY_SHARD must be a positive shard number/count, such as 1/4')
  }
  const [number, count] = shardValue.split('/').map(Number)
  if (!Number.isSafeInteger(number) || !Number.isSafeInteger(count) || number > count) {
    throw new Error('LINEN_VERIFY_SHARD must have safe integer values with number <= count')
  }
  shard = { number, count }
}
// CI seconds: baseline Verify 39658205193; department browser 39721605432.
// Unlisted checks count as 10.
// Heaviest first onto the lightest shard keeps every shard inside its job limit.
const measuredSeconds = {
  'Native archive transfer': 447, 'browser journeys': 249, 'native connected provider journeys': 246,
  'department workspaces browser': 146, 'identity erasure': 143, 'operations KPI browser': 100, 'Base native auth': 78,
  'desk scenarios and templates browser': 74, 'connection and authority setup': 69, 'release browser': 56,
  'pending person browser': 55, 'MCP native conversation': 51, 'desk groups and views browser': 49,
  'Legacy session retirement': 46, 'service integration': 37, 'adoption and recovery': 36,
  'pending person services': 35, 'migration order and retained history': 33, 'catalog team tasks browser': 33,
  'work and lifecycle': 32, 'service notice browser': 32, 'mailbox browser': 35, 'emitted Worker': 30,
  'ordinary intake and independent evidence': 29, 'work integration regressions': 28,
  'Freshservice and Snipe-IT native migration': 26,
}
function shardChecks(count) {
  const loads = Array(count).fill(0), shards = Array.from({ length: count }, () => [])
  const order = checks.slice(1).map((check, index) => ({ check, index, seconds: measuredSeconds[check[0]] ?? 10 }))
    .sort((a, b) => b.seconds - a.seconds || a.index - b.index)
  for (const item of order) {
    const lightest = loads.indexOf(Math.min(...loads))
    loads[lightest] += item.seconds
    shards[lightest].push(item)
  }
  return shards.map(items => items.sort((a, b) => a.index - b.index).map(item => item.check))
}
// Every shard builds its own emitted Worker before its assigned checks.
const selectedChecks = shard ? [checks[0], ...shardChecks(shard.count)[shard.number - 1]] : checks
const shardLabel = shard ? ` (shard ${shard.number}/${shard.count})` : ''
await mkdir(output, { recursive: true })
const results = []
for (const [name, executable, argv, checkEnvironment = {}] of selectedChecks) {
  console.log(`\nChecking ${name}${shardLabel}`)
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
    ...(shard ? { shard } : {}),
    complete: results.length === selectedChecks.length && results.every(r => r.exitCode === 0),
    results,
  }, null, 2) + '\n')
  if (code !== 0) process.exit(code)
}
console.log(`\nPASS ${results.length} local checks${shardLabel}. Evidence: ${output}`)

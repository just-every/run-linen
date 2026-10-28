import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Run persistent-runtime checks sequentially to bound disk and Worker usage.
// Provider credentials and chargeable provider smoke tests are never implicit.
const root = resolve(import.meta.dirname, '..')
const output = resolve(process.env.LINEN_VERIFY_OUTPUT || '.wrangler/verification')
const checks = [
  ["Native sign-in and scoped API", process.execPath, ["tests/platform/base-auth-runtime.mjs"]],
  ["Native archive and recovery", process.execPath, ["tests/platform/base-auth-transfer.mjs"]],
  ["Employee service desk browser", process.execPath, ["tests/ui/run.mjs"]],
  ["Emitted HTTP", process.execPath, ["tests/runtime.mjs"]],
  ["Configuration and sandbox", process.execPath, ["tests/platform/config-runtime.mjs"]],
  ["Service desk and lifecycle", process.execPath, ["tests/work/runtime.mjs"]],
  ["Knowledge publication", process.execPath, ["tests/work/knowledge-draft-runtime.mjs"]],
  ["Fulfilment and measured effort", process.execPath, ["tests/work/fulfilment-link-runtime.mjs"]],
  ["Fulfilment integration", process.execPath, ["tests/work/integration-regressions-runtime.mjs"]],
  ["Reviewed identity continuity", process.execPath, ["tests/work/person-binding-runtime.mjs"]],
  ["Pending people", process.execPath, ["tests/work/pending-person-runtime.mjs"]],
  ["Manager approval and bundles", process.execPath, ["tests/work/amend-manager-runtime.mjs"]],
  ["Execution and reconciliation", process.execPath, ["tests/execution/runtime.mjs"]],
  ["Current effect authority", process.execPath, ["tests/execution/authority-runtime.mjs"]],
  ["Service operations", process.execPath, ["tests/services/run.mjs"]],
  ["Controlled changes and reporting", process.execPath, ["tests/services/integration.mjs"]],
  ["Connection discovery", process.execPath, ["tests/connections/runtime.mjs"]],
  ["Native transport", process.execPath, ["tests/transport/runtime.mjs"]],
  ["Intelligence protocols and budgets", process.execPath, ["tests/intelligence/runtime.mjs"]],
  ["Conversational intake and evidence", process.execPath, ["tests/intelligence/repair-runtime.mjs"]],
  ["Incumbent import", process.execPath, ["tests/adoption/freshservice-import.mjs"]],
  ["Archive restore and erasure", process.execPath, ["tests/adoption/runtime.mjs"]],
  ["Department privacy browser", process.execPath, ["tests/ui/run.mjs", "tests/ui/department-browser.mjs"]],
  ["Connected service recovery browser", process.execPath, ["tests/ui/connected-run.mjs"]],
  ["Connection and authority browser", process.execPath, ["tests/ui/setup-run.mjs"]],
  ["Communications browser", process.execPath, ["tests/ui/connected-run.mjs", "tests/ui/communication-browser.mjs"]],
  ["Billing browser", process.execPath, ["tests/ui/run.mjs", "tests/ui/billing-browser.mjs"]],
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
// Conservative journey durations, refreshed from the exact-head Verify when needed.
const measuredSeconds = {
  "Native sign-in and scoped API": 30,
  "Native archive and recovery": 315,
  "Employee service desk browser": 280,
  "Emitted HTTP": 50,
  "Configuration and sandbox": 70,
  "Service desk and lifecycle": 80,
  "Knowledge publication": 10,
  "Fulfilment and measured effort": 10,
  "Fulfilment integration": 23,
  "Reviewed identity continuity": 14,
  "Pending people": 29,
  "Manager approval and bundles": 28,
  "Execution and reconciliation": 19,
  "Current effect authority": 10,
  "Service operations": 15,
  "Controlled changes and reporting": 55,
  "Connection discovery": 11,
  "Native transport": 58,
  "Intelligence protocols and budgets": 30,
  "Conversational intake and evidence": 35,
  "Incumbent import": 75,
  "Archive restore and erasure": 130,
  "Department privacy browser": 100,
  "Connected service recovery browser": 250,
  "Connection and authority browser": 70,
  "Communications browser": 155,
  "Billing browser": 30
}
function shardChecks(count) {
  const loads = Array(count).fill(0), shards = Array.from({ length: count }, () => [])
  const order = checks.map((check, index) => ({ check, index, seconds: measuredSeconds[check[0]] ?? 10 }))
    .sort((a, b) => b.seconds - a.seconds || a.index - b.index)
  for (const item of order) {
    const lightest = loads.indexOf(Math.min(...loads))
    loads[lightest] += item.seconds
    shards[lightest].push(item)
  }
  return shards.map(items => items.sort((a, b) => a.index - b.index).map(item => item.check))
}
// Installed rer verify builds once. CI downloads the build produced by its build job.
if (!process.env.LINEN_TEST_BUILT) {
  const code = await new Promise((done, reject) => {
    const child = spawn('pnpm', ['run', 'build:app'], {cwd:root,stdio:'inherit'});
    child.once('error',reject);child.once('exit',code=>done(code??1));
  });
  if (code) process.exit(code);
}
const selectedChecks = shard ? shardChecks(shard.count)[shard.number-1] : checks
if (process.argv.includes('--plan')) {
  console.log(JSON.stringify(shardChecks(6).map((items,index)=>({shard:index+1,seconds:items.reduce((sum,item)=>sum+measuredSeconds[item[0]],0),journeys:items.map(item=>item[0])})),null,2));
  process.exit(0);
}
const shardLabel = shard ? ` (shard ${shard.number}/${shard.count})` : ''
await mkdir(output, { recursive: true })
const results = []
for (const [name, executable, argv, checkEnvironment = {}] of selectedChecks) {
  console.log(`\nChecking ${name}${shardLabel}`)
  const started = Date.now()
  const code = await new Promise((done, reject) => {
    const child = spawn(executable, argv, {
      cwd: root, stdio: 'inherit',
      env: { ...process.env, LINEN_TEST_BUILT:'1', LINEN_TEST_PORT: process.env.LINEN_TEST_PORT || "8810",
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

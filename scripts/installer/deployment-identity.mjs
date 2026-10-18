import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseJsonc } from '@runeditrun/rer/jsonc'
import { ownerWorkerName } from '@runeditrun/rer/modules/deploy-kit/owner'
import { cloudflare } from '@runeditrun/rer/modules/deploy-kit/provider'
import { hookState } from '@runeditrun/rer/internal/cli/deploy-hook-record.mjs'
import { contained } from '@runeditrun/rer/internal/cli/project.mjs'

const project = 'runeditrun/linen'

// Names in the distributed Wrangler file are local defaults, not proof that an
// installation exists. A remote ID, a retained record, or live bindings are.
export async function deploymentIdentity({ root, options }, env = process.env) {
 const environment = options.environment ?? 'production'
 const worker = ownerWorkerName(project, environment)
 const path = await hookState(root, environment) ?? join('.rer', 'deploy', `${environment}.json`)
 let record
 try { record = JSON.parse(await readFile(await contained(root, path, { optional: true }), 'utf8')) }
 catch (error) { if (error.code !== 'ENOENT') throw error }
 if (record?.kind === 'rer-deploy-owner-state' && record.project === project && record.environment === environment && record.accountId === env.CLOUDFLARE_ACCOUNT_ID) {
  if (record.worker === 'linen') return 'legacy'
  // The kit verifies the record against the live resource identities itself.
  // A separate retained environment is not an upgrade of this account's legacy app.
  if (record.worker === worker) return 'recorded'
 }
 const config = parseJsonc(await readFile(join(root, 'wrangler.jsonc'), 'utf8'))
 if (config.d1_databases?.some(database => database.database_id !== 'local-linen')) return 'legacy'
 // Dry runs promise no provider requests. Missing permissions or an unavailable
 // provider cannot establish a legacy identity; the normal deploy still checks
 // its credentials and refuses collisions before changing resources.
 if (options.dryRun || !env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) return 'fresh'
 try {
  const api = cloudflare({ accountId: env.CLOUDFLARE_ACCOUNT_ID, token: env.CLOUDFLARE_API_TOKEN })
  const settings = await api.request('/workers/scripts/linen/settings')
  const database = settings?.bindings?.find(binding => binding.type === 'd1' && binding.name === 'DB')
  if (!/^[a-f0-9-]{36}$/i.test(database?.id ?? '')) return 'fresh'
  const actual = await api.request(`/d1/database/${database.id}`)
  if (actual?.uuid === database.id && actual.name === 'linen') return 'legacy'
 } catch { /* No confirmed legacy identity: choose the fresh path. */ }
 return 'fresh'
}

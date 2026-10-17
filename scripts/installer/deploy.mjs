import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ownerDeploy } from '@runeditrun/rer/deploy'
import { parseJsonc } from '@runeditrun/rer/jsonc'
import { refuse } from '@runeditrun/rer/errors'

const retained = 'Existing Linen installations must retain Worker linen, D1 linen and R2 linen-attachments. Keep their configuration and data; the shared deploy kit needs an existing-resource identity contract before upgrading them.'

export function freshOwnerDeploy(lifecycle) {
 const deploy = ownerDeploy('deploy.json', lifecycle)
 return Object.assign(async context => {
  // Explicit consent distinguishes a separate new installation from an upgrade
  // of pre-rer hosting. Never infer freshness from absent local deploy receipts.
  if (process.env.LINEN_DEPLOYMENT !== 'new') throw refuse(`${retained} For a separate fresh installation only, set LINEN_DEPLOYMENT=new as described in README.md.`)
  const config = parseJsonc(await readFile(join(context.root, 'wrangler.jsonc'), 'utf8'))
  if (config.d1_databases?.some(database => database.database_id !== 'local-linen')) throw refuse(retained)
  return deploy(context)
 }, { declaration: 'deploy.json', managesHostedOwner: true })
}

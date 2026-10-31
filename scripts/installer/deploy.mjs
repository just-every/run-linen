import { ownerDeploy } from '@runeditrun/rer/deploy'
import { refuse } from '@runeditrun/rer/errors'
import { deploymentIdentity } from './deployment-identity.mjs'

const retained = 'Existing Linen installations must retain Worker linen, D1 linen and R2 linen-attachments. Keep the original wrangler.jsonc with its remote D1 ID and use the existing deployment workflow; rer cannot adopt these resources.'

export function freshOwnerDeploy(lifecycle) {
 const deploy = ownerDeploy('deploy.json', lifecycle)
 return Object.assign(async context => {
  const identity = await deploymentIdentity(context)
  if (identity === 'legacy') throw refuse(retained)
  if (identity === 'fresh') context.store.report('No legacy Linen identity was confirmed; using rer’s environment names. Legacy owners: keep the original wrangler.jsonc with its remote D1 ID and fixed linen / linen / linen-attachments names.')
  return deploy(context)
 }, { declaration: 'deploy.json', managesHostedOwner: true })
}

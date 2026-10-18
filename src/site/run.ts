import type { RunData } from '../base/run-site'
import { repository } from './shell/links'

/** Every string and command on the run site's Run page (/run), Base's standard two steps. */
export const run: RunData = {
  name: 'Linen',
  repository,
  clone: 'npx -y @runeditrun/rer dev just-every/run-linen',
  folder: 'run-linen',
  requirements: 'Runs on macOS, Linux or Windows with WSL2, with git. The installer brings Node when it is missing, and rer brings pnpm.',
  licence: 'MIT',
  docs: true,
  hosted: [],
}

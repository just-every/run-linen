import { constants } from 'node:fs'
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

// The deploy kit packages migrations/core. Linen's applied filenames and flat
// local migration directory stay canonical; stage their identical bytes only
// while packaging a deployment. Never remove a directory we did not create.
export async function withDeployMigrations(root, action) {
 const source = join(root, 'migrations'), staged = join(source, 'core')
 await mkdir(staged)
 try {
  for (const name of (await readdir(source)).filter(name => name.endsWith('.sql')).sort()) {
   await copyFile(join(source, name), join(staged, name), constants.COPYFILE_EXCL)
  }
  return await action()
 } finally {
  await rm(staged, { recursive: true, force: true })
 }
}

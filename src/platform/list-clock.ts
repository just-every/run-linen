import type { Env, Principal } from './types'

/** A queue read costs 1 row when nothing was written since the caller last read it.
 * The counter moves on every write the service accepts (any non-GET request, any scheduled
 * lane that changed a row); the time bucket bounds how stale time-derived fields can be. */
const BUCKET_MS = 300_000

export async function bumpListClock(env: Pick<Env, 'DB'>) {
  await env.DB.prepare('INSERT INTO work_list_clock VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=version+1').run()
}

async function digest(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return btoa(String.fromCharCode(...bytes.slice(0, 12))).replaceAll('+', '-').replaceAll('/', '_')
}

/** Validator for one principal's view of the queue. Read before the queue itself so a write in between only costs a refetch. */
export async function queueValidator(env: Pick<Env, 'DB'>, principal: Principal, scope: string, at = Date.now()) {
  const row = await env.DB.prepare('SELECT version FROM work_list_clock WHERE id=1').first<{ version: number }>()
  return `"${await digest(JSON.stringify([row?.version ?? 0, Math.floor(at / BUCKET_MS), principal.userId, principal.workspaceId, [...principal.roles].sort(), principal.departmentIds ?? null, principal.departmentRoles ?? null, scope]))}"`
}

/** Every request that is not a plain read moves the counter once it has been answered, so the next queue validator differs. */
export async function respondAndBump(request: Request, env: Pick<Env, 'DB'>, respond: () => Promise<Response>) {
  const response = await respond()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) await bumpListClock(env)
  return response
}

/** If-None-Match as a cache or the edge may rewrite it: a list, with strong tags possibly weakened. */
export function validatorMatches(header: string | undefined, validator: string) {
  return (header ?? '').split(',').some(tag => tag.trim().replace(/^W\//, '') === validator)
}

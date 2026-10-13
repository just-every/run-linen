import { createApplication } from '../../src/application'
import { ApiError } from '../../src/platform/http'
import { hashToken } from '../../src/platform/crypto'
import { assertPlatformAdmission, erasePlatformIdentity } from '../../src/platform/privacy'
import { preflightImportedTombstone } from '../../src/features/adoption/import-erasure'
import { erasePersonData } from '../../src/features/adoption/retention'
import type { Env } from '../../src/platform/types'
import { raceDatabase, raceState, releaseRace } from './tombstone-race-fixture'
const app = createApplication()
export default { async fetch(request: Request, env: Env, execution: ExecutionContext) {
 const url = new URL(request.url)
 if (url.pathname === '/fixture') {
  const b = await request.json() as any
  const ctx = { env, principal: { workspaceId: b.workspace ?? 'a', userId: b.actor ?? 'owner', roles: ['owner' as const] } }
  try {
   if (b.sql) return Response.json((await env.DB.prepare(b.sql).bind(...(b.args ?? [])).all()).results)
   if (b.raceState) return Response.json(raceState(b.raceState))
   if (b.releaseRace) { releaseRace(b.releaseRace); return Response.json({ ok: true }) }
   if (b.preflight) return Response.json(await preflightImportedTombstone(ctx, await hashToken(b.preflight)))
   if (b.fullErase) return Response.json(await erasePersonData(ctx, b.fullErase))
   if (b.erase) { await erasePlatformIdentity(ctx, b.erase); return Response.json({ ok: true }) }
   if (b.check) { await assertPlatformAdmission(env.DB, ctx.principal.workspaceId, b.check.id, b.check.email); return Response.json({ ok: true }) }
   if (b.tombstone) {
    await env.DB.prepare('INSERT OR IGNORE INTO adoption_tombstones VALUES(?,?,?)').bind(ctx.principal.workspaceId, await hashToken(b.tombstone), '2026-09-27').run()
    return Response.json({ ok: true })
   }
   return Response.json({ error: 'invalid_fixture' }, { status: 400 })
  } catch (error) {
   return Response.json({ error: error instanceof ApiError ? error.code : String(error) }, { status: error instanceof ApiError ? error.status : 500 })
  }
 }
 const key = request.headers.get('X-Test-Race')
 const db = key ? raceDatabase(env.DB, key, request.headers.get('X-Test-Statement')!) : env.DB
 return app.fetch(request, { ...env, DB: db }, execution)
} }

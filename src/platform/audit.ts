import type { Hono } from 'hono'
import type { AppEnv } from './types'
import { ApiError, requireRole } from './http'

/** The audit reader exposes only these columns. Raw detail payloads never leave the server. */
export const GRANT_VERSION_EVENT = 'execution.grant_version.created'
const DEFAULT_LIMIT = 50, MAX_LIMIT = 200

interface Row { rowid: number; id: string; actor_id: string; action: string; target: string; detail_json: string; created_at: string }

/** Typed identity of a grant version, or null when the stored detail is not exactly that type. */
function grantVersion(row: Row) {
 if (row.action !== GRANT_VERSION_EVENT) return null
 try {
  const d = JSON.parse(row.detail_json)
  if (d && d.kind === 'grant_version' && typeof d.grantId === 'string' && Number.isInteger(d.version) && d.version > 0) return { grantId: d.grantId, version: d.version as number }
 } catch { /* cleared or untyped history carries no typed identity */ }
 return null
}

function bounded(value: string | undefined, name: string, fallback: number, max: number) {
 if (value === undefined) return fallback
 const n = Number(value)
 if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < 1 || n > max) throw new ApiError(400, 'invalid_' + name, `${name} must be a whole number from 1 to ${max}`)
 return n
}

export function registerAuditRoutes(app: Hono<AppEnv>) {
 // Owner and auditor only, read from the current membership on every request.
 app.get('/audit-events', async c => {
  const p = requireRole(c, 'owner', 'auditor')
  const limit = bounded(c.req.query('limit'), 'limit', DEFAULT_LIMIT, MAX_LIMIT)
  const before = c.req.query('before') === undefined ? null : bounded(c.req.query('before'), 'before', 0, Number.MAX_SAFE_INTEGER)
  const action = c.req.query('action')
  if (action !== undefined && (!action || action.length > 120)) throw new ApiError(400, 'invalid_action', 'action filter must be 1 to 120 characters')
  const rows = (await c.env.DB.prepare(
   'SELECT rowid,id,actor_id,action,target,detail_json,created_at FROM audit_events WHERE workspace_id=? AND (? IS NULL OR rowid<?) AND (? IS NULL OR action=?) ORDER BY rowid DESC LIMIT ?',
  ).bind(p.workspaceId, before, before, action ?? null, action ?? null, limit + 1).all<Row>()).results
  const page = rows.slice(0, limit)
  c.header('Cache-Control', 'private, no-store')
  return c.json({
   events: page.map(r => ({ id: r.id, at: r.created_at, actorId: r.actor_id, action: r.action, target: r.target, grantVersion: grantVersion(r) })),
   nextBefore: rows.length > limit ? page[page.length - 1].rowid : null,
  })
 })
}

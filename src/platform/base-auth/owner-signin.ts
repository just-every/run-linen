import { AuthError } from '../../modules/operator-auth/index.mjs'
import { validToken } from '../../modules/operator-auth/crypto.mjs'
import { requireOrigin, requirePost } from '../../modules/operator-auth/http.mjs'
import { OWNER_SIGNIN_SECONDS, ownerSigninDigest } from '../../modules/operator-auth/owner-signin-grant.mjs'
import type { Store } from './store'

export function nativeOwnerSignIn(store: Store, config: { origin: string; local: boolean }) {
  const { db, byId, fence, guard, transaction, sessionInsert } = store
  const live = 'token_hash=? AND consumed_at IS NULL AND expires_at>? AND expires_at<=?'
  const liveBindings = (digest: string, now: number) => [digest, now, now + OWNER_SIGNIN_SECONDS * 1000]

  async function grant(digest: string, now: number) {
    return db.prepare(`SELECT g.id, g.expires_at, o.id AS user_id, o.workspace_id, o.version
      FROM oa_owner_signins g JOIN oa_operators o ON o.id=g.operator_id AND o.version=g.operator_version
      WHERE ${live}`).bind(...liveBindings(digest, now)).first<{
        id: string; expires_at: number; user_id: string; workspace_id: string; version: number
      }>()
  }

  return {
    async previewOwnerSignIn(request: Request, token: string | null) {
      requireOrigin(request, config)
      if (!token || !validToken(token)) return null
      const now = Date.now()
      const row = await grant(await ownerSigninDigest(token), now)
      return row ? { kind: 'owner' as const, expiresInMinutes: Math.ceil((row.expires_at - now) / 60_000) } : null
    },

    async confirmOwnerSignIn(request: Request, { token }: { token: string }) {
      requirePost(request, config)
      if (!validToken(token)) throw new AuthError('invalid_or_expired')
      const digest = await ownerSigninDigest(token), now = Date.now()
      const row = await grant(digest, now)
      const person = row && await byId(row.user_id, row.workspace_id)
      if (!row || !person?.owner || person.status !== 'active' || person.version !== row.version) {
        throw new AuthError('invalid_or_expired')
      }
      const authority = await fence(person)
      const issued = await sessionInsert(request, person, 'native', now, true)
      const accepted = await transaction([
        guard(authority.sql, authority.args),
        db.prepare(`UPDATE oa_owner_signins SET consumed_at=? WHERE ${live} AND id=?
          AND EXISTS (SELECT 1 FROM oa_operators o WHERE o.id=operator_id AND o.version=operator_version AND o.workspace_id=?)`)
          .bind(now, ...liveBindings(digest, now), row.id, person.workspaceId),
        guard('changes()=1'),
        ...issued.statements,
        db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(
          crypto.randomUUID(), person.workspaceId, person.id, 'auth.owner_signin', row.id, '{}', new Date(now).toISOString(),
        ),
      ])
      if (!accepted) throw new AuthError('invalid_or_expired')
      return issued.completed
    },
  }
}

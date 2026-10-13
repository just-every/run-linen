import type { Context } from 'hono'
import { session } from './auth'
import { ApiError } from './http'
import type { AppEnv } from './types'

/** Public initialization, using the same native validation as protected reads.
 * Only absent/expired/revoked authentication is an anonymous result. Admission
 * denials and infrastructure errors retain their real error response. */
export async function sessionStatus(c: Context<AppEnv>) {
  c.header('Cache-Control', 'private, no-store')
  try {
    const { sessionId, ...publicSession } = await session(c)
    return c.json({ authenticated: true, session: publicSession })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && error.code === 'unauthenticated') {
      return c.json({ authenticated: false })
    }
    throw error
  }
}

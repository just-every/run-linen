import { ApiError } from './http'
import type { Env } from './types'

export function requireOutboundMail(env: Pick<Env, 'MAIL_PROVIDER'>) {
  if (env.MAIL_PROVIDER === 'none') throw new ApiError(503, 'mail_off', 'Outbound email is off')
}

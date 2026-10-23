import { decryptSecret } from '../../platform/crypto'
import { check, request, safeJson, type ConnectionContext } from './core'

/** Read-only RingCentral access: a JWT credential for one extension, in the sandbox or production environment. */
export const ringCentralOrigin = (environment: unknown) => environment === 'sandbox' ? 'https://platform.devtest.ringcentral.com' : 'https://platform.ringcentral.com'
export async function ringCentralToken(ctx: ConnectionContext, row: { config_json: string; secret_ciphertext: string | null }) {
  const config = JSON.parse(row.config_json)
  check(typeof config.line === 'string' && (config.environment === 'sandbox' || config.environment === 'production'), 'ringcentral_configuration_required', 400)
  check(row.secret_ciphertext, 'credential_required', 503)
  let secret: any
  try { secret = JSON.parse(await decryptSecret(ctx.env.ENCRYPTION_KEY, row.secret_ciphertext)) } catch { check(false, 'credential_invalid', 400) }
  check(typeof secret?.clientId === 'string' && typeof secret?.clientSecret === 'string' && typeof secret?.jwt === 'string', 'credential_invalid', 400)
  const origin = ringCentralOrigin(config.environment)
  const token = await safeJson(await request(`${origin}/restapi/oauth/token`, {
    method: 'POST', headers: { Authorization: `Basic ${btoa(`${secret.clientId}:${secret.clientSecret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: secret.jwt }),
  }))
  check(typeof token.access_token === 'string', 'provider_auth_denied', 503)
  return { origin, token: token.access_token as string }
}
/** The credential reaches one extension; no call, recording or contact is read. */
export async function verifyRingCentralConnection(ctx: ConnectionContext, row: { config_json: string; secret_ciphertext: string | null }) {
  const { origin, token } = await ringCentralToken(ctx, row)
  const extension = await safeJson(await request(`${origin}/restapi/v1.0/account/~/extension/~`, { headers: { Authorization: `Bearer ${token}` } }))
  check(extension.id !== undefined && typeof extension.account?.id !== 'undefined', 'provider_schema_invalid', 502)
  return { protocol: 'ringcentral-read-only-v1', environment: JSON.parse(row.config_json).environment, extensionId: String(extension.id), accountId: String(extension.account.id), coverage: 'The credential reaches one extension; no call, recording or transcript was read' }
}

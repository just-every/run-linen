import { decryptSecret } from '../../platform/crypto'
import { connectionConfig } from '../../platform/connection-config'
import { check, request, safeJson, type ConnectionContext } from './core'

/** UI/settings contract: global SendGrid API, direct account key, no impersonation.
 * GET verification only; delivery requires the separately configured signed webhook.
 * EU regional accounts and domain-only sender discovery are not supported here.
 */
export const sendGridActivationContract = {
 provider: 'sendgrid',
 origin: 'https://api.sendgrid.com',
 configFields: ['from', 'webhookPublicKey'],
 secretFields: ['apiKey'],
 readEndpoints: ['/v3/scopes', '/v3/user/username', '/v3/verified_senders'],
 requiredSendScope: 'mail.send',
 deliveryEvidence: 'signed-event-webhook',
} as const

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const positiveId = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0

export async function verifySendGridConnection(ctx: ConnectionContext, row: { config_json: string; secret_ciphertext: string | null }) {
 let config: Record<string, unknown>
 try { config = connectionConfig('sendgrid', JSON.parse(row.config_json)) } catch { check(false, 'invalid_config', 400) }
 check(typeof config.from === 'string' && typeof config.webhookPublicKey === 'string', 'sendgrid_configuration_required', 400)
 // Validate the actual point, not just the SPKI envelope accepted for draft storage.
 try {
  await crypto.subtle.importKey('spki', Uint8Array.from(atob(config.webhookPublicKey), c => c.charCodeAt(0)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
 } catch { check(false, 'sendgrid_webhook_key_invalid', 400) }
 check(row.secret_ciphertext, 'credential_required', 503)
 let secret: unknown
 try { secret = JSON.parse(await decryptSecret(ctx.env.ENCRYPTION_KEY, row.secret_ciphertext)) } catch { check(false, 'credential_invalid', 400) }
 check(record(secret) && typeof secret.apiKey === 'string' && secret.apiKey.length > 0 && secret.apiKey.length <= 1024 && !/\s|[\x00-\x1f\x7f]/.test(secret.apiKey), 'credential_invalid', 400)
 const apiKey = secret.apiKey
 const read = async (path: string): Promise<Record<string, unknown>> => {
  const response = await request(sendGridActivationContract.origin + path, { method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, 'Cache-Control': 'no-cache' } })
  const data: unknown = await safeJson(response)
  check(response.status === 200 && record(data), 'provider_schema_invalid', 502)
  return data
 }
 // SendGrid documents /scopes as the scopes on the authenticating key itself.
 const scopes = await read('/v3/scopes')
 check(Array.isArray(scopes.scopes) && scopes.scopes.length <= 5000 && scopes.scopes.every(s => typeof s === 'string' && s.length > 0 && s.length <= 200), 'provider_schema_invalid', 502)
 check(scopes.scopes.includes('mail.send'), 'sendgrid_mail_scope_required', 403)
 const account = await read('/v3/user/username')
 check(positiveId(account.user_id) && typeof account.username === 'string' && account.username.length > 0 && account.username.length <= 320, 'provider_schema_invalid', 502)
 const match = config.from.trim().match(/^(?:(.*?)\s*<([^<>]+)>|([^<>]+))$/)
 const email = (match?.[2] ?? match?.[3] ?? '').trim()
 // lastSeenID is the documented numeric pagination cursor, never a provider URL.
 let lastSeen = 0
 for (let page = 0; page < 100; page++) {
  const data = await read(`/v3/verified_senders?limit=100${lastSeen ? `&lastSeenID=${lastSeen}` : ''}`)
  check(Array.isArray(data.results) && data.results.length <= 100, 'provider_schema_invalid', 502)
  const ids = new Set<number>()
  for (const sender of data.results) {
   check(record(sender) && positiveId(sender.id) && sender.id > lastSeen && !ids.has(sender.id) && typeof sender.from_email === 'string' && typeof sender.verified === 'boolean', 'provider_schema_invalid', 502)
   ids.add(sender.id)
  }
  const sender = data.results.find(s => s.from_email === email && s.verified === true)
  if (sender) return {
   protocol: 'sendgrid-read-only-v1', accountId: account.user_id,
   configuredFrom: config.from, verifiedSenderId: sender.id, verifiedSenderEmail: email,
   mailSendScope: true, deliveryVerified: false, webhookDelivery: 'awaiting-signed-event',
   coverage: 'Current credential, account and exact verified sender only; no email sent',
  }
  if (data.results.length < 100) break
  lastSeen = Math.max(...ids)
 }
 check(false, 'sendgrid_verified_sender_required', 422)
}

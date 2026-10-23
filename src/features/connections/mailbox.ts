import { check, type ConnectionContext } from './core'
import { connectionConfig } from '../../platform/connection-config'
import { domainAuthentication, mailboxAccess, readMailbox, type MailboxKind } from './mailbox-provider'

/** Read-only activation check: the credential reaches the one configured mailbox and the buyer's domain authenticates mail. No mail is read or sent. */
export async function verifyMailboxConnection(ctx: ConnectionContext, row: { provider: string; config_json: string; secret_ciphertext: string | null }) {
  let config: Record<string, unknown>
  try { config = connectionConfig(row.provider, JSON.parse(row.config_json)) } catch { check(false, 'invalid_config', 400) }
  check(typeof config.mailbox === 'string' && typeof config.mode === 'string', 'mailbox_configuration_required', 400)
  check(row.provider !== 'exchange-online' || typeof config.tenantId === 'string', 'tenant_uuid_required', 400)
  if (config.mode === 'oauth') await readMailbox(await mailboxAccess(ctx, row))
  const authentication = await domainAuthentication(row.provider as MailboxKind, config.mailbox)
  return {
    protocol: 'mailbox-read-only-v1', mailbox: config.mailbox, mode: config.mode, mailboxRead: config.mode === 'oauth', domainAuthentication: authentication,
    coverage: config.mode === 'oauth'
      ? 'The credential reaches this mailbox; no message was read or sent'
      : 'Forwarding: no mailbox credential is held, and nothing is observed until authenticated forwarded mail arrives',
  }
}

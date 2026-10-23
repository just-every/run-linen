import { decryptSecret } from '../../platform/crypto'
import { check, request, safeJson, type ConnectionContext } from './core'

/** Gmail and Exchange Online support mailboxes: read-only polling, one mailbox send, and the buyer-domain authentication readback. */
export type MailboxKind = 'gmail' | 'exchange-online'
export interface MailboxAccess { kind: MailboxKind; mailbox: string; token: string }
export class MailboxSendError extends Error {
  constructor(public readonly outcome: 'rejected' | 'ambiguous', message: string) { super(message) }
}
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me', GRAPH = 'https://graph.microsoft.com/v1.0'
const bearer = (access: MailboxAccess, extra: Record<string, string> = {}) => ({ headers: { Authorization: `Bearer ${access.token}`, ...extra } })
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
const fromBase64url = (value: string) => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0))
const chunked = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s) }

/** Exchanges the stored OAuth credential for a short-lived access token; the credential never leaves this call. */
export async function mailboxAccess(ctx: ConnectionContext, row: { provider: string; config_json: string; secret_ciphertext: string | null }): Promise<MailboxAccess> {
  const config = JSON.parse(row.config_json)
  check(row.provider === 'gmail' || row.provider === 'exchange-online', 'mailbox_provider_required', 422)
  check(config.mode === 'oauth' && typeof config.mailbox === 'string', 'mailbox_oauth_required', 422)
  check(row.secret_ciphertext, 'credential_required', 503)
  let secret: any
  try { secret = JSON.parse(await decryptSecret(ctx.env.ENCRYPTION_KEY, row.secret_ciphertext)) } catch { check(false, 'credential_invalid', 400) }
  const gmail = row.provider === 'gmail'
  check(typeof secret?.clientId === 'string' && typeof secret?.clientSecret === 'string' && (!gmail || typeof secret.refreshToken === 'string'), 'credential_invalid', 400)
  if (!gmail) check(/^[a-f0-9-]{36}$/i.test(config.tenantId), 'tenant_uuid_required', 400)
  const body = gmail
    ? new URLSearchParams({ client_id: secret.clientId, client_secret: secret.clientSecret, refresh_token: secret.refreshToken, grant_type: 'refresh_token' })
    : new URLSearchParams({ client_id: secret.clientId, client_secret: secret.clientSecret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' })
  const token = await safeJson(await request(gmail ? 'https://oauth2.googleapis.com/token' : `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, { method: 'POST', body }))
  check(typeof token.access_token === 'string', 'provider_auth_denied', 503)
  return { kind: row.provider as MailboxKind, mailbox: config.mailbox, token: token.access_token }
}

/** Proves the credential reaches exactly the configured mailbox, without reading any message. */
export async function readMailbox(access: MailboxAccess) {
  if (access.kind === 'gmail') {
    const profile = await safeJson(await request(`${GMAIL}/profile`, bearer(access)))
    check(typeof profile.emailAddress === 'string' && profile.emailAddress.toLowerCase() === access.mailbox, 'mailbox_mismatch', 422)
  } else {
    const inbox = await safeJson(await request(`${GRAPH}/users/${encodeURIComponent(access.mailbox)}/mailFolders/inbox?$select=id`, bearer(access)))
    check(typeof inbox.id === 'string', 'provider_schema_invalid', 502)
  }
}

/** Provider ids of inbox messages received since the instant, oldest first, at most 300. */
export async function listInbox(access: MailboxAccess, since: Date): Promise<string[]> {
  const ids: string[] = []
  if (access.kind === 'gmail') {
    let page = ''
    for (let i = 0; i < 3; i++) {
      const data = await safeJson(await request(`${GMAIL}/messages?labelIds=INBOX&maxResults=100&q=${encodeURIComponent('after:' + Math.floor(since.getTime() / 1000))}${page ? '&pageToken=' + encodeURIComponent(page) : ''}`, bearer(access)))
      check(data.messages === undefined || Array.isArray(data.messages), 'provider_schema_invalid', 502)
      for (const m of data.messages ?? []) { check(typeof m?.id === 'string', 'provider_schema_invalid', 502); ids.push(m.id) }
      if (typeof data.nextPageToken !== 'string') break
      page = data.nextPageToken
    }
    return ids.reverse()
  }
  let url = `${GRAPH}/users/${encodeURIComponent(access.mailbox)}/mailFolders/inbox/messages?$select=id&$top=100&$orderby=receivedDateTime asc&$filter=receivedDateTime ge ${since.toISOString()}`
  for (let i = 0; i < 3; i++) {
    const data = await safeJson(await request(url, bearer(access)))
    check(Array.isArray(data.value), 'provider_schema_invalid', 502)
    for (const m of data.value) { check(typeof m?.id === 'string', 'provider_schema_invalid', 502); ids.push(m.id) }
    const next = data['@odata.nextLink']
    if (typeof next !== 'string') break
    const u = new URL(next)
    check(u.origin === 'https://graph.microsoft.com' && !u.username && !u.password, 'provider_cursor_denied', 502)
    url = next
  }
  return ids
}

/** The complete RFC 822 message, so headers, CC and attachments reach Linen exactly as the mailbox holds them. */
export async function fetchRaw(access: MailboxAccess, id: string): Promise<Uint8Array> {
  if (access.kind === 'gmail') {
    const data = await safeJson(await request(`${GMAIL}/messages/${encodeURIComponent(id)}?format=raw`, bearer(access)))
    check(typeof data.raw === 'string' && /^[A-Za-z0-9_-]+={0,2}$/.test(data.raw), 'provider_schema_invalid', 502)
    return fromBase64url(data.raw)
  }
  const response = await request(`${GRAPH}/users/${encodeURIComponent(access.mailbox)}/messages/${encodeURIComponent(id)}/$value`, bearer(access))
  check(response.ok, response.status === 404 ? 'not_found' : 'provider_unavailable', response.status === 404 ? 404 : 503)
  check(Number(response.headers.get('content-length') || 0) <= 40_000_000, 'provider_response_too_large', 502)
  return new Uint8Array(await response.arrayBuffer())
}

/** One attempt, sent from the mailbox itself so the buyer's own SPF and DKIM sign it. An unconfirmed outcome is never retried here. */
export async function sendRaw(access: MailboxAccess, mime: Uint8Array): Promise<string | null> {
  let response: Response
  try {
    response = access.kind === 'gmail'
      ? await request(`${GMAIL}/messages/send`, { method: 'POST', ...bearer(access, { 'Content-Type': 'application/json' }), body: JSON.stringify({ raw: base64url(mime) }) })
      : await request(`${GRAPH}/users/${encodeURIComponent(access.mailbox)}/sendMail`, { method: 'POST', ...bearer(access, { 'Content-Type': 'text/plain' }), body: chunked(mime) })
  } catch { throw new MailboxSendError('ambiguous', 'The mailbox did not return a receipt; reconcile before resending.') }
  if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) throw new MailboxSendError('rejected', `The mailbox provider rejected this message (${response.status}).`)
  if (response.status !== (access.kind === 'gmail' ? 200 : 202)) throw new MailboxSendError('ambiguous', `Unconfirmed submission status (${response.status}); reconcile before resending.`)
  if (access.kind !== 'gmail') return null
  try { const id = (await response.json() as any)?.id; return typeof id === 'string' ? id : null } catch { return null }
}

interface Dns { status: 'ok' | 'missing' | 'error'; records: { value: string }[] }
const dnsTypes = { TXT: 16, CNAME: 5 } as const
/** One lookup through the fixed public DNS-over-HTTPS resolver; a malformed or failed answer is "error", never a pass. */
const first = async (name: string, type: keyof typeof dnsTypes): Promise<Dns> => {
  try {
    const url = new URL('https://cloudflare-dns.com/dns-query')
    url.searchParams.set('name', name); url.searchParams.set('type', type)
    const response = await fetch(url, { headers: { accept: 'application/dns-json' }, redirect: 'manual', signal: AbortSignal.timeout(8000) })
    if (response.status !== 200) return { status: 'error', records: [] }
    const data = await response.json() as { Status?: number; Answer?: { name?: string; type?: number; data?: string }[] }
    if (data.Status === 3) return { status: 'missing', records: [] }
    if (data.Status !== 0) return { status: 'error', records: [] }
    const records = (data.Answer ?? []).filter(a => a.type === dnsTypes[type] && typeof a.data === 'string' && a.name?.replace(/\.$/, '').toLowerCase() === name)
      .map(a => ({ value: type === 'TXT' ? [...a.data!.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1].replace(/\\(.)/g, '$1')).join('') : a.data!.replace(/\.$/, '') }))
    return { status: records.length ? 'ok' : 'missing', records }
  } catch { return { status: 'error', records: [] } }
}
/** DNS readback of the buyer's SPF, DKIM and DMARC records. "Aligned" requires all three; the sending provider signs for the mailbox's own domain. */
export async function domainAuthentication(kind: MailboxKind, mailbox: string) {
  const domain = mailbox.split('@')[1]
  const txt = (r: Dns) => r.records.map(x => String(x.value))
  const [spf, dmarc, dkim1, dkim2] = await Promise.all([
    first(domain, 'TXT'), first(`_dmarc.${domain}`, 'TXT'),
    first(kind === 'gmail' ? `google._domainkey.${domain}` : `selector1._domainkey.${domain}`, kind === 'gmail' ? 'TXT' : 'CNAME'),
    kind === 'gmail' ? Promise.resolve<Dns>({ status: 'ok', records: [] }) : first(`selector2._domainkey.${domain}`, 'CNAME'),
  ])
  const include = kind === 'gmail' ? '_spf.google.com' : 'spf.protection.outlook.com'
  const spfRecord = txt(spf).find(v => /^v=spf1\b/i.test(v))
  const dmarcRecord = txt(dmarc).find(v => /^v=DMARC1\b/i.test(v))
  const result = {
    domain,
    spf: spf.status === 'error' ? 'unknown' : spfRecord?.includes(`include:${include}`) ? 'pass' : 'missing',
    dkim: dkim1.status === 'error' || dkim2.status === 'error' ? 'unknown'
      : kind === 'gmail' ? (txt(dkim1).some(v => /v=DKIM1/i.test(v)) ? 'pass' : 'missing') : (dkim1.records.length && dkim2.records.length ? 'pass' : 'missing'),
    dmarc: dmarc.status === 'error' ? 'unknown' : dmarcRecord ? 'pass' : 'missing',
    dmarcPolicy: /(?:^|;)\s*p=(none|quarantine|reject)/i.exec(dmarcRecord ?? '')?.[1].toLowerCase() ?? null,
  }
  return { ...result, aligned: result.spf === 'pass' && result.dkim === 'pass' && result.dmarc === 'pass' }
}

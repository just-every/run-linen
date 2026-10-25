import { ApiError } from './http'

type Check = (value: unknown) => boolean
const text = (max: number): Check => v => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x1f\x7f]/.test(v)
const number = (min: number, max: number, integer = false): Check => v => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isSafeInteger(v))
const host: Check = v => text(253)(v) && /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/.test(v as string) && !/(\.local|\.localhost|\.internal|\.test|\.invalid)$/.test(v as string)
const list = (check: Check, max = 100): Check => v => Array.isArray(v) && v.length > 0 && v.length <= max && v.every(check) && new Set(v).size === v.length
const url: Check = v => {
 if (!text(2000)(v)) return false
 try { const u = new URL(v as string); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && !u.port && host(u.hostname) } catch { return false }
}
const metadata: Record<string, Check> = Object.fromEntries(['tenantId','tenant','domain','audience','clientId','scope','region','mailbox','description'].map(k => [k,text(2000)]))
metadata.baseUrl = url; metadata.issuer = url
const endpoint = {url, allowedHosts:list(host)}
const email: Check = v => {
 if (!text(320)(v)) return false
 const match = (v as string).trim().match(/^(?:(.*?)\s*<([^<>]+)>|([^<>]+))$/)
 return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test((match?.[2] ?? match?.[3] ?? '').trim())
}
const plainEmail: Check = v => text(254)(v) && /^[^\s@<>"]+@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(v as string) && v === (v as string).toLowerCase()
const githubLogin: Check = v => text(39)(v) && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(v as string) && !(v as string).includes('--')
const githubRepository: Check = v => text(100)(v) && /^[a-z0-9._-]+$/i.test(v as string) && v !== '.' && v !== '..'
const uuid: Check = v => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v)
const mailboxMode: Check = v => v === 'oauth' || v === 'forwarding'
// The signature consumer expects base64 SPKI, not a PEM envelope.
const publicKey: Check = v => {
 if (typeof v !== 'string' || v.length > 2000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v)) return false
 try { const bytes = atob(v); return bytes.length === 91 && bytes.startsWith(atob('MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE')) } catch { return false }
}
const schemas: Record<string, Record<string, Check>> = {
 'microsoft-graph': {tenantId:v => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v)},
 openai: {model:v => text(150)(v) && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(v as string),inputUsdPerMillion:number(0,10000),cachedInputUsdPerMillion:number(0,10000),outputUsdPerMillion:number(0,10000),maxOutputTokens:number(100,16000,true),maxAttemptUsd:number(0.000001,100),contextCharacters:number(1000,100000),reasoningEffort:v => ['none','minimal','low','medium','high','xhigh'].includes(v as string)},
 'workflow-probe': endpoint,
 'controlled-deployment': {...endpoint, targets:list(text(1000))},
 'notification-webhook': endpoint,
 'monitoring-webhook': {}, // Inbound HMAC signingSecret belongs only in encrypted secret.
 sendgrid: {from:email,webhookPublicKey:publicKey},
 github: {repositoryOwner:githubLogin,repositoryName:githubRepository,memberId:uuid,githubLogin,githubUserId:number(1,Number.MAX_SAFE_INTEGER,true)},
 // CHANNEL-007: the IT phone line on a RingCentral account (sandbox or production).
 ringcentral: {line:v => text(40)(v) && /^\+?[\d ()-]{7,20}$/.test(v as string),environment:v => v === 'sandbox' || v === 'production'},
 // CHANNEL-003: one support mailbox, read by OAuth polling or fed by a forwarding rule.
 gmail: {mailbox:plainEmail,mode:mailboxMode},
 'exchange-online': {mailbox:plainEmail,mode:mailboxMode,tenantId:v => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v)},
 freshservice: {domain:v => typeof v === 'string' && v.length <= 253 && /^[a-z0-9][a-z0-9-]*\.freshservice\.com$/.test(v)},
}
// Admission is not activation: incomplete drafts remain unverified until the
// adapter validates its protocol. Unknown providers receive inert metadata only.
export function connectionConfig(provider: string, value: unknown): Record<string, unknown> {
 if (value === undefined && provider !== 'github') return {}
 const invalid = () => new ApiError(400,'invalid_config','Unsupported or invalid nonsecret connection configuration')
 if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 32768) throw invalid()
 const schema = Object.hasOwn(schemas,provider) ? {...schemas[provider],description:text(2000)} : metadata
 const result: Record<string, unknown> = {}
 for (const [key,item] of Object.entries(value)) {
  if (!Object.hasOwn(schema,key) || !schema[key](item)) throw invalid()
  result[key] = item
 }
 if (provider === 'github' && ['repositoryOwner','repositoryName','memberId','githubLogin','githubUserId'].some(key=>result[key]===undefined)) throw invalid()
 if (result.url !== undefined && (!Array.isArray(result.allowedHosts) || !result.allowedHosts.includes(new URL(result.url as string).hostname))) throw invalid()
 return result
}

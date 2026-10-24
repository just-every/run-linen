function decode(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
// SendGrid signs ASN.1 DER ECDSA; WebCrypto expects the fixed-width r || s form.
function rawSignature(der: Uint8Array) {
  if (der[0] !== 0x30 || der[1] !== der.length - 2) throw new Error('Invalid signature');
  let cursor = 2;
  const raw = new Uint8Array(64);
  for (const offset of [0, 32]) {
    if (der[cursor++] !== 2) throw new Error('Invalid integer');
    const length = der[cursor++];
    let value = der.slice(cursor, cursor + length); cursor += length;
    if (value.length === 33 && value[0] === 0) value = value.slice(1);
    if (!value.length || value.length > 32) throw new Error('Invalid integer size');
    raw.set(value, offset + 32 - value.length);
  }
  if (cursor !== der.length) throw new Error('Invalid signature length');
  return raw;
}
export async function verifySendGridWebhook(input: { publicKey: string; timestamp?: string; signature?: string; rawBody: string | Uint8Array }) {
  if (!input.timestamp || !/^\d+$/.test(input.timestamp) || !input.signature || Math.abs(Date.now() - Number(input.timestamp) * 1000) > 5 * 60_000) return false;
  try {
    const key = await crypto.subtle.importKey('spki', decode(input.publicKey).buffer, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const prefix = new TextEncoder().encode(input.timestamp);
    const body = typeof input.rawBody === 'string' ? new TextEncoder().encode(input.rawBody) : input.rawBody;
    const signed = new Uint8Array(prefix.length + body.length);
    signed.set(prefix); signed.set(body, prefix.length);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, rawSignature(decode(input.signature)).buffer, signed);
  } catch { return false; }
}

function timely(timestamp: string | undefined) {
  return Boolean(timestamp && /^\d+$/.test(timestamp) && Number.isSafeInteger(Number(timestamp)) && Math.abs(Date.now() - Number(timestamp) * 1000) <= 5 * 60_000);
}
function relayBytes(timestamp: string, rawBody: string) { return new TextEncoder().encode(`${timestamp}.${rawBody}`); }
async function relayKey(secret: string, usage: Array<'sign' | 'verify'>) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage);
}
export async function signRelayBody(secret: string, timestamp: string, rawBody: string): Promise<string> {
  if (secret.length < 32) throw new Error('Relay secret must contain at least 32 characters.');
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', await relayKey(secret, ['sign']), relayBytes(timestamp, rawBody)));
  return `v1=${[...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
export async function verifyRelayRequest(input: { secret: string; timestamp?: string; signature?: string; rawBody: string }): Promise<boolean> {
  if (input.secret.length < 32 || !timely(input.timestamp) || !/^v1=[a-f0-9]{64}$/.test(input.signature ?? '')) return false;
  const signature = Uint8Array.from(input.signature!.slice(3).match(/../g)!, pair => Number.parseInt(pair, 16));
  return crypto.subtle.verify('HMAC', await relayKey(input.secret, ['verify']), signature, relayBytes(input.timestamp!, input.rawBody));
}

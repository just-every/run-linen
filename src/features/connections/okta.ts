import { decryptSecret } from '../../platform/crypto';
import { oktaOrigin } from '../../platform/okta-origin';
import { check, request, safeJson, type ConnectionContext } from './core';
export async function verifyOktaConnection(ctx: ConnectionContext, row: any) {
  const origin = oktaOrigin(JSON.parse(row.config_json).orgUrl);
  check(origin && row.secret_ciphertext, 'needs_configuration', 503);
  let secret: any;
  try { secret = JSON.parse(await decryptSecret(ctx.env.ENCRYPTION_KEY, row.secret_ciphertext)); }
  catch { check(false, 'credential_invalid', 400); }
  check(typeof secret.apiToken === 'string' && secret.apiToken.length > 0, 'credential_invalid', 400);
  const me = await safeJson(await request(origin + '/api/v1/users/me', {
    headers: { Authorization: `SSWS ${secret.apiToken}`, Accept: 'application/json' },
  }));
  check(typeof me.id === 'string' && typeof me.status === 'string', 'provider_schema_invalid', 502);
  return { readResource: 'authenticated Okta account', workflowVerified: false, writeAuthority: 'not-established' };
}

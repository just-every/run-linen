import { oktaOrigin } from '../../platform/okta-origin';
import { connection } from './connectors';
import { providerFetch } from './transport';
import { assert } from './authority';
import type { CoreContext, Step } from './types';
export async function oktaClient(ctx: CoreContext, step: Step, operationId?: string) {
  const { config, secret } = await connection(ctx, step.connectionId, 'okta', true, step.connectionRevision);
  const origin = oktaOrigin(config.orgUrl);
  assert(origin && typeof secret.apiToken === 'string' && secret.apiToken.length > 0, 'needs_configuration', 503);
  return async (path: string, method = 'GET', body?: unknown) => {
    const url = new URL(path, origin);
    assert(url.origin === origin && url.pathname.startsWith('/api/v1/') && !url.username && !url.password && !url.hash, 'provider_cursor_denied', 502);
    return providerFetch(ctx, step.connectionId, method === 'GET' ? 'observe' : 'effect', url, {
      method, redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `SSWS ${secret.apiToken}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }, method === 'GET' ? undefined : operationId);
  };
}
export async function oktaItems(request: Awaited<ReturnType<typeof oktaClient>>, path: string) {
  const items: any[] = [];
  let next: string | undefined = path;
  const expectedPath = new URL(path, 'https://synthetic-linen-1.okta.com').pathname;
  for (let page = 0; next && page < 20; page++) {
    assert(new URL(next, 'https://synthetic-linen-1.okta.com').pathname === expectedPath, 'provider_cursor_denied', 502);
    const response = await request(next);
    assert(response.ok, 'provider_observation_failed', 503);
    const data: any = await response.json();
    assert(Array.isArray(data) && data.length <= 1000, 'provider_schema_invalid', 502);
    items.push(...data);
    next = response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
  }
  assert(!next, 'provider_observation_incomplete', 503);
  return items;
}

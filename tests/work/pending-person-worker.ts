import { Hono } from 'hono';
import { platformApp } from '../../src/platform/routes';
import { baseAuthResponse } from '../../src/platform/base-auth/http';
import { ApiError } from '../../src/platform/http';
import type { AppEnv, Env } from '../../src/platform/types';
import { registerWorkRoutes } from '../../src/features/work';
import { registerAdoptionRoutes } from '../../src/features/adoption';

// Only the outbound mail provider is replaced. Native proof consumption,
// sessions, membership, pending-person binding and fulfilment use real D1.
const delivered: unknown[] = [];
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const outgoing = new Request(input, init);
  const url = new URL(outgoing.url);
  if (url.origin !== 'https://api.resend.com' || url.pathname !== '/emails')
    throw new Error(`Unexpected provider request: ${url.origin}${url.pathname}`);
  delivered.push(await outgoing.json());
  return Response.json({ id: crypto.randomUUID() });
};

const app = new Hono<AppEnv>();
app.onError((error, c) => c.json(
  { error: error instanceof ApiError ? error.code : error.message },
  (error instanceof ApiError ? error.status : 500) as 400,
));
const api = platformApp();
registerWorkRoutes(api);
registerAdoptionRoutes(api);
app.route('/api/v1', api);

export default {
  async fetch(request: Request, bindings: Env, execution: ExecutionContext) {
    if (new URL(request.url).pathname === '/test/mail') return Response.json(delivered);
    const env = { ...bindings, AUTH_ORIGIN: new URL(request.url).origin,
      MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'synthetic-test-mail-key',
      MAIL_FROM: 'auth@pending.test', AUTH_LOCAL: 'true',
      SESSION_SECRET: 'synthetic-pending-person-session-secret-for-test' };
    return await baseAuthResponse(request, env) ?? app.fetch(request, env, execution);
  },
};

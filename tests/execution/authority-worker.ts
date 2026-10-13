import { Hono } from "hono";
import { registerExecutionRoutes } from "../../src/features/execution";
import { registerWorkRoutes } from "../../src/features/work";
import { runOperation } from "../../src/features/execution/engine";
import { encryptSecret } from "../../src/platform/crypto";
import { ApiError } from "../../src/platform/http";
import type { AppEnv, Env } from "../../src/platform/types";

// Test-only transport to a native HTTP fixture. All production service code remains real.
const nativeFetch = globalThis.fetch;
let env: Env & { TEST_PROVIDER_URL: string };
let oauthMutation: { countdown: number; sql: string } | undefined;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  if (!["login.microsoftonline.com", "graph.microsoft.com", "workflow.example.test"].includes(url.hostname))
    throw new Error(`Unexpected network request ${url.origin}`);
  const response = await nativeFetch(env.TEST_PROVIDER_URL + '/' + url.hostname + url.pathname + url.search, init);
  if (url.hostname === "login.microsoftonline.com" && oauthMutation && --oauthMutation.countdown === 0) {
    const mutation = oauthMutation;
    oauthMutation = undefined;
    await env.DB.exec(mutation.sql);
  }
  return response;
};
const app = new Hono<AppEnv>();
app.use('*', async (c, next) => {
  const userId = c.req.header('x-user') || 'owner', workspaceId = c.req.header('x-workspace') || 'w';
  const member = await c.env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1')
    .bind(workspaceId, userId).first<{roles_json:string}>();
  c.set('principal', { userId, workspaceId, roles: JSON.parse(member?.roles_json || '[]') });
  await next();
});
app.onError((e, c) => c.json({ code: e instanceof ApiError ? e.code : 'internal', message: e.message }, (e instanceof ApiError ? e.status : 500) as any));
registerExecutionRoutes(app);
registerWorkRoutes(app);
app.post('/test/run', async c => c.json(await runOperation({env:c.env,principal:c.get('principal')}, (await c.req.json()).operationId)));
app.post('/test/secret', async c => c.json({secret:await encryptSecret(c.env.ENCRYPTION_KEY, JSON.stringify(await c.req.json()))}));
app.post('/test/oauth-mutation', async c => { oauthMutation = await c.req.json(); return c.json({armed:true}); });
export default {
  async fetch(request: Request, bindings: typeof env, execution: ExecutionContext) {
    env = bindings;
    return app.fetch(request, bindings, execution);
  },
};

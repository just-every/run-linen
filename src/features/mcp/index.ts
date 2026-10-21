import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { listMcpCredentials, mintMcpCredential, revokeMcpCredential } from './credentials';
export { mcpProtocol } from './protocol';
export function registerMcpCredentialRoutes(app: Hono<AppEnv>) {
  app.use('/mcp-credentials*',async (c,next) => { c.header('Cache-Control','no-store'); await next(); });
  app.get('/mcp-credentials',async c => c.json(await listMcpCredentials(c)));
  app.post('/mcp-credentials',async c => {
    c.header('Cache-Control','no-store');
    return c.json(await mintMcpCredential(c,await jsonBody(c)),201);
  });
  app.post('/mcp-credentials/:id/revoke',async c => c.json(await revokeMcpCredential(c,c.req.param('id'))));
}

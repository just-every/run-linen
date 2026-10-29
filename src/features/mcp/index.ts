import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { registerMcpFieldClassificationRoutes } from './field-classification';
import { jsonBody } from '../../platform/http';
import { listMcpCredentials, mintMcpCredential, narrowMcpCredential, revokeMcpCredential } from './credentials';
export function registerMcpCredentialRoutes(app: Hono<AppEnv>) {
  registerMcpFieldClassificationRoutes(app);
  app.use('/mcp-credentials*',async (c,next) => { c.header('Cache-Control','no-store'); await next(); });
  app.get('/mcp-credentials',async c => c.json(await listMcpCredentials(c)));
  app.post('/mcp-credentials',async c => {
    c.header('Cache-Control','no-store');
    return c.json(await mintMcpCredential(c,await jsonBody(c)),201);
  });
  app.post('/mcp-credentials/:id/narrow',async c => c.json(await narrowMcpCredential(c,c.req.param('id'),await jsonBody(c))));
  app.post('/mcp-credentials/:id/revoke',async c => c.json(await revokeMcpCredential(c,c.req.param('id'))));
}

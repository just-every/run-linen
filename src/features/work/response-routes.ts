import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { listCannedResponses, saveCannedResponse, deleteCannedResponse, insertCannedResponse } from './canned-responses';
import { assistResponse } from './response-assistance';
export function registerResponseRoutes(app: Hono<AppEnv>) {
  app.get('/canned-responses', async c => c.json(await listCannedResponses({ env: c.env, principal: c.get('principal') })));
  app.post('/canned-responses', async c => c.json(await saveCannedResponse({ env: c.env, principal: c.get('principal') }, await jsonBody(c)), 201));
  app.post('/canned-responses/:id/delete', async c => c.json(await deleteCannedResponse({ env: c.env, principal: c.get('principal') }, c.req.param('id'), await jsonBody(c))));
  app.post('/work/:id/canned-response', async c => c.json(await insertCannedResponse({ env: c.env, principal: c.get('principal') }, c.req.param('id'), await jsonBody(c))));
  app.post('/work/:id/response-assistance', async c => c.json(await assistResponse({ env: c.env, principal: c.get('principal') }, c.req.param('id'), await jsonBody(c))));
}

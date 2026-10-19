import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { readClassification, overrideClassification, proposeClassification } from './classification';
export function registerClassificationRoutes(app: Hono<AppEnv>) {
  app.get('/work/:id/classification', async c => c.json(await readClassification({ env: c.env, principal: c.get('principal') }, c.req.param('id'))));
  app.post('/work/:id/classification/propose', async c => c.json(await proposeClassification({ env: c.env, principal: c.get('principal') }, c.req.param('id'), await jsonBody(c))));
  app.post('/work/:id/classification/override', async c => c.json(await overrideClassification({ env: c.env, principal: c.get('principal') }, c.req.param('id'), await jsonBody(c))));
}

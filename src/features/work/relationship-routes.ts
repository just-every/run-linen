import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { linkWork, linkedWork, mergeWork, readRelationships, setParent, splitWork } from './relationships';
/** DESK-006: merge, split, parent/child and record links on tickets; each linked record lists its tickets. */
export function registerRelationshipRoutes(app: Hono<AppEnv>) {
  const ctx = (c: any) => ({ env: c.env, principal: c.get('principal') });
  app.get('/work-links', async c => c.json({ items: await linkedWork(ctx(c), c.req.query('kind') || '', c.req.query('targetId') || '') }));
  app.get('/work/:id/relationships', async c => c.json(await readRelationships(ctx(c), c.req.param('id'))));
  app.post('/work/:id/merge', async c => c.json(await mergeWork(ctx(c), c.req.param('id'), await jsonBody(c))));
  app.post('/work/:id/split', async c => c.json(await splitWork(ctx(c), c.req.param('id'), await jsonBody(c)), 201));
  app.post('/work/:id/parent', async c => c.json(await setParent(ctx(c), c.req.param('id'), await jsonBody(c))));
  app.post('/work/:id/links', async c => c.json(await linkWork(ctx(c), c.req.param('id'), await jsonBody(c))));
}

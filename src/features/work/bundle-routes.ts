import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { approveBundle, bundleStatus, createBundle, listBundles, requestBundle } from './bundles';
/** CATALOG-004: owner-built bundles, one request per bundle, one manager decision, per-child delivery state. */
export function registerBundleRoutes(app: Hono<AppEnv>) {
  app.get('/catalog-bundles', async c => c.json(await listBundles({ env: c.env, principal: c.get('principal') })));
  app.post('/catalog-bundles', async c => c.json(await createBundle({ env: c.env, principal: c.get('principal') }, await jsonBody(c)), 201));
  app.post('/catalog-bundles/:id/request', async c => c.json(await requestBundle({ env: c.env, principal: c.get('principal') }, c.req.param('id'), await jsonBody(c)), 201));
  app.get('/work/:id/bundle', async c => c.json(await bundleStatus({ env: c.env, principal: c.get('principal') }, c.req.param('id'))));
  app.post('/work/:id/bundle/approve', async c => c.json(await approveBundle({ env: c.env, principal: c.get('principal') }, c.req.param('id'), await jsonBody(c))));
}

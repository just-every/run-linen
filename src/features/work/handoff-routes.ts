import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import type { WorkContext } from './core';
import { acceptHandoff, configureHandoff, currentHandoff, endHandoff, handoffQueue, presence, readHandoffConfig, requestHandoff, setPresence } from './handoff';

export function registerHandoffRoutes(app: Hono<AppEnv>) {
  const ctx = (c: any): WorkContext => ({ env: c.env, principal: c.get('principal') });
  app.get('/handoff-config', async c => c.json({ config: await readHandoffConfig(ctx(c)) }));
  app.post('/handoff-config', async c => c.json(await configureHandoff(ctx(c), await jsonBody(c))));
  app.get('/agents/presence', async c => c.json(await presence(ctx(c))));
  app.post('/agents/presence', async c => c.json(await setPresence(ctx(c), await jsonBody(c))));
  app.get('/handoffs', async c => c.json(await handoffQueue(ctx(c))));
  app.post('/handoffs/:id/accept', async c => c.json(await acceptHandoff(ctx(c), c.req.param('id'))));
  app.post('/handoffs/:id/end', async c => c.json(await endHandoff(ctx(c), c.req.param('id'))));
  app.post('/work/:id/handoff', async c => c.json(await requestHandoff(ctx(c), c.req.param('id')), 201));
  app.get('/work/:id/handoff', async c => c.json(await currentHandoff(ctx(c), c.req.param('id'))));
}

import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { listSlaPolicies, readWorkSla, saveRequesterGroup, saveSlaPolicy } from './sla-policies';
/** DESK-004: the owner orders SLA policies and requester groups; agents and auditors read each ticket's targets. */
export function registerSlaRoutes(app: Hono<AppEnv>) {
  app.post('/requester-groups', async c => c.json(await saveRequesterGroup({ env: c.env, principal: c.get('principal') }, await jsonBody(c)), 201));
  app.get('/sla-policies', async c => c.json({ items: await listSlaPolicies({ env: c.env, principal: c.get('principal') }) }));
  app.post('/sla-policies', async c => c.json(await saveSlaPolicy({ env: c.env, principal: c.get('principal') }, await jsonBody(c)), 201));
  app.get('/work/:id/sla', async c => c.json(await readWorkSla({ env: c.env, principal: c.get('principal') }, c.req.param('id'))));
}

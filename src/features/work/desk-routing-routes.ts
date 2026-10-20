import type { Context, Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { listRouting, removeRoutingRule, saveRoutingRule, setAgentRouting, setGroupAssignment, setSupportGroup } from './desk-routing-config';
import { assignmentHistory, rerouteWork } from './desk-routing';

/** DESK-003: routing rules, support groups, agent shifts and skills, group assignment, routing and assignment history. */
export function registerDeskRoutingRoutes(app: Hono<AppEnv>) {
  const ctx = (c: Context<AppEnv>) => ({ env: c.env, principal: c.get('principal') });
  app.get('/work-routing', async c => c.json(await listRouting(ctx(c))));
  app.post('/work-routing/rules', async c => c.json(await saveRoutingRule(ctx(c), await jsonBody(c)), 201));
  app.post('/work-routing/rules/:id/remove', async c => c.json(await removeRoutingRule(ctx(c), c.req.param('id'))));
  app.post('/work-routing/support-groups/:itemId', async c => c.json(await setSupportGroup(ctx(c), c.req.param('itemId'), await jsonBody(c))));
  app.post('/work-routing/agents/:userId', async c => c.json(await setAgentRouting(ctx(c), c.req.param('userId'), await jsonBody(c))));
  app.post('/work-groups/:id/assignment', async c => c.json(await setGroupAssignment(ctx(c), c.req.param('id'), await jsonBody(c))));
  app.post('/work/:id/route', async c => c.json(await rerouteWork(ctx(c), c.req.param('id'), await jsonBody(c))));
  app.get('/work/:id/assignments', async c => c.json(await assignmentHistory(ctx(c), c.req.param('id'))));
}

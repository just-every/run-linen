import type { Context, Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { createGroup, leadQueue, listGroups, removeGroupMember, setGroupMember, setWorkGroup } from './desk-groups';

/** DESK-001: agent groups, a ticket's accountable group and owner, and the group-lead view. */
export function registerDeskGroupRoutes(app: Hono<AppEnv>) {
  const ctx = (c: Context<AppEnv>) => ({ env: c.env, principal: c.get('principal') });
  app.get('/work-groups', async c => c.json(await listGroups(ctx(c))));
  app.post('/work-groups', async c => c.json(await createGroup(ctx(c), await jsonBody(c)), 201));
  app.post('/work-groups/:id/members', async c => c.json(await setGroupMember(ctx(c), c.req.param('id'), await jsonBody(c))));
  app.post('/work-groups/:id/members/:userId/remove', async c => c.json(await removeGroupMember(ctx(c), c.req.param('id'), c.req.param('userId'))));
  app.get('/work-groups/:id/queue', async c => c.json(await leadQueue(ctx(c), c.req.param('id'))));
  app.post('/work/:id/group', async c => c.json(await setWorkGroup(ctx(c), c.req.param('id'), await jsonBody(c))));
}

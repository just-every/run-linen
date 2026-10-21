import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody, requireRole } from '../../platform/http';
import { getService } from './store';
import { completeRelease, decideRelease, newRelease, presentRelease, recordReleasePhase } from './releases';

/** CHANGE-007 commands. Reads use the shared service record routes. */
export function registerReleaseRoutes(app: Hono<AppEnv>) {
  // Requester groups name the affected employees who may receive release notes.
  app.get('/release-cohorts', async c => { const p = requireRole(c, 'owner', 'operator'); return c.json({ items: (await c.env.DB.prepare('SELECT id,name FROM work_requester_groups WHERE workspace_id=? ORDER BY name').bind(p.workspaceId).all()).results }); });
  app.post('/releases', async c => { const p = requireRole(c, 'owner', 'operator'); return c.json(await presentRelease(c.env.DB, p, await newRelease(c.env, p, await jsonBody(c))), 201); });
  app.post('/releases/:id/phases', async c => { const p = requireRole(c, 'owner', 'operator'); return c.json(await presentRelease(c.env.DB, p, await recordReleasePhase(c.env, p, await getService(c.env.DB, p, c.req.param('id'), 'release'), await jsonBody(c)))); });
  app.post('/releases/:id/decisions', async c => { const p = requireRole(c, 'owner', 'approver'); return c.json(await presentRelease(c.env.DB, p, await decideRelease(c.env, p, await getService(c.env.DB, p, c.req.param('id'), 'release'), await jsonBody(c)))); });
  app.post('/releases/:id/complete', async c => { const p = requireRole(c, 'owner', 'operator'); return c.json(await presentRelease(c.env.DB, p, await completeRelease(c.env, p, await getService(c.env.DB, p, c.req.param('id'), 'release'), await jsonBody(c)))); });
}

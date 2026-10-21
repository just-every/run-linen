import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, jsonBody } from '../../platform/http';
import { permit } from './core';
import { currentWorkPrincipal } from './identity';
import { listPolicies, savePolicy } from './access-policies';

/** LIFE-003: the owner edits birthright baselines; owner and HR read them to review a move. */
export function registerAccessPolicyRoutes(app: Hono<AppEnv>) {
  app.get('/access-policies', async c => {
    const ctx = { env: c.env, principal: c.get('principal') };
    await currentWorkPrincipal(ctx); permit(ctx, ['owner', 'hr']);
    return c.json({ items: await listPolicies(ctx) });
  });
  app.post('/access-policies', async c => {
    const ctx = { env: c.env, principal: c.get('principal') };
    await currentWorkPrincipal(ctx);
    const b = await jsonBody(c);
    return c.json(await savePolicy(ctx, { name: b.name, match: b.match, grants: b.grants }), 201);
  });
  app.post('/access-policies/:id', async c => {
    const ctx = { env: c.env, principal: c.get('principal') };
    await currentWorkPrincipal(ctx);
    const b = await jsonBody(c);
    if (typeof b.revision !== 'number') throw new ApiError(422, 'access_policy_revision', 'Current revision required');
    return c.json(await savePolicy(ctx, { policyId: c.req.param('id'), revision: b.revision, active: b.active, name: b.name, match: b.match, grants: b.grants }));
  });
}

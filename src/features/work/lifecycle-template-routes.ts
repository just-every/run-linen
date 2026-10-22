import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, jsonBody } from '../../platform/http';
import { permit } from './core';
import { currentWorkPrincipal } from './identity';
import { listTemplates, saveTemplate } from './lifecycle-templates';
import { completeLifecycleTask, myLifecycleTasks, waiveLifecycleTask } from './lifecycle-tasks';

/** LIFE-002: the owner edits dated task templates; owner and HR read them; a person does only the tasks assigned to them. */
export function registerLifecycleTemplateRoutes(app: Hono<AppEnv>) {
  const ctxOf = (c: { env: AppEnv['Bindings']; get(key: 'principal'): AppEnv['Variables']['principal'] }) => ({ env: c.env, principal: c.get('principal') });
  app.get('/lifecycle-templates', async c => {
    const ctx = ctxOf(c);
    await currentWorkPrincipal(ctx); permit(ctx, ['owner', 'hr']);
    return c.json({ items: await listTemplates(ctx) });
  });
  app.post('/lifecycle-templates', async c => {
    const b = await jsonBody(c);
    return c.json(await saveTemplate(ctxOf(c), { name: b.name, kind: b.kind, match: b.match, tasks: b.tasks }), 201);
  });
  app.post('/lifecycle-templates/:id', async c => {
    const b = await jsonBody(c);
    if (typeof b.revision !== 'number') throw new ApiError(422, 'lifecycle_template_revision', 'Current revision required');
    return c.json(await saveTemplate(ctxOf(c), { templateId: c.req.param('id'), revision: b.revision, active: b.active, name: b.name, kind: b.kind, match: b.match, tasks: b.tasks }));
  });
  app.get('/lifecycle-tasks', async c => c.json(await myLifecycleTasks(ctxOf(c))));
  app.post('/lifecycle-tasks/:id/complete', async c => c.json(await completeLifecycleTask(ctxOf(c), c.req.param('id'), await jsonBody(c))));
  app.post('/lifecycle-tasks/:id/waive', async c => c.json(await waiveLifecycleTask(ctxOf(c), c.req.param('id'), await jsonBody(c))));
}

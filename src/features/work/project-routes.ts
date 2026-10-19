import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { addMilestone, addTask, createProject, linkProject, listProjects, readProject, setProjectStatus, updateTask, workload } from './projects';
/** PROJECT-001: IT team projects, their board/timeline read and each agent's combined workload. */
export function registerProjectRoutes(app: Hono<AppEnv>) {
  const ctx = (c: any) => ({ env: c.env, principal: c.get('principal') });
  app.get('/projects', async c => c.json({ items: await listProjects(ctx(c)) }));
  app.post('/projects', async c => c.json(await createProject(ctx(c), await jsonBody(c)), 201));
  app.get('/projects/:id', async c => c.json(await readProject(ctx(c), c.req.param('id'))));
  app.post('/projects/:id/status', async c => c.json(await setProjectStatus(ctx(c), c.req.param('id'), await jsonBody(c))));
  app.post('/projects/:id/milestones', async c => c.json(await addMilestone(ctx(c), c.req.param('id'), await jsonBody(c)), 201));
  app.post('/projects/:id/tasks', async c => c.json(await addTask(ctx(c), c.req.param('id'), await jsonBody(c)), 201));
  app.post('/projects/:id/tasks/:taskId', async c => c.json(await updateTask(ctx(c), c.req.param('id'), c.req.param('taskId'), await jsonBody(c))));
  app.post('/projects/:id/links', async c => c.json(await linkProject(ctx(c), c.req.param('id'), await jsonBody(c))));
  app.get('/workload', async c => c.json({ items: await workload(ctx(c)) }));
}

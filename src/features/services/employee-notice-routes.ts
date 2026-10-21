import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, jsonBody } from '../../platform/http';
import { employeeNotices, manageNotices, publishNotice } from './employee-notices';
export function registerEmployeeNotices(app: Hono<AppEnv>) {
  app.get('/service-notices', async c => c.json(await employeeNotices(c.env, c.get('principal'))));
  app.post('/service-notices/suggestions', async c => {
    const b = await jsonBody(c);
    if (typeof b.question !== 'string' || b.question.length > 50000) throw new ApiError(422, 'notice_question', 'A question of at most 50000 characters is required');
    return c.json(await employeeNotices(c.env, c.get('principal'), b.question));
  });
  for (const path of ['incidents', 'changes', 'releases']) {
    app.get(`/${path}/:id/notices`, async c => c.json(await manageNotices(c.env, c.get('principal'), c.req.param('id'))));
    app.post(`/${path}/:id/notices`, async c => c.json(await publishNotice(c.env, c.get('principal'), c.req.param('id'), await jsonBody(c)), 201));
    for (const command of ['update', 'all-clear', 'withdraw'])
      app.post(`/${path}/:id/notices/:noticeId/${command}`, async c => c.json(await publishNotice(c.env, c.get('principal'), c.req.param('id'), await jsonBody(c), c.req.param('noticeId'), command)));
  }
}

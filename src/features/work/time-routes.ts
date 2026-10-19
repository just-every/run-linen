import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { listTime, recordTime, updateTimer } from './time';
import { effortReport } from './effort-report';
export function registerTimeRoutes(app: Hono<AppEnv>) {
  app.get('/work/:id/time', async c=>c.json({items:await listTime({env:c.env,principal:c.get('principal')},c.req.param('id'))}));
  app.post('/work/:id/time', async c=>c.json(await recordTime({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c) as never),201));
  app.post('/work/:id/time/:entryId', async c=>c.json(await updateTimer({env:c.env,principal:c.get('principal')},c.req.param('id'),c.req.param('entryId'),await jsonBody(c) as never)));
  app.get('/reports/effort', async c=>c.json(await effortReport({env:c.env,principal:c.get('principal')},c.req.query('from')||'',c.req.query('to')||'')));
}

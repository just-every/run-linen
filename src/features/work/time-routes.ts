import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { listTime, recordTime, updateTimer } from './time';
import { effortReport, workSavedReport } from './effort-report';
import { declareLaborRates, readLaborRates } from './labor-rates';
export function registerTimeRoutes(app: Hono<AppEnv>) {
  app.get('/work/:id/time', async c=>c.json({items:await listTime({env:c.env,principal:c.get('principal')},c.req.param('id'))}));
  app.post('/work/:id/time', async c=>c.json(await recordTime({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c) as never),201));
  app.post('/work/:id/time/:entryId', async c=>c.json(await updateTimer({env:c.env,principal:c.get('principal')},c.req.param('id'),c.req.param('entryId'),await jsonBody(c) as never)));
  app.get('/reports/labor-rates', async c=>c.json(await readLaborRates({env:c.env,principal:c.get('principal')})));
  app.post('/reports/labor-rates', async c=>c.json(await declareLaborRates({env:c.env,principal:c.get('principal')},await jsonBody(c) as never)));
  app.get('/reports/work-saved', async c=>c.json(await workSavedReport({env:c.env,principal:c.get('principal')},{baselineFrom:c.req.query('baselineFrom')||'',baselineTo:c.req.query('baselineTo')||'',currentFrom:c.req.query('currentFrom')||'',currentTo:c.req.query('currentTo')||'',requestTypes:c.req.queries('requestType')})));
  app.get('/reports/effort', async c=>c.json(await effortReport({env:c.env,principal:c.get('principal')},c.req.query('from')||'',c.req.query('to')||'')));
}

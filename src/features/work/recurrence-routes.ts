import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { listRecurringPlans, createRecurringPlan, setRecurringEnabled, recurringTasks, completeRecurringTask } from './recurrence';
export function registerRecurrenceRoutes(app:Hono<AppEnv>) {
  app.get('/recurring-work',async c=>c.json(await listRecurringPlans({env:c.env,principal:c.get('principal')})));
  app.post('/recurring-work',async c=>c.json(await createRecurringPlan({env:c.env,principal:c.get('principal')},await jsonBody(c)),201));
  app.post('/recurring-work/:id',async c=>c.json(await setRecurringEnabled({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c))));
  app.get('/work/:id/recurring-tasks',async c=>c.json({items:await recurringTasks({env:c.env,principal:c.get('principal')},c.req.param('id'))}));
  app.post('/work/:id/recurring-tasks/:task',async c=>c.json(await completeRecurringTask({env:c.env,principal:c.get('principal')},c.req.param('id'),c.req.param('task'),await jsonBody(c))));
}

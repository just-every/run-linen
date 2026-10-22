import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { createDepartment, departments, editDepartment } from './department-admin';
import { handoffDepartment } from './department-handoff';
export function registerDepartmentRoutes(app:Hono<AppEnv>) {
  const context=(c:any)=>({env:c.env,principal:c.get('principal')});
  app.get('/departments/admin',async c=>c.json(await departments(context(c),true)));
  app.get('/departments',async c=>c.json(await departments(context(c))));
  app.post('/departments',async c=>c.json(await createDepartment(context(c),await jsonBody(c)),201));
  app.post('/departments/:id',async c=>c.json(await editDepartment(context(c),c.req.param('id'),await jsonBody(c))));
  app.post('/departments/:id/members',async c=>c.json(await editDepartment(context(c),c.req.param('id'),await jsonBody(c),true)));
  app.post('/work/:id/department',async c=>c.json(await handoffDepartment(context(c),c.req.param('id'),await jsonBody(c))));
}

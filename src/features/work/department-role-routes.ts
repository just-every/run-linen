import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { departmentRoles,createDepartmentRole,editDepartmentRole,setDepartmentRoleMember } from './department-role-admin';
export function registerDepartmentRoleRoutes(app:Hono<AppEnv>) {
  const context=(c:any)=>({env:c.env,principal:c.get('principal')});
  app.get('/department-roles',async c=>c.json(await departmentRoles(context(c))));
  app.post('/department-roles',async c=>c.json(await createDepartmentRole(context(c),await jsonBody(c)),201));
  app.post('/department-roles/:id',async c=>c.json(await editDepartmentRole(context(c),c.req.param('id'),await jsonBody(c))));
  app.post('/department-roles/:id/members',async c=>c.json(await setDepartmentRoleMember(context(c),c.req.param('id'),await jsonBody(c))));
}

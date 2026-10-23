import { getWork } from './core';
import { workTransitionAllowed } from './scope';
import { resolutionCodes } from './desk-fields';
import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, jsonBody } from '../../platform/http';
import { departmentRoles,createDepartmentRole,editDepartmentRole,setDepartmentRoleMember } from './department-role-admin';
export function registerDepartmentRoleRoutes(app:Hono<AppEnv>) {
  const context=(c:any)=>({env:c.env,principal:c.get('principal')});
  app.get('/work/:id/command-options',async c=>{
    const ctx=context(c),work=await getWork(ctx,c.req.param('id'));
    if(!workTransitionAllowed(ctx.principal,work,'close'))throw new ApiError(403,'ticket_transition','Current status permission required');
    const statuses=(await ctx.env.DB.prepare('SELECT id,name,waiting_on waitingOn FROM work_custom_statuses WHERE workspace_id=? ORDER BY created_at,name').bind(ctx.principal.workspaceId).all()).results;
    return c.json({statuses,resolutionCodes:await resolutionCodes(ctx)});
  });
  app.get('/department-roles',async c=>c.json(await departmentRoles(context(c))));
  app.post('/department-roles',async c=>c.json(await createDepartmentRole(context(c),await jsonBody(c)),201));
  app.post('/department-roles/:id',async c=>c.json(await editDepartmentRole(context(c),c.req.param('id'),await jsonBody(c))));
  app.post('/department-roles/:id/members',async c=>c.json(await setDepartmentRoleMember(context(c),c.req.param('id'),await jsonBody(c))));
}

import { activeCatalogDepartment } from './department-operations';
import { departmentStaff } from './department-spaces';
import { audienceEvaluation } from './catalog-audience';
import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, jsonBody } from '../../platform/http';
import { getWork } from './core';
import { applications, saveApplication } from './application-registry';
import { applicationProjection, resolveApplication, type ApplicationSnapshot } from './application-catalog';
import { currentWorkPrincipal } from './identity';
export function registerApplicationRoutes(app: Hono<AppEnv>) {
  app.get('/applications',async c=>c.json({items:await applications({env:c.env,principal:c.get('principal')})}));
  app.post('/applications',async c=>c.json(await saveApplication({env:c.env,principal:c.get('principal')},await jsonBody(c)),201));
  app.post('/applications/:id',async c=>c.json(await saveApplication({env:c.env,principal:c.get('principal')},await jsonBody(c),c.req.param('id'))));
  app.get('/work/:id/application-services',async c=>{
    const ctx={env:c.env,principal:c.get('principal')};await getWork(ctx,c.req.param('id'));
    const rows=(await c.env.DB.prepare('SELECT application_json FROM work_fulfilments WHERE workspace_id=? AND work_id=? AND application_json IS NOT NULL').bind(ctx.principal.workspaceId,c.req.param('id')).all<{application_json:string}>()).results;
    return c.json({items:rows.map(r=>applicationProjection(ctx,JSON.parse(r.application_json) as ApplicationSnapshot))});
  });
}
export async function catalogItems(ctx: {env: AppEnv['Bindings'];principal: AppEnv['Variables']['principal']}) {
  await currentWorkPrincipal(ctx);
  const items=(await ctx.env.DB.prepare('SELECT c.id,c.name,c.kind,c.target,c.owner_id,c.capacity,c.revision,c.form_json,c.audience_json,c.application_id,c.entitlement_id,c.tasks_json,c.approvals_json,c.manager_approval_json,c.requires_manager,c.department_id,d.name department_name FROM work_catalog c LEFT JOIN work_departments d ON d.workspace_id=c.workspace_id AND d.id=c.department_id WHERE c.workspace_id=?').bind(ctx.principal.workspaceId).all<any>()).results;
  const visible=[];
  for(const item of items) {
    if(!await activeCatalogDepartment(ctx,item))continue;
    if(!ctx.principal.roles.some(r=>['owner','operator','hr'].includes(r)) && !(await audienceEvaluation(ctx,item,ctx.principal.userId)).allowed)continue;
    visible.push(item);
  }
  return Promise.all(visible.map(async item=>{
    const {application_id,entitlement_id,form_json,audience_json,tasks_json,approvals_json,manager_approval_json,...base}=item;
    const canStaff=await departmentStaff(ctx,item.department_id);
    const publicItem={...base,departmentId:item.department_id??null,form:JSON.parse(form_json),...(canStaff && ctx.principal.roles.some(r=>['owner','operator','hr'].includes(r))?{tasks:JSON.parse(tasks_json)}:{}),...(ctx.principal.roles.includes('owner')?{audience:JSON.parse(audience_json),approvals:JSON.parse(approvals_json),managerApproval:manager_approval_json?JSON.parse(manager_approval_json):null}:{})};
    if(!application_id || !entitlement_id)return publicItem;
    try {return {...publicItem,application:applicationProjection(ctx,await resolveApplication(ctx,application_id,entitlement_id))};}
    catch(error) {if(!(error instanceof ApiError)||![404,409].includes(error.status))throw error;return {...publicItem,applicationUnavailable:true};}
  }));
}

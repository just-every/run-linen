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
  const items=(await ctx.env.DB.prepare('SELECT id,name,kind,target,owner_id,capacity,revision,form_json,application_id,entitlement_id FROM work_catalog WHERE workspace_id=?').bind(ctx.principal.workspaceId).all<any>()).results;
  return Promise.all(items.map(async item=>{
    const {application_id,entitlement_id,form_json,...base}=item;
    const publicItem={...base,form:JSON.parse(form_json)};
    if(!application_id || !entitlement_id)return publicItem;
    try {return {...publicItem,application:applicationProjection(ctx,await resolveApplication(ctx,application_id,entitlement_id))};}
    catch(error) {if(!(error instanceof ApiError)||![404,409].includes(error.status))throw error;return {...publicItem,applicationUnavailable:true};}
  }));
}

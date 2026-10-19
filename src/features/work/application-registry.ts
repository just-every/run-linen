import { ApiError, id, now, requiredString } from '../../platform/http';
import { create, getService, list } from '../services/store';
import { currentWorkPrincipal } from './identity';
import { permit, type WorkContext } from './core';
import { applicationData, type ApplicationData } from './application-schema';

async function members(ctx: WorkContext, ids: string[]) {
  for (const memberId of new Set(ids))
    if (!await ctx.env.DB.prepare('SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(ctx.principal.workspaceId, memberId).first())
      throw new ApiError(422, 'application_member', 'Application owner and approvers must be current active members');
}
async function audit(ctx: WorkContext, action: string, target: string) {
  await ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
    .bind(id(),ctx.principal.workspaceId,ctx.principal.userId,action,target,'{}',now()).run();
}
export async function applications(ctx: WorkContext) {
  await currentWorkPrincipal(ctx); permit(ctx,['owner','operator']);
  const items = await list(ctx.env.DB,ctx.principal,'application');
  await audit(ctx,'work.applications_read','registry');
  return items;
}
export async function saveApplication(ctx: WorkContext, input: Record<string, unknown>, applicationId?: string) {
  await currentWorkPrincipal(ctx); permit(ctx,['owner']);
  const previous = applicationId ? await getService(ctx.env.DB,ctx.principal,applicationId,'application') : null;
  const data = applicationData(input,previous?.data as ApplicationData | undefined);
  const ownerId = requiredString(input.ownerId,'ownerId');
  await members(ctx,[ownerId,...data.approverIds]);
  let result;
  if(previous) {
    if(input.revision!==previous.revision)throw new ApiError(409,'revision_conflict','Reload the current application registration');
    const t=now();
    const updated=await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE svc_records SET owner_id=?,data_json=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?').bind(ownerId,JSON.stringify(data),t,ctx.principal.workspaceId,previous.id,previous.revision),
      ctx.env.DB.prepare('INSERT INTO svc_events SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(id(),ctx.principal.workspaceId,previous.id,ctx.principal.userId,'application-updated',JSON.stringify({from:previous.revision,to:previous.revision+1}),t),
    ]);
    if(updated[0].meta.changes!==1)throw new ApiError(409,'revision_conflict','Application registration changed');
    result=await getService(ctx.env.DB,ctx.principal,previous.id,'application');
  } else result=await create(ctx.env.DB,ctx.principal,'application',data,{ownerId,visibility:'operators'});
  await audit(ctx,previous?'work.application_updated':'work.application_created',result.id);
  return result;
}

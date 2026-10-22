import {ticketHistory} from './work-history';
import { ApiError, id, now } from '../../platform/http';
import { getWork, type WorkContext } from './core';
import { getService } from '../services/store';

/** Exact service classification of a current requester's ordinary work; no caller-supplied owner. */
export async function classifyEmployeeIncident(ctx: WorkContext, workId: string, serviceId: string) {
  const work = await getWork(ctx, workId), service = await getService(ctx.env.DB, ctx.principal, serviceId, 'service');
  if (work.requester_id !== ctx.principal.userId || work.sensitivity !== 'normal' || ['cancelled','closed'].includes(work.state))
    throw new ApiError(403, 'intake_route_scope', 'Only the requester’s active ordinary work can be correlated');
  const member = await ctx.env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1')
    .bind(ctx.principal.workspaceId, service.ownerId).first<{roles_json:string}>();
  if (!member || !JSON.parse(member.roles_json).some((r:string) => ['owner','operator'].includes(r)))
    throw new ApiError(409, 'service_owner_unavailable', 'Current service operator required');
  const context = JSON.parse(work.context_json);
  if (work.kind !== 'incident' || context.serviceId !== service.id || work.assignee_id !== service.ownerId) {
    const result = await ctx.env.DB.batch([
      ctx.env.DB.prepare("UPDATE work_records SET kind='incident',assignee_id=?,context_json=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=? AND EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1) AND EXISTS(SELECT 1 FROM svc_records WHERE workspace_id=? AND id=? AND owner_id=? AND revision=?)")
        .bind(service.ownerId, JSON.stringify({...context, serviceId:service.id}), now(), ctx.principal.workspaceId, work.id, work.revision,ctx.principal.workspaceId,ctx.principal.userId,ctx.principal.workspaceId,service.id,service.ownerId,service.revision),
      ticketHistory(ctx,work,'work.service_routed',{type:work.kind,service:context.serviceId??null,assignee:work.assignee_id},{type:'incident',service:service.id,assignee:service.ownerId},now(),{metadata:{fields:{service:{label:service.data.name}}}}),
    ]);
    if (!result[0].meta.changes) throw new ApiError(409,'revision_conflict','Work changed during correlation');
  }
  return service;
}

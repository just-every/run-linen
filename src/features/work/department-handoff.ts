import {ticketHistory} from './work-history';
import { destinationAssignee } from './department-assignment';
import { protectedDepartments } from './scope';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { getWork, type WorkContext } from './core';
import { assertDepartmentConfig, getDepartment } from './department-spaces';

/** One revision-fenced move keeps the ticket, frozen fulfillment evidence and elapsed SLA intact. */
export async function handoffDepartment(ctx:WorkContext,workId:string,input:Record<string,unknown>) {
  if(!Object.hasOwn(input,'departmentId'))throw new ApiError(422,'department_required','Choose the destination workspace explicitly');
  const targetId=await assertDepartmentConfig(ctx,input.departmentId),work=await getWork(ctx,workId);
  const reason=requiredString(input.reason,'reason',2000),w=ctx.principal.workspaceId;
  if(!Number.isInteger(input.revision)||input.revision!==work.revision)throw new ApiError(409,'revision_conflict','Work changed; reload before handing it off');
  if(targetId===work.department_id)throw new ApiError(422,'department_same','Choose a different department workspace');
  const target=targetId?await getDepartment(ctx,targetId):null;
  // Retain every earlier HR boundary rather than granting the destination its history.
  const source=work.department_id?await getDepartment(ctx,work.department_id,false):null;
  const prior=protectedDepartments(work);
  if(prior===null)throw new ApiError(409,'protected_department_invalid','Retained workspace restrictions need owner review');
  const protectedJson=JSON.stringify([...new Set([...prior,...(source?.kind==='hr'?[source.id]:[])])]);
  let groupId=typeof input.groupId==='string'&&input.groupId?input.groupId:null;
  if(input.groupId===undefined&&work.group_id) {
    const existing=await ctx.env.DB.prepare('SELECT id FROM work_groups WHERE workspace_id=? AND id=? AND department_id IS ?').bind(w,work.group_id,targetId).first();
    if(existing)groupId=work.group_id;
  }
  if(groupId&&!await ctx.env.DB.prepare('SELECT id FROM work_groups WHERE workspace_id=? AND id=? AND department_id IS ?').bind(w,groupId,targetId).first())throw new ApiError(422,'department_group','Choose a group in the destination workspace');
  let assigneeId=typeof input.assigneeId==='string'&&input.assigneeId?input.assigneeId:null;
  const eligible=async(userId:string)=>{const query=destinationAssignee(ctx,userId,targetId,protectedJson,work.sensitivity,groupId);return ctx.env.DB.prepare(query.sql).bind(...query.bindings).first();};
  if(input.assigneeId===undefined&&work.assignee_id&&await eligible(work.assignee_id))assigneeId=work.assignee_id;
  if(assigneeId&&!await eligible(assigneeId))throw new ApiError(422,'department_assignee','Choose an authorized destination agent in its accountable group');
  const guard=id(),at=now(),eventId=id(),assignment=destinationAssignee(ctx,assigneeId,targetId,protectedJson,work.sensitivity,groupId);
  try { await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')
      AND (? IS NULL OR EXISTS(SELECT 1 FROM work_departments WHERE workspace_id=? AND id=? AND active=1 AND revision=?))
      AND EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=? AND revision=? AND department_id IS ? AND protected_departments_json=?) THEN 1 ELSE 0 END)`)
      .bind(guard,w,ctx.principal.userId,targetId,w,targetId,target?.revision??null,w,workId,input.revision,work.department_id??null,work.protected_departments_json??'[]'),
    ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN (? IS NULL OR EXISTS(SELECT 1 FROM work_groups g WHERE g.workspace_id=? AND g.id=? AND g.department_id IS ?))
      AND (? IS NULL OR EXISTS(${assignment.sql})) THEN 1 ELSE 0 END)`)
      .bind(guard+':assignment',groupId,w,groupId,targetId,assigneeId,...assignment.bindings),
    ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard+':assignment'),
    ctx.env.DB.prepare('UPDATE work_records SET department_id=?,protected_departments_json=?,group_id=?,assignee_id=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?').bind(targetId,protectedJson,groupId,assigneeId,at,w,workId,input.revision),
    ticketHistory(ctx,work,'work.department_handed_off',{department:work.department_id??null,group:work.group_id??null,assignee:work.assignee_id},{department:targetId,group:groupId,assignee:assigneeId},at,{id:eventId}),
    ctx.env.DB.prepare("INSERT INTO work_messages VALUES(?,?,?,?,'public',?,?,?)").bind(id(),w,workId,ctx.principal.userId,`Handed to ${target?.name??'the existing service workspace'}: ${reason}`,`transition:department:${eventId}`,at),
    ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard),
  ]); } catch(error){if(/CHECK constraint failed/i.test(String(error)))throw new ApiError(409,'department_changed','Ticket, department or current owner authority changed; reload');throw error;}
  return {work:await getWork(ctx,workId)};
}

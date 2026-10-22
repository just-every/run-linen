import { ApiError, id, now, requiredString } from '../../platform/http';
import { getWork, type WorkContext } from './core';
import { assertDepartmentConfig, getDepartment } from './department-spaces';

/** One revision-fenced move keeps the ticket, frozen fulfillment evidence and elapsed SLA intact. */
export async function handoffDepartment(ctx:WorkContext,workId:string,input:Record<string,unknown>) {
  const targetId=await assertDepartmentConfig(ctx,input.departmentId),work=await getWork(ctx,workId);
  const reason=requiredString(input.reason,'reason',2000),w=ctx.principal.workspaceId;
  if(!Number.isInteger(input.revision)||input.revision!==work.revision)throw new ApiError(409,'revision_conflict','Work changed; reload before handing it off');
  if(targetId===work.department_id)throw new ApiError(422,'department_same','Choose a different department workspace');
  const target=targetId?await getDepartment(ctx,targetId):null;
  // Moving a normal HR service ticket must never expose its retained HR history to another department.
  const source=work.department_id?await getDepartment(ctx,work.department_id,false):null;
  if(source?.kind==='hr'&&target?.kind!=='hr')throw new ApiError(422,'department_restrictions','HR workspace history must remain in an HR workspace; create a separately scoped service request for another team');
  let groupId=typeof input.groupId==='string'&&input.groupId?input.groupId:null;
  if(input.groupId===undefined&&work.group_id) {
    const existing=await ctx.env.DB.prepare('SELECT id FROM work_groups WHERE workspace_id=? AND id=? AND department_id IS ?').bind(w,work.group_id,targetId).first();
    if(existing)groupId=work.group_id;
  }
  if(groupId&&!await ctx.env.DB.prepare('SELECT id FROM work_groups WHERE workspace_id=? AND id=? AND department_id IS ?').bind(w,groupId,targetId).first())throw new ApiError(422,'department_group','Choose a group in the destination workspace');
  let assigneeId=typeof input.assigneeId==='string'&&input.assigneeId?input.assigneeId:null;
  const eligible=async(userId:string)=>ctx.env.DB.prepare(`SELECT 1 FROM memberships m WHERE m.workspace_id=? AND m.user_id=? AND m.active=1
    AND EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value IN ('owner','operator','hr'))
    AND (EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value='owner') OR ? IS NULL OR EXISTS(SELECT 1 FROM work_department_members dm WHERE dm.workspace_id=m.workspace_id AND dm.department_id=? AND dm.user_id=m.user_id AND dm.active=1))
    AND (?<>'hr' OR EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value IN ('owner','hr')))
    AND (? IS NULL OR EXISTS(SELECT 1 FROM work_group_members gm WHERE gm.workspace_id=m.workspace_id AND gm.group_id=? AND gm.user_id=m.user_id))`)
    .bind(w,userId,targetId,targetId,work.sensitivity,groupId,groupId).first();
  if(input.assigneeId===undefined&&work.assignee_id&&await eligible(work.assignee_id))assigneeId=work.assignee_id;
  if(assigneeId&&!await eligible(assigneeId))throw new ApiError(422,'department_assignee','Choose an authorized destination agent in its accountable group');
  const guard=id(),at=now(),eventId=id();
  try { await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')
      AND (? IS NULL OR EXISTS(SELECT 1 FROM work_departments WHERE workspace_id=? AND id=? AND active=1 AND revision=?))
      AND EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=? AND revision=? AND department_id IS ?) THEN 1 ELSE 0 END)`)
      .bind(guard,w,ctx.principal.userId,targetId,w,targetId,target?.revision??null,w,workId,input.revision,work.department_id??null),
    ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN (? IS NULL OR EXISTS(SELECT 1 FROM work_groups g WHERE g.workspace_id=? AND g.id=? AND g.department_id IS ?)) AND
      (? IS NULL OR EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=? AND m.user_id=? AND m.active=1
        AND EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value IN ('owner','operator','hr'))
        AND (EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value='owner') OR ? IS NULL OR EXISTS(SELECT 1 FROM work_department_members dm WHERE dm.workspace_id=m.workspace_id AND dm.department_id=? AND dm.user_id=m.user_id AND dm.active=1))
        AND (?<>'hr' OR EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value IN ('owner','hr')))
        AND (? IS NULL OR EXISTS(SELECT 1 FROM work_group_members gm WHERE gm.workspace_id=m.workspace_id AND gm.group_id=? AND gm.user_id=m.user_id)))) THEN 1 ELSE 0 END)`)
      .bind(guard+':assignment',groupId,w,groupId,targetId,assigneeId,w,assigneeId,targetId,targetId,work.sensitivity,groupId,groupId),
    ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard+':assignment'),
    ctx.env.DB.prepare('UPDATE work_records SET department_id=?,group_id=?,assignee_id=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?').bind(targetId,groupId,assigneeId,at,w,workId,input.revision),
    ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(eventId,w,ctx.principal.userId,'work.department_handed_off',workId,JSON.stringify({from:work.department_id??null,to:targetId,reason,groupId,assigneeId}),at),
    ctx.env.DB.prepare("INSERT INTO work_messages VALUES(?,?,?,?,'public',?,?,?)").bind(id(),w,workId,ctx.principal.userId,`Handed to ${target?.name??'the existing service workspace'}: ${reason}`,`department:${eventId}`,at),
    ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard),
  ]); } catch(error){if(/CHECK constraint failed/i.test(String(error)))throw new ApiError(409,'department_changed','Ticket, department or current owner authority changed; reload');throw error;}
  return {work:await getWork(ctx,workId)};
}

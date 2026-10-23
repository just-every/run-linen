import { scopedTicketSql } from './department-role-authority';
import { ApiError, id } from '../../platform/http';
import { currentWorkPrincipal } from './identity';
import { departmentStaffPrincipal, workPrivateReadable, type WorkScope } from './scope';
import type { WorkContext, WorkRecord } from './core';

export const departmentKinds = ['it','hr','facilities','finance','legal','custom'] as const;
export interface Department {id:string;workspace_id:string;name:string;kind:string;active:number;revision:number;created_at:string;updated_at:string}
export async function getDepartment(ctx:WorkContext,departmentId:string,active=true) {
  const row=await ctx.env.DB.prepare(`SELECT * FROM work_departments WHERE workspace_id=? AND id=? ${active?'AND active=1':''}`)
    .bind(ctx.principal.workspaceId,departmentId).first<Department>();
  if(!row)throw new ApiError(422,'department_unavailable','Choose an active department workspace in this installation');
  return row;
}
export async function departmentStaff(ctx:WorkContext,departmentId:string|null|undefined) {
  await currentWorkPrincipal(ctx);
  return departmentStaffPrincipal(ctx.principal,departmentId);
}
/** Owner configuration authority is separate from staff and employee readership. */
export async function assertDepartmentConfig(ctx:WorkContext,departmentId:unknown):Promise<string|null> {
  await currentWorkPrincipal(ctx);
  if(!ctx.principal.roles.includes('owner'))throw new ApiError(403,'department_admin','Only the owner configures department workspaces');
  if(departmentId===undefined || departmentId===null || departmentId==='')return null;
  if(typeof departmentId!=='string')throw new ApiError(422,'department_invalid','Choose a department workspace');
  return (await getDepartment(ctx,departmentId)).id;
}
export async function requestDepartment(ctx:WorkContext,departmentId:unknown) {
  if(departmentId===undefined || departmentId===null || departmentId==='')return null;
  if(typeof departmentId!=='string')throw new ApiError(422,'department_invalid','Choose a department workspace');
  return (await getDepartment(ctx,departmentId)).id;
}
export const departmentNotHrSql=(alias:string)=>`json_array_length(${alias}.protected_departments_json)=0 AND NOT EXISTS(SELECT 1 FROM work_departments dh WHERE dh.workspace_id=${alias}.workspace_id AND dh.id=${alias}.department_id AND dh.kind='hr')`;
/** SQL counterpart to the staff helper, for atomic public-door writes and credential grants. */
export function departmentStaffSql(work:string,member:string) {
  return `(EXISTS(SELECT 1 FROM json_each(${member}.roles_json) WHERE value='owner') OR
    (EXISTS(SELECT 1 FROM json_each(${member}.roles_json) WHERE value IN ('operator','hr')) AND
      (${work}.department_id IS NULL OR EXISTS(SELECT 1 FROM work_department_members dm JOIN work_departments d ON d.workspace_id=dm.workspace_id AND d.id=dm.department_id
        WHERE dm.workspace_id=${work}.workspace_id AND dm.department_id=${work}.department_id AND dm.user_id=${member}.user_id AND dm.active=1 AND d.active=1))))`;
}
/** Retained HR guards are additional to the current department, never replacement authority. */
export function workDepartmentStaffSql(work:string,member:string) {
  return `(${departmentStaffSql(work,member)} AND (EXISTS(SELECT 1 FROM json_each(${member}.roles_json) WHERE value='owner') OR
    NOT EXISTS(SELECT 1 FROM json_each(${work}.protected_departments_json) protected WHERE NOT EXISTS(
      SELECT 1 FROM work_department_members dm JOIN work_departments d ON d.workspace_id=dm.workspace_id AND d.id=dm.department_id
      WHERE dm.workspace_id=${work}.workspace_id AND dm.department_id=protected.value AND dm.user_id=${member}.user_id AND dm.active=1 AND d.active=1 AND d.kind='hr'))))`;
}
export function workReadSql(work='w',member='m',custom=true) {
  const roles=(list:string)=>`EXISTS(SELECT 1 FROM json_each(${member}.roles_json) WHERE value IN (${list}))`;
  const own=`(${work}.requester_id=${member}.user_id OR ${work}.beneficiary_id=${member}.user_id)`;
  return `(${custom?scopedTicketSql(work,member,'ticket.read'):'0'} OR ${roles("'owner'")} OR (${work}.sensitivity='hr' AND (${roles("'hr'")} AND ${workDepartmentStaffSql(work,member)} OR ${roles("'integration'")} AND ${work}.requester_id=${member}.user_id)) OR
    (${work}.sensitivity<>'hr' AND (${own} OR (${work}.sensitivity='normal' AND ${workDepartmentStaffSql(work,member)} AND (${work}.department_id IS NOT NULL OR json_array_length(${work}.protected_departments_json)>0 OR ${roles("'operator'")})))))`;
}
export function workPrivateSql(work='w',member='m',custom=true) {
  return `(${custom?scopedTicketSql(work,member,'ticket.private.read'):'0'} OR ${workDepartmentStaffSql(work,member)} AND (EXISTS(SELECT 1 FROM json_each(${member}.roles_json) WHERE value IN ('owner','operator')) OR ${work}.sensitivity='hr' AND EXISTS(SELECT 1 FROM json_each(${member}.roles_json) WHERE value='hr')))`;
}
/** Handoff and revocation between evaluation and commit must refuse the entire write. */
export async function departmentWorkBatch(ctx:WorkContext,work:WorkRecord & {department_id?:string|null},statements:D1PreparedStatement[],authority:'read'|'private'|'staff'|'reply'|'privateReply'|'transition'|'participantTransition'='read') {
  const guard=id(),w=ctx.principal.workspaceId;
  const rule=authority==='reply'?`(${workReadSql('w','m',false)} OR ${scopedTicketSql('w','m','ticket.reply')})`:authority==='privateReply'?`(${workPrivateSql('w','m',false)} OR ${scopedTicketSql('w','m','ticket.private.reply')})`:authority==='transition'?`((${workReadSql('w','m',false)} AND ${workDepartmentStaffSql('w','m')}) OR ${scopedTicketSql('w','m','ticket.transition')})`:authority==='participantTransition'?`(${workReadSql('w','m',false)} OR ${scopedTicketSql('w','m','ticket.transition')})`:authority==='private'?workPrivateSql():authority==='staff'?`${workReadSql()} AND ${workDepartmentStaffSql('w','m')}`:workReadSql();
  try { const result=await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM work_records w JOIN memberships m ON m.workspace_id=w.workspace_id
      WHERE w.workspace_id=? AND w.id=? AND w.revision=? AND w.department_id IS ? AND w.protected_departments_json=? AND m.user_id=? AND m.active=1 AND ${rule}) THEN 1 ELSE 0 END)`)
      .bind(guard,w,work.id,work.revision,work.department_id??null,work.protected_departments_json??'[]',ctx.principal.userId),
    ...statements,ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard),
  ]); return result.slice(1,-1); } catch(error) {if(/CHECK constraint failed/i.test(String(error)))throw new ApiError(409,'department_authority_changed','Ticket workspace or current authority changed; reload');throw error;}
}
export function requireWorkPrivate(ctx:WorkContext,work:WorkScope) {
  if(!workPrivateReadable(ctx.principal,work))throw new ApiError(403,'private_note','Private evidence requires current department staff authority');
}

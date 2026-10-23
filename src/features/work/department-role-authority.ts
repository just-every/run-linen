import type { Principal } from '../../platform/types';
import type { WorkScope } from './scope';
export const rolePermissions = [
  {id:'ticket.read',label:'Read tickets'},
  {id:'ticket.private.read',label:'Read private notes'},
  {id:'ticket.reply',label:'Reply publicly'},
  {id:'ticket.private.reply',label:'Reply privately'},
  {id:'ticket.transition',label:'Update ticket status'},
  {id:'ticket.attachment.read',label:'Read ticket attachments'},
  {id:'ticket.attachment.write',label:'Add ticket attachments'},
] as const;
export type TicketPermission = typeof rolePermissions[number]['id'];
export interface DepartmentRoleGrant {id:string;name:string;departmentId:string;permissions:TicketPermission[];revision:number}
export async function liveDepartmentRoles(db:D1Database,workspaceId:string,userId:string):Promise<DepartmentRoleGrant[]> {
  const rows=await db.prepare(`SELECT r.id,r.name,r.department_id departmentId,r.permissions_json,r.revision FROM work_department_roles r
    JOIN work_department_role_members g ON g.workspace_id=r.workspace_id AND g.role_id=r.id AND g.role_revision=r.revision
    JOIN work_departments d ON d.workspace_id=r.workspace_id AND d.id=r.department_id
    JOIN memberships m ON m.workspace_id=g.workspace_id AND m.user_id=g.user_id
    WHERE r.workspace_id=? AND g.user_id=? AND r.active=1 AND g.active=1 AND d.active=1 AND d.kind<>'hr' AND m.active=1
      AND NOT EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value='integration')
      AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=g.workspace_id AND e.person_id=g.user_id) ORDER BY r.id`)
    .bind(workspaceId,userId).all<{id:string;name:string;departmentId:string;permissions_json:string;revision:number}>();
  return rows.results.map(({permissions_json,...r})=>({...r,permissions:JSON.parse(permissions_json)}));
}
/** Custom grants never supply authority over HR history, restricted or legacy tickets. */
export function scopedTicketPermission(p:Principal,row:WorkScope,permission:TicketPermission) {
  return row.sensitivity==='normal' && Boolean(row.department_id) && (row.protected_departments_json??'[]')==='[]' &&
    p.departmentRoles?.some(r=>r.departmentId===row.department_id&&r.permissions.includes(permission))===true;
}
export function scopedTicketSql(work:string,member:string,permission:TicketPermission) {
  return `(${work}.sensitivity='normal' AND json_array_length(${work}.protected_departments_json)=0 AND EXISTS(
    SELECT 1 FROM work_department_roles cr JOIN work_department_role_members cg ON cg.workspace_id=cr.workspace_id AND cg.role_id=cr.id AND cg.role_revision=cr.revision
    JOIN work_departments cd ON cd.workspace_id=cr.workspace_id AND cd.id=cr.department_id
    JOIN memberships cm ON cm.workspace_id=cg.workspace_id AND cm.user_id=cg.user_id
    WHERE cr.workspace_id=${work}.workspace_id AND cr.department_id=${work}.department_id AND cg.user_id=${member}.user_id
    AND cr.active=1 AND cg.active=1 AND cd.active=1 AND cd.kind<>'hr' AND cm.active=1
    AND NOT EXISTS(SELECT 1 FROM json_each(cm.roles_json) WHERE value='integration')
    AND NOT EXISTS(SELECT 1 FROM work_erasure ce WHERE ce.workspace_id=cg.workspace_id AND ce.person_id=cg.user_id)
    AND EXISTS(SELECT 1 FROM json_each(cr.permissions_json) WHERE value='${permission}')))`;
}

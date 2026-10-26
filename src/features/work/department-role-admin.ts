import { ApiError, id, now, requiredString } from '../../platform/http';
import type { WorkContext } from './core';
import { assertDepartmentConfig, getDepartment } from './department-spaces';
import { rolePermissions } from './department-role-authority';
interface Definition {id:string;department_id:string;name:string;permissions_json:string;revision:number;active:number}
const conflict=()=>new ApiError(409,'role_changed','Role, assignment or owner authority changed; reload');
export function validateRolePermissions(value:unknown) {
  if(!Array.isArray(value)||!value.length||value.some(v=>typeof v!=='string'||!rolePermissions.some(p=>p.id===v))||new Set(value).size!==value.length||!value.includes('ticket.read')||value.includes('ticket.private.reply')&&(!value.includes('ticket.private.read')||!value.includes('ticket.reply'))||value.includes('ticket.attachment.write')&&(!value.includes('ticket.attachment.read')||!value.includes('ticket.reply')))
    throw new ApiError(422,'role_permissions','Choose read access and the explicit ticket permissions this role needs');
  return [...value].sort();
}
async function commit(ctx:WorkContext,statements:D1PreparedStatement[],action:string,target:string,detail:unknown) {
  const key=id();
  try { await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner') THEN 1 ELSE 0 END)`).bind(key,ctx.principal.workspaceId,ctx.principal.userId),
    ...statements,
    ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),ctx.principal.workspaceId,ctx.principal.userId,action,target,JSON.stringify(detail),now()),
    ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(key),
  ]); } catch(error) {if(/CHECK constraint failed/i.test(String(error)))throw conflict();if(/UNIQUE/i.test(String(error)))throw new ApiError(409,'role_exists','This department already has a role with that name');throw error;}
}
// Guard rows are transaction assertions. Their identifiers are removed in the same batch.
async function guardedCommit(ctx:WorkContext,checks:{sql:string;values:unknown[]}[],statements:D1PreparedStatement[],action:string,target:string,detail:unknown) {
  const ids=checks.map(()=>id());
  await commit(ctx,[...checks.map((c,i)=>ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN ${c.sql} THEN 1 ELSE 0 END)`).bind(ids[i],...c.values)),...statements,...ids.map(key=>ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(key))],action,target,detail);
}
export async function departmentRoles(ctx:WorkContext) {
  await assertDepartmentConfig(ctx,null);const w=ctx.principal.workspaceId;
  const definitions=(await ctx.env.DB.prepare(`SELECT r.*,d.name department_name FROM work_department_roles r JOIN work_departments d ON d.workspace_id=r.workspace_id AND d.id=r.department_id WHERE r.workspace_id=? ORDER BY d.name,r.name`).bind(w).all<Definition&{department_name:string}>()).results;
  const items=[];
  for(const r of definitions) {
    const members=(await ctx.env.DB.prepare(`SELECT g.user_id userId,u.name,g.active,g.role_revision roleRevision,g.revision FROM work_department_role_members g JOIN users u ON u.id=g.user_id WHERE g.workspace_id=? AND g.role_id=? ORDER BY u.name`).bind(w,r.id).all<any>()).results;
    items.push({id:r.id,name:r.name,departmentId:r.department_id,departmentName:r.department_name,permissions:JSON.parse(r.permissions_json),revision:r.revision,active:Boolean(r.active),members:members.map(m=>({...m,active:Boolean(m.active)&&m.roleRevision===r.revision&&Boolean(r.active)}))});
  }
  const people=(await ctx.env.DB.prepare(`SELECT u.id,u.name,u.email,m.roles_json FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND m.active=1 AND NOT EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value='integration') AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=m.workspace_id AND e.person_id=m.user_id) ORDER BY u.name`).bind(w).all<any>()).results.map(({roles_json,...p})=>({...p,roles:JSON.parse(roles_json)}));
  const departments=(await ctx.env.DB.prepare("SELECT id,name,kind FROM work_departments WHERE workspace_id=? AND active=1 AND kind<>'hr' ORDER BY name").bind(w).all()).results;
  return {items,people,departments,permissions:rolePermissions};
}
async function definition(ctx:WorkContext,roleId:string) {
  await assertDepartmentConfig(ctx,null);
  const row=await ctx.env.DB.prepare('SELECT * FROM work_department_roles WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,roleId).first<Definition>();
  if(!row)throw new ApiError(404,'role_not_found','Role not found');return row;
}
export async function createDepartmentRole(ctx:WorkContext,input:Record<string,unknown>) {
  await assertDepartmentConfig(ctx,null);
  const department=await getDepartment(ctx,requiredString(input.departmentId,'departmentId'));
  if(department.kind==='hr')throw new ApiError(422,'role_department','Custom roles cannot grant HR access');
  const name=requiredString(input.name,'name',120),perms=validateRolePermissions(input.permissions),roleId=id(),at=now(),w=ctx.principal.workspaceId;
  await guardedCommit(ctx,[{sql:"EXISTS(SELECT 1 FROM work_departments WHERE workspace_id=? AND id=? AND active=1 AND kind<>'hr')",values:[w,department.id]}],[ctx.env.DB.prepare('INSERT INTO work_department_roles VALUES(?,?,?,?,?,1,1,?,?,?)').bind(roleId,w,department.id,name,JSON.stringify(perms),ctx.principal.userId,at,at)],'work.department_role_created',roleId,{departmentId:department.id,permissions:perms});
  return (await departmentRoles(ctx)).items.find(r=>r.id===roleId)!;
}
export async function editDepartmentRole(ctx:WorkContext,roleId:string,input:Record<string,unknown>) {
  const before=await definition(ctx,roleId),w=ctx.principal.workspaceId;
  if(input.revision!==before.revision)throw conflict();
  if(input.departmentId!==undefined&&input.departmentId!==before.department_id)throw new ApiError(422,'role_department_immutable','Create a new role for a different department');
  if(typeof input.active!=='boolean')throw new ApiError(422,'role_active','Choose whether this role is active');
  const name=requiredString(input.name,'name',120),perms=validateRolePermissions(input.permissions),at=now();
  await guardedCommit(ctx,[{sql:'EXISTS(SELECT 1 FROM work_department_roles WHERE workspace_id=? AND id=? AND revision=?)',values:[w,roleId,before.revision]}],[
    ctx.env.DB.prepare('UPDATE work_department_roles SET name=?,permissions_json=?,active=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=?').bind(name,JSON.stringify(perms),Number(input.active),at,w,roleId),
    ctx.env.DB.prepare('UPDATE work_department_role_members SET active=0,revision=revision+1,updated_at=? WHERE workspace_id=? AND role_id=?').bind(at,w,roleId),
  ],'work.department_role_edited',roleId,{revision:before.revision+1,active:input.active,permissions:perms,assignmentsWithdrawn:true});
  return (await departmentRoles(ctx)).items.find(r=>r.id===roleId)!;
}
export async function setDepartmentRoleMember(ctx:WorkContext,roleId:string,input:Record<string,unknown>) {
  const role=await definition(ctx,roleId),w=ctx.principal.workspaceId,userId=requiredString(input.userId,'userId'),at=now();
  if(input.roleRevision!==role.revision||!Number.isInteger(input.revision))throw conflict();
  if(typeof input.active!=='boolean')throw new ApiError(422,'role_member','Choose whether this assignment is active');
  const member=await ctx.env.DB.prepare(`SELECT 1 FROM memberships m WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND NOT EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value='integration') AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=m.workspace_id AND e.person_id=m.user_id)`).bind(w,userId).first();
  if(!member)throw new ApiError(422,'role_member','Choose a current human member');
  if(input.active&&(!role.active||(await getDepartment(ctx,role.department_id)).kind==='hr'))throw new ApiError(422,'role_inactive','Activate the role and its department before granting access');
  await guardedCommit(ctx,[
    {sql:`EXISTS(SELECT 1 FROM work_department_roles r JOIN work_departments d ON d.workspace_id=r.workspace_id AND d.id=r.department_id WHERE r.workspace_id=? AND r.id=? AND r.revision=? AND (?=0 OR r.active=1 AND d.active=1 AND d.kind<>'hr'))`,values:[w,roleId,role.revision,Number(input.active)]},
    {sql:`EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND NOT EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value='integration') AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=m.workspace_id AND e.person_id=m.user_id))`,values:[w,userId]},
    {sql:'COALESCE((SELECT revision FROM work_department_role_members WHERE workspace_id=? AND role_id=? AND user_id=?),0)=?',values:[w,roleId,userId,input.revision]},
  ],[ctx.env.DB.prepare(`INSERT INTO work_department_role_members VALUES(?,?,?,?,1,?,?,?,?) ON CONFLICT(workspace_id,role_id,user_id) DO UPDATE SET role_revision=excluded.role_revision,revision=revision+1,active=excluded.active,granted_by=excluded.granted_by,updated_at=excluded.updated_at`).bind(w,roleId,userId,role.revision,Number(input.active),ctx.principal.userId,at,at)],'work.department_role_member_set',roleId,{userId,active:input.active,roleRevision:role.revision});
  return (await departmentRoles(ctx)).items.find(r=>r.id===roleId)!;
}

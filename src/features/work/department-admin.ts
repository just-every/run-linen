import { ApiError, id, now, requiredString } from '../../platform/http';
import type { WorkContext } from './core';
import { assertDepartmentConfig, departmentKinds, departmentStaff, getDepartment, type Department } from './department-spaces';

const metadata=(d:Department,canStaff:boolean)=>({id:d.id,name:d.name,kind:d.kind,active:Boolean(d.active),revision:d.revision,canStaff});
export async function departments(ctx:WorkContext,admin=false) {
  if(admin)await assertDepartmentConfig(ctx,null);
  else await departmentStaff(ctx,null);
  const owner=ctx.principal.roles.includes('owner'),w=ctx.principal.workspaceId;
  const rows=(await ctx.env.DB.prepare(`SELECT * FROM work_departments WHERE workspace_id=? ${owner?'':'AND active=1'} ORDER BY name`).bind(w).all<Department>()).results;
  const items=[];
  for(const d of rows) {
    const item={...metadata(d,await departmentStaff(ctx,d.id)),...(admin?{members:(await ctx.env.DB.prepare(`SELECT dm.user_id userId,u.name,u.email,dm.active FROM work_department_members dm JOIN users u ON u.id=dm.user_id WHERE dm.workspace_id=? AND dm.department_id=? ORDER BY u.name`).bind(w,d.id).all<any>()).results.map(m=>({...m,active:Boolean(m.active)}))}:{})};
    items.push(item);
  }
  const people=admin?(await ctx.env.DB.prepare(`SELECT u.id,u.name,u.email,m.roles_json FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND m.active=1 AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=m.workspace_id AND e.person_id=m.user_id) ORDER BY u.name`).bind(w).all<any>()).results.map(p=>({id:p.id,name:p.name,email:p.email,roles:JSON.parse(p.roles_json)})):undefined;
  return {items,...(admin?{people}:{})};
}
const audit=(ctx:WorkContext,action:string,target:string,detail:unknown,at:string)=>ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),ctx.principal.workspaceId,ctx.principal.userId,action,target,JSON.stringify(detail),at);
async function ownerBatch(ctx:WorkContext,statements:D1PreparedStatement[]) {
  const guard=id();
  try { await ctx.env.DB.batch([ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner') THEN 1 ELSE 0 END)`).bind(guard,ctx.principal.workspaceId,ctx.principal.userId),...statements,ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard)]); }
  catch(error){if(/CHECK constraint failed/i.test(String(error)))throw new ApiError(409,'department_changed','Department or current owner authority changed; reload');if(/UNIQUE/i.test(String(error)))throw new ApiError(409,'department_exists','A department workspace with this name exists');throw error;}
}
export async function createDepartment(ctx:WorkContext,input:Record<string,unknown>) {
  await assertDepartmentConfig(ctx,null);
  const name=requiredString(input.name,'name',120),kind=requiredString(input.kind,'kind'),departmentId=id(),at=now();
  if(!departmentKinds.includes(kind as never))throw new ApiError(422,'department_kind','Choose a service department kind');
  await ownerBatch(ctx,[ctx.env.DB.prepare('INSERT INTO work_departments VALUES(?,?,?,?,1,1,?,?)').bind(departmentId,ctx.principal.workspaceId,name,kind,at,at),audit(ctx,'work.department_created',departmentId,{kind},at)]);
  return (await departments(ctx,true)).items.find(d=>d.id===departmentId)!;
}
export async function editDepartment(ctx:WorkContext,departmentId:string,input:Record<string,unknown>,membership=false) {
  await assertDepartmentConfig(ctx,null);const before=await getDepartment(ctx,departmentId,false),at=now(),w=ctx.principal.workspaceId;
  if(!Number.isInteger(input.revision)||input.revision!==before.revision)throw new ApiError(409,'department_changed','Department changed; reload');
  const statements:D1PreparedStatement[]=[];
  if(membership) {
    const userId=requiredString(input.userId,'userId');
    if(typeof input.active!=='boolean')throw new ApiError(422,'department_member','Choose active membership');
    const member=await ctx.env.DB.prepare(`SELECT roles_json FROM memberships m WHERE workspace_id=? AND user_id=? AND active=1 AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=m.workspace_id AND e.person_id=m.user_id)`).bind(w,userId).first<{roles_json:string}>();
    if(!member || input.active&&!JSON.parse(member.roles_json).some((r:string)=>['owner','operator','hr'].includes(r)))throw new ApiError(422,'department_member','Choose a current service agent or HR member');
    const memberGuard=id();
    statements.push(ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND m.roles_json=? AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=m.workspace_id AND e.person_id=m.user_id)) THEN 1 ELSE 0 END)`).bind(memberGuard,w,userId,member.roles_json),ctx.env.DB.prepare(`INSERT INTO work_department_members VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_id,department_id,user_id) DO UPDATE SET active=excluded.active,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(w,departmentId,userId,Number(input.active),ctx.principal.userId,at),audit(ctx,'work.department_member_set',departmentId,{userId,active:input.active},at),ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(memberGuard));
  }
  const name=membership?before.name:requiredString(input.name,'name',120),active=membership?before.active:input.active;
  if(!membership&&typeof active!=='boolean')throw new ApiError(422,'department_active','Choose whether the department workspace is active');
  const guard=id();
  await ownerBatch(ctx,[ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM work_departments WHERE workspace_id=? AND id=? AND revision=?) THEN 1 ELSE 0 END)`).bind(guard,w,departmentId,input.revision),
    ctx.env.DB.prepare('UPDATE work_departments SET name=?,active=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?').bind(name,Number(active),at,w,departmentId,input.revision),...statements,
    ...(!membership?[audit(ctx,'work.department_edited',departmentId,{revision:before.revision+1,active:Boolean(active)},at)]:[]),ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard)]);
  return (await departments(ctx,true)).items.find(d=>d.id===departmentId)!;
}

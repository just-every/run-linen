import type { Hono } from 'hono';
import type { AppEnv } from './types';
import { ApiError, auditStatement, id, jsonBody, now, requiredString, requireRole } from './http';

/** Custom roles grant public ticket reading only; all existing authorities remain independent. */
export function registerCustomRoleRoutes(app:Hono<AppEnv>) {
 const rolePath='/custom-roles/:id';
 app.get('/custom-roles',async c=>{
  const p=requireRole(c,'owner');
  return c.json({items:(await c.env.DB.prepare(`SELECT r.*,d.name department_name,
   (SELECT json_group_array(json_object('userId',a.user_id,'name',u.name,'active',a.active)) FROM platform_custom_role_members a JOIN users u ON u.id=a.user_id WHERE a.role_id=r.id AND a.workspace_id=r.workspace_id) members_json
   FROM platform_custom_roles r JOIN work_departments d ON d.id=r.department_id AND d.workspace_id=r.workspace_id WHERE r.workspace_id=? ORDER BY r.name`).bind(p.workspaceId).all()).results});
 });
 app.post('/custom-roles',async c=>{
  const p=requireRole(c,'owner'),b=await jsonBody(c),rid=id(),department=requiredString(b.departmentId,'departmentId'),name=requiredString(b.name,'name',120);
  if(b.permission!==undefined&&b.permission!=='work.public.read')throw new ApiError(422,'custom_role_permission','Only public ticket reading is available');
  const [result]=await c.env.DB.batch([
   c.env.DB.prepare(`INSERT OR IGNORE INTO platform_custom_roles SELECT ?,?,?,?,1,1,? WHERE EXISTS(SELECT 1 FROM work_departments WHERE workspace_id=? AND id=? AND active=1 AND kind<>'hr')
    AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')`).bind(rid,p.workspaceId,name,department,now(),p.workspaceId,department,p.workspaceId,p.userId),
   auditStatement(c,'custom_role.created',rid,{departmentId:department,permission:'work.public.read'},true),
  ]);
  if(!result.meta.changes)throw new ApiError(409,'custom_role_unavailable','Current owner and active non-HR department required');
  return c.json({id:rid,revision:1},201);
 });
 app.post(rolePath,async c=>{
  const p=requireRole(c,'owner'),b=await jsonBody(c),rid=requiredString(c.req.param('id'),'roleId');
  if(!Number.isInteger(b.revision)||typeof b.active!=='boolean')throw new ApiError(422,'custom_role_input','Revision and active state required');
  const [result]=await c.env.DB.batch([
   c.env.DB.prepare(`UPDATE platform_custom_roles SET active=?,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=? AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')`).bind(Number(b.active),p.workspaceId,rid,b.revision,p.workspaceId,p.userId),
   auditStatement(c,'custom_role.changed',rid,{active:b.active},true),
  ]);
  if(!result.meta.changes)throw new ApiError(409,'custom_role_changed','Role or owner authority changed; reload');
  return c.json({updated:true});
 });
 app.post(rolePath+'/members',async c=>{
  const p=requireRole(c,'owner'),b=await jsonBody(c),rid=requiredString(c.req.param('id'),'roleId'),uid=requiredString(b.userId,'userId');
  if(!Number.isInteger(b.revision)||typeof b.active!=='boolean')throw new ApiError(422,'custom_role_input','Revision and active state required');
  const guard=id();
  try {await c.env.DB.batch([
   c.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM platform_custom_roles r JOIN work_departments d ON d.id=r.department_id AND d.workspace_id=r.workspace_id WHERE r.workspace_id=? AND r.id=? AND r.revision=? AND r.active=1 AND d.active=1 AND d.kind<>'hr')
    AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')
    AND EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=m.workspace_id AND e.person_id=m.user_id)) THEN 1 ELSE 0 END)`).bind(guard,p.workspaceId,rid,b.revision,p.workspaceId,p.userId,p.workspaceId,uid),
   c.env.DB.prepare(`INSERT INTO platform_custom_role_members VALUES(?,?,?,?) ON CONFLICT(workspace_id,role_id,user_id) DO UPDATE SET active=excluded.active`).bind(p.workspaceId,rid,uid,Number(b.active)),
   c.env.DB.prepare('UPDATE platform_custom_roles SET revision=revision+1 WHERE workspace_id=? AND id=?').bind(p.workspaceId,rid),
   auditStatement(c,'custom_role.member_changed',rid,{userId:uid,active:b.active}),
   c.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard),
  ]);}catch(error){if(/CHECK constraint failed/i.test(String(error)))throw new ApiError(409,'custom_role_changed','Role, department or membership changed; reload');throw error;}
  return c.json({updated:true});
 });
}

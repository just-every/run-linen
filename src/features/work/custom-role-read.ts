import { id, now } from '../../platform/http';
import type { WorkContext } from './core';

/** A separate projection prevents a reading role from acquiring staff or catalog authority. */
export function customReadSql(work='w') {
 return `${work}.sensitivity='normal' AND json_array_length(${work}.protected_departments_json)=0 AND EXISTS(
  SELECT 1 FROM platform_custom_roles r JOIN platform_custom_role_members a ON a.role_id=r.id AND a.workspace_id=r.workspace_id
  JOIN memberships m ON m.workspace_id=a.workspace_id AND m.user_id=a.user_id
  JOIN work_departments d ON d.id=r.department_id AND d.workspace_id=r.workspace_id
  WHERE r.workspace_id=${work}.workspace_id AND r.department_id=${work}.department_id AND r.active=1 AND a.active=1 AND m.active=1 AND d.active=1 AND d.kind<>'hr'
   AND a.user_id=? AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=m.workspace_id AND e.person_id=m.user_id))`;
}
const fields=`w.id,w.workspace_id,w.department_id,w.title,w.kind,w.state,w.sensitivity,w.revision,w.created_at,w.updated_at,
 '' requester_id,'' beneficiary_id,'Not included in this view' requester_name,'Not included in this view' beneficiary_name,'Not included in this view' assignee_name,NULL assignee_id,'{}' context_json,'custom-read' access`;
export async function customRoleList(ctx:WorkContext,departmentId?:string|null) {
 const p=ctx.principal;
 return (await ctx.env.DB.prepare(`SELECT ${fields} FROM work_records w WHERE w.workspace_id=? AND ${customReadSql()} ${departmentId===undefined?'':'AND w.department_id IS ?'} ORDER BY w.updated_at DESC LIMIT 200`)
  .bind(p.workspaceId,p.userId,...(departmentId===undefined?[]:[departmentId])).all()).results;
}
export async function customRoleConversation(ctx:WorkContext,workId:string) {
 const p=ctx.principal,db=ctx.env.DB;
 const work=await db.prepare(`SELECT ${fields} FROM work_records w WHERE w.workspace_id=? AND w.id=? AND ${customReadSql()}`).bind(p.workspaceId,workId,p.userId).first();
 if(!work)return null;
 // The public messages query checks live authority again, including a concurrent handoff or revocation.
 const messages=await db.prepare(`SELECT x.id,'' author_id,x.visibility,x.body,x.created_at FROM work_messages x JOIN work_records w ON w.id=x.work_id AND w.workspace_id=x.workspace_id
  WHERE w.workspace_id=? AND w.id=? AND w.revision=? AND x.visibility='public' AND ${customReadSql()} ORDER BY x.created_at,x.id`).bind(p.workspaceId,workId,work.revision,p.userId).all();
 if(!await db.prepare(`SELECT 1 FROM work_records w WHERE w.workspace_id=? AND w.id=? AND w.revision=? AND ${customReadSql()}`).bind(p.workspaceId,workId,work.revision,p.userId).first())return null;
 await db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),p.workspaceId,p.userId,'custom_role.ticket_read',workId,'{}',now()).run();
 return {work,messages:messages.results,attachments:[],quotes:[],progress:[]};
}

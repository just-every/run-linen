import {ticketHistory} from './work-history';
import {destinationAssignee} from './department-assignment';
import { assertDepartmentConfig,departmentWorkBatch } from './department-spaces';
import { departmentRows,requireDepartmentStaff,requireWorkDepartmentStaff } from './department-operations';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { currentWorkPrincipal } from './identity';
import { getWork, listWork, permit, type WorkContext } from './core';

/** DESK-001: agent groups. The owner (acting for "admin" until that role exists) creates groups, adds agents and names
 * leads; each ticket has one accountable group and at most one owner (its assignee), who must be a member of that group.
 * A lead's view lists their group's tickets that are not restricted; restricted tickets stay visible only to the
 * workspace owner, the requester and the person it is for. */
const agentMember = "SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1 AND (roles_json LIKE '%\"operator\"%' OR roles_json LIKE '%\"owner\"%')";

async function group(ctx: WorkContext, groupId: string) {
  const row = await ctx.env.DB.prepare('SELECT id,name,department_id FROM work_groups WHERE workspace_id=? AND id=?')
    .bind(ctx.principal.workspaceId, groupId).first<{ id: string; name: string;department_id:string|null }>();
  if(row)await requireDepartmentStaff(ctx,row.department_id);
  if (!row) throw new ApiError(404, 'group_not_found', 'Agent group not found');
  return {...row,departmentId:row.department_id};
}

const audit = (ctx: WorkContext, type: string, target: string, data: unknown) =>
  ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
    .bind(id(), ctx.principal.workspaceId, ctx.principal.userId, type, target, JSON.stringify(data), now());

export async function listGroups(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'operator', 'hr']);
  const w = ctx.principal.workspaceId;
  const groups = (await ctx.env.DB.prepare('SELECT id,name,created_at,department_id,(SELECT name FROM work_departments d WHERE d.workspace_id=work_groups.workspace_id AND d.id=work_groups.department_id) department_name FROM work_groups WHERE workspace_id=? ORDER BY name').bind(w).all<{ id: string; name: string;created_at:string;department_id:string|null }>()).results;
  const members = (await ctx.env.DB.prepare(`SELECT m.group_id,m.user_id,m.lead,u.name FROM work_group_members m JOIN users u ON u.id=m.user_id
    WHERE m.workspace_id=? ORDER BY u.name`).bind(w).all<{ group_id: string; user_id: string; lead: number; name: string }>()).results;
  return {
    items: (await departmentRows(ctx,groups)).map((g) => ({
      ...g,
      members: members.filter((m) => m.group_id === g.id).map((m) => ({ userId: m.user_id, name: m.name, lead: Boolean(m.lead) })),
    })),
  };
}

export async function createGroup(ctx: WorkContext, body: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const name = requiredString(body.name, 'name', 120), groupId = id(),departmentId=await assertDepartmentConfig(ctx,body.departmentId);
  try {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('INSERT INTO work_groups(id,workspace_id,name,created_by,created_at,department_id) VALUES(?,?,?,?,?,?)').bind(groupId, ctx.principal.workspaceId, name, ctx.principal.userId, now(),departmentId),
      audit(ctx, 'work.group_created', groupId, { name }),
    ]);
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new ApiError(409, 'group_exists', 'An agent group with this name exists');
    throw error;
  }
  return group(ctx, groupId);
}

/** Adds an agent to a group or changes whether they lead it. */
export async function setGroupMember(ctx: WorkContext, groupId: string, body: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const target=await group(ctx, groupId);
  const userId = requiredString(body.userId, 'userId'), lead = body.lead === true;
  if (!await ctx.env.DB.prepare(agentMember).bind(ctx.principal.workspaceId, userId).first())
    throw new ApiError(422, 'member_not_agent', 'Group members must be active service agents');
  if(target.department_id && !await ctx.env.DB.prepare(`SELECT 1 FROM memberships m WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND (EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value='owner') OR EXISTS(SELECT 1 FROM work_department_members d JOIN work_departments s ON s.workspace_id=d.workspace_id AND s.id=d.department_id WHERE d.workspace_id=m.workspace_id AND d.user_id=m.user_id AND d.department_id=? AND d.active=1 AND s.active=1))`).bind(ctx.principal.workspaceId,userId,target.department_id).first())throw new ApiError(422,'department_member','Choose a current agent of this department');
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO work_group_members VALUES(?,?,?,?,?,?)
      ON CONFLICT(workspace_id,group_id,user_id) DO UPDATE SET lead=excluded.lead`).bind(ctx.principal.workspaceId, groupId, userId, Number(lead), ctx.principal.userId, now()),
    audit(ctx, 'work.group_member_set', groupId, { userId, lead }),
  ]);
  return listGroups(ctx);
}

/** Removing an agent who still owns one of the group's open tickets is refused: the owner must stay a member. */
export async function removeGroupMember(ctx: WorkContext, groupId: string, userId: string) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  await group(ctx, groupId);
  const w = ctx.principal.workspaceId;
  if (await ctx.env.DB.prepare("SELECT 1 FROM work_records WHERE workspace_id=? AND group_id=? AND assignee_id=? AND state NOT IN ('closed','cancelled')").bind(w, groupId, userId).first())
    throw new ApiError(409, 'member_owns_tickets', "Reassign this agent's open tickets in the group first");
  const [removed] = await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM work_group_members WHERE workspace_id=? AND group_id=? AND user_id=?').bind(w, groupId, userId),
    audit(ctx, 'work.group_member_removed', groupId, { userId }),
  ]);
  if (!removed.meta.changes) throw new ApiError(404, 'not_found', 'This agent is not in the group');
  return listGroups(ctx);
}

export async function groupMember(ctx: WorkContext, groupId: string, userId: string) {
  return Boolean(await ctx.env.DB.prepare('SELECT 1 FROM work_group_members WHERE workspace_id=? AND group_id=? AND user_id=?')
    .bind(ctx.principal.workspaceId, groupId, userId).first());
}

/** Sets a ticket's accountable group and, in the same change, optionally its owner; the owner must be a group member. */
export async function setWorkGroup(ctx: WorkContext, workId: string, body: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'operator']);
  const work = await getWork(ctx, workId), target = await group(ctx, requiredString(body.groupId, 'groupId'));
  await requireWorkDepartmentStaff(ctx,work);
  if((target.department_id??null)!==(work.department_id??null))throw new ApiError(422,'group_department','Choose a group in the ticket department');
  if (typeof body.revision !== 'number') throw new ApiError(422, 'revision_required', 'Send the ticket revision you read');
  const assigneeId = body.assigneeId === null ? null : typeof body.assigneeId === 'string' && body.assigneeId ? body.assigneeId : work.assignee_id;
  const assignment=destinationAssignee(ctx,assigneeId,work.department_id??null,work.protected_departments_json??'[]',work.sensitivity,target.id);
  if(assigneeId && !await ctx.env.DB.prepare(assignment.sql).bind(...assignment.bindings).first())throw new ApiError(422,'department_assignee','Choose a current agent authorized for the ticket restrictions');
  if (assigneeId && (!await groupMember(ctx, target.id, assigneeId) || !await ctx.env.DB.prepare(agentMember).bind(ctx.principal.workspaceId, assigneeId).first()))
    throw new ApiError(422, 'owner_not_in_group', `The ticket's owner must be an agent in ${target.name}`);
  const t = now();
  const [changed] = await departmentWorkBatch(ctx,work,[
    ctx.env.DB.prepare(`UPDATE work_records SET group_id=?,assignee_id=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=? AND (? IS NULL OR EXISTS(${assignment.sql}))`)
      .bind(target.id, assigneeId ?? null, t, ctx.principal.workspaceId, workId, body.revision,assigneeId??null,...assignment.bindings),
    ticketHistory(ctx,work,'work.group_set',{group:work.group_id??null,assignee:work.assignee_id},{group:target.id,assignee:assigneeId??null},t),
  ],'staff');
  if (!changed.meta.changes) throw new ApiError(409, 'revision_conflict', 'Work changed; refresh before deciding');
  return getWork(ctx, workId);
}

/** The group-lead view: the group's tickets the lead can read, never restricted ones. The owner may read it too. */
export async function leadQueue(ctx: WorkContext, groupId: string) {
  await currentWorkPrincipal(ctx);
  const target = await group(ctx, groupId);
  const lead = await ctx.env.DB.prepare('SELECT 1 FROM work_group_members WHERE workspace_id=? AND group_id=? AND user_id=? AND lead=1')
    .bind(ctx.principal.workspaceId, groupId, ctx.principal.userId).first();
  if (!lead && !ctx.principal.roles.includes('owner'))
    throw new ApiError(403, 'not_group_lead', 'Only a lead of this group reads its lead view');
  return { group: target, items: await listWork(ctx, { groupId, restricted: false }) };
}

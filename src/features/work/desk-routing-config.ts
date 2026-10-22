import { assertDepartmentConfig } from './department-spaces';
import { departmentRows } from './department-operations';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { currentWorkPrincipal } from './identity';
import { permit, type WorkContext } from './core';
import { categories } from './classification-policy';

/** DESK-003: the owner (acting for "admin" until that role exists) orders routing rules, names each configuration item's
 * or business service's support group, records agents' shifts and skills, and sets each group's assignment method. */
export const assignmentModes = ['none', 'round_robin', 'load'] as const;
const agentMember = "SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1 AND (roles_json LIKE '%\"operator\"%' OR roles_json LIKE '%\"owner\"%')";
const optional = (value: unknown, name: string, max = 120) =>
  value === undefined || value === null ? null : requiredString(value, name, max);
const audit = (ctx: WorkContext, action: string, target: string, data: unknown) =>
  ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
    .bind(id(), ctx.principal.workspaceId, ctx.principal.userId, action, target, JSON.stringify(data), now());

async function existing(ctx: WorkContext, sql: string, value: string | null, code: string, message: string) {
  if (value !== null && !await ctx.env.DB.prepare(sql).bind(ctx.principal.workspaceId, value).first())
    throw new ApiError(422, code, message);
}

export async function saveRoutingRule(ctx: WorkContext, body: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const name = requiredString(body.name, 'name', 120), position = body.position;
  if (!Number.isInteger(position) || (position as number) < 1 || (position as number) > 1000)
    throw new ApiError(422, 'routing_position', 'Position must be a whole number from 1 to 1000');
  const category = optional(body.category, 'category');
  if (category !== null && !Object.hasOwn(categories, category))
    throw new ApiError(422, 'routing_category', 'Choose a desk category, or omit it for any');
  const requesterId = optional(body.requesterId, 'requesterId'), requesterGroupId = optional(body.requesterGroupId, 'requesterGroupId');
  const skill = optional(body.skill, 'skill', 60), groupId = requiredString(body.groupId, 'groupId');
  await existing(ctx, 'SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=?', requesterId, 'routing_requester', 'Choose a workspace member, or omit the requester');
  await existing(ctx, 'SELECT 1 FROM work_requester_groups WHERE workspace_id=? AND id=?', requesterGroupId, 'requester_group_missing', 'Choose an existing requester group, or omit it');
  await existing(ctx, 'SELECT 1 FROM work_groups WHERE workspace_id=? AND id=?', groupId, 'group_not_found', 'Route to an existing agent group');
  const departmentId=await assertDepartmentConfig(ctx,body.departmentId);
  if(!await ctx.env.DB.prepare('SELECT 1 FROM work_groups WHERE workspace_id=? AND id=? AND department_id IS ?').bind(ctx.principal.workspaceId,groupId,departmentId).first())throw new ApiError(422,'group_department','Route to a group in the rule department');
  const ruleId = id();
  const [saved] = await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT OR IGNORE INTO work_routing_rules(id,workspace_id,name,position,category,requester_id,requester_group_id,skill,group_id,created_by,created_at,department_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(ruleId, ctx.principal.workspaceId, name, position, category, requesterId, requesterGroupId, skill, groupId, ctx.principal.userId, now(),departmentId),
    ctx.env.DB.prepare("INSERT INTO audit_events SELECT ?,?,?,'work.routing_rule_saved',?,?,? WHERE changes()>0")
      .bind(id(), ctx.principal.workspaceId, ctx.principal.userId, ruleId, JSON.stringify({ name, position, category, requesterId, requesterGroupId, skill, groupId }), now()),
  ]);
  if (!saved.meta.changes) throw new ApiError(409, 'routing_position_taken', 'Another rule holds this position');
  return (await listRouting(ctx)).rules.find((r) => r.id === ruleId);
}

export async function removeRoutingRule(ctx: WorkContext, ruleId: string) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const [removed] = await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM work_routing_rules WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, ruleId),
    audit(ctx, 'work.routing_rule_removed', ruleId, {}),
  ]);
  if (!removed.meta.changes) throw new ApiError(404, 'not_found', 'Routing rule not found');
  return listRouting(ctx);
}

/** Names the support group of a configuration item or business service (ASSET-009); `groupId: null` clears it. */
export async function setSupportGroup(ctx: WorkContext, itemId: string, body: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  await existing(ctx, "SELECT 1 FROM svc_records WHERE workspace_id=? AND id=? AND kind='service'", itemId, 'item_not_found', 'Choose a configuration item or business service');
  const groupId = body.groupId === null ? null : requiredString(body.groupId, 'groupId');
  await existing(ctx, 'SELECT 1 FROM work_groups WHERE workspace_id=? AND id=?', groupId, 'group_not_found', 'Choose an existing agent group');
  await ctx.env.DB.batch([
    groupId === null
      ? ctx.env.DB.prepare('DELETE FROM work_support_groups WHERE workspace_id=? AND item_id=?').bind(ctx.principal.workspaceId, itemId)
      : ctx.env.DB.prepare(`INSERT INTO work_support_groups VALUES(?,?,?,?,?) ON CONFLICT(workspace_id,item_id)
          DO UPDATE SET group_id=excluded.group_id,set_by=excluded.set_by,set_at=excluded.set_at`).bind(ctx.principal.workspaceId, itemId, groupId, ctx.principal.userId, now()),
    audit(ctx, 'work.support_group_set', itemId, { groupId }),
  ]);
  return { itemId, groupId };
}

/** An agent's shift (a business calendar; none means always available) and skills. */
export async function setAgentRouting(ctx: WorkContext, userId: string, body: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  await existing(ctx, agentMember, userId, 'member_not_agent', 'Shifts and skills belong to active service agents');
  const calendarId = optional(body.calendarId, 'calendarId');
  await existing(ctx, 'SELECT 1 FROM work_calendars WHERE workspace_id=? AND id=?', calendarId, 'calendar_missing', 'Choose a business calendar, or omit it for always available');
  const skills = Array.isArray(body.skills) ? [...new Set(body.skills)] : [];
  if (skills.length > 20 || !skills.every((s) => typeof s === 'string' && s.trim() && s.length <= 60))
    throw new ApiError(422, 'agent_skills', 'Name up to 20 skills of at most 60 characters');
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO work_agent_routing VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_id,user_id)
      DO UPDATE SET calendar_id=excluded.calendar_id,skills_json=excluded.skills_json,set_by=excluded.set_by,set_at=excluded.set_at`)
      .bind(ctx.principal.workspaceId, userId, calendarId, JSON.stringify(skills), ctx.principal.userId, now()),
    audit(ctx, 'work.agent_routing_set', userId, { calendarId, skills }),
  ]);
  return { userId, calendarId, skills };
}

/** A group's automatic assignment: none, round-robin or least open tickets, with an optional open-ticket cap per agent. */
export async function setGroupAssignment(ctx: WorkContext, groupId: string, body: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  await existing(ctx, 'SELECT 1 FROM work_groups WHERE workspace_id=? AND id=?', groupId, 'group_not_found', 'Agent group not found');
  const mode = body.mode;
  if (!assignmentModes.includes(mode as never)) throw new ApiError(422, 'assignment_mode', 'Choose none, round_robin or load');
  const maxOpen = body.maxOpen ?? null;
  if (maxOpen !== null && (!Number.isInteger(maxOpen) || (maxOpen as number) < 1 || (maxOpen as number) > 1000))
    throw new ApiError(422, 'assignment_cap', 'The open-ticket cap is a whole number from 1 to 1000, or omitted');
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE work_groups SET assignment=?,max_open=? WHERE workspace_id=? AND id=?').bind(mode, maxOpen, ctx.principal.workspaceId, groupId),
    audit(ctx, 'work.group_assignment_set', groupId, { mode, maxOpen }),
  ]);
  return { groupId, mode, maxOpen };
}

export async function listRouting(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'operator']);
  const w = ctx.principal.workspaceId, db = ctx.env.DB;
  const rules = (await db.prepare(`SELECT id,name,department_id,position,category,requester_id requesterId,requester_group_id requesterGroupId,skill,group_id groupId
    FROM work_routing_rules WHERE workspace_id=? ORDER BY position`).bind(w).all<{ id: string; name: string;position:number;department_id:string|null }>()).results;
  const supportGroups = (await db.prepare('SELECT s.item_id itemId,s.group_id groupId,g.department_id FROM work_support_groups s JOIN work_groups g ON g.workspace_id=s.workspace_id AND g.id=s.group_id WHERE s.workspace_id=? ORDER BY s.item_id').bind(w).all()).results;
  const agents = (await db.prepare('SELECT user_id userId,calendar_id calendarId,skills_json FROM work_agent_routing WHERE workspace_id=? ORDER BY user_id').bind(w)
    .all<{ userId: string; calendarId: string | null; skills_json: string }>()).results.map(({ skills_json, ...a }) => ({ ...a, skills: JSON.parse(skills_json) }));
  const groups = (await db.prepare('SELECT id,name,department_id,assignment mode,max_open maxOpen FROM work_groups WHERE workspace_id=? ORDER BY name').bind(w).all()).results;
  return { rules:await departmentRows(ctx,rules),supportGroups:await departmentRows(ctx,supportGroups), agents,groups:await departmentRows(ctx,groups) };
}

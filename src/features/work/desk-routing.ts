import { departmentWorkBatch } from './department-spaces';
import { requireDepartmentStaff } from './department-operations';
import { ApiError, id, now } from '../../platform/http';
import { currentWorkPrincipal } from './identity';
import { getWork, permit, type WorkContext, type WorkRecord } from './core';
import { businessMinuteTest, calendarFromRow } from './calendar';

/** DESK-003: routing places a ticket in one accountable group and, by that group's method, assigns an available agent.
 * The impacted configuration item's or business service's support group comes first; otherwise the first owner-ordered
 * rule whose every condition matches (category, requester, requester group) decides; otherwise nothing changes. */
type Trigger = 'created' | 'classified' | 'agent';
interface Target { groupId: string; ruleId?: string; itemId?: string; skill: string | null }
interface Member { user_id: string; calendar_json: string | null; skills_json: string | null; open: number }

async function target(ctx: WorkContext, work: WorkRecord): Promise<Target | null> {
  const db = ctx.env.DB, w = work.workspace_id;
  const context = JSON.parse(work.context_json || '{}');
  if (typeof context.serviceId === 'string') {
    const support = await db.prepare('SELECT s.group_id FROM work_support_groups s JOIN work_groups g ON g.workspace_id=s.workspace_id AND g.id=s.group_id WHERE s.workspace_id=? AND s.item_id=? AND g.department_id IS ?')
      .bind(w, context.serviceId,work.department_id??null).first<{ group_id: string }>();
    if (support) return { groupId: support.group_id, itemId: context.serviceId, skill: null };
  }
  const rule = await db.prepare(`SELECT r.id,r.group_id,r.skill FROM work_routing_rules r WHERE r.workspace_id=? AND r.department_id IS ?
      AND (r.category IS NULL OR r.category=(SELECT json_extract(c.current_json,'$.category') FROM work_classifications c WHERE c.workspace_id=r.workspace_id AND c.work_id=?))
      AND (r.requester_id IS NULL OR r.requester_id=?)
      AND (r.requester_group_id IS NULL OR EXISTS(SELECT 1 FROM work_requester_groups g, json_each(g.members_json) m WHERE g.workspace_id=r.workspace_id AND g.id=r.requester_group_id AND m.value=?))
    ORDER BY r.position LIMIT 1`).bind(w,work.department_id??null, work.id, work.requester_id, work.requester_id).first<{ id: string; group_id: string; skill: string | null }>();
  return rule ? { groupId: rule.group_id, ruleId: rule.id, skill: rule.skill } : null;
}

/** The group's members in round-robin order (joined first), after the group's last automatic assignee. */
async function pickAgent(ctx: WorkContext, group: { id: string;department_id:string|null; assignment: string; max_open: number | null; last_assignee_id: string | null }, skill: string | null) {
  if (group.assignment === 'none') return null;
  const members = (await ctx.env.DB.prepare(`SELECT m.user_id,
      (SELECT json_object('timezone',c.timezone,'weekdays_json',c.weekdays_json,'start_hour',c.start_hour,'end_hour',c.end_hour,'holidays_json',c.holidays_json,'holiday_catalog',c.holiday_catalog)
        FROM work_agent_routing a JOIN work_calendars c ON c.workspace_id=a.workspace_id AND c.id=a.calendar_id WHERE a.workspace_id=m.workspace_id AND a.user_id=m.user_id) calendar_json,
      (SELECT a.skills_json FROM work_agent_routing a WHERE a.workspace_id=m.workspace_id AND a.user_id=m.user_id) skills_json,
      (SELECT COUNT(*) FROM work_records r WHERE r.workspace_id=m.workspace_id AND r.assignee_id=m.user_id AND r.state NOT IN ('closed','cancelled')) open
    FROM work_group_members m JOIN memberships s ON s.workspace_id=m.workspace_id AND s.user_id=m.user_id AND s.active=1
      AND (s.roles_json LIKE '%"operator"%' OR s.roles_json LIKE '%"owner"%')
    WHERE m.workspace_id=? AND m.group_id=? AND (? IS NULL OR EXISTS(SELECT 1 FROM json_each(s.roles_json) WHERE value='owner') OR EXISTS(SELECT 1 FROM work_department_members dm JOIN work_departments d ON d.workspace_id=dm.workspace_id AND d.id=dm.department_id WHERE dm.workspace_id=m.workspace_id AND dm.user_id=m.user_id AND dm.department_id=? AND dm.active=1 AND d.active=1)) ORDER BY m.added_at,m.user_id`).bind(ctx.principal.workspaceId, group.id,group.department_id,group.department_id).all<Member>()).results;
  const start = members.findIndex((m) => m.user_id === group.last_assignee_id) + 1, t = Date.now();
  const ordered = [...members.slice(start), ...members.slice(0, start)];
  const available = ordered.filter((m) =>
    (!m.calendar_json || businessMinuteTest(calendarFromRow(JSON.parse(m.calendar_json)))(t)) &&
    (!skill || (JSON.parse(m.skills_json || '[]') as string[]).includes(skill)) &&
    (group.max_open === null || m.open < group.max_open));
  if (group.assignment === 'load') return available.reduce<Member | null>((best, m) => (!best || m.open < best.open ? m : best), null)?.user_id ?? null;
  return available[0]?.user_id ?? null;
}

async function route(ctx: WorkContext, work: WorkRecord, trigger: Trigger) {
  if (['closed', 'cancelled'].includes(work.state)) return null;
  const to = await target(ctx, work);
  if (!to) return null;
  const group = await ctx.env.DB.prepare('SELECT id,department_id,assignment,max_open,last_assignee_id FROM work_groups WHERE workspace_id=? AND id=? AND department_id IS ?')
    .bind(work.workspace_id, to.groupId,work.department_id??null).first<{ id: string;department_id:string|null; assignment: string; max_open: number | null; last_assignee_id: string | null }>();
  if (!group) return null;
  // Restricted and HR tickets are never handed to an agent automatically: only their own readers decide who works them.
  const assigneeId = work.sensitivity === 'normal' ? await pickAgent(ctx, group, to.skill) : null;
  const t = now(), db = ctx.env.DB;
  const detail = {
    trigger, from: { groupId: work.group_id ?? null, assigneeId: work.assignee_id }, to: { groupId: group.id, assigneeId },
    ...(to.ruleId ? { ruleId: to.ruleId } : { itemId: to.itemId }), method: group.assignment,
    ...(assigneeId || group.assignment === 'none' || work.sensitivity !== 'normal' ? {} : { unassigned: 'no_available_agent' }),
  };
  const statements = [
    db.prepare('UPDATE work_records SET group_id=?,assignee_id=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=? AND department_id IS ?')
      .bind(group.id, assigneeId, t, work.workspace_id, work.id, work.revision,group.department_id),
    db.prepare("INSERT INTO audit_events SELECT ?,?,?,'work.routed',?,?,? WHERE changes()>0")
      .bind(id(), work.workspace_id, ctx.principal.userId, work.id, JSON.stringify(detail), t),
    db.prepare('UPDATE work_groups SET last_assignee_id=COALESCE(?,last_assignee_id) WHERE workspace_id=? AND id=? AND changes()>0')
      .bind(assigneeId, work.workspace_id, group.id),
  ];
  const [changed]=trigger==='agent'?await departmentWorkBatch(ctx,work,statements,'staff'):await db.batch(statements);
  return changed.meta.changes ? detail : null;
}

/** Routes a ticket Linen just created or classified while it has no accountable group; a concurrent change wins. */
export async function routeUnplaced(ctx: WorkContext, workId: string, trigger: Exclude<Trigger, 'agent'>) {
  const work = await ctx.env.DB.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=?')
    .bind(ctx.principal.workspaceId, workId).first<WorkRecord>();
  if (work && !work.group_id) await route(ctx, work, trigger);
}

/** An agent asks Linen to route a ticket again, at the revision they read. */
export async function rerouteWork(ctx: WorkContext, workId: string, body: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'operator']);
  const work = await getWork(ctx, workId);
  await requireDepartmentStaff(ctx,work.department_id);
  if (body.revision !== work.revision) throw new ApiError(409, 'revision_conflict', 'Work changed; refresh before routing');
  const routed = await route(ctx, work, 'agent');
  if (!routed) throw new ApiError(422, 'no_route', 'No support group or routing rule matches this ticket');
  return { routing: routed, work: await getWork(ctx, workId) };
}

/** Every placement and reassignment of a ticket, oldest first: routing, group placement and manual assignment. */
export async function assignmentHistory(ctx: WorkContext, workId: string) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'operator']);
  await getWork(ctx, workId);
  const rows = (await ctx.env.DB.prepare(`SELECT action,actor_id,detail_json,created_at FROM audit_events WHERE workspace_id=? AND target=?
    AND action IN ('work.routed','work.group_set','work.assigned') ORDER BY created_at,rowid`).bind(ctx.principal.workspaceId, workId)
    .all<{ action: string; actor_id: string; detail_json: string; created_at: string }>()).results;
  return { items: rows.map((r) => ({ action: r.action, actorId: r.actor_id, at: r.created_at, ...JSON.parse(r.detail_json) })) };
}

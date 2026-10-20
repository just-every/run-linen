import { ApiError, id, now, requiredString } from '../../platform/http';
import { permit, type WorkContext, type WorkRecord } from './core';
import { readProject } from './projects';

/** DESK-015 task plans use PROJECT-001's IT projects, local duties and normal-ticket link boundary.
 * Preparing checks all permissions and references before the scenario changes any field. */
export type ScenarioPlan = { projectId: string } | { name: string; tasks: { title: string; ownerId: string; dueDate: string }[] };
interface PreparedPlan { id: string; name?: string; tasks: { title: string; ownerId: string; dueDate: string }[] }
export async function prepareScenarioPlan(ctx: WorkContext, work: WorkRecord, value: ScenarioPlan): Promise<PreparedPlan> {
  permit(ctx, ['owner', 'operator']);
  if (work.sensitivity !== 'normal') throw new ApiError(422, 'project_link', 'Only normal-sensitivity tickets may link to an IT project task plan');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(422, 'scenario_plan', 'Link a projectId or start a named task plan');
  if ('projectId' in value) {
    if ('tasks' in value || 'name' in value) throw new ApiError(422, 'scenario_plan', 'Link an existing plan or start a new one');
    const projectId = requiredString(value.projectId, 'projectId');
    await readProject(ctx, projectId);
    return { id: projectId, tasks: [] };
  }
  const name = requiredString(value.name, 'task plan name', 200);
  if (!Array.isArray(value.tasks) || !value.tasks.length || value.tasks.length > 30) throw new ApiError(422, 'scenario_plan', 'A task plan needs 1 to 30 local duties');
  const tasks = [];
  for (const raw of value.tasks) {
    const title = requiredString(raw?.title, 'task title', 300), ownerId = requiredString(raw?.ownerId, 'task owner');
    const dueDate = raw.dueDate;
    if (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate + 'T00:00:00Z')))
      throw new ApiError(422, 'task_date', 'Task due date must be YYYY-MM-DD');
    if (!await ctx.env.DB.prepare("SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value IN ('owner','operator')")
      .bind(ctx.principal.workspaceId, ownerId).first()) throw new ApiError(422, 'project_owner', 'Task owner must be an active owner or service agent');
    tasks.push({ title, ownerId, dueDate });
  }
  return { id: id(), name, tasks };
}

/** The local project, all its duties and its ticket link are one D1 batch. No provider effect or grant is created. */
export async function applyScenarioPlan(ctx: WorkContext, workId: string, plan: PreparedPlan) {
  const ws = ctx.principal.workspaceId, t = now(), writes: D1PreparedStatement[] = [];
  if (plan.name) {
    writes.push(ctx.env.DB.prepare("INSERT INTO work_projects(id,workspace_id,name,description,owner_id,status,created_at,updated_at) VALUES(?,?,?,'',?,'active',?,?)")
      .bind(plan.id, ws, plan.name, ctx.principal.userId, t, t));
    for (const task of plan.tasks) writes.push(ctx.env.DB.prepare("INSERT INTO work_project_tasks(id,workspace_id,project_id,title,owner_id,due_date,depends_on_json,created_at,updated_at) VALUES(?,?,?,?,?,?,'[]',?,?)")
      .bind(id(), ws, plan.id, task.title, task.ownerId, task.dueDate, t, t));
  }
  writes.push(ctx.env.DB.prepare("INSERT OR IGNORE INTO work_project_links(workspace_id,project_id,kind,target_id,task_id,detail,created_by,created_at) VALUES(?,?,'ticket',?,NULL,'',?,?)")
    .bind(ws, plan.id, workId, ctx.principal.userId, t));
  await ctx.env.DB.batch(writes);
}

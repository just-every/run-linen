import { currentWorkPrincipal } from "./identity";
import { ApiError, id, now, requiredString } from "../../platform/http";
import { permit, type WorkContext } from "./core";

/** PROJECT-001: IT team projects. Owners and agents plan them; auditors read; employees have no project view. */
const projectStatuses = ["planned", "active", "on_hold", "done", "cancelled"];
const taskStatuses = ["todo", "in_progress", "blocked", "done"];
const linkKinds = ["ticket", "change", "asset", "lifecycle"] as const;
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + "T00:00:00Z"));
const team = (ctx: WorkContext) => permit(ctx, ["owner", "operator"]);
async function agent(ctx: WorkContext, userId: unknown, field: string) {
  if (typeof userId !== "string" || !(await ctx.env.DB.prepare(
    "SELECT 1 FROM memberships m, json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value IN ('owner','operator')",
  ).bind(ctx.principal.workspaceId, userId).first()))
    throw new ApiError(422, "project_owner", `${field} must be an active owner or service agent`);
  return userId;
}
async function project(ctx: WorkContext, projectId: string) {
  const row = await ctx.env.DB.prepare("SELECT * FROM work_projects WHERE workspace_id=? AND id=?").bind(ctx.principal.workspaceId, projectId).first<any>();
  if (!row) throw new ApiError(404, "project_not_found", "Project not found");
  return row;
}

export async function createProject(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  team(ctx);
  const ownerId = await agent(ctx, input.ownerId ?? ctx.principal.userId, "Project owner"), t = now(), projectId = id();
  await ctx.env.DB.prepare("INSERT INTO work_projects(id,workspace_id,name,description,owner_id,status,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?)")
    .bind(projectId, ctx.principal.workspaceId, requiredString(input.name, "name", 200), typeof input.description === "string" ? input.description.slice(0, 4000) : "", ownerId, t, t).run();
  return readProject(ctx, projectId);
}
export async function listProjects(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator", "auditor"]);
  return (await ctx.env.DB.prepare(`SELECT p.*,(SELECT COUNT(*) FROM work_project_tasks t WHERE t.workspace_id=p.workspace_id AND t.project_id=p.id) tasks,
    (SELECT COUNT(*) FROM work_project_tasks t WHERE t.workspace_id=p.workspace_id AND t.project_id=p.id AND t.status='done') done
    FROM work_projects p WHERE p.workspace_id=? ORDER BY p.created_at DESC`).bind(ctx.principal.workspaceId).all()).results;
}
export async function addMilestone(ctx: WorkContext, projectId: string, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  team(ctx);
  await project(ctx, projectId);
  if (!isDate(input.dueDate)) throw new ApiError(422, "milestone_date", "Milestone due date must be YYYY-MM-DD");
  const milestoneId = id();
  await ctx.env.DB.prepare("INSERT INTO work_project_milestones(id,workspace_id,project_id,name,due_date,created_at) VALUES(?,?,?,?,?,?)")
    .bind(milestoneId, ctx.principal.workspaceId, projectId, requiredString(input.name, "name", 200), input.dueDate, now()).run();
  return { id: milestoneId };
}
async function validDependencies(ctx: WorkContext, projectId: string, taskId: string | null, value: unknown) {
  const deps = Array.isArray(value) ? [...new Set(value)] : [];
  if (deps.length > 50 || deps.some((d) => typeof d !== "string" || d === taskId)) throw new ApiError(422, "task_dependencies", "Name up to 50 other tasks of this project");
  const found = await ctx.env.DB.prepare("SELECT COUNT(*) n FROM work_project_tasks WHERE workspace_id=? AND project_id=? AND id IN (SELECT value FROM json_each(?))")
    .bind(ctx.principal.workspaceId, projectId, JSON.stringify(deps)).first<{ n: number }>();
  if (found?.n !== deps.length) throw new ApiError(422, "task_dependencies", "Every dependency must be a task of this project");
  return deps as string[];
}
export async function addTask(ctx: WorkContext, projectId: string, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  team(ctx);
  await project(ctx, projectId);
  if (!isDate(input.dueDate)) throw new ApiError(422, "task_date", "Task due date must be YYYY-MM-DD");
  const milestoneId = (input.milestoneId as string | undefined) ?? null;
  if (milestoneId && !(await ctx.env.DB.prepare("SELECT 1 FROM work_project_milestones WHERE workspace_id=? AND project_id=? AND id=?").bind(ctx.principal.workspaceId, projectId, milestoneId).first()))
    throw new ApiError(422, "milestone_missing", "Choose a milestone of this project");
  const deps = await validDependencies(ctx, projectId, null, input.dependsOn), taskId = id(), t = now();
  await ctx.env.DB.prepare("INSERT INTO work_project_tasks(id,workspace_id,project_id,milestone_id,title,owner_id,due_date,depends_on_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(taskId, ctx.principal.workspaceId, projectId, milestoneId, requiredString(input.title, "title", 300), await agent(ctx, input.ownerId, "Task owner"), input.dueDate, JSON.stringify(deps), t, t).run();
  return { id: taskId };
}
/** A task cannot be done while a task it depends on is open. */
export async function updateTask(ctx: WorkContext, projectId: string, taskId: string, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  team(ctx);
  const task = await ctx.env.DB.prepare("SELECT * FROM work_project_tasks WHERE workspace_id=? AND project_id=? AND id=?").bind(ctx.principal.workspaceId, projectId, taskId).first<any>();
  if (!task) throw new ApiError(404, "task_not_found", "Task not found");
  if (input.revision !== task.revision) throw new ApiError(409, "task_changed", "Task changed; refresh before updating");
  const status = (input.status as string | undefined) ?? task.status;
  if (!taskStatuses.includes(status)) throw new ApiError(422, "task_status", `Status must be one of ${taskStatuses.join(", ")}`);
  const deps = input.dependsOn === undefined ? JSON.parse(task.depends_on_json) : await validDependencies(ctx, projectId, taskId, input.dependsOn);
  if (status === "done" && (await ctx.env.DB.prepare("SELECT COUNT(*) n FROM work_project_tasks WHERE workspace_id=? AND project_id=? AND id IN (SELECT value FROM json_each(?)) AND status<>'done'")
    .bind(ctx.principal.workspaceId, projectId, JSON.stringify(deps)).first<{ n: number }>())!.n)
    throw new ApiError(409, "dependency_open", "Finish the tasks this one depends on first");
  const ownerId = input.ownerId === undefined ? task.owner_id : await agent(ctx, input.ownerId, "Task owner");
  const dueDate = input.dueDate === undefined ? task.due_date : input.dueDate;
  if (!isDate(dueDate)) throw new ApiError(422, "task_date", "Task due date must be YYYY-MM-DD");
  const changed = await ctx.env.DB.prepare("UPDATE work_project_tasks SET status=?,owner_id=?,due_date=?,depends_on_json=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?")
    .bind(status, ownerId, dueDate, JSON.stringify(deps), now(), ctx.principal.workspaceId, taskId, task.revision).run();
  if (!changed.meta.changes) throw new ApiError(409, "task_changed", "Task changed; refresh before updating");
  return readProject(ctx, projectId);
}
export async function setProjectStatus(ctx: WorkContext, projectId: string, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  team(ctx);
  const row = await project(ctx, projectId);
  if (!projectStatuses.includes(input.status as string)) throw new ApiError(422, "project_status", `Status must be one of ${projectStatuses.join(", ")}`);
  if (input.revision !== row.revision) throw new ApiError(409, "project_changed", "Project changed; refresh before updating");
  const changed = await ctx.env.DB.prepare("UPDATE work_projects SET status=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?")
    .bind(input.status, now(), ctx.principal.workspaceId, projectId, row.revision).run();
  if (!changed.meta.changes) throw new ApiError(409, "project_changed", "Project changed; refresh before updating");
  return readProject(ctx, projectId);
}

const linkTargets: Record<(typeof linkKinds)[number], string> = {
  ticket: "SELECT id,title label FROM work_records WHERE workspace_id=? AND id=? AND sensitivity='normal'",
  change: "SELECT id,json_extract(data_json,'$.title') label FROM svc_records WHERE workspace_id=? AND id=? AND kind='change'",
  asset: "SELECT id,COALESCE(asset_tag,serial) label FROM work_assets WHERE workspace_id=? AND id=?",
  lifecycle: "SELECT l.id,l.kind||' '||l.effective_at label FROM work_lifecycle l WHERE l.workspace_id=? AND l.id=?",
};
/** Links tickets (normal sensitivity only), changes, assets (with a relocation note) and lifecycle plans, up to 200 per call. */
export async function linkProject(ctx: WorkContext, projectId: string, input: { items?: unknown }) {
  await currentWorkPrincipal(ctx);
  team(ctx);
  await project(ctx, projectId);
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length || items.length > 200) throw new ApiError(422, "project_links", "Link 1 to 200 records per request");
  const statements = [];
  for (const raw of items as Record<string, unknown>[]) {
    const kind = raw?.kind as (typeof linkKinds)[number];
    if (!linkKinds.includes(kind) || typeof raw.targetId !== "string") throw new ApiError(422, "project_link", "Each link names a ticket, change, asset or lifecycle plan");
    if (!(await ctx.env.DB.prepare(linkTargets[kind]).bind(ctx.principal.workspaceId, raw.targetId).first()))
      throw new ApiError(422, "project_link_target", `No ${kind} ${raw.targetId} in this workspace's linkable records`);
    if (raw.taskId !== undefined && !(await ctx.env.DB.prepare("SELECT 1 FROM work_project_tasks WHERE workspace_id=? AND project_id=? AND id=?").bind(ctx.principal.workspaceId, projectId, raw.taskId).first()))
      throw new ApiError(422, "task_missing", "Choose a task of this project");
    statements.push(ctx.env.DB.prepare("INSERT OR IGNORE INTO work_project_links(workspace_id,project_id,kind,target_id,task_id,detail,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(ctx.principal.workspaceId, projectId, kind, raw.targetId, (raw.taskId as string) ?? null, typeof raw.detail === "string" ? raw.detail.slice(0, 300) : "", ctx.principal.userId, now()));
  }
  await ctx.env.DB.batch(statements);
  return readProject(ctx, projectId);
}

/** Timeline flag: a task waits on an open dependency, and is blocked when that dependency is itself
 * blocked, overdue (due before today, UTC) or due after the dependent task. */
function dependencyState(task: any, byId: Map<string, any>, today: string) {
  const open = JSON.parse(task.depends_on_json).map((d: string) => byId.get(d)).filter((d: any) => d && d.status !== "done");
  if (!open.length) return { state: "clear", blockedBy: [] };
  const blocking = open.filter((d: any) => d.status === "blocked" || d.due_date < today || d.due_date > task.due_date);
  return { state: blocking.length ? "blocked" : "waiting", blockedBy: (blocking.length ? blocking : open).map((d: any) => d.id) };
}
export async function readProject(ctx: WorkContext, projectId: string) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator", "auditor"]);
  const row = await project(ctx, projectId), ws = ctx.principal.workspaceId;
  const [milestones, tasks, links] = await Promise.all([
    ctx.env.DB.prepare("SELECT * FROM work_project_milestones WHERE workspace_id=? AND project_id=? ORDER BY due_date,created_at").bind(ws, projectId).all<any>(),
    ctx.env.DB.prepare("SELECT t.*,u.name owner_name FROM work_project_tasks t LEFT JOIN users u ON u.id=t.owner_id WHERE t.workspace_id=? AND t.project_id=? ORDER BY t.due_date,t.created_at").bind(ws, projectId).all<any>(),
    ctx.env.DB.prepare("SELECT * FROM work_project_links WHERE workspace_id=? AND project_id=? ORDER BY kind,created_at").bind(ws, projectId).all<any>(),
  ]);
  const byId = new Map(tasks.results.map((t) => [t.id, t])), today = now().slice(0, 10);
  const timeline = tasks.results.map((t) => ({ ...t, dependsOn: JSON.parse(t.depends_on_json), dependency: dependencyState(t, byId, today), overdue: t.status !== "done" && t.due_date < today }));
  const labelled = await Promise.all(links.results.map(async (l) => ({ ...l, label: (await ctx.env.DB.prepare(linkTargets[l.kind as keyof typeof linkTargets]).bind(ws, l.target_id).first<{ label: string }>())?.label ?? null })));
  return {
    project: row, milestones: milestones.results, tasks: timeline,
    board: Object.fromEntries(taskStatuses.map((s) => [s, timeline.filter((t) => t.status === s).map((t) => t.id)])),
    links: labelled,
    definition: "Timeline order is task due date (YYYY-MM-DD, UTC). A task waits on an open dependency and is flagged blocked when that dependency is blocked, overdue or due after it.",
  };
}
/** Each agent's open project tasks beside the open tickets assigned to them. */
export async function workload(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator", "auditor"]);
  const ws = ctx.principal.workspaceId;
  return (await ctx.env.DB.prepare(`SELECT m.user_id userId,u.name,
    (SELECT COUNT(*) FROM work_records w WHERE w.workspace_id=m.workspace_id AND w.assignee_id=m.user_id AND w.state IN ('open','paused')) openTickets,
    (SELECT COUNT(*) FROM work_project_tasks t WHERE t.workspace_id=m.workspace_id AND t.owner_id=m.user_id AND t.status<>'done') openProjectTasks
    FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND m.active=1 AND EXISTS(SELECT 1 FROM json_each(m.roles_json) r WHERE r.value IN ('owner','operator')) ORDER BY u.name`)
    .bind(ws).all<{ userId: string; name: string; openTickets: number; openProjectTasks: number }>()).results.map((r) => ({ ...r, total: r.openTickets + r.openProjectTasks }));
}

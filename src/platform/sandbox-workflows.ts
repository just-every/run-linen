import type { Context, Hono } from 'hono';
import type { AppEnv } from './types';
import { ApiError, auditStatement, id, jsonBody, now } from './http';
import { readSandbox, ownerSql, type Item, type Sandbox } from './sandboxes';
import { validateCatalogAnswers } from '../features/work/catalog-form-schema';
import { AUTOMATED_STEP, checkTaskPlan, type CatalogTask } from '../features/work/catalog-task-plan';

type Run = { id: string; catalogId: string; configurationRevision: number; createdAt: string; tasks: CatalogTask[]; completed: string[] };
type C = Context<AppEnv>;
function view(run: Run) {
 return { ...run, state: run.tasks.every(t => run.completed.includes(t.key)) ? 'completed' : 'running',
  tasks: run.tasks.map(task => ({ ...task,
   state: run.completed.includes(task.key) ? 'completed' : task.after.every(key => run.completed.includes(key)) ? 'ready' : 'blocked',
   dueAt: new Date(Date.parse(run.createdAt) + task.dueHours * 3600000).toISOString(),
  })), externalEffects: false };
}
function draft(row: Sandbox, revision: unknown) {
 if (row.state !== 'draft' || revision !== row.revision)
  throw new ApiError(409, 'sandbox_changed', 'Rehearsals require the current draft revision');
}
async function save(c: C, row: Sandbox, runs: Run[], runId: string, action: string, detail: Record<string, unknown>) {
 const p = c.get('principal');
 try {
  await c.env.DB.batch([
   c.env.DB.prepare(`UPDATE configuration_sandboxes SET runs_json=? WHERE workspace_id=? AND id=? AND revision=? AND state='draft' AND runs_json=? AND ${ownerSql}`)
    .bind(JSON.stringify(runs), p.workspaceId, row.id, row.revision, row.runs_json, p.workspaceId, p.userId),
   c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'),
   auditStatement(c, action, row.id, { runId, configurationRevision: row.revision, ...detail }),
   c.env.DB.prepare('DELETE FROM platform_auth_guard'),
  ]);
 } catch (error) {
  if (String(error).includes('CHECK constraint')) throw new ApiError(409, 'sandbox_changed', 'Draft, rehearsal or current authority changed; reload');
  throw error;
 }
}
export function registerSandboxWorkflowRoutes(app: Hono<AppEnv>) {
 app.get('/sandboxes/:id/runs', async c => {
  const row = await readSandbox(c, c.req.param('id'));
  c.header('Cache-Control', 'private, no-store');
  return c.json({ items: (JSON.parse(row.runs_json) as Run[]).map(run => ({ ...view(run), current: run.configurationRevision === row.revision })) });
 });
 app.post('/sandboxes/:id/runs', async c => {
  const row = await readSandbox(c, c.req.param('id')), b = await jsonBody(c);
  draft(row, b.revision);
  if (Object.keys(b).some(key => !['revision', 'catalogId', 'answers'].includes(key)))
   throw new ApiError(422, 'sandbox_config_only', 'Rehearsals accept form answers and catalog configuration only');
  const item = (JSON.parse(row.draft_json) as Item[]).find(item => item.id === b.catalogId);
  if (!item) throw new ApiError(404, 'not_found', 'Catalog item unavailable in this sandbox');
  validateCatalogAnswers(item.form, b.answers ?? {});
  const tasks = checkTaskPlan(item.tasks);
  if (!tasks.length || tasks.some(task => task.after.includes(AUTOMATED_STEP)))
   throw new ApiError(422, 'sandbox_connector_unavailable', 'Only team task workflows can run here; connector steps require sandbox credentials and transport');
  const runs = JSON.parse(row.runs_json) as Run[];
  // Bound retained local rehearsal history without discarding results silently.
  if (runs.length >= 100) throw new ApiError(422, 'sandbox_run_limit', 'Create a fresh sandbox to run more rehearsals');
  const run: Run = { id: id(), catalogId: item.id, configurationRevision: row.revision, createdAt: now(), tasks, completed: [] };
  runs.push(run);
  // Answers are validated but never retained in rehearsal history or audit.
  await save(c, row, runs, run.id, 'sandbox.workflow_started', { catalogId: item.id });
  return c.json(view(run), 201);
 });
 app.post('/sandboxes/:id/runs/:runId/complete', async c => {
  const row = await readSandbox(c, c.req.param('id')), b = await jsonBody(c);
  draft(row, b.revision);
  if (Object.keys(b).some(key => !['revision', 'taskKey'].includes(key)))
   throw new ApiError(422, 'sandbox_config_only', 'Complete one rehearsal task by its key');
  const runs = JSON.parse(row.runs_json) as Run[], run = runs.find(run => run.id === c.req.param('runId'));
  if (!run) throw new ApiError(404, 'not_found', 'Rehearsal unavailable');
  if (run.configurationRevision !== row.revision) throw new ApiError(409, 'sandbox_changed', 'Configuration changed; start a fresh rehearsal');
  const task = run.tasks.find(task => task.key === b.taskKey);
  if (!task) throw new ApiError(404, 'not_found', 'Rehearsal task unavailable');
  if (run.completed.includes(task.key) || !task.after.every(key => run.completed.includes(key)))
   throw new ApiError(409, 'sandbox_task_not_ready', 'Task already completed or waiting for dependencies');
  run.completed.push(task.key);
  await save(c, row, runs, run.id, 'sandbox.workflow_task_completed', { taskKey: task.key });
  return c.json(view(run));
 });
}

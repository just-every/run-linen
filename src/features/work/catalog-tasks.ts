import {departmentWorkBatch} from './department-spaces';
import {requireWorkDepartmentStaff} from './department-operations';
import {workDepartmentStaff,workDepartmentScoped} from './scope';
import { ApiError, id, now } from '../../platform/http';
import { currentWorkPrincipal } from './identity';
import { getWork, permit, type WorkContext } from './core';
import { groupMember } from './desk-groups';
import { getFulfilmentReadiness } from './fulfilment-readiness';
import { normalizeTaskPlan, type CatalogTask } from './catalog-task-plan';
import { mayDoTask } from './lifecycle-tasks';

/** CATALOG-003: the request's obligations are its item's automated step plus a copy of the item's team task plan.
 * The item's owner is accountable for every obligation; the named team does a task. A done task is a recorded
 * completion by a team member, not independent verification; a waiver is the owner's recorded decision and reason.
 * A request closes only when each of these is verified, done or waived (or cancelled with the request). */
export const SATISFIED = "('verified','done','waived')";
const CLOSE_GATED = "((kind IN ('access.grant','device.deliver','task.manual') AND lifecycle_id IS NULL) OR (kind='task.manual' AND lifecycle_id IS NOT NULL))";
const OPEN = "('pending','blocked','executing','unknown','failed')";
const audit = (ctx: WorkContext, action: string, target: string, detail: unknown, conditional = false) =>
  ctx.env.DB.prepare(`INSERT INTO audit_events SELECT ?,?,?,?,?,?,? ${conditional ? 'WHERE changes()=1' : ''}`)
    .bind(id(), ctx.principal.workspaceId, ctx.principal.userId, action, target, JSON.stringify(detail), now());

/** The item's plan becomes obligation rows in the request's own batch; `automatedId` is the item's connector step. */
export function taskStatements(ctx: WorkContext, workId: string, catalog: { id: string; owner_id: string; tasks_json?: string }, beneficiaryId: string, automatedId: string) {
  const plan: CatalogTask[] = JSON.parse(catalog.tasks_json || '[]'), ids = new Map<string, string>([['automated', automatedId]]), at = Date.now();
  return plan.map(task => {
    const taskId = id();
    ids.set(task.key, taskId);
    return ctx.env.DB.prepare(`INSERT OR IGNORE INTO work_obligations(id,workspace_id,work_id,kind,target,beneficiary_id,due_at,state,owner_id,title,group_id,catalog_id,after_json)
      VALUES(?,?,?,'task.manual',?,?,?,'pending',?,?,?,?,?)`).bind(taskId, ctx.principal.workspaceId, workId, task.key, beneficiaryId,
      new Date(at + task.dueHours * 3600_000).toISOString(), catalog.owner_id, task.title, task.groupId, catalog.id,
      JSON.stringify(task.after.map(key => ids.get(key)!)));
  });
}

export async function editTaskPlan(ctx: WorkContext, catalogId: string, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx); permit(ctx, ['owner']);
  if (!Number.isInteger(input.revision)) throw new ApiError(422, 'catalog_revision', 'Current item revision required');
  const tasks = await normalizeTaskPlan(ctx, input.tasks);
  const results = await ctx.env.DB.batch([ctx.env.DB.prepare('UPDATE work_catalog SET tasks_json=?,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=?')
    .bind(JSON.stringify(tasks), ctx.principal.workspaceId, catalogId, input.revision),
    audit(ctx, 'catalog.tasks_edited', catalogId, { fromRevision: input.revision, toRevision: Number(input.revision) + 1, tasks: tasks.length }, true)]);
  if (!results[0].meta.changes) throw new ApiError(409, 'catalog_changed', 'Catalog item changed; refresh before editing');
  return { id: catalogId, revision: Number(input.revision) + 1, tasks };
}

async function openRow(ctx: WorkContext, workId: string, obligationId: string) {
  await currentWorkPrincipal(ctx);
  const work=await getWork(ctx, workId);
  if(workDepartmentScoped(work))await requireWorkDepartmentStaff(ctx,work);
  const row = await ctx.env.DB.prepare('SELECT * FROM work_obligations WHERE workspace_id=? AND work_id=? AND id=?').bind(ctx.principal.workspaceId, workId, obligationId).first<any>();
  if (!row) throw new ApiError(404, 'not_found', 'Responsibility not found');
  return {row,work};
}
const mayWaive = (ctx: WorkContext, row: any) => ctx.principal.roles.includes('owner') || (Boolean(row.owner_id) && row.owner_id === ctx.principal.userId);
const waivable = (row: any) => !row.lifecycle_id && ['task.manual', 'access.grant', 'device.deliver'].includes(row.kind) && ['pending', 'blocked', 'failed'].includes(row.state)
  && (row.kind === 'task.manual' || row.state === 'failed' || !row.operation_id);

export async function completeTask(ctx: WorkContext, workId: string, obligationId: string, input: Record<string, unknown>) {
  const {row,work} = await openRow(ctx, workId, obligationId);
  if (row.kind !== 'task.manual') throw new ApiError(404, 'not_found', 'Team task not found');
  permit(ctx, ['owner', 'operator']);
  // An account or service item has no team: its owner does it (CATALOG-001).
  const team = row.group_id ? await groupMember(ctx, row.group_id, ctx.principal.userId) : row.owner_id === ctx.principal.userId;
  if (!ctx.principal.roles.includes('owner') && !team)
    throw new ApiError(403, 'task_team_only', "Only a member of the task's team, or the workspace owner, completes it");
  if (!Number.isInteger(input.revision)) throw new ApiError(422, 'revision', 'Current task revision required');
  if (row.state !== 'pending') throw new ApiError(409, 'task_not_open', 'This task is already done, waived or cancelled');
  const gate = await getFulfilmentReadiness(ctx, workId, row.catalog_id);
  if (!gate.ready) throw new ApiError(409, 'task_not_ready', `The request is not ready for this task: ${gate.reason}`);
  const w = ctx.principal.workspaceId, t = now();
  const [result] = await departmentWorkBatch(ctx,work,[ctx.env.DB.prepare(`UPDATE work_obligations SET state='done',completed_by=?,completed_at=?,revision=revision+1
    WHERE workspace_id=? AND id=? AND revision=? AND state='pending'
    AND NOT EXISTS(SELECT 1 FROM json_each(work_obligations.after_json) j JOIN work_obligations d ON d.workspace_id=work_obligations.workspace_id AND d.id=j.value WHERE d.state NOT IN ${SATISFIED})`)
    .bind(ctx.principal.userId, t, w, obligationId, input.revision),
    audit(ctx, 'work.task_completed', obligationId, { workId }, true),
    ctx.env.DB.prepare('UPDATE work_records SET updated_at=? WHERE workspace_id=? AND id=? AND changes()=1').bind(t, w, workId)],'staff');
  if (!result.meta.changes) {
    const earlier = await ctx.env.DB.prepare(`SELECT o.title FROM json_each(?) j JOIN work_obligations o ON o.workspace_id=? AND o.id=j.value WHERE o.state NOT IN ${SATISFIED}`)
      .bind(row.after_json, w).all<{ title: string | null }>();
    if (earlier.results.length) throw new ApiError(409, 'task_waiting', 'Earlier steps must be done, verified or waived first');
    throw new ApiError(409, 'revision_conflict', 'Task changed; refresh before completing it');
  }
  return { id: obligationId, state: 'done', revision: Number(input.revision) + 1 };
}

export async function waiveObligation(ctx: WorkContext, workId: string, obligationId: string, input: Record<string, unknown>) {
  const {row,work} = await openRow(ctx, workId, obligationId);
  if (!['task.manual', 'access.grant', 'device.deliver'].includes(row.kind) || row.lifecycle_id) throw new ApiError(422, 'not_waivable', 'Only catalog request responsibilities can be waived');
  if (!mayWaive(ctx, row)) throw new ApiError(403, 'waiver_owner_only', "Only the responsibility's owner, or the workspace owner, waives it");
  if (!Number.isInteger(input.revision)) throw new ApiError(422, 'revision', 'Current responsibility revision required');
  if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 500) throw new ApiError(422, 'reason_required', 'Explain why this responsibility is waived');
  if (!waivable(row)) throw new ApiError(409, 'not_waivable', 'A responsibility with an applied or uncertain effect must be reconciled, not waived');
  const w = ctx.principal.workspaceId, t = now();
  const [result] = await departmentWorkBatch(ctx,work,[ctx.env.DB.prepare(`UPDATE work_obligations SET state='waived',waived_by=?,waived_at=?,revision=revision+1
    WHERE workspace_id=? AND id=? AND revision=? AND state IN ('pending','blocked','failed')`).bind(ctx.principal.userId, t, w, obligationId, input.revision),
    audit(ctx, 'work.obligation_waived', obligationId, { workId, kind: row.kind, reason: input.reason.trim() }, true),
    ctx.env.DB.prepare(`UPDATE work_catalog_reservations SET released_at=? WHERE workspace_id=? AND work_id=? AND released_at IS NULL AND changes()=1
      AND catalog_id IN (SELECT id FROM work_catalog WHERE workspace_id=? AND target=?)`).bind(t, w, workId, w, row.target),
    ctx.env.DB.prepare("UPDATE work_records SET updated_at=? WHERE workspace_id=? AND id=? AND EXISTS(SELECT 1 FROM work_obligations WHERE workspace_id=? AND id=? AND state='waived')").bind(t, w, workId, w, obligationId)],workDepartmentScoped(work)?'staff':'read');
  if (!result.meta.changes) throw new ApiError(409, 'revision_conflict', 'Responsibility changed; refresh before waiving it');
  return { id: obligationId, state: 'waived', revision: Number(input.revision) + 1 };
}

/** The request's responsibilities as its readers see them, with what the caller may do to each. */
export async function describeObligations(ctx: WorkContext, workId: string, rows: any[]) {
  const work=await getWork(ctx,workId),staff=workDepartmentStaff(ctx.principal,work),canAct=!workDepartmentScoped(work)||staff,w=ctx.principal.workspaceId;
  const titles = new Map(rows.map(r => [r.id, r.title ?? 'The automated step']));
  const groups = new Map((await ctx.env.DB.prepare('SELECT id,name FROM work_groups WHERE workspace_id=?').bind(w).all<{ id: string; name: string }>()).results.map(g => [g.id, g.name]));
  const state = new Map(rows.map(r => [r.id, r.state]));
  const ready = new Map<string, boolean>();
  for (const row of rows) if (row.kind === 'task.manual' && row.state === 'pending' && row.catalog_id && !ready.has(row.catalog_id))
    ready.set(row.catalog_id, (await getFulfilmentReadiness(ctx, workId, row.catalog_id)).ready);
  return Promise.all(rows.map(async row => {
    const { catalog_id, after_json, lifecycle_id, ...visible } = row;
    if (row.kind !== 'task.manual') return { ...visible, can_waive: canAct && mayWaive(ctx, row) && waivable(row) };
    // LIFE-002: a template task of a lifecycle record is done by its team or named person and waived by the owner.
    if (lifecycle_id) return { ...visible, group_name: staff ? groups.get(row.group_id) ?? null : undefined, waiting_for: [],
      can_complete: canAct && row.state === 'pending' && await mayDoTask(ctx, row), can_waive: canAct && row.state === 'pending' && ctx.principal.roles.includes('owner'), lifecycle_task: true };
    const waitingFor = (JSON.parse(after_json || '[]') as string[]).filter(dep => !['verified', 'done', 'waived'].includes(state.get(dep) ?? '')).map(dep => titles.get(dep) ?? 'An earlier step');
    const member = canAct && row.state === 'pending' && ctx.principal.roles.some(r => ['owner', 'operator'].includes(r))
      && (ctx.principal.roles.includes('owner') || (row.group_id ? await groupMember(ctx, row.group_id, ctx.principal.userId) : row.owner_id === ctx.principal.userId));
    return { ...visible, group_name: staff ? groups.get(row.group_id) ?? null : undefined, waiting_for: waitingFor,
      can_complete: Boolean(member) && !waitingFor.length && ready.get(catalog_id) === true, can_waive: canAct && mayWaive(ctx, row) && waivable(row) };
  }));
}

/** CATALOG-003: the request closes only when every one of its catalog responsibilities is settled. */
export async function assertCloseable(ctx: WorkContext, workId: string) {
  const open = await ctx.env.DB.prepare(`SELECT COUNT(*) n FROM work_obligations WHERE workspace_id=? AND work_id=? AND ${CLOSE_GATED} AND state IN ${OPEN}`)
    .bind(ctx.principal.workspaceId, workId).first<{ n: number }>();
  if (open?.n) throw new ApiError(409, 'obligations_open', `${open.n} responsibilit${open.n === 1 ? 'y is' : 'ies are'} not yet verified, done or waived. Finish each, or ask its owner to waive it with a reason, before closing`);
}

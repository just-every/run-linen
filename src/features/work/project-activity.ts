import {registeredHistory,historyEventStatement,readHistoryEvent} from '../history/event';
import {changeRecords} from './work-history';
import { ApiError, id, now } from '../../platform/http';
import { currentWorkPrincipal } from './identity';
import { permit, type WorkContext } from './core';
import type { ActivityEntry } from './activity';

export interface TaskChange { field: string; before: unknown; after: unknown }
export interface TaskOrigin { scenarioId: string; name: string }
export function taskSnapshot(task: { title: string; ownerId: string; dueDate: string; milestoneId?: string | null; dependsOn?: string[]; status?: string }) {
  return { title: task.title, state: task.status ?? 'todo', owner: task.ownerId, dueDate: task.dueDate,
    milestone: task.milestoneId ?? null, dependencies: task.dependsOn ?? [] };
}
export function taskChanges(before: Record<string, unknown> | null, after: Record<string, unknown>): TaskChange[] {
  return Object.entries(after).filter(([field, value]) => JSON.stringify(before?.[field] ?? null) !== JSON.stringify(value))
    .map(([field, value]) => ({ field, before: before?.[field] ?? null, after: value }));
}
/** Place immediately after the mutation in its D1 batch: a losing CAS or ignored link adds no event. */
export function taskEvent(ctx: WorkContext, taskId: string, action: 'created' | 'updated' | 'linked', changes: TaskChange[], at: string, origin?: TaskOrigin) {
  const actionName='work.project_task_'+action,values=changeRecords(changes.map(c=>c.field.endsWith(' link')?{...c,field:'link',after:{kind:c.field.slice(0,-5),id:c.after}}:c));
  return historyEventStatement(ctx,{action:actionName,target:taskId,at,envelope:registeredHistory(actionName,{kind:'task',id:taskId},values.before,values.after,origin?{kind:'scenario',id:origin.scenarioId,name:origin.name,initiatedBy:ctx.principal.userId}:{kind:'person',id:ctx.principal.userId},[],'normal',at)});
}

/** DESK-017: same live readership as PROJECT-001; historical values only ever come from their original event. */
export async function projectTaskActivity(ctx: WorkContext, projectId: string, taskId: string) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'operator', 'auditor']);
  const ws = ctx.principal.workspaceId;
  if (!await ctx.env.DB.prepare(`SELECT 1 FROM work_project_tasks t JOIN work_projects p ON p.workspace_id=t.workspace_id AND p.id=t.project_id
    WHERE t.workspace_id=? AND t.project_id=? AND t.id=?`).bind(ws, projectId, taskId).first())
    throw new ApiError(404, 'task_not_found', 'Task not found');
  const rows = (await ctx.env.DB.prepare(`SELECT e.*, CASE WHEN
    EXISTS(SELECT 1 FROM platform_identity_erasures p WHERE p.workspace_id=e.workspace_id AND p.user_id=e.actor_id) OR
    EXISTS(SELECT 1 FROM work_erasure p WHERE p.workspace_id=e.workspace_id AND p.person_id=e.actor_id)
    THEN '[erased]' ELSE COALESCE(u.name,e.actor_id) END actor_name
    FROM audit_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.workspace_id=? AND e.target=?
    AND e.action IN ('work.project_task_created','work.project_task_updated','work.project_task_linked') ORDER BY e.created_at,e.rowid`)
    .bind(ws, taskId).all<any>()).results;
  await ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
    .bind(id(), ws, ctx.principal.userId, 'work.project_task_activity_read', taskId, '{}', now()).run();
  return { items: await Promise.all(rows.map(async(e): Promise<ActivityEntry> => {
    const detail=await readHistoryEvent(ctx,e.action,e.detail_json,e.actor_id,e.id),actor='actor' in detail?detail.actor:undefined;
    return { id: e.id, at: e.created_at, kind: 'change', actor:actor?.name??(actor?.id==='[erased]'?'Erased person':e.actor_name),
      actorKind:actor?.kind==='scenario'?'scenario':'person',...(actor?.initiatedBy?{initiatedBy:actor.initiatedBy}:{}),
      action: e.action.replace('work.project_task_', 'Task '), visibility: 'private',
      changes:detail.changes.map(c=>c.field==='link'&&c.after&&typeof c.after==='object'&&'kind' in c.after?{...c,field:String(c.after.kind)+' link',after:(c.after as any).id}:c),...detail.redacted?{redacted:detail.redacted,redactedAt:detail.redactedAt}:{},
      ...(!detail.changes.length ? { body: 'Values unavailable: not recorded or removed by erasure. They are never rebuilt from the current task.' } : {}) };
  })) };
}

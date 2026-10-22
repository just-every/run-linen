import {obligationHistory,ticketHistory} from './work-history';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { currentWorkPrincipal } from './identity';
import { getWork, operator, permit, type WorkContext } from './core';
import type { BusinessCalendar } from './calendar';
import { occurrence, validateRecurrence, type RecurrenceRule } from './recurrence-calendar';
interface Task { title: string; ownerId: string }
interface Plan { id:string; workspace_id:string; creator_id:string; owner_id:string; title:string; body:string; calendar_json:string; rule_json:string; tasks_json:string; enabled:number; next_index:number; next_due_at:string; revision:number }
async function manager(ctx:WorkContext) { await currentWorkPrincipal(ctx); permit(ctx,['owner','operator']); }
async function owner(ctx:WorkContext, userId:string) {
  const row=await ctx.env.DB.prepare("SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1 AND EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value IN ('owner','operator')) AND NOT EXISTS(SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id=?)")
    .bind(ctx.principal.workspaceId,userId,ctx.principal.workspaceId,userId).first();
  if(!row) throw new ApiError(422,'recurrence_owner','An active service owner or operator is required for every duty');
}
export async function listRecurringPlans(ctx:WorkContext) {
  await manager(ctx);
  const rows=await ctx.env.DB.prepare('SELECT * FROM work_recurring_plans WHERE workspace_id=? ORDER BY created_at DESC LIMIT 100').bind(ctx.principal.workspaceId).all<Plan>();
  const occurrences=await ctx.env.DB.prepare('SELECT * FROM work_recurring_occurrences WHERE workspace_id=? ORDER BY due_at DESC LIMIT 100').bind(ctx.principal.workspaceId).all();
  return {items:rows.results.map(p=>({...p,calendar:JSON.parse(p.calendar_json),rule:JSON.parse(p.rule_json),tasks:JSON.parse(p.tasks_json)})),occurrences:occurrences.results};
}
export async function createRecurringPlan(ctx:WorkContext,b:Record<string,unknown>) {
  await manager(ctx);
  const ownerId=requiredString(b.ownerId,'ownerId'), title=requiredString(b.title,'title',500), body=requiredString(b.body,'body',10000);
  await owner(ctx,ownerId);
  if(!b.calendar || typeof b.calendar!=='object' || Array.isArray(b.calendar) || !b.rule || typeof b.rule!=='object' || Array.isArray(b.rule)) throw new ApiError(422,'recurrence_input','Calendar and recurrence rule required');
  const calendar=b.calendar as BusinessCalendar, rule=b.rule as RecurrenceRule;
  validateRecurrence(rule,calendar);
  if(b.tasks !== undefined && (!Array.isArray(b.tasks) || b.tasks.length>30)) throw new ApiError(422,'recurrence_tasks','Up to 30 named owner duties required');
  const tasks:Task[]=[];
  for(const raw of (b.tasks || []) as Record<string,unknown>[]) {
    if(!raw || typeof raw!=='object')throw new ApiError(422,'recurrence_tasks','Named owner duties required');
    const task={title:requiredString(raw.title,'task title',500),ownerId:requiredString(raw.ownerId,'task owner')};
    await owner(ctx,task.ownerId); tasks.push(task);
  }
  const planId=id(), t=now(), first=occurrence(rule,calendar,0);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO work_recurring_plans(id,workspace_id,creator_id,owner_id,title,body,calendar_json,rule_json,tasks_json,next_due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(planId,ctx.principal.workspaceId,ctx.principal.userId,ownerId,title,body,JSON.stringify(calendar),JSON.stringify(rule),JSON.stringify(tasks),first.dueAt,t,t),
    ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),ctx.principal.workspaceId,ctx.principal.userId,'work.recurring_created',planId,JSON.stringify({ownerId,rule,taskCount:tasks.length}),t),
  ]);
  return {id:planId,revision:1,next_due_at:first.dueAt,business_date:first.date};
}
export async function setRecurringEnabled(ctx:WorkContext,planId:string,b:Record<string,unknown>) {
  await manager(ctx);
  if(typeof b.enabled!=='boolean' || !Number.isInteger(b.revision)) throw new ApiError(422,'recurrence_input','Enabled flag and current revision required');
  if(b.enabled) {
    const plan=await ctx.env.DB.prepare('SELECT creator_id,owner_id,tasks_json FROM work_recurring_plans WHERE workspace_id=? AND id=?')
      .bind(ctx.principal.workspaceId,planId).first<{creator_id:string;owner_id:string;tasks_json:string}>();
    if(!plan)throw new ApiError(404,'not_found','Recurring plan not found');
    for(const person of new Set([plan.creator_id,plan.owner_id,...(JSON.parse(plan.tasks_json) as Task[]).map(task=>task.ownerId)]))await owner(ctx,person);
  }
  const result=await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE work_recurring_plans SET enabled=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?')
      .bind(Number(b.enabled),now(),ctx.principal.workspaceId,planId,b.revision as number),
    ctx.env.DB.prepare('INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()=1')
      .bind(id(),ctx.principal.workspaceId,ctx.principal.userId,'work.recurring_enabled',planId,JSON.stringify({enabled:b.enabled}),now()),
  ]);
  if(!result[0].meta.changes)throw new ApiError(409,'revision_conflict','Plan changed or inaccessible');
  return {id:planId,enabled:b.enabled,revision:Number(b.revision)+1};
}
/** Recurring duties are local work only. They never enter the external-effect obligation processor. */
export async function processDueRecurrences(ctx:WorkContext,at=now()) {
  await currentWorkPrincipal(ctx); permit(ctx,['owner','integration']);
  if(!Number.isFinite(Date.parse(at)))throw new ApiError(422,'time','Valid processing instant required');
  at=new Date(at).toISOString();
  const rows=await ctx.env.DB.prepare('SELECT * FROM work_recurring_plans WHERE workspace_id=? AND enabled=1 AND next_due_at<=? ORDER BY next_due_at LIMIT 50')
    .bind(ctx.principal.workspaceId,at).all<Plan>();
  const results=[];
  for(const p of rows.results) {
    // A bounded batch catches up one occurrence per plan per tick, retaining every remaining due period.
    const tasks=JSON.parse(p.tasks_json) as Task[], rule=JSON.parse(p.rule_json) as RecurrenceRule, calendar=JSON.parse(p.calendar_json) as BusinessCalendar;
    const due=occurrence(rule,calendar,p.next_index), next=occurrence(rule,calendar,p.next_index+1), occurrenceId=id(), workId=id(), t=now();
    const people=[...new Set([p.creator_id,p.owner_id,...tasks.map(task=>task.ownerId)])];
    const placeholders=people.map(()=>'?').join(',');
    const admitted=`EXISTS(SELECT 1 FROM work_recurring_occurrences WHERE id=? AND workspace_id=?)`;
    // The admission, work, tasks and cursor advance commit together. A concurrent loser has no admitted id.
    const writes=[ctx.env.DB.prepare(`INSERT INTO work_recurring_occurrences SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(
      SELECT 1 FROM work_recurring_plans WHERE workspace_id=? AND id=? AND revision=? AND enabled=1 AND next_index=? AND next_due_at<=?)
      AND (SELECT COUNT(*) FROM memberships WHERE workspace_id=? AND user_id IN (${placeholders}) AND active=1
        AND EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value IN ('owner','operator'))) = ?
      AND NOT EXISTS(SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id IN (${placeholders}))
      ON CONFLICT(workspace_id,plan_id,occurrence_index) DO NOTHING`)
      .bind(occurrenceId,p.workspace_id,p.id,p.next_index,due.nominalDate,due.date,due.dueAt,workId,t,
        p.workspace_id,p.id,p.revision,p.next_index,at,p.workspace_id,...people,people.length,p.workspace_id,...people),
    ctx.env.DB.prepare(`INSERT INTO work_records(id,workspace_id,requester_id,beneficiary_id,kind,title,sensitivity,assignee_id,created_at,updated_at,context_json,dedup_key) SELECT ?,?,?,?,'request',?,'normal',?,?,?,?,? WHERE ${admitted}`)
      .bind(workId,p.workspace_id,p.creator_id,p.owner_id,p.title,p.owner_id,t,t,JSON.stringify({recurringPlanId:p.id,recurringOccurrenceId:occurrenceId,dueAt:due.dueAt,businessDate:due.date}),`recurring:${p.id}:${p.next_index}`,occurrenceId,p.workspace_id),
    ctx.env.DB.prepare(`INSERT INTO work_messages SELECT ?,?,?,?,'public',?,'initial',? WHERE ${admitted}`)
      .bind(id(),p.workspace_id,workId,p.creator_id,`${p.body}\n\nScheduled for ${due.date} (${calendar.timezone}).`,t,occurrenceId,p.workspace_id),
    ...tasks.flatMap(task=>{const taskId=id();return [ctx.env.DB.prepare(`INSERT INTO work_recurring_tasks(id,workspace_id,occurrence_id,work_id,title,owner_id) SELECT ?,?,?,?,?,? WHERE ${admitted}`)
      .bind(taskId,p.workspace_id,occurrenceId,workId,task.title,task.ownerId,occurrenceId,p.workspace_id),obligationHistory(ctx,{id:taskId,work_id:workId,owner_id:task.ownerId},'work.recurring_task_created',null,{state:'pending',title:task.title,owner:task.ownerId},t)];}),
    ctx.env.DB.prepare(`UPDATE work_recurring_plans SET next_index=next_index+1,next_due_at=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND next_index=? AND ${admitted}`)
      .bind(next.dueAt,t,p.workspace_id,p.id,p.next_index,occurrenceId,p.workspace_id),
    ticketHistory(ctx,{id:workId,requester_id:p.creator_id,beneficiary_id:p.owner_id},'work.recurring_materialized',null,{state:'open',type:'request',title:p.title,assignee:p.owner_id,dueAt:due.dueAt},t)];
    const result=await ctx.env.DB.batch(writes);
    results.push({planId:p.id,state:result[0].meta.changes?'created':'held_or_already_created',workId:result[0].meta.changes?workId:null});
  }
  return results;
}
export async function recurringTasks(ctx:WorkContext,workId:string) {
  await getWork(ctx,workId);
  return (await ctx.env.DB.prepare('SELECT * FROM work_recurring_tasks WHERE workspace_id=? AND work_id=? ORDER BY id').bind(ctx.principal.workspaceId,workId).all()).results;
}
export async function completeRecurringTask(ctx:WorkContext,workId:string,taskId:string,b:Record<string,unknown>) {
  await currentWorkPrincipal(ctx); await getWork(ctx,workId);
  const task=await ctx.env.DB.prepare('SELECT * FROM work_recurring_tasks WHERE workspace_id=? AND work_id=? AND id=?').bind(ctx.principal.workspaceId,workId,taskId).first<{owner_id:string;revision:number;state:string;completed_by:string|null;completed_at:string|null}>();
  if(!task)throw new ApiError(404,'not_found','Task not found');
  if(task.owner_id!==ctx.principal.userId && !operator(ctx.principal))throw new ApiError(403,'forbidden','Task owner or service operator required');
  if(!Number.isInteger(b.revision))throw new ApiError(422,'revision','Current task revision required');
  const t=now(), result=await ctx.env.DB.batch([
    ctx.env.DB.prepare("UPDATE work_recurring_tasks SET state='completed',completed_by=?,completed_at=?,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=? AND state='pending'")
      .bind(ctx.principal.userId,t,ctx.principal.workspaceId,taskId,b.revision as number),
    obligationHistory(ctx,{id:taskId,work_id:workId,owner_id:task.owner_id},'work.recurring_task_completed',{state:task.state,completedBy:task.completed_by,completedAt:task.completed_at,revision:task.revision},{state:'completed',completedBy:ctx.principal.userId,completedAt:t,revision:task.revision+1},t),
  ]);
  if(!result[0].meta.changes)throw new ApiError(409,'revision_conflict','Task already completed or changed');
  return {id:taskId,state:'completed',revision:Number(b.revision)+1};
}

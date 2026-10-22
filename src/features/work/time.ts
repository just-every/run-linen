import { workPrivateReadable, workDepartmentScoped } from './scope';
import { departmentWorkBatch } from './department-spaces';
import { ApiError, id, now } from '../../platform/http';
import { getWork, operator, type WorkContext } from './core';

export interface TimeEntry {
  id: string; workspace_id: string; work_id: string; obligation_id: string | null;
  actor_id: string; actor_role: string; effort_role: string; request_type: string;
  source: string; active_ms: number; touches: number; note: string; state: string; touch_kind: string;
  sequence: number; last_seen_at: string | null; created_at: string; updated_at: string; dedup_key: string;
}
// A missing heartbeat never becomes human effort. Late heartbeats re-establish a baseline only.
export const heartbeatLimitMs = 30000;
const roles = ['owner', 'operator', 'hr', 'approver', 'employee'];
/** A7: the human work a touch was for. Vendor and technician work defaults to its own kind. */
export const touchKinds = ['request_work', 'sign_in_consent', 'setup_gap', 'correction', 'physical_custody', 'vendor_technician', 'takeover', 'recovery'] as const;
export async function timeTarget(ctx: WorkContext, workId: string, obligationId?: string | null) {
  const work = await getWork(ctx, workId);
  if (obligationId && !await ctx.env.DB.prepare('SELECT 1 FROM work_obligations WHERE workspace_id=? AND work_id=? AND id=?')
    .bind(ctx.principal.workspaceId, workId, obligationId).first())
    throw new ApiError(404, 'task_not_found', 'Task not found on this request');
  return work;
}
export async function listTime(ctx: WorkContext, workId: string) {
  const work=await getWork(ctx, workId);
  // Notes and other people's effort are service-team records, not conversation messages.
  const team = workDepartmentScoped(work) ? workPrivateReadable(ctx.principal,work) : operator(ctx.principal)||ctx.principal.roles.includes('hr');
  return (await ctx.env.DB.prepare(`SELECT * FROM work_time_entries WHERE workspace_id=? AND work_id=? AND (?=1 OR actor_id=?) ORDER BY created_at,id`)
    .bind(ctx.principal.workspaceId, workId, Number(team), ctx.principal.userId).all<TimeEntry>()).results;
}
export async function recordTime(ctx: WorkContext, workId: string, input: {
  source: 'manual' | 'measured'; minutes?: number; obligationId?: string | null;
  deduplicationKey: string; note?: string; effortRole?: string; touchKind?: string;
}) {
  if(input.obligationId!==undefined && input.obligationId!==null && typeof input.obligationId!=='string')
    throw new ApiError(422,'task_input','A task identity is required');
  const work = await timeTarget(ctx, workId, input.obligationId);
  const actorRole = roles.find(role => ctx.principal.roles.includes(role as never));
  if (!actorRole) throw new ApiError(403, 'human_role_required', 'A current human workspace role is required');
  const ownRole = ['operator','hr'].includes(actorRole) ? 'agent' : actorRole;
  const effortRole = input.effortRole || ownRole;
  if (effortRole !== ownRole && !(operator(ctx.principal) && (!workDepartmentScoped(work)||workPrivateReadable(ctx.principal,work)) && ['vendor','technician'].includes(effortRole)))
    throw new ApiError(403, 'effort_role', 'Record your own role, or explicitly attributed vendor or technician work as a service operator');
  if (!['manual','measured'].includes(input.source) || typeof input.deduplicationKey !== 'string' || !input.deduplicationKey.trim() || input.deduplicationKey.length>200 || (input.note !== undefined && (typeof input.note !== 'string' || input.note.length>2000)))
    throw new ApiError(422, 'time_input', 'Source, stable entry identity and a note of at most 2000 characters required');
  const touchKind = input.touchKind ?? (['vendor','technician'].includes(effortRole) ? 'vendor_technician' : 'request_work');
  if (!touchKinds.includes(touchKind as never))
    throw new ApiError(422, 'touch_kind', `Touch kind must be one of ${touchKinds.join(', ')}`);
  const minutes = input.minutes;
  if (input.source === 'manual' && (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes<=0 || minutes>1440))
    throw new ApiError(422, 'minutes', 'Enter active minutes greater than zero, at most one day per entry');
  if(input.source==='measured' && (minutes!==undefined || effortRole!==ownRole))
    throw new ApiError(422,'measured_input','Measured activity records only the signed-in person and server-bounded activity');
  const previous = await ctx.env.DB.prepare('SELECT * FROM work_time_entries WHERE workspace_id=? AND actor_id=? AND dedup_key=?')
    .bind(ctx.principal.workspaceId,ctx.principal.userId,input.deduplicationKey).first<TimeEntry>();
  if(previous) {
    if(previous.work_id!==workId || previous.obligation_id!==(input.obligationId||null) || previous.source!==input.source || previous.note!==(input.note||'') || previous.effort_role!==effortRole || previous.touch_kind!==touchKind || (input.source==='manual' && previous.active_ms!==Math.round(minutes!*60000)))
      throw new ApiError(409,'time_conflict','Entry identity already belongs to different effort');
    return previous;
  }
  const service = await ctx.env.DB.prepare(`SELECT c.name FROM work_fulfilments f JOIN work_catalog c ON c.workspace_id=f.workspace_id AND c.id=f.catalog_id WHERE f.workspace_id=? AND f.work_id=? ORDER BY c.id LIMIT 1`)
    .bind(ctx.principal.workspaceId,workId).first<{name:string}>();
  const entryId=id(), t=now();
  // Expired timers relinquish authority without inventing elapsed effort.
  const statements = input.source==='measured' ? [ctx.env.DB.prepare("UPDATE work_time_entries SET state='paused',last_seen_at=NULL,sequence=sequence+1 WHERE workspace_id=? AND actor_id=? AND state='active' AND last_seen_at<?")
    .bind(ctx.principal.workspaceId,ctx.principal.userId,new Date(Date.now()-heartbeatLimitMs).toISOString())] : [];
  try { await departmentWorkBatch(ctx,work,[...statements,ctx.env.DB.prepare(`INSERT INTO work_time_entries(id,workspace_id,work_id,obligation_id,actor_id,actor_role,effort_role,request_type,source,active_ms,note,state,last_seen_at,created_at,updated_at,dedup_key,touch_kind) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(entryId,ctx.principal.workspaceId,workId,input.obligationId||null,ctx.principal.userId,actorRole,effortRole,service?.name||work.kind,input.source,input.source==='manual'?Math.round(minutes!*60000):0,input.note||'',input.source==='manual'?'completed':'active',input.source==='manual'?null:t,t,t,input.deduplicationKey,touchKind)]); }
  catch(error) {
    if(String(error).includes('UNIQUE constraint')) throw new ApiError(409,'time_conflict','An entry or active timer already exists. Refresh the recorded effort before starting another.');
    throw error;
  }
  return ctx.env.DB.prepare('SELECT * FROM work_time_entries WHERE id=?').bind(entryId).first<TimeEntry>();
}
export async function updateTimer(ctx: WorkContext, workId: string, entryId: string, input: {
  command: 'heartbeat'|'pause'|'resume'|'stop'; sequence: number; activeMs?: number;
}) {
  await getWork(ctx,workId);
  const row=await ctx.env.DB.prepare("SELECT * FROM work_time_entries WHERE workspace_id=? AND work_id=? AND id=? AND actor_id=? AND source='measured'")
    .bind(ctx.principal.workspaceId,workId,entryId,ctx.principal.userId).first<TimeEntry>();
  if(!row) throw new ApiError(404,'timer_not_found','Your timer was not found');
  if(!ctx.principal.roles.includes(row.actor_role as never))
    throw new ApiError(403,'timer_role_changed','Your role changed; start a new entry under your current role');
  if(!['heartbeat','pause','resume','stop'].includes(input.command) || !Number.isInteger(input.sequence) || (input.activeMs!==undefined && (!Number.isFinite(input.activeMs)||input.activeMs<0)))
    throw new ApiError(422,'timer_input','A timer command, sequence and nonnegative active duration required');
  if(input.sequence!==row.sequence || row.state==='completed') throw new ApiError(409,'timer_changed','Timer changed; refresh its recorded state');
  if(input.command==='heartbeat' && row.state!=='active') throw new ApiError(409,'timer_paused','Resume before recording activity');
  if(input.command==='resume' && row.state!=='paused') throw new ApiError(409,'timer_active','Only a paused timer can resume');
  const t=now(), elapsed=row.last_seen_at?Date.parse(t)-Date.parse(row.last_seen_at):0;
  const credit = input.command==='heartbeat' && elapsed>=0 && elapsed<=heartbeatLimitMs ? Math.floor(Math.min(elapsed,input.activeMs||0)) : 0;
  const state=input.command==='stop'?'completed':input.command==='pause'?'paused':'active';
  try {
    const changed=await ctx.env.DB.prepare(`UPDATE work_time_entries SET active_ms=active_ms+?,state=?,last_seen_at=?,sequence=sequence+1,touches=touches+?,updated_at=? WHERE workspace_id=? AND id=? AND actor_id=? AND sequence=? AND state=?`)
      .bind(credit,state,state==='active'?t:null,Number(input.command==='resume'),t,ctx.principal.workspaceId,entryId,ctx.principal.userId,row.sequence,row.state).run();
    if(!changed.meta.changes) throw new ApiError(409,'timer_changed','Timer changed; refresh its recorded state');
  } catch(error) {
    if(String(error).includes('UNIQUE constraint')) throw new ApiError(409,'timer_active','Pause your other active timer before resuming');
    throw error;
  }
  return ctx.env.DB.prepare('SELECT * FROM work_time_entries WHERE id=?').bind(entryId).first<TimeEntry>();
}

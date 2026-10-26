import type {Context} from 'hono';
import type {AppEnv} from './types';
import type {Item} from './sandboxes';
import type {SlaConfiguration} from './sandbox-sla-config';
import {ApiError} from './http';
import {calendarFromRow} from '../features/work/calendar';
import {normalizeStages,type StageDef} from '../features/work/approval-config';
export async function editSandboxApprovals(c:Context<AppEnv>,item:Item,configuration:SlaConfiguration,body:Record<string,unknown>,baseline:SlaConfiguration) {
 const calendar=configuration.calendar.find(row=>row.id===body.calendarId);
 if(!calendar)throw new ApiError(422,'approval_calendar_required','Choose a draft business calendar');
 if(typeof body.requiresManager!=='boolean')throw new ApiError(422,'approval_manager','Choose whether manager approval is required');
 const ctx={env:c.env,principal:c.get('principal')},business=calendarFromRow(calendar as never);
 const bind=(stage:StageDef)=>({...stage,calendarId:calendar.id,calendarRevision:calendar.revision+Number(Object.entries(calendar).some(([key,value])=>value!==baseline.calendar.find(row=>row.id===calendar.id)?.[key]))});
 item.approvals=(await normalizeStages(ctx,body.approvals,item.form,business)).map(bind);
 if(body.manager!=null&&(!body.requiresManager||typeof body.manager!=='object'||Array.isArray(body.manager)||Object.keys(body.manager).some(key=>!['remindHours','slaHours'].includes(key))))throw new ApiError(422,'approval_manager_timing','Manager timing has only reminder and SLA business hours');
 item.managerApproval=body.manager==null?null:{...bind((await normalizeStages(ctx,[{...body.manager as object,key:'manager_timer',name:'Manager approval',mode:'any',approvers:[{type:'application_owner'}]}],item.form,business))[0]),key:'manager'};
 item.requiresManager=Number(body.requiresManager);
}
export function sandboxApprovalGuards(c:Context<AppEnv>,item:Item) {
 const ws=c.get('principal').workspaceId,checks:D1PreparedStatement[]=[];
 for(const stage of [...item.approvals??[],...item.managerApproval?[item.managerApproval]:[]]) {
  checks.push(c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM work_calendars WHERE workspace_id=? AND id=?) THEN 1 ELSE 0 END').bind(ws,stage.calendarId));
  for(const holder of stage.approvers)if(holder.type==='group')checks.push(c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM work_groups WHERE workspace_id=? AND id=?) THEN 1 ELSE 0 END').bind(ws,holder.groupId));else if(holder.type==='member')checks.push(c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1) THEN 1 ELSE 0 END').bind(ws,holder.userId));
 }
 return checks;
}

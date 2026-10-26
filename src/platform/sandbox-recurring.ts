import type {Context} from 'hono';
import type {AppEnv} from './types';
import {validateCalendar} from '../features/work/calendar';
import {ApiError,requiredString} from './http';
import {occurrence,validateRecurrence} from '../features/work/recurrence-calendar';
export type RecurringConfiguration=Record<string,string|number|null>&{id:string;revision:number};
export async function editRecurringConfiguration(c:Context<AppEnv>,row:RecurringConfiguration) {
 row.title=requiredString(row.title,'title',500);row.body=requiredString(row.body,'body',10000);
 if(row.enabled!==0&&row.enabled!==1)throw new ApiError(422,'recurrence_input','Choose whether this recurring plan is active');
 try {
  const rule=JSON.parse(String(row.rule_json)),calendar=JSON.parse(String(row.calendar_json)),tasks=JSON.parse(String(row.tasks_json));
  if(!rule||typeof rule!=='object'||Object.keys(rule).some(key=>!['startDate','frequency','interval','firstBusinessDay'].includes(key))||!calendar||typeof calendar!=='object'||Object.keys(calendar).some(key=>!['timezone','startHour','endHour','weekdays','holidays','holidayCatalog'].includes(key)))throw new ApiError(422,'sandbox_config_only','Only recurrence and business calendar fields are accepted');
  validateRecurrence(rule,calendar);validateCalendar(calendar);
  if(!Array.isArray(tasks)||tasks.length>30)throw new ApiError(422,'recurrence_tasks','Up to 30 named duties are allowed');
  for(const task of tasks){if(!task||typeof task!=='object'||Object.keys(task).some(key=>!['title','ownerId'].includes(key)))throw new ApiError(422,'recurrence_tasks','Each duty has a title and owner');task.title=requiredString(task.title,'task title',500);task.ownerId=requiredString(task.ownerId,'task owner');}
  row.owner_id=requiredString(row.owner_id,'owner');
  for(const userId of new Set([row.owner_id,...tasks.map(task=>task.ownerId)]))if(!await c.env.DB.prepare("SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1 AND EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value IN ('owner','operator')) AND NOT EXISTS(SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id=?)").bind(c.get('principal').workspaceId,userId,c.get('principal').workspaceId,userId).first())throw new ApiError(422,'recurrence_owner','Choose active service owners or operators');
  row.rule_json=JSON.stringify(rule);row.calendar_json=JSON.stringify(calendar);row.tasks_json=JSON.stringify(tasks);
  occurrence(rule,calendar,Number(row.next_index));
 }catch(error){if(error instanceof ApiError)throw error;throw new ApiError(422,'recurrence_input','Choose a valid calendar, recurrence and named duties');}
}
export function recurringNext(row:RecurringConfiguration){return occurrence(JSON.parse(String(row.rule_json)),JSON.parse(String(row.calendar_json)),Number(row.next_index));}
export function recurringAuthority(c:Context<AppEnv>,row:RecurringConfiguration) {
 const ws=c.get('principal').workspaceId;
 return [...new Set([row.owner_id,...JSON.parse(String(row.tasks_json)).map((task:{ownerId:string})=>task.ownerId)])].map(userId=>c.env.DB.prepare("INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1 AND EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value IN ('owner','operator')) AND NOT EXISTS(SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id=?)) THEN 1 ELSE 0 END").bind(ws,userId,ws,userId));
}

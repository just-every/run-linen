import type { Context } from 'hono';
import type { AppEnv } from './types';
import { ApiError, requiredString } from './http';
import { preserveFollowupVersions } from '../features/work/followup-versions';
import { id } from './http';
import { validateRolePermissions } from '../features/work/department-role-admin';
import { normalizeTasks, templateKinds } from '../features/work/lifecycle-templates';
import { normalizeMatch } from '../features/work/access-policies';
import { calendarFromRow, validateCalendar } from '../features/work/calendar';

type C = Context<AppEnv>;
type Row = Record<string,string|number|null> & {id:string;revision:number};
export type SlaConfiguration = Record<Family,Row[]>;
const specs = {
 lifecycle: {table:'work_lifecycle_templates',fields:['name','kind','match_json','tasks_json','active']},
 role: {table:'work_department_roles',fields:['name','permissions_json','active','department_id']},
 calendar: {table:'work_calendars',fields:['name','timezone','weekdays_json','start_hour','end_hour','holidays_json','location','holiday_catalog']},
 escalation: {table:'work_escalation_levels',fields:['target','level','offset_minutes','notify','label']},
 waiting: {table:'work_waiting_rules',fields:['remind_business_days','resolve_business_days']},
} as const;
type Family = keyof typeof specs;
export async function readSlaConfiguration(c:C):Promise<SlaConfiguration> {
 const ws=c.get('principal').workspaceId;
 const entries=await Promise.all(Object.entries(specs).map(async([family,spec])=>[family,(await c.env.DB.prepare(`SELECT ${family==='waiting'?"'waiting' AS id":'id'},revision,${spec.fields.join(',')} FROM ${spec.table} WHERE workspace_id=? ORDER BY id`).bind(ws).all<Row>()).results]));
 return Object.fromEntries(entries) as SlaConfiguration;
}
export function configurationDifferences(before:SlaConfiguration,after:SlaConfiguration) {
 return (Object.keys(specs) as Family[]).flatMap(family=>(after[family]??[]).flatMap(row=>{
  const prior=(before[family]??[]).find(x=>x.id===row.id)!;
  return specs[family].fields.filter(field=>row[field]!==prior[field]).map(field=>({family,configurationId:row.id,field,before:prior[field],after:row[field]}));
 }));
}
export async function editSlaConfiguration(c:C,draft:SlaConfiguration,family:string,configurationId:string,body:Record<string,unknown>) {
 if(!Object.hasOwn(specs,family))throw new ApiError(404,'not_found','Configuration family unavailable');
 const kind=family as Family,spec=specs[kind],row=(draft[kind]??[]).find(x=>x.id===configurationId);
 if(!row)throw new ApiError(404,'not_found','Configuration unavailable in this sandbox');
 if(Object.keys(body).some(key=>key!=='revision'&&!(spec.fields as readonly string[]).includes(key)))throw new ApiError(422,'sandbox_config_only','Only the named configuration fields are accepted');
 for(const field of spec.fields)if(body[field]!==undefined)row[field]=body[field] as string|number|null;
 if(kind==='lifecycle') {
  row.name=requiredString(row.name,'name',200);
  if(!templateKinds.includes(row.kind as never)||![0,1].includes(Number(row.active))||typeof row.active!=='number')throw new ApiError(422,'lifecycle_template','Choose a lifecycle event and active state');
  try {
   row.match_json=JSON.stringify(normalizeMatch(JSON.parse(String(row.match_json))));
   row.tasks_json=JSON.stringify(await normalizeTasks({env:c.env,principal:c.get('principal')},JSON.parse(String(row.tasks_json))));
  }catch(error){if(error instanceof ApiError)throw error;throw new ApiError(422,'lifecycle_template','Choose valid reviewed values and dated tasks');}
  for(const [dimension,values] of Object.entries(JSON.parse(row.match_json as string)))for(const value of values as string[])if(!await c.env.DB.prepare('SELECT 1 FROM work_catalog_values WHERE workspace_id=? AND dimension=? AND id=? AND active=1').bind(c.get('principal').workspaceId,dimension,value).first())throw new ApiError(422,'lifecycle_template','Choose active reviewed values from this workspace');
 } else if(kind==='role') {
  const original=(await c.env.DB.prepare('SELECT department_id FROM work_department_roles WHERE workspace_id=? AND id=?').bind(c.get('principal').workspaceId,row.id).first<{department_id:string}>());
  if(!original||row.department_id!==original.department_id)throw new ApiError(422,'role_department_immutable','Create a separate role for another department');
  row.name=requiredString(row.name,'name',120);
  if(row.active!==0&&row.active!==1)throw new ApiError(422,'role_active','Choose whether the role is active');
  try {row.permissions_json=JSON.stringify(validateRolePermissions(JSON.parse(String(row.permissions_json))));}catch {throw new ApiError(422,'role_permissions','Choose the explicit supported ticket permissions');}
  if(!await c.env.DB.prepare("SELECT 1 FROM work_departments WHERE workspace_id=? AND id=? AND active=1 AND kind<>'hr'").bind(c.get('principal').workspaceId,row.department_id).first())throw new ApiError(422,'role_department','Choose an active non-HR department');
  if(draft.role.some(other=>other.id!==row.id&&other.department_id===row.department_id&&other.name===row.name))throw new ApiError(422,'role_exists','This department already has a draft role with that name');
 } else if(kind==='calendar') {
  row.name=requiredString(row.name,'name',120);
  if(typeof row.timezone!=='string'||typeof row.weekdays_json!=='string'||typeof row.holidays_json!=='string')throw new ApiError(422,'calendar','Choose a time zone, weekdays and holidays');
  try {validateCalendar(calendarFromRow(row as never));}catch {throw new ApiError(422,'calendar','Invalid business calendar');}
  if(row.location!==null&&(typeof row.location!=='string'||!row.location.trim()||row.location.length>120))throw new ApiError(422,'calendar_location','Location must be a short name');
 } else if(kind==='escalation') {
  if(!['first_response','resolution'].includes(String(row.target))||!Number.isInteger(row.level)||Number(row.level)<1||Number(row.level)>5||!Number.isInteger(row.offset_minutes)||Math.abs(Number(row.offset_minutes))>10080)throw new ApiError(422,'escalation','Choose a target, level from 1 to 5 and whole-minute offset within one week');
  row.label=requiredString(row.label,'label',80);row.notify=requiredString(row.notify,'notify',200);
  await checkRecipient(c,row.notify);
  if(draft.escalation.some(other=>other.id!==row.id&&other.target===row.target&&other.level===row.level))throw new ApiError(422,'escalation_level','Another draft rule holds this target and level');
 } else if(!Number.isInteger(row.remind_business_days)||!Number.isInteger(row.resolve_business_days)||Number(row.remind_business_days)<1||Number(row.resolve_business_days)<=Number(row.remind_business_days)||Number(row.resolve_business_days)>30)throw new ApiError(422,'waiting_rule','Remind after at least one business day and resolve later within 30 days');
}
async function checkRecipient(c:C,notify:string) {
 if(notify!=='assignee'&&!await c.env.DB.prepare("SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1 AND EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value IN ('owner','operator'))").bind(c.get('principal').workspaceId,notify).first())throw new ApiError(422,'escalation_notify','Choose the assignee or an active owner or operator');
}
export function promoteSlaConfiguration(c:C,before:SlaConfiguration,after:SlaConfiguration) {
 const db=c.env.DB,ws=c.get('principal').workspaceId,statements:D1PreparedStatement[]=[],updates:D1PreparedStatement[]=[];
 for(const family of Object.keys(specs) as Family[]) {
  const spec=specs[family];
  statements.push(db.prepare(`INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN COUNT(*)=? THEN 1 ELSE 0 END FROM ${spec.table} WHERE workspace_id=?`).bind((before[family]??[]).length,ws));
  for(const row of before[family]??[]) {
   const fields=['revision',...spec.fields],where=family==='waiting'?'workspace_id=?':'workspace_id=? AND id=?',keys=family==='waiting'?[ws]:[ws,row.id];
   statements.push(db.prepare(`INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM ${spec.table} WHERE ${where} AND ${fields.map(f=>f+' IS ?').join(' AND ')}) THEN 1 ELSE 0 END`).bind(...keys,...fields.map(f=>row[f])));
   const next=after[family].find(x=>x.id===row.id)!;
   if(family==='lifecycle') {
    for(const task of JSON.parse(String(next.tasks_json)))if(task.assignee.type==='group')statements.push(db.prepare('INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM work_groups WHERE workspace_id=? AND id=?) THEN 1 ELSE 0 END').bind(ws,task.assignee.groupId));
    for(const [dimension,values] of Object.entries(JSON.parse(String(next.match_json))))for(const value of values as string[])statements.push(db.prepare('INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM work_catalog_values WHERE workspace_id=? AND dimension=? AND id=? AND active=1) THEN 1 ELSE 0 END').bind(ws,dimension,value));
   }
   if(family==='role'&&spec.fields.some(f=>row[f]!==next[f]))statements.push(db.prepare("INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM work_departments WHERE workspace_id=? AND id=? AND active=1 AND kind<>'hr') THEN 1 ELSE 0 END").bind(ws,next.department_id));
   if(family==='escalation'&&next.notify!=='assignee')statements.push(db.prepare("INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1 AND EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value IN ('owner','operator'))) THEN 1 ELSE 0 END").bind(ws,next.notify));
   if(spec.fields.some(f=>row[f]!==next[f])||family==='role'&&configurationDifferences(before,after).some(d=>d.family==='role'&&d.field==='name')||family==='escalation'&&configurationDifferences(before,after).some(d=>d.family==='escalation'))updates.push(db.prepare(`UPDATE ${spec.table} SET ${spec.fields.map(f=>f+'=?').join(',')},revision=revision+? WHERE ${where}`).bind(...spec.fields.map(f=>next[f]),Number(spec.fields.some(f=>row[f]!==next[f])),...keys));
  }
 }
 if(configurationDifferences(before,after).some(d=>d.family==='escalation'||d.family==='waiting'))statements.push(...preserveFollowupVersions(db,ws));
 if(configurationDifferences(before,after).some(d=>d.family==='role'&&d.field==='name'))statements.push(db.prepare('UPDATE work_department_roles SET name=?||id WHERE workspace_id=?').bind('sandbox-stage-'+id()+'-',ws));
 if(configurationDifferences(before,after).some(d=>d.family==='escalation'))statements.push(db.prepare('UPDATE work_escalation_levels SET level=-level WHERE workspace_id=?').bind(ws));
 return [...statements,...updates];
}
export function rollbackSlaConfiguration(current:SlaConfiguration,before:SlaConfiguration,after:SlaConfiguration) {
 const draft=structuredClone(current);
 for(const family of Object.keys(specs) as Family[])for(const original of before[family]??[]) {
  const applied=after[family].find(x=>x.id===original.id)!,fields=specs[family].fields;
  if(!fields.some(f=>original[f]!==applied[f]))continue;
  const row=draft[family].find(x=>x.id===original.id);
  if(!row||row.revision!==original.revision+1||fields.some(f=>row[f]!==applied[f]))throw new ApiError(409,'production_changed','Later SLA configuration changes prevent this rollback');
  for(const field of fields)row[field]=original[field];
 }
 return draft;
}

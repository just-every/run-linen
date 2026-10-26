import type { Context } from 'hono';
import type { AppEnv } from './types';
import { ApiError, requiredString } from './http';
import { categories } from '../features/work/classification-policy';

export type Sla = {id:string;name:string;revision:number;position:number;priority:string|null;category:string|null;requester_group_id:string|null;calendar_id:string|null;department_id:string|null;first_response_minutes:number;next_response_minutes:number;resolution_minutes:number;pause_on_json:string};
export const slaFields=['name','position','priority','category','requester_group_id','calendar_id','department_id','first_response_minutes','next_response_minutes','resolution_minutes','pause_on_json'] as const;
const columns='id,name,revision,position,priority,category,requester_group_id,calendar_id,department_id,first_response_minutes,next_response_minutes,resolution_minutes,pause_on_json';
export async function sandboxSlas(c:Context<AppEnv>):Promise<Sla[]> {
 return (await c.env.DB.prepare(`SELECT ${columns} FROM work_sla_policies WHERE workspace_id=? ORDER BY id`).bind(c.get('principal').workspaceId).all<Sla>()).results;
}
export async function editSandboxSla(c:Context<AppEnv>,item:Sla,body:Record<string,unknown>) {
 const ws=c.get('principal').workspaceId;
 if(body.position!==undefined) {
  if(!Number.isInteger(body.position)||(body.position as number)<1||(body.position as number)>1000)throw new ApiError(422,'sla_position','Position must be a whole number from 1 to 1000');
  item.position=body.position as number;
 }
 for(const field of ['priority','category'] as const)if(body[field]!==undefined) {
  const value=body[field];
  if(value!==null&&(typeof value!=='string'||(field==='priority'?!['P1','P2','P3','P4'].includes(value):!Object.hasOwn(categories,value))))throw new ApiError(422,'sla_scope','Choose a supported priority and category');
  item[field]=value as string|null;
 }
 for(const [field,table] of [['requester_group_id','work_requester_groups'],['calendar_id','work_calendars'],['department_id','work_departments']] as const)if(body[field]!==undefined) {
  const value=body[field];
  if(value!==null&&(typeof value!=='string'||!await c.env.DB.prepare(`SELECT 1 FROM ${table} WHERE workspace_id=? AND id=?${field==='department_id'?' AND active=1':''}`).bind(ws,value).first()))throw new ApiError(422,'sla_scope','Choose current configuration in this workspace');
  item[field]=value as string|null;
 }
 item.name=requiredString(body.name,'name',120);
 for(const field of ['first_response_minutes','next_response_minutes','resolution_minutes'] as const) {
  const value=body[field];
  if(!Number.isInteger(value)||(value as number)<1||(value as number)>525600)throw new ApiError(422,'sla_target','SLA targets must be whole minutes between 1 and 525600');
  item[field]=value as number;
 }
 if(!Array.isArray(body.pauseOn)||body.pauseOn.some(v=>v!=='requester'&&v!=='vendor'))throw new ApiError(422,'sla_pause_on','Choose requester, vendor, both or neither');
 item.pause_on_json=JSON.stringify([...new Set(body.pauseOn)].sort());
}
export function slaDifferences(baseline:Sla[],draft:Sla[]) {
 return draft.flatMap(item=>{
  const before=baseline.find(x=>x.id===item.id)!;
  return slaFields.filter(field=>before[field]!==item[field]).map(field=>({family:'sla' as const,slaId:item.id,field,before:before[field],after:item[field]}));
 });
}
export function slaPromotion(c:Context<AppEnv>,baseline:Sla[],draft:Sla[]) {
 const ws=c.get('principal').workspaceId,db=c.env.DB;
 const statements=[db.prepare('INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN COUNT(*)=? THEN 1 ELSE 0 END FROM work_sla_policies WHERE workspace_id=?').bind(baseline.length,ws)];
 for(const before of baseline) {
  const fields=columns.split(',');
  statements.push(db.prepare(`INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM work_sla_policies WHERE workspace_id=? AND ${fields.map(f=>f+' IS ?').join(' AND ')}) THEN 1 ELSE 0 END`).bind(ws,...fields.map(f=>before[f as keyof Sla])));
  const after=draft.find(x=>x.id===before.id)!;
  for(const [field,table] of [['requester_group_id','work_requester_groups'],['calendar_id','work_calendars'],['department_id','work_departments']] as const)if(after[field]!==null)statements.push(db.prepare(`INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM ${table} WHERE workspace_id=? AND id=?${field==='department_id'?' AND active=1':''}) THEN 1 ELSE 0 END`).bind(ws,after[field]));
 }
 // Vacate positions inside the same transaction so reviewed swaps cannot collide.
 // No intermediate order is observable outside this atomic batch.
 if(slaDifferences(baseline,draft).length) {
  statements.push(db.prepare('UPDATE work_sla_policies SET position=-position WHERE workspace_id=?').bind(ws));
  for(const before of baseline) {
   const after=draft.find(x=>x.id===before.id)!;
   statements.push(db.prepare(`UPDATE work_sla_policies SET ${slaFields.map(f=>f+'=?').join(',')},revision=revision+? WHERE workspace_id=? AND id=?`).bind(...slaFields.map(f=>after[f]),Number(slaFields.some(f=>before[f]!==after[f])),ws,before.id));
  }
 }
 return statements;
}

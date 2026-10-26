import type {Context} from 'hono';
import type {AppEnv} from './types';
import {ApiError,requiredString} from './http';
import {categories} from '../features/work/classification-policy';

type Row=Record<string,string|number|null>&{id:string;revision:number};
type Configuration=Record<string,Row[]>;
export const routingSpecs={
 routing:{table:'work_routing_rules',fields:['name','position','category','requester_id','requester_group_id','skill','group_id','department_id']},
 support:{table:'work_support_groups',fields:['group_id'],key:'item_id'},
 agent:{table:'work_agent_routing',fields:['calendar_id','skills_json'],key:'user_id'},
 assignment:{table:'work_groups',fields:['assignment','max_open']},
} as const;
export const isRouting=(family:string)=>Object.hasOwn(routingSpecs,family);
export const routingKey=(family:string)=>family==='support'?'item_id':family==='agent'?'user_id':'id';
const optional=(value:unknown,name:string,max=120)=>value===null?null:requiredString(value,name,max);
async function exists(c:Context<AppEnv>,table:string,key:string,value:unknown,extra='') {
 if(value!==null&&!await c.env.DB.prepare(`SELECT 1 FROM ${table} WHERE workspace_id=? AND ${key}=? ${extra}`).bind(c.get('principal').workspaceId,value).first())throw new ApiError(422,'sandbox_routing_reference','Choose a current routing reference in this workspace');
}
export async function validateRouting(c:Context<AppEnv>,draft:Configuration,family:string,row:Row) {
 if(family==='routing') {
  row.name=requiredString(row.name,'name',120);
  if(!Number.isInteger(row.position)||Number(row.position)<1||Number(row.position)>1000)throw new ApiError(422,'routing_position','Choose a whole rule position from 1 to 1000');
  for(const field of ['category','requester_id','requester_group_id','skill','department_id'])row[field]=optional(row[field],field,field==='skill'?60:120);
  if(row.category!==null&&!Object.hasOwn(categories,String(row.category)))throw new ApiError(422,'routing_category','Choose a desk category');
  await exists(c,'memberships','user_id',row.requester_id,'AND active=1');
  await exists(c,'work_requester_groups','id',row.requester_group_id);
  await exists(c,'work_departments','id',row.department_id,'AND active=1');
  if(draft.routing.some(other=>other.id!==row.id&&other.position===row.position&&other.department_id===row.department_id))throw new ApiError(422,'routing_position_taken','Another draft rule holds this position');
 }
 if(family==='routing'||family==='support') {
  row.group_id=requiredString(row.group_id,'group_id');await exists(c,'work_groups','id',row.group_id);
  if(family==='routing'&&!await c.env.DB.prepare('SELECT 1 FROM work_groups WHERE workspace_id=? AND id=? AND department_id IS ?').bind(c.get('principal').workspaceId,row.group_id,row.department_id).first())throw new ApiError(422,'group_department','Route to a group in the rule department');
  if(family==='support')await exists(c,'svc_records','id',row.id,"AND kind='service'");
 }
 if(family==='agent') {
  await exists(c,'memberships','user_id',row.id,"AND active=1 AND EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value IN ('owner','operator'))");
  row.calendar_id=optional(row.calendar_id,'calendar_id');
  if(row.calendar_id!==null&&!draft.calendar.some(calendar=>calendar.id===row.calendar_id))throw new ApiError(422,'calendar_missing','Choose a draft business calendar');
  try {const skills=JSON.parse(String(row.skills_json));if(!Array.isArray(skills)||skills.length>20||!skills.every(s=>typeof s==='string'&&s.trim()&&s.length<=60))throw Error();row.skills_json=JSON.stringify([...new Set(skills)]);}catch{throw new ApiError(422,'agent_skills','Name up to 20 skills of at most 60 characters');}
 }
 if(family==='assignment') {
  if(!['none','round_robin','load'].includes(String(row.assignment)))throw new ApiError(422,'assignment_mode','Choose an assignment method');
  if(row.max_open!==null&&(!Number.isInteger(row.max_open)||Number(row.max_open)<1||Number(row.max_open)>1000))throw new ApiError(422,'assignment_cap','Choose a whole open-ticket cap from 1 to 1000, or leave it empty');
 }
}
export function routingGuards(c:Context<AppEnv>,family:string,row:Row) {
 const db=c.env.DB,ws=c.get('principal').workspaceId,checks:D1PreparedStatement[]=[];
 const check=(sql:string,args:unknown[])=>checks.push(db.prepare(`INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN EXISTS(${sql}) THEN 1 ELSE 0 END`).bind(ws,...args));
 if(family==='routing'||family==='support')check('SELECT 1 FROM work_groups WHERE workspace_id=? AND id=?'+(family==='routing'?' AND department_id IS ?':''),family==='routing'?[row.group_id,row.department_id]:[row.group_id]);
 if(family==='routing') {
  if(row.requester_id!==null)check('SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1',[row.requester_id]);
  if(row.requester_group_id!==null)check('SELECT 1 FROM work_requester_groups WHERE workspace_id=? AND id=?',[row.requester_group_id]);
  if(row.department_id!==null)check('SELECT 1 FROM work_departments WHERE workspace_id=? AND id=? AND active=1',[row.department_id]);
 }
 if(family==='support')check("SELECT 1 FROM svc_records WHERE workspace_id=? AND id=? AND kind='service'",[row.id]);
 if(family==='agent') {
  check("SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1 AND EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value IN ('owner','operator'))",[row.id]);
  if(row.calendar_id!==null)check('SELECT 1 FROM work_calendars WHERE workspace_id=? AND id=?',[row.calendar_id]);
 }
 return checks;
}
export async function rehearseRouting(c:Context<AppEnv>,configuration:Configuration,body:Record<string,unknown>) {
 if(Object.keys(body).some(key=>!['revision','category','requesterId','serviceId','departmentId'].includes(key)))throw new ApiError(422,'sandbox_config_only','Routing rehearsals accept matching references only');
 const category=body.category==null?null:requiredString(body.category,'category'),requesterId=body.requesterId==null?null:requiredString(body.requesterId,'requesterId'),departmentId=body.departmentId==null?null:requiredString(body.departmentId,'departmentId'),serviceId=body.serviceId==null?null:requiredString(body.serviceId,'serviceId');
 if(category!==null&&!Object.hasOwn(categories,category))throw new ApiError(422,'routing_category','Choose a desk category');
 await exists(c,'memberships','user_id',requesterId,'AND active=1');await exists(c,'work_departments','id',departmentId,'AND active=1');await exists(c,'svc_records','id',serviceId,"AND kind='service'");
 const ws=c.get('principal').workspaceId;
 const groups=new Set(requesterId?(await c.env.DB.prepare('SELECT g.id FROM work_requester_groups g,json_each(g.members_json) m WHERE g.workspace_id=? AND m.value=?').bind(ws,requesterId).all<{id:string}>()).results.map(row=>row.id):[]);
 const support=configuration.support.find(row=>row.id===serviceId);
 const supportGroup=support?await c.env.DB.prepare('SELECT id FROM work_groups WHERE workspace_id=? AND id=? AND department_id IS ?').bind(ws,support.group_id,departmentId).first():null;
 const rule=configuration.routing.filter(row=>row.department_id===departmentId&&(row.category===null||row.category===category)&&(row.requester_id===null||row.requester_id===requesterId)&&(row.requester_group_id===null||groups.has(String(row.requester_group_id)))).sort((a,b)=>Number(a.position)-Number(b.position))[0];
 const selected=supportGroup?support:rule,assignment=configuration.assignment.find(row=>row.id===selected?.group_id);
 return {configurationRevision:body.revision,groupId:selected?.group_id??null,source:supportGroup?'support':rule?'rule':'unmatched',ruleId:supportGroup?null:rule?.id??null,skill:supportGroup?null:rule?.skill??null,assignment:assignment?{mode:assignment.assignment,maxOpen:assignment.max_open}:null,externalEffects:false,productionAuthority:false,assigned:false};
}

import {rehearseRouting} from './sandbox-routing';
import {editSandboxApprovals,sandboxApprovalGuards} from './sandbox-approvals';
import type {StageDef} from '../features/work/approval-config';
import {stageApplies} from '../features/work/approval-stages';
import {recurringNext} from './sandbox-recurring';
import {rehearseLifecycle} from './sandbox-lifecycle';
import {readSlaConfiguration, editSlaConfiguration, configurationDifferences, promoteSlaConfiguration, rollbackSlaConfiguration} from './sandbox-sla-config';
import type { Context, Hono } from 'hono';
import {sandboxSlas, editSandboxSla, slaDifferences, slaPromotion, slaFields, type Sla} from './sandbox-slas';
import type { AppEnv } from './types';
import { ApiError, audit, auditStatement, id, jsonBody, now, requiredString } from './http';
import { normalizeCatalogForm, validateCatalogAnswers, type CatalogForm } from '../features/work/catalog-form-schema';
import { checkTaskPlan, type CatalogTask } from '../features/work/catalog-task-plan';

export type Item = { id: string; name: string; revision: number; sourceForm: string; sourceTasks: string; sourceApprovals:string; sourceManagerApproval:string|null; requiresManager:number; approvals:StageDef[]; managerApproval:StageDef|null; form: CatalogForm; tasks: CatalogTask[] };
export type Sandbox = { id: string; name: string; created_by: string; contributors_json: string; baseline_json: string; draft_json: string; revision: number; state: string; approved_by: string | null; runs_json: string; sla_config_baseline_json:string; sla_config_draft_json:string; sla_baseline_json:string; sla_draft_json:string };
type C = Context<AppEnv>;
const currentOwnerSql = `EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')`;
export const ownerSql = `EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner' AND NOT EXISTS(SELECT 1 FROM adoption_imports i WHERE i.workspace_id=m.workspace_id AND i.state IN ('applying','erasure_pending','reconciling')))`;
const currentReviewerSql = currentOwnerSql.replace("r.value='owner'", "r.value IN ('owner','sandbox-admin')");
const reviewerSql = ownerSql.replace("r.value='owner'", "r.value IN ('owner','sandbox-admin')");
async function owner(c: C, review=false) {
 const p=c.get('principal');
 if(!(p.roles.includes('owner') || review&&p.roles.includes('sandbox-admin')) || !await c.env.DB.prepare(`SELECT 1 WHERE ${review?currentReviewerSql:currentOwnerSql}`).bind(p.workspaceId,p.userId).first())
  throw new ApiError(403,'forbidden',review?'A current owner or designated sandbox administrator is required':'A current workspace owner is required');
 if(await c.env.DB.prepare("SELECT 1 FROM adoption_imports WHERE workspace_id=? AND state IN ('applying','erasure_pending','reconciling') LIMIT 1").bind(p.workspaceId).first())
  throw new ApiError(409,'sandbox_restore_in_progress','Finish restoring the workspace before creating or using a fresh sandbox');
 return p;
}
async function read(c:C, sandboxId:string, review=false) {
 const p=await owner(c,review);
 const row=await c.env.DB.prepare('SELECT * FROM configuration_sandboxes WHERE workspace_id=? AND id=?').bind(p.workspaceId,sandboxId).first<Sandbox>();
 if(!row || !p.roles.includes('owner') && !['review','approved','promoted'].includes(row.state))throw new ApiError(404,'not_found','Sandbox unavailable');
 return row;
}
async function catalogs(c:C):Promise<Item[]> {
 const p=c.get('principal');
 const rows=(await c.env.DB.prepare('SELECT id,name,revision,form_json,tasks_json,requires_manager,approvals_json,manager_approval_json FROM work_catalog WHERE workspace_id=? ORDER BY id').bind(p.workspaceId).all<{id:string;name:string;revision:number;form_json:string;tasks_json:string;requires_manager:number;approvals_json:string;manager_approval_json:string|null}>()).results;
 return rows.map(r=>({id:r.id,name:r.name,revision:r.revision,sourceForm:r.form_json,sourceTasks:r.tasks_json,sourceApprovals:r.approvals_json,sourceManagerApproval:r.manager_approval_json,requiresManager:r.requires_manager,approvals:JSON.parse(r.approvals_json),managerApproval:r.manager_approval_json?JSON.parse(r.manager_approval_json):null,form:normalizeCatalogForm(JSON.parse(r.form_json)),tasks:checkTaskPlan(JSON.parse(r.tasks_json))}));
}
function differences(row:Sandbox) {
 const baseline=JSON.parse(row.baseline_json) as Item[],draft=JSON.parse(row.draft_json) as Item[];
 return [...configurationDifferences(JSON.parse(row.sla_config_baseline_json),JSON.parse(row.sla_config_draft_json)),...slaDifferences(JSON.parse(row.sla_baseline_json),JSON.parse(row.sla_draft_json)),...draft.flatMap(item=>{
  const before=baseline.find(x=>x.id===item.id)!;
  return (['name','form','tasks','requiresManager','approvals','managerApproval'] as const).filter(field=>JSON.stringify(before[field])!==JSON.stringify(item[field])).map(field=>({catalogId:item.id,field,before:before[field],after:item[field]}));
 })];
}
function view(row:Sandbox) {return {id:row.id,name:row.name,revision:row.revision,state:row.state,approvedBy:row.approved_by,items:JSON.parse(row.draft_json),slas:JSON.parse(row.sla_draft_json),slaConfiguration:JSON.parse(row.sla_config_draft_json),differences:differences(row),limits:'Catalog metadata, forms, team task plans and lifecycle task templates, recurring duties, existing custom role definitions, SLA policies, business calendars, escalation levels and waiting rules, routing rules, support group bindings, agent shifts and skills, and group assignment settings only. Form validation and isolated team task rehearsals are available. Requester memberships and role assignments remain unchanged. Changed role revisions require new assignment confirmation in production. Definitions must already exist in production; this workspace edits configuration only. Connector execution and other configuration families are not available.'};}
function configurationBody(body:Record<string,unknown>, allowed:string[]) {
 if(Object.keys(body).some(key=>!allowed.includes(key)))
  throw new ApiError(422,'sandbox_config_only','Only the named configuration fields are accepted; records and credentials cannot be included');
}
function revision(row:Sandbox,b:Record<string,unknown>,state:string) {
 if(b.revision!==row.revision||row.state!==state)throw new ApiError(409,'sandbox_changed','Sandbox state or revision changed; reload');
}
async function write(c:C,row:Sandbox,sql:string,args:(string|number|null)[],action:string,detail:unknown, review=false) {
 const p=c.get('principal');
 const result=await c.env.DB.batch([
  c.env.DB.prepare(`UPDATE configuration_sandboxes SET ${sql} WHERE workspace_id=? AND id=? AND revision=? AND state=? AND ${review?reviewerSql:ownerSql}`).bind(...args,p.workspaceId,row.id,row.revision,row.state,p.workspaceId,p.userId),
  c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'),
  auditStatement(c,action,row.id,detail),c.env.DB.prepare('DELETE FROM platform_auth_guard'),
 ]).catch(e=>{if(String(e).includes('CHECK constraint'))throw new ApiError(409,'sandbox_changed','Sandbox or current authority changed; reload');throw e;});
 return result;
}
export function registerSandboxRoutes(app:Hono<AppEnv>) {
 app.get('/sandboxes',async c=>{
  const p=await owner(c);c.header('Cache-Control','private, no-store');
  return c.json({items:(await c.env.DB.prepare('SELECT id,name,revision,state FROM configuration_sandboxes WHERE workspace_id=? ORDER BY created_at,id').bind(p.workspaceId).all()).results});
 });
 app.post('/sandboxes',async c=>{
  const p=await owner(c),b=await jsonBody(c),name=requiredString(b.name,'name',120);
  configurationBody(b,['name']);
  const items=await catalogs(c),sandboxId=id(),snapshot=JSON.stringify(items),slas=JSON.stringify(await sandboxSlas(c)),slaConfig=JSON.stringify(await readSlaConfiguration(c));
  await c.env.DB.batch([
   c.env.DB.prepare(`INSERT INTO configuration_sandboxes(id,workspace_id,name,created_by,contributors_json,baseline_json,draft_json,sla_baseline_json,sla_draft_json,sla_config_baseline_json,sla_config_draft_json,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${ownerSql}`).bind(sandboxId,p.workspaceId,name,p.userId,JSON.stringify([p.userId]),snapshot,snapshot,slas,slas,slaConfig,slaConfig,now(),p.workspaceId,p.userId),
   c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'),
   auditStatement(c,'sandbox.created',sandboxId,{configurationOnly:true}),c.env.DB.prepare('DELETE FROM platform_auth_guard'),
  ]);
  return c.json(view(await read(c,sandboxId)),201);
 });
 app.get('/sandboxes/:id',async c=>{c.header('Cache-Control','private, no-store');const row=await read(c,c.req.param('id'),true);if(!c.get('principal').roles.includes('owner'))await audit(c,'sandbox.review_read',row.id,{revision:row.revision});return c.json(view(row));});
 app.get('/sandboxes/:id/options',async c=>{
  await read(c,c.req.param('id'));const ws=c.get('principal').workspaceId;
  const result:Record<string,unknown>={};
  for(const [key,table] of [['requesterGroups','work_requester_groups'],['calendars','work_calendars'],['departments','work_departments']])result[key]=(await c.env.DB.prepare(`SELECT id,name FROM ${table} WHERE workspace_id=?${key==='departments'?' AND active=1':''} ORDER BY name`).bind(ws).all()).results;
  result.groups=(await c.env.DB.prepare('SELECT id,name,department_id FROM work_groups WHERE workspace_id=? ORDER BY name').bind(ws).all()).results;
  result.services=(await c.env.DB.prepare("SELECT id,json_extract(data_json,'$.name') AS name FROM svc_records WHERE workspace_id=? AND kind='service' ORDER BY name").bind(ws).all()).results;
  result.requesters=(await c.env.DB.prepare('SELECT u.id,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND m.active=1 ORDER BY u.name').bind(ws).all()).results;
  result.recipients=(await c.env.DB.prepare("SELECT u.id,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND m.active=1 AND EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value IN ('owner','operator')) ORDER BY u.name").bind(ws).all()).results;
  c.header('Cache-Control','private, no-store');return c.json(result);
 });
 app.put('/sandboxes/:id/catalog/:catalogId',async c=>{
  const row=await read(c,c.req.param('id')),b=await jsonBody(c);revision(row,b,'draft');
  configurationBody(b,['revision','name','form','tasks']);
  const items=JSON.parse(row.draft_json) as Item[],item=items.find(x=>x.id===c.req.param('catalogId'));
  if(!item)throw new ApiError(404,'not_found','Catalog item unavailable in this sandbox');
  item.name=requiredString(b.name,'name',200);item.form=normalizeCatalogForm(b.form);item.tasks=checkTaskPlan(b.tasks??[]);
  const groups=new Set((await c.env.DB.prepare('SELECT id FROM work_groups WHERE workspace_id=?').bind(c.get('principal').workspaceId).all<{id:string}>()).results.map(r=>r.id));
  if(item.tasks.some(t=>!groups.has(t.groupId)))throw new ApiError(422,'catalog_tasks_invalid','Task groups must exist in this workspace');
  const contributors=[...new Set([...JSON.parse(row.contributors_json),c.get('principal').userId])];
  await write(c,row,'draft_json=?,contributors_json=?,revision=revision+1',[JSON.stringify(items),JSON.stringify(contributors)],'sandbox.edited',{fromRevision:row.revision});
  return c.json(view(await read(c,row.id)));
 });
 app.put('/sandboxes/:id/catalog/:catalogId/approvals',async c=>{
  const row=await read(c,c.req.param('id')),b=await jsonBody(c);revision(row,b,'draft');configurationBody(b,['revision','calendarId','requiresManager','approvals','manager']);
  const items=JSON.parse(row.draft_json) as Item[],item=items.find(item=>item.id===c.req.param('catalogId'));if(!item)throw new ApiError(404,'not_found','Catalog item unavailable');
  await editSandboxApprovals(c,item,JSON.parse(row.sla_config_draft_json),b,JSON.parse(row.sla_config_baseline_json));
  const contributors=[...new Set([...JSON.parse(row.contributors_json),c.get('principal').userId])];
  await write(c,row,'draft_json=?,contributors_json=?,revision=revision+1',[JSON.stringify(items),JSON.stringify(contributors)],'sandbox.edited',{family:'catalog_approvals',fromRevision:row.revision});return c.json(view(await read(c,row.id)));
 });
 app.put('/sandboxes/:id/slas/:slaId',async c=>{
  const row=await read(c,c.req.param('id')),b=await jsonBody(c);revision(row,b,'draft');
  configurationBody(b,['revision','name','position','priority','category','requester_group_id','calendar_id','department_id','first_response_minutes','next_response_minutes','resolution_minutes','pauseOn']);
  const slas=JSON.parse(row.sla_draft_json) as Sla[],item=slas.find(x=>x.id===c.req.param('slaId'));
  if(!item)throw new ApiError(404,'not_found','SLA policy unavailable in this sandbox');
  await editSandboxSla(c,item,b);
  if(slas.some(other=>other.id!==item.id&&other.position===item.position&&other.department_id===item.department_id))throw new ApiError(422,'sla_position_taken','Another draft policy holds this position in the department');
  const contributors=[...new Set([...JSON.parse(row.contributors_json),c.get('principal').userId])];
  await write(c,row,'sla_draft_json=?,contributors_json=?,revision=revision+1',[JSON.stringify(slas),JSON.stringify(contributors)],'sandbox.edited',{family:'sla',fromRevision:row.revision});
  return c.json(view(await read(c,row.id)));
 });
 app.put('/sandboxes/:id/sla-configuration/:family/:configurationId',async c=>{
  const row=await read(c,c.req.param('id')),b=await jsonBody(c);revision(row,b,'draft');
  const draft=JSON.parse(row.sla_config_draft_json);
  await editSlaConfiguration(c,draft,c.req.param('family'),c.req.param('configurationId'),b);
  const contributors=[...new Set([...JSON.parse(row.contributors_json),c.get('principal').userId])];
  await write(c,row,'sla_config_draft_json=?,contributors_json=?,revision=revision+1',[JSON.stringify(draft),JSON.stringify(contributors)],'sandbox.edited',{family:c.req.param('family'),fromRevision:row.revision});
  return c.json(view(await read(c,row.id)));
 });
 app.post('/sandboxes/:id/test-routing',async c=>{
  const row=await read(c,c.req.param('id')),b=await jsonBody(c);revision(row,b,'draft');
  c.header('Cache-Control','private, no-store');return c.json(await rehearseRouting(c,JSON.parse(row.sla_config_draft_json),b));
 });
 app.post('/sandboxes/:id/test-lifecycle',async c=>{
  const row=await read(c,c.req.param('id')),b=await jsonBody(c);revision(row,b,'draft');
  configurationBody(b,['revision','kind','attributes','effectiveAt','expiresAt','calendarId']);
  c.header('Cache-Control','private, no-store');
  return c.json(await rehearseLifecycle(c,JSON.parse(row.sla_config_draft_json),b));
 });
 app.post('/sandboxes/:id/test-configuration',async c=>{
  const row=await read(c,c.req.param('id')),b=await jsonBody(c);revision(row,b,'draft');configurationBody(b,['revision','family','configurationId']);
  const draft=JSON.parse(row.sla_config_draft_json),family=String(b.family),entry=Object.hasOwn(draft,family)&&Array.isArray(draft[family])?draft[family].find((item:{id:string})=>item.id===b.configurationId):undefined;
  if(!entry)throw new ApiError(404,'not_found','Configuration unavailable');
  await editSlaConfiguration(c,draft,family,entry.id,{revision:row.revision});
  return c.json({valid:true,externalEffects:false,productionAuthority:false,configurationRevision:row.revision,...(family==='recurring'?{nextOccurrence:recurringNext(entry),duties:JSON.parse(String(entry.tasks_json))}:{})});
 });
 app.post('/sandboxes/:id/test-form',async c=>{
  const row=await read(c,c.req.param('id')),b=await jsonBody(c);if(b.revision!==row.revision)throw new ApiError(409,'sandbox_changed','Reload the current sandbox');
  configurationBody(b,['revision','catalogId','answers']);
  const item=(JSON.parse(row.draft_json) as Item[]).find(x=>x.id===b.catalogId);
  if(!item)throw new ApiError(404,'not_found','Catalog item unavailable in this sandbox');
  const answers=validateCatalogAnswers(item.form,b.answers??{});
  return c.json({revision:row.revision,answers,taskPlan:checkTaskPlan(item.tasks),approvalPlan:(item.approvals??[]).map(stage=>({name:stage.name,key:stage.key,mode:stage.mode,withPrevious:stage.withPrevious,applies:stageApplies(stage,{form:item.form,answers})})),managerRequired:Boolean(item.requiresManager),executed:false});
 });
 app.post('/sandboxes/:id/package',async c=>{
  const row=await read(c,c.req.param('id')),b=await jsonBody(c);revision(row,b,'draft');configurationBody(b,['revision']);
  if(!differences(row).length)throw new ApiError(422,'sandbox_no_changes','Edit configuration before requesting review');
  await write(c,row,"state='review',revision=revision+1",[],'sandbox.review_requested',{fromRevision:row.revision});
  return c.json(view(await read(c,row.id)));
 });
 app.post('/sandboxes/:id/approve',async c=>{
  const row=await read(c,c.req.param('id'),true),b=await jsonBody(c);revision(row,b,'review');configurationBody(b,['revision']);
  if(JSON.stringify(await catalogs(c))!==row.baseline_json||JSON.stringify(await sandboxSlas(c))!==row.sla_baseline_json||JSON.stringify(await readSlaConfiguration(c))!==row.sla_config_baseline_json)throw new ApiError(409,'production_changed','Production configuration changed; create and review a fresh sandbox');
  const p=c.get('principal');
  if((JSON.parse(row.contributors_json) as string[]).includes(p.userId))throw new ApiError(403,'sandbox_separate_approver','A separate current owner or sandbox administrator who did not edit must approve');
  await write(c,row,"state='approved',approved_by=?,revision=revision+1",[p.userId],'sandbox.approved',{fromRevision:row.revision},true);
  return c.json(view(await read(c,row.id,true)));
 });
 app.post('/sandboxes/:id/rollback-package',async c=>{
  const prior=await read(c,c.req.param('id')),b=await jsonBody(c);revision(prior,b,'promoted');configurationBody(b,['revision']);
  const p=c.get('principal'),baseline=await catalogs(c),draft=structuredClone(baseline),before=JSON.parse(prior.baseline_json) as Item[],after=JSON.parse(prior.draft_json) as Item[];
  const changed=new Set(differences(prior).flatMap(d=>'catalogId' in d?[d.catalogId]:[]));
  const slaBaseline=await sandboxSlas(c),slaDraft=structuredClone(slaBaseline),slaBefore=JSON.parse(prior.sla_baseline_json) as Sla[],slaAfter=JSON.parse(prior.sla_draft_json) as Sla[];
  for(const original of slaBefore) {
   const applied=slaAfter.find(x=>x.id===original.id)!;
   if(!slaFields.some(f=>original[f]!==applied[f]))continue;
   const current=slaDraft.find(x=>x.id===original.id);
   if(!current||current.revision!==original.revision+1||JSON.stringify({...current,revision:applied.revision})!==JSON.stringify(applied))throw new ApiError(409,'production_changed','Later SLA configuration changes prevent this rollback');
   for(const field of slaFields)Object.assign(current,{[field]:original[field]});
  }
  for(const catalogId of changed) {
   const current=draft.find(x=>x.id===catalogId),applied=after.find(x=>x.id===catalogId)!,original=before.find(x=>x.id===catalogId)!;
   if(!current||current.revision!==original.revision+1||(['name','form','tasks','requiresManager','approvals','managerApproval'] as const).some(k=>JSON.stringify(current[k])!==JSON.stringify(applied[k])))throw new ApiError(409,'production_changed','Later configuration changes prevent this rollback');
   current.name=original.name;current.form=original.form;current.tasks=original.tasks;current.requiresManager=original.requiresManager;current.approvals=original.approvals;current.managerApproval=original.managerApproval;
  }
  const slaConfigBaseline=await readSlaConfiguration(c),slaConfigDraft=rollbackSlaConfiguration(slaConfigBaseline,JSON.parse(prior.sla_config_baseline_json),JSON.parse(prior.sla_config_draft_json));
  const sandboxId=id();
  await c.env.DB.batch([
   c.env.DB.prepare(`INSERT INTO configuration_sandboxes(id,workspace_id,name,created_by,contributors_json,baseline_json,draft_json,sla_baseline_json,sla_draft_json,sla_config_baseline_json,sla_config_draft_json,state,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,'review',? WHERE ${ownerSql}`).bind(sandboxId,p.workspaceId,('Rollback '+prior.name).slice(0,120),p.userId,JSON.stringify([p.userId]),JSON.stringify(baseline),JSON.stringify(draft),JSON.stringify(slaBaseline),JSON.stringify(slaDraft),JSON.stringify(slaConfigBaseline),JSON.stringify(slaConfigDraft),now(),p.workspaceId,p.userId),
   c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'),
   auditStatement(c,'sandbox.rollback_requested',sandboxId,{priorSandboxId:prior.id}),c.env.DB.prepare('DELETE FROM platform_auth_guard'),
  ]);
  return c.json(view(await read(c,sandboxId)),201);
 });
 app.post('/sandboxes/:id/promote',async c=>{
  const row=await read(c,c.req.param('id')),b=await jsonBody(c);revision(row,b,'approved');configurationBody(b,['revision']);
  const p=c.get('principal'),baseline=JSON.parse(row.baseline_json) as Item[],draft=JSON.parse(row.draft_json) as Item[],changed=new Set(differences(row).flatMap(d=>'catalogId' in d?[d.catalogId]:[]));
  if(JSON.stringify(await catalogs(c))!==row.baseline_json||JSON.stringify(await sandboxSlas(c))!==row.sla_baseline_json||JSON.stringify(await readSlaConfiguration(c))!==row.sla_config_baseline_json)throw new ApiError(409,'production_changed','Production configuration changed; create and review a fresh sandbox');
  const statements:D1PreparedStatement[]=[
   c.env.DB.prepare(`UPDATE configuration_sandboxes SET state='promoted',promoted_at=?,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=? AND state='approved' AND ${ownerSql} AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=configuration_sandboxes.approved_by AND m.active=1 AND r.value IN ('owner','sandbox-admin')) AND NOT EXISTS(SELECT 1 FROM json_each(configuration_sandboxes.contributors_json) WHERE value=configuration_sandboxes.approved_by)`).bind(now(),p.workspaceId,row.id,row.revision,p.workspaceId,p.userId,p.workspaceId),
   c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'),
   c.env.DB.prepare(`INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN COUNT(*)=? THEN 1 ELSE 0 END FROM work_catalog WHERE workspace_id=?`).bind(baseline.length,p.workspaceId),
  ];
  for(const item of baseline) {
   const next=draft.find(x=>x.id===item.id)!;
   statements.push(c.env.DB.prepare(`INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM work_catalog WHERE workspace_id=? AND id=? AND revision=? AND name=? AND form_json=? AND tasks_json=?) THEN 1 ELSE 0 END`).bind(p.workspaceId,item.id,item.revision,item.name,item.sourceForm,item.sourceTasks));
   statements.push(...sandboxApprovalGuards(c,next));
   for(const task of next.tasks)statements.push(c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM work_groups WHERE workspace_id=? AND id=?) THEN 1 ELSE 0 END').bind(p.workspaceId,task.groupId));
   if(changed.has(item.id))statements.push(c.env.DB.prepare('INSERT OR IGNORE INTO configuration_catalog_versions(workspace_id,catalog_id,revision,requires_manager) VALUES(?,?,?,?)').bind(p.workspaceId,item.id,item.revision,item.requiresManager??0));
   if(changed.has(item.id))statements.push(c.env.DB.prepare('UPDATE work_catalog SET name=?,form_json=?,tasks_json=?,requires_manager=?,approvals_json=?,manager_approval_json=?,revision=revision+1 WHERE workspace_id=? AND id=?').bind(next.name,JSON.stringify(next.form),JSON.stringify(next.tasks),next.requiresManager??0,JSON.stringify(next.approvals??[]),next.managerApproval?JSON.stringify(next.managerApproval):null,p.workspaceId,item.id));
  }
  statements.push(...promoteSlaConfiguration(c,JSON.parse(row.sla_config_baseline_json),JSON.parse(row.sla_config_draft_json)));
  statements.push(...slaPromotion(c,JSON.parse(row.sla_baseline_json),JSON.parse(row.sla_draft_json)));
  statements.push(auditStatement(c,'sandbox.promoted',row.id,{version:row.revision+1,approvedBy:row.approved_by,configurationChanges:configurationDifferences(JSON.parse(row.sla_config_baseline_json),JSON.parse(row.sla_config_draft_json)).map(({family,configurationId,field})=>({family,configurationId,field})),catalogIds:[...changed],slaIds:slaDifferences(JSON.parse(row.sla_baseline_json),JSON.parse(row.sla_draft_json)).map(d=>d.slaId)}),c.env.DB.prepare('DELETE FROM platform_auth_guard'));
  try{await c.env.DB.batch(statements);}catch(e){if(String(e).includes('CHECK constraint'))throw new ApiError(409,'production_changed','Production or current approval changed; nothing was promoted');throw e;}
  return c.json(view(await read(c,row.id)));
 });
}

export { read as readSandbox };

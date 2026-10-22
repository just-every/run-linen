import type { Env } from '../../platform/types';
import { legacyIdentityContent } from './redact';
interface Context {env:Pick<Env,'DB'>;principal:{workspaceId:string}}
type Match=(value:string)=>Promise<boolean>;
// Only native subject columns and native parent references establish legacy
// event ownership. Payload claims and operational targetIds confer no relation.
const relations:Record<string,{people:string[];parents?:string[];content?:string[]}>= {
  work_records:{people:['requester_id','beneficiary_id']},
  work_messages:{people:['author_id'],parents:['work_id']},
  work_lifecycle:{people:['person_id'],parents:['work_id']},
  work_obligations:{people:['beneficiary_id','owner_id'],parents:['work_id','lifecycle_id']},
  work_assets:{people:['person_id']},
  work_custody:{people:['person_id'],parents:['asset_id']},
  work_projects:{people:['owner_id']},
  work_project_tasks:{people:['owner_id'],parents:['project_id']},
  work_project_milestones:{people:[],parents:['project_id']},
  work_recurring_plans:{people:['creator_id','owner_id'],content:['tasks_json']},
  work_recurring_tasks:{people:['owner_id','completed_by'],parents:['work_id','occurrence_id']},
  work_recurring_occurrences:{people:[],parents:['plan_id','work_id']},
  work_fulfilments:{people:['beneficiary_id'],parents:['work_id']},
  work_approval_decisions:{people:['approver_id'],parents:['work_id','fulfilment_id']},
  work_approval_tokens:{people:['approver_id'],parents:['work_id','fulfilment_id']},
  svc_records:{people:['owner_id'],content:['participants_json','data_json']},
};
/** Resolve original untyped targets against installed native module tables.
 * Discovery supports installations/isolated module harnesses with different
 * module inventories; no absent relation is invented. Scope is tenant-bound. */
export function legacySubjectMatcher(ctx:Context,matches:Match) {
  const db=ctx.env.DB,w=ctx.principal.workspaceId,cache=new Map<string,Promise<boolean>>();
  let inventory:Promise<Set<string>>|undefined;
  const tables=()=>inventory??=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{name:string}>().then(r=>new Set(r.results.map(t=>t.name)));
  async function visit(target:string,seen:Set<string>):Promise<boolean> {
    if(!target||seen.has(target))return false;
    if(await matches(target))return true;
    const next=new Set(seen).add(target),installed=await tables();
    const installedRelations=Object.entries(relations).filter(([table])=>installed.has(table));
    if(!installedRelations.length)return false;
    const query=installedRelations.map(([table,relation])=>{
      const columns=[...relation.people,...relation.parents??[],...relation.content??[]];
      return `SELECT '${table}' relation,json_object(${columns.map(column=>`'${column}',${column}`).join(',')}) payload FROM ${table} WHERE workspace_id=? AND id=?`;
    }).join(' UNION ALL ');
    const rows=(await db.prepare(query).bind(...installedRelations.flatMap(()=>[w,target])).all<{relation:string;payload:string}>()).results;
    for(const result of rows){
      const relation=relations[result.relation],row=JSON.parse(result.payload) as Record<string,unknown>;
      for(const column of relation.people)if(typeof row[column]==='string'&&await matches(row[column] as string))return true;
      for(const column of relation.content??[])if(await legacyIdentityContent(row[column],matches))return true;
      for(const column of relation.parents??[])if(typeof row[column]==='string'&&await visit(row[column] as string,next))return true;
    }
    return false;
  }
  return (target:string)=>{let value=cache.get(target);if(!value){value=visit(target,new Set());cache.set(target,value);}return value;};
}

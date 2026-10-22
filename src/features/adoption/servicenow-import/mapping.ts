import {canonicalJson,sha256,type ImportMapping} from '../../../modules/import-kit/src/d1/index';
import {registeredHistory} from '../../history/event';
import {stableId,type ParsedExport} from './format';
import {emptyRelated} from './targets';
export const MAPPING_VERSION='linen-servicenow-files-v1';
const known=new Set(['state','priority','impact','urgency','category','subcategory','assignment_group','assigned_to','short_description','description','caller_id','type','service']);
function sourceValue(field:string,value:string):unknown {return field==='priority'&&/^[1-5]$/.test(value)?`P${value}`:value;}
export function mapping(parsed:ParsedExport,destination:string,namespace:string,privacy:{history:string[];legacy:string[]}):ImportMapping {
 return {version:MAPPING_VERSION,map(record){
  const t=parsed.incidents.get(record.sourceId)!,workId=stableId(destination,namespace,t.id),requester=stableId(namespace,'requester',t.requester||t.id);
  const work={id:workId,workspace_id:destination,requester_id:requester,beneficiary_id:requester,kind:'incident',title:t.title,state:'paused',sensitivity:'restricted',assignee_id:null,impact:'individual',revision:1,created_at:t.created,updated_at:t.updated,closed_at:null,paused_at:t.updated,paused_ms:0,response_at:null,resolution_at:null,context_json:canonicalJson({importedFrom:'servicenow',sourceIncidentId:t.id,sourceNumber:t.number,sourceState:t.state,sourcePriority:t.priority,historyOnly:true}),dedup_key:`servicenow:${namespace}:${t.id}`,request_hash:null,pending_person_id:null,merged_into:null,split_from:null,parent_id:null,department_id:parsed.departmentId,protected_departments_json:'[]'};
  const messages=[{id:stableId(workId,'description'),workspace_id:destination,work_id:workId,author_id:requester,visibility:'private',body:t.description,source_key:'servicenow:description',created_at:t.created}];
  const audits=t.audits.map(a=>{
   const actorId=stableId(namespace,'actor',a.actor),field=a.field==='assignment_group'?'group':a.field==='assigned_to'?'assignee':a.field==='short_description'?'title':a.field;
   const payload=registeredHistory('work.imported_field',{kind:'ticket',id:workId},{[field]:sourceValue(a.field,a.before)},{[field]:sourceValue(a.field,a.after)},{kind:'integration',id:actorId,name:a.actor},[requester],'restricted',a.at,{source:{system:'servicenow',table:'sys_audit',eventKey:stableId(namespace,t.id,a.id)}});
   return {id:stableId(destination,namespace,t.id,'audit',a.id),workspace_id:destination,actor_id:actorId,action:'work.imported_field',target:workId,detail_json:canonicalJson(payload as any),created_at:a.at};
  }).sort((a,b)=>a.id.localeCompare(b.id));
  const identities=[...new Set([t.requester,requester,...t.audits.map(a=>a.actor)])].filter(Boolean).map(value=>sha256(value)).sort();
  const unmapped=[
   {reason:'Paused restricted historical incident only. No source account matching, permissions, notifications, approval decisions, provider execution or SLA authority is imported.'},
   {reason:'Only supplied raw Table API incident and sys_audit rows are included. Saved files cannot prove source audit completeness, pagination or source-side deletion.'},
   {reason:'Original attachments, journal messages, CMDB, approvals and source automation are not materialized. Supplied bytes remain owner-only retained artifacts, withdrawn on related erasure.'},
   ...t.audits.filter(a=>!known.has(a.field)).map(a=>({field:a.field,reason:'Unregistered field remains personal; no retained-value classification inferred from source.'})),
  ];
  return {effects:[{targetKind:'work',targetId:workId,value:{work,messages,audits,related:emptyRelated(),identities,privacy}}],unmapped};
 }};
}

import { canonicalJson, sha256, type ImportMapping } from '../../../modules/import-kit/src/d1/index';
import { stableId, type ParsedExport } from './format';
import { emptyRelated } from './targets';

export const MAPPING_VERSION = 'linen-freshservice-files-v1';
export function mapping(parsed: ParsedExport, destination: string, namespace: string, system='freshservice', version=MAPPING_VERSION): ImportMapping {
  return { version, map(record) {
    const t = parsed.tickets.get(record.sourceId)!;
    const workId = stableId(destination,namespace,t.id), requester = parsed.identities[t.requester] ?? stableId(namespace,t.requester);
    const kind = t.kind === 'Incident' ? 'incident' : t.kind === 'Service Request' ? 'request' : null;
    const unmapped = [
      { reason: 'Imported work is paused historical data. Incumbent status is retained; no verified completion, approval, execution, notification or SLA is imported.' },
      { reason: 'Conversation completeness and pagination cannot be proven from saved files. CSV omits complete history; only supplied separate conversation pages are included.' },
      { reason: 'Attachment bytes, embedded files, service-request item fields, assets, problems, changes, approvals, workflows and custom relationships are not mapped. Original supplied files are retained for owner review.' },
      ...(!parsed.identities[t.requester] ? [{field:'requester',reason:'Unresolved historical requester; no account created and record remains owner-only.'}] : []),
    ];
    const raw = t.raw as any;
    for (const key of Object.keys(raw)) if (!['Ticket Id','Subject','Description','Status','Requester Email','Created Time','Last Updated Time','Type','id','subject','description','requester','created_at','updated_at','comments','description_text','status','type','requester_id','created_at','updated_at'].includes(key)) unmapped.push({field:key,reason:'Retained in original/source history only; no native semantics or authority assigned.'});
    if (!kind) return {effects:[],unmapped,rejection:'Unsupported ticket type; retained source only'};
    const messages = [{ id: stableId(workId,'description'), workspace_id:destination, work_id:workId, author_id:requester, visibility:'public',body:t.description,source_key:system+':description',created_at:t.created }, ...t.conversations.map(c => ({id:stableId(workId,'conversation',String(c.id)),workspace_id:destination,work_id:workId,author_id:parsed.identities[`user:${c.user_id}`] ?? stableId(namespace,`user:${c.user_id}`),visibility:c.private ? 'private' : 'public',body:c.body_text,source_key:`${system}:conversation:${c.id}`,created_at:new Date(c.created_at).toISOString()}))].sort((a,b)=>a.id.localeCompare(b.id));
    const identities = [...new Set([t.requester,requester,...t.conversations.flatMap(c => [`user:${c.user_id}`,parsed.identities[`user:${c.user_id}`]]).filter(Boolean)])].map(value=>sha256(String(value))).sort();
    const work = { id:workId,workspace_id:destination,requester_id:requester,beneficiary_id:requester,kind,title:t.title,state:'paused',sensitivity:'restricted',assignee_id:null,impact:'individual',revision:1,created_at:t.created,updated_at:t.updated,closed_at:null,paused_at:t.updated,paused_ms:0,response_at:null,resolution_at:null,context_json:canonicalJson({importedFrom:system,sourceTicketId:t.id,sourceStatus:t.status,historyOnly:true}),dedup_key:`${system}:${namespace}:${t.id}`,request_hash:null,pending_person_id:null,merged_into:null,split_from:null,parent_id:null };
    return {effects:[{targetKind:'work',targetId:workId,value:{work,messages,related:emptyRelated(),identities}}],unmapped};
  }};
}

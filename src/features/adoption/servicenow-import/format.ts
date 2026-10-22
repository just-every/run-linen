import { Buffer } from 'node:buffer';
import { canonicalJson,sha256,type SourceBundle,type Json } from '../../../modules/import-kit/src/d1/index';
import { parseJson } from '../../../modules/import-kit/src/readers/json';
import { ApiError } from '../../../platform/http';
export const requireInput:(ok:unknown,message:string)=>asserts ok=(ok,message)=>{if(!ok)throw new ApiError(422,'servicenow_input',message);};
export interface SavedFile {name:string;format:'incidents-json'|'audits-json';base64:string}
export interface ImportInput {instance:string;files:SavedFile[];departmentId?:string}
export interface Incident {id:string;number:string;title:string;description:string;requester:string;state:string;priority:string;created:string;updated:string;raw:Record<string,Json>;audits:Audit[];artifacts:string[]}
export interface Audit {id:string;ticketId:string;field:string;before:string;after:string;actor:string;at:string;raw:Record<string,Json>}
export interface ParsedExport {source:SourceBundle;incidents:Map<string,Incident>;departmentId:string|null}
export const stableId=(...parts:string[])=>'sn_'+sha256(canonicalJson(parts)).slice(0,40);
function text(value:unknown,field:string):string {requireInput(typeof value==='string',`${field} requires raw Table API string values; export with sysparm_display_value=false`);return value;}
function sysId(value:unknown):string {requireInput(typeof value==='string'&&/^[a-f0-9]{32}$/.test(value),'Exact raw ServiceNow sys_id required');return value;}
function timestamp(value:unknown):string {requireInput(typeof value==='string'&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value),'Raw ServiceNow UTC sys_created_on/sys_updated_on required');const iso=value.replace(' ','T')+'Z';requireInput(Number.isFinite(Date.parse(iso))&&new Date(iso).toISOString().slice(0,19)===iso.slice(0,19),'Invalid UTC source timestamp');return new Date(iso).toISOString();}
/** Saved raw Table API result arrays; no network, account inference or execution authority. */
export function parseExport(input:ImportInput,destination:string):ParsedExport {
 requireInput(input&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(input.instance),'Stable non-secret instance slug required');
 requireInput(Array.isArray(input.files)&&input.files.length>0&&input.files.length<=30,'Supply 1–30 saved raw JSON files');
 requireInput(input.departmentId===undefined||typeof input.departmentId==='string'&&input.departmentId.length>0&&input.departmentId.length<=100,'Explicit destination workspace ID required');
 const namespace=`servicenow:${destination}:${input.instance}`,source:SourceBundle={records:[],artifacts:[],diagnostics:[]},incidents=new Map<string,Incident>(),audits:{audit:Audit;artifact:string}[]=[],names=new Set<string>(),auditIds=new Map<string,string>();let total=0;
 for(const file of input.files) {
  requireInput(file&&typeof file.name==='string'&&/^[\w .-]{1,120}$/.test(file.name)&&!names.has(file.name),'Unique simple artifact filename required');names.add(file.name);
  requireInput(typeof file.base64==='string','Exact saved bytes required');const bytes=Buffer.from(file.base64,'base64');requireInput(bytes.toString('base64')===file.base64,'Canonical base64 required');total+=bytes.length;requireInput(total<=1024*1024,'At most 1 MiB total saved source bytes');
  const root=parseJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes),{artifact:file.name}) as any;
  requireInput(root&&Object.keys(root).length===1&&Array.isArray(root.result),'Raw Table API response requires only a result array');
  const artifact={name:file.name,sha256:sha256(bytes),size:bytes.length,original:{status:'available' as const,base64:file.base64}};source.artifacts.push(artifact);
  for(const [position,row]of root.result.entries()) {
   requireInput(row&&typeof row==='object'&&!Array.isArray(row),'Source row object required');
   if(file.format==='incidents-json') {
    const id=sysId(row.sys_id);requireInput(!incidents.has(id),'Duplicate incident identity; review overlapping files');
    const incident:Incident={id,number:text(row.number,'number'),title:text(row.short_description,'short_description'),description:text(row.description,'description'),requester:text(row.caller_id,'caller_id'),state:text(row.state,'state'),priority:text(row.priority,'priority'),created:timestamp(row.sys_created_on),updated:timestamp(row.sys_updated_on),raw:row,audits:[],artifacts:[artifact.sha256]};
    requireInput(incident.title.length>0&&incident.title.length<=1000&&incident.description.length<=100000,'Incident text outside supported bounds');
    incidents.set(id,incident);source.records.push({namespace,kind:'incident',sourceId:id,payload:{},payloadHash:'',artifactHash:artifact.sha256,location:{artifact:file.name,row:position+1}});
   } else if(file.format==='audits-json') {
    requireInput(row.tablename==='incident','Only incident sys_audit rows are supported');
    const audit:Audit={id:sysId(row.sys_id),ticketId:sysId(row.documentkey),field:text(row.fieldname,'fieldname'),before:text(row.oldvalue,'oldvalue'),after:text(row.newvalue,'newvalue'),actor:text(row.user,'user'),at:timestamp(row.sys_created_on),raw:row};
    requireInput(audit.actor.length>0&&audit.actor.length<=320,'Original audit user is required');
    const fingerprint=canonicalJson(row),previous=auditIds.get(audit.id);requireInput(previous===undefined||previous===fingerprint,'Conflicting duplicate sys_audit identity');
    if(previous===undefined){auditIds.set(audit.id,fingerprint);audits.push({audit,artifact:artifact.sha256});}
   } else requireInput(false,'Unsupported saved file format');
  }
 }
 requireInput(incidents.size>0&&incidents.size<=100,'Supply 1–100 incidents per reviewed job');
 for(const {audit,artifact}of audits){const incident=incidents.get(audit.ticketId);requireInput(incident,'Orphan audit row; supply its incident');incident.audits.push(audit);incident.artifacts.push(artifact);}
 for(const record of source.records){const incident=incidents.get(record.sourceId)!;requireInput(incident.audits.length<=100,'At most 100 supplied audits per incident');incident.audits.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));record.payload={incident:incident.raw,audits:incident.audits.map(a=>a.raw),departmentId:input.departmentId??null,sourceArtifacts:[...new Set(incident.artifacts)]};record.payloadHash=sha256(canonicalJson(record.payload));}
 return {source,incidents,departmentId:input.departmentId??null};
}

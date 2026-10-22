import { id, now } from '../../platform/http';
import { decodeHistory, historyActions } from './registry';
import { erasedPerson, isErased, type HistoryActor, type HistoryEnvelope, type HistoryMetadata, type HistoryRecord, type Protection } from './types';
export type {HistoryActor,HistoryEnvelope,HistoryMetadata,HistoryRecord,Protection} from './types';
export {historyEventStatement} from './statement';
export {readHistoryEvent} from './archive';

export function registeredHistory(action:string,record:HistoryRecord,before:Record<string,unknown>|null,after:Record<string,unknown>,actor:HistoryActor,subjects:string[],protection:Protection,at?:string,metadata:HistoryMetadata={}):HistoryEnvelope {
  if(!historyActions.has(action))throw new Error('Unregistered history action: '+action);
  return {schema:'linen.history',version:1,action,record,actor,subjects:[...new Set(subjects)],protection,
    changes:Object.entries({...Object.fromEntries(Object.keys(before??{}).map(key=>[key,null])),...after}).filter(([key,value])=>JSON.stringify(before?.[key]??null)!==JSON.stringify(value??null)).map(([field,value])=>({field,before:before?.[field]??null,after:value??null,...(metadata.fields?.[field]?{evidence:metadata.fields[field]}:{})})),...(metadata.source?{source:metadata.source}:{})};
}
function display(value:unknown):unknown { if(isErased(value))return (value as any).person?'Erased person':'[erased]';return value; }
export function projectHistoryEvent(action:string,payload:unknown) {
  const e=decodeHistory(payload);
  if(!e)return {changes:legacyChanges(action,payload),...(cleared(payload)?{redacted:'erasure' as const,redactedAt:clearedAt(payload)}:{})};
  return {changes:e.changes.map(c=>({field:c.evidence?.label && c.field.startsWith('custom:')?c.evidence.label:c.field,before:display(c.before),after:display(c.after),...(c.beforeEvidence?.label?{beforeLabel:c.beforeEvidence.label}:{}),...(c.afterEvidence?.label?{afterLabel:c.afterEvidence.label}:{}),...(c.field.startsWith('custom:')?{fieldId:c.field.slice(7)}:{})})),actor:e.actor,...(e.source?{source:e.source}:{}),
    ...(e.redacted?{redacted:e.redacted,redactedAt:e.redactedAt}:{})};
}
export function historyChanges(action:string,payload:unknown) {return projectHistoryEvent(action,payload).changes;}
function object(payload:unknown):any {try{return typeof payload==='string'?JSON.parse(payload):payload;}catch{return {};}}
function cleared(payload:unknown){const d=object(payload);return !!d && (d.redacted==='erasure'||Object.keys(d).length===0);}
function clearedAt(payload:unknown):string|undefined{return object(payload)?.redactedAt;}
/** Existing original payloads remain readable until their writer migrates; this never fills missing values. */
function legacyChanges(action:string,payload:unknown):{field:string;before:unknown;after:unknown;fieldId?:string;custom?:boolean}[] {
  const d=object(payload);if(!d || d.redacted==='erasure')return [];
  if(Array.isArray(d.changes))return d.changes.filter((c:any)=>c && typeof c.field==='string'&&Object.hasOwn(c,'before')&&Object.hasOwn(c,'after')).map(({field,before,after,step}:any)=>({field,before,after,...(action==='work.scenario_run'&&step==='fields'?{custom:true}:{})}));
  if(action==='work.field_set')return Object.hasOwn(d,'before')?[{field:d.field,before:d.before,after:d.value,custom:true}]:[];
  if(action==='work.group_set')return Object.hasOwn(d,'to')?[{field:'group',before:d.from,after:d.to}]:[];
  const before=d.before??d.from,after=d.after??d.to;
  return after && typeof after==='object'&&!Array.isArray(after)?Object.keys(after).filter(k=>JSON.stringify(before?.[k]??null)!==JSON.stringify(after[k])).map(field=>({field,before:before?.[field]??null,after:after[field]})):[];
}

import { ApiError } from '../../platform/http';
import { archiveReferences } from './archive-schema';
import { isArchiveAlias } from '../history/archive-identities.mjs';
import type { NativeRecord } from './import';
export interface Reference {fromTable:string;fromKey:string;field:string;targets:string[];key:string}
/** Schema-directed reference extraction is shared with export and remapping. */
export function references(record:NativeRecord):Reference[] {
    validateShape(record);
    return archiveReferences(record).flatMap(ref=>{
        if(ref.identity||ref.value==='[erased]'||ref.value==='erased')return [];
        if(isArchiveAlias(ref.value))return [{...ref,targets:['@archive-alias'],key:ref.value}];
        return ref.targets.length?[ref]:[];
    });
}
function validateShape({table,row}:NativeRecord) {
    function json(column:string):any{try{return JSON.parse(String(row[column]));}catch{throw new ApiError(422,'restore_json','Valid typed archive JSON required');}}
    function require(value:unknown){if(!value)throw new ApiError(422,'restore_shape','Typed archive relationships required');}
    if(table==='work_records'&&row.protected_departments_json!==undefined){const values=json('protected_departments_json');require(Array.isArray(values)&&values.every(v=>typeof v==='string'&&v)&&new Set(values).size===values.length);}
    if(table==='work_fulfilments'&&row.application_json){const value=json('application_json');require(value&&typeof value.applicationId==='string'&&Array.isArray(value.approverIds));}
    if(table==='svc_records'&&row.kind==='application'){const value=json('data_json');require(value&&Array.isArray(value.approverIds));}
    if(table==='work_knowledge_drafts'){
        const sources=json('sources_json'),group=json('group_json');require(Array.isArray(sources)&&group&&typeof group==='object'&&!Array.isArray(group));
        for(const source of sources)require(source&&['ticket','known-error'].includes(source.type)&&typeof source.id==='string'&&Array.isArray(source.guards));
    }
    if(table==='svc_records'&&['problem','problem-proposal'].includes(String(row.kind))){const value=json('data_json');require(value&&typeof value==='object'&&!Array.isArray(value)&&(!value.workarounds||Array.isArray(value.workarounds)));}
}

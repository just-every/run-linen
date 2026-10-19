import { ApiError } from '../../platform/http';
import type { NativeRecord } from './import';
export interface Reference {
    fromTable: string;
    fromKey: string;
    field: string;
    targets: string[];
    key: string;
}
const fields: Record<string, string[]> = { work_id: ['work_records'], obligation_id: ['work_obligations'], plan_id: ['execution_plans'], operation_id: ['execution_operations'], attempt_id: ['execution_attempts'], asset_id: ['work_assets'], vendor_id: ['svc_records'], lifecycle_id: ['work_lifecycle'], calendar_id: ['work_calendars'], catalog_id: ['work_catalog'], article_id: ['work_knowledge'], commitment_id: ['intelligence_commitments'], research_id: ['intelligence_research'], capability_id: ['intelligence_capabilities'], person_id: ['work_people', 'identities'], requester_id: ['identities', 'work_people'], beneficiary_id: ['identities', 'work_people'], manager_id: ['work_people', 'identities'] };
export function references(record: NativeRecord): Reference[] {
    const out: Reference[] = [];
    if (record.table === 'work_knowledge_drafts') {
        let sources, group;
        try { sources = JSON.parse(String(record.row.sources_json)); group = JSON.parse(String(record.row.group_json)); }
        catch { throw new ApiError(422, 'restore_json', 'Knowledge source snapshots must be valid JSON'); }
        if (!Array.isArray(sources) || !group || typeof group !== 'object' || Array.isArray(group)) throw new ApiError(422, 'restore_shape', 'Knowledge sources and grouping required');
        for (const source of sources) {
            if (!source || !['ticket','known-error'].includes(source.type) || typeof source.id !== 'string' || !Array.isArray(source.guards))
                throw new ApiError(422, 'restore_shape', 'Typed knowledge sources and guards required');
            if (typeof source.id === 'string') out.push({fromTable:record.table,fromKey:record.key,field:'sources.id',targets:[source.type === 'ticket' ? 'work_records' : 'svc_records'],key:source.id});
            for (const guard of source.guards || []) if (typeof guard.id === 'string' && ['work_records','svc_records'].includes(guard.table))
                out.push({fromTable:record.table,fromKey:record.key,field:'sources.guards.id',targets:[guard.table],key:guard.id});
        }
        if ((group.type === 'known-error' || group.facet === 'serviceId') && typeof group.value === 'string')
            out.push({fromTable:record.table,fromKey:record.key,field:'group.value',targets:['svc_records'],key:group.value});
    }
    if (record.table==='work_recurring_occurrences' && typeof record.row.plan_id==='string')
        out.push({fromTable:record.table,fromKey:record.key,field:'plan_id',targets:['work_recurring_plans'],key:record.row.plan_id});
    if (record.table==='work_recurring_tasks' && typeof record.row.occurrence_id==='string')
        out.push({fromTable:record.table,fromKey:record.key,field:'occurrence_id',targets:['work_recurring_occurrences'],key:record.row.occurrence_id});
    for (const [field, targets] of Object.entries(fields)) {
        if (field==='plan_id' && record.table==='work_recurring_occurrences') continue;
        const key = record.row[field];
        if (typeof key === 'string' && key && !key.startsWith('erased') && key !== '[erased]')
            out.push({ fromTable: record.table, fromKey: record.key, field, targets, key });
    }
    if (record.table === 'work_pending_people' && typeof record.row.id === 'string')
        out.push({fromTable:record.table,fromKey:record.key,field:'id',targets:['work_people'],key:record.row.id});
    const pendingId = record.table === 'work_pending_services' ? record.row.person_id : record.row.pending_person_id;
    if (typeof pendingId === 'string' && pendingId)
        out.push({fromTable:record.table,fromKey:record.key,field:record.table==='work_pending_services'?'person_id':'pending_person_id',
            targets:['work_pending_people'],key:JSON.stringify([record.row.workspace_id,pendingId])});
    if (record.table === 'svc_records' && ['problem','problem-proposal'].includes(String(record.row.kind))) {
        let data;
        try { data = JSON.parse(String(record.row.data_json)); }
        catch { throw new ApiError(422,'restore_json','Problem data must be valid JSON'); }
        if (!data || typeof data !== 'object' || Array.isArray(data) || (data.workarounds && !Array.isArray(data.workarounds)))
            throw new ApiError(422,'restore_shape','Problem workarounds must be a list');
        for (const ref of data.evidence || []) {
            if (typeof ref.id === 'string') out.push({fromTable:record.table,fromKey:record.key,field:'data.evidence.id',targets:[ref.type==='ticket'?'work_records':'svc_records'],key:ref.id});
            if (typeof ref.serviceId === 'string') out.push({fromTable:record.table,fromKey:record.key,field:'data.evidence.serviceId',targets:['svc_records'],key:ref.serviceId});
        }
        if (data.cluster?.facet==='service') out.push({fromTable:record.table,fromKey:record.key,field:'data.cluster.value',targets:['svc_records'],key:data.cluster.value});
        for (const link of data.workarounds || []) if (link && typeof link.articleId === 'string')
            out.push({fromTable:record.table,fromKey:record.key,field:'data.workarounds.articleId',targets:['work_knowledge'],key:link.articleId});
    }
    if(record.table==='svc_records'&&record.row.kind==='calendar-window') {
        const data=JSON.parse(String(record.row.data_json));
        for(const service of data.services||[])out.push({fromTable:record.table,fromKey:record.key,field:'data.services',targets:['svc_records'],key:service});
    }
    if (record.table === 'svc_events' && record.row.record_id)
        out.push({ fromTable: record.table, fromKey: record.key, field: 'record_id', targets: ['svc_records'], key: String(record.row.record_id) });
    return out;
}

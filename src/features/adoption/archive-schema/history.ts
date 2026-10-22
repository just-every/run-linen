import { fieldClass, historyActions } from '../../history/registry';
import { isArchiveAlias } from '../../history/archive-identities.mjs';
import { business, person, json, type JsonPath, type ReferenceSelector } from './types';
const typed = ({ root }: { root: unknown }) => {
    const value = root as any;
    return value?.schema === 'linen.history' && value.version === 1 && historyActions.has(value.action);
};
const recordTables: Record<string, string[]> = { ticket: ['work_records'], task: ['work_obligations', 'work_project_tasks', 'work_recurring_tasks'], change: ['svc_records'], problem: ['svc_records'], asset: ['work_assets'], service: ['svc_records'] };
export function historyReferences(column: string): ReferenceSelector[] {
    const field = (path: JsonPath, kind: 'person' | 'business' | 'alias', when?: ReferenceSelector['when']) => ({ ...json(column, path, kind, [], when), applies: typed });
    return [
        field(['actor', 'id'], 'person', ({ parent }) => (parent as any)?.kind === 'person' && !isArchiveAlias((parent as any)?.id)),
        field(['actor', 'id'], 'business', ({ parent }) => (parent as any)?.kind !== 'person' && !isArchiveAlias((parent as any)?.id)),
        field(['actor', 'id'], 'alias', ({ parent }) => isArchiveAlias((parent as any)?.id)),
        field(['actor', 'initiatedBy'], 'person', ({ parent }) => !isArchiveAlias((parent as any)?.initiatedBy)),
        field(['actor', 'initiatedBy'], 'alias', ({ parent }) => isArchiveAlias((parent as any)?.initiatedBy)),
        field(['subjects', '*'], 'person'),
        ...Object.entries(recordTables).map(([kind, targets]) => ({ ...field(['record', 'id'], 'business', ({ parent }) => (parent as any)?.kind === kind), targets })),
        ...(['before', 'after'] as const).flatMap(side => [
            field(['changes', '*', side], 'person', ({ root, parent }) => fieldClass((root as any).action, (parent as any).field) === 'person' && typeof (parent as any)[side] === 'string'),
            field(['changes', '*', side, 'alias'], 'alias', ({ parent }) => (parent as any)?.redacted === 'erasure' && (parent as any)?.person === true),
        ]),
    ];
}
const alias = (identity = false): ReferenceSelector => ({ column: 'alias', kind: 'alias', targets: [], identity });
const linkedAlias: ReferenceSelector = { ...alias(), targets: ['history_archive_aliases'], keyOf: (value, row) => JSON.stringify([row.workspace_id, row.origin, value]) };
export const historyMetadataReferences: Readonly<Record<string, readonly ReferenceSelector[]>> = {
    history_archive_aliases: [alias(true)],
    history_archive_identity_digests: [linkedAlias],
    history_archive_slots: [linkedAlias, business('event_id')],
    history_redactions: [business('event_id'), ...historyReferences('envelope_json')],
    audit_events: [...historyReferences('detail_json'), { ...person('target', []), when: ({ row }) => ['member.created','member.changed','work.person_erased', 'platform.identity_erased', 'platform.identity.erased'].includes(String(row.action)) }],
    svc_events: historyReferences('data_json'),
};

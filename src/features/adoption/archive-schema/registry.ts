import { archiveKeyFields } from './keys';
import { scalarReferences } from './scalars';
import { executionReferences } from './execution';
import { workReferences } from './work';
import { serviceReferences } from './services';
import { intelligenceReferences } from './intelligence';
import { historyMetadataReferences } from './history';
import { type ArchiveRow, type ArchiveTableSchema, type ReferenceSelector } from './types';
const personTables = new Set(['identities', 'work_people', 'work_pending_people']);
const tombstoneTables = new Set(['adoption_tombstones', 'history_identity_tombstones', 'platform_identity_erasures', 'work_erasure']);
const extras: Readonly<Record<string, readonly ReferenceSelector[]>> = {
    execution_grant_revocations: [{ column: 'grant_id', kind: 'business', targets: ['execution_grants'], keyOf: (value, row) => JSON.stringify([row.workspace_id, value, row.version]) }],
    execution_decisions: [{ column: 'grant_id', kind: 'business', targets: ['execution_grants'], keyOf: (value, row) => JSON.stringify([row.workspace_id, value, row.grant_version]) }],
    adoption_identity_map: [
        { column: 'target_id', kind: 'person', targets: [], when: ({ row }) => row.kind === 'principal' },
        { column: 'source_key', kind: 'person', targets: [], when: ({ row }) => row.kind === 'principal' },
        { column: 'target_id', kind: 'business', targets: [], when: ({ row }) => row.kind !== 'principal' },
    ],
};
/** The row parameter is accepted for callers sharing a schema-selection interface;
 * discriminators remain on selectors, so extraction and mapping cannot diverge. */
export function archiveTableSchema(table: string, _row?: ArchiveRow): ArchiveTableSchema | undefined {
    const keyFields = archiveKeyFields[table];
    if (!keyFields) return undefined;
    return { keyFields, personIdentity: personTables.has(table), tombstone: tombstoneTables.has(table), references: [
        ...(scalarReferences[table] ?? []), ...(executionReferences[table] ?? []), ...(workReferences[table] ?? []),
        ...(table === 'svc_records' ? serviceReferences : []), ...(intelligenceReferences[table] ?? []),
        ...(historyMetadataReferences[table] ?? []), ...(extras[table] ?? []),
    ] };
}

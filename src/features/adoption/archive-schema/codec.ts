import { archiveTableSchema } from './registry';
import { archiveJsonLeaves, setArchiveJsonLeaf } from './paths';
import { ArchiveSchemaError, type ArchiveMapping, type ArchiveRecord, type ArchiveReference, type ArchiveRow } from './types';

export function archiveRowKey(table: string, row: ArchiveRow): string {
    const schema = archiveTableSchema(table);
    if (!schema) throw new ArchiveSchemaError('archive_unknown_table', table);
    const values = schema.keyFields.map(field => {
        const value = row[field];
        if (typeof value !== 'string' && typeof value !== 'number') throw new ArchiveSchemaError('archive_row_key', `${table}.${field}`);
        return value;
    });
    return values.length === 1 ? String(values[0]) : JSON.stringify(values);
}
function roots(record: ArchiveRecord) {
    const parsed = new Map<string, unknown>();
    for (const selector of archiveTableSchema(record.table)?.references ?? []) {
        if (selector.path === undefined || parsed.has(selector.column)) continue;
        const value = record.row[selector.column];
        if (value === null || value === undefined) continue;
        if (typeof value !== 'string') throw new ArchiveSchemaError('archive_json', `${record.table}.${selector.column}`);
        try { parsed.set(selector.column, JSON.parse(value)); }
        catch { throw new ArchiveSchemaError('archive_json', `${record.table}.${selector.column}`); }
    }
    return parsed;
}
function collect(record: ArchiveRecord, parsed: Map<string, unknown>): ArchiveReference[] {
    const out: ArchiveReference[] = [];
    for (const selector of archiveTableSchema(record.table)?.references ?? []) {
        const root = selector.path === undefined ? record.row[selector.column] : parsed.get(selector.column);
        if (selector.applies && !selector.applies({ row: record.row, root, parent: undefined })) continue;
        for (const leaf of archiveJsonLeaves(root, selector.path ?? [])) {
            if (selector.when && !selector.when({ row: record.row, root, parent: leaf.parent, path: leaf.path })) continue;
            if (leaf.value === null || leaf.value === undefined || leaf.value === '') continue;
            if (typeof leaf.value !== 'string') throw new ArchiveSchemaError('archive_reference_shape', `${record.table}.${selector.column}`);
            out.push({ fromTable: record.table, fromKey: record.key, column: selector.column,
                field: [selector.column, ...leaf.path].join('.'), path: leaf.path, targets: [...selector.targets],
                key: selector.keyOf ? selector.keyOf(leaf.value, record.row, { row: record.row, root, parent: leaf.parent, path: leaf.path }) : leaf.value, value: leaf.value,
                kind: selector.kind, identity: selector.identity === true });
        }
    }
    return out;
}
/** Includes primary person identities. Empty targets mean typed, without a local FK. */
export function archiveReferences(record: ArchiveRecord): ArchiveReference[] { return collect(record, roots(record)); }
export function mapArchiveRow(table: string, row: ArchiveRow, mapping: ArchiveMapping): ArchiveRow {
    const record = { table, key: '', row }, parsed = roots(record), mapped = { ...row }, changed = new Set<string>();
    for (const reference of collect(record, parsed)) {
        const mapper = mapping[reference.kind];
        if (!mapper) continue;
        const next = mapper(reference.value, reference);
        if (typeof next !== 'string') throw new ArchiveSchemaError('archive_reference_mapping', reference.field);
        if (next === reference.value) continue;
        if (parsed.has(reference.column)) {
            parsed.set(reference.column, setArchiveJsonLeaf(parsed.get(reference.column), reference.path, next));
            changed.add(reference.column);
        } else mapped[reference.column] = next;
    }
    for (const column of changed) mapped[column] = JSON.stringify(parsed.get(column));
    if (mapping.workspaceId !== undefined && Object.hasOwn(row, 'workspace_id')) mapped.workspace_id = mapping.workspaceId;
    if (table === 'workspace' && mapping.workspaceId !== undefined) mapped.id = mapping.workspaceId;
    return mapped;
}
/** Diagnostic residual only: callers must still tombstone-scan the whole projected row. */
export function archiveUntypedRow(table: string, row: ArchiveRow): ArchiveRow {
    const record = { table, key: '', row }, parsed = roots(record), residual = { ...row }, changed = new Set<string>();
    for (const reference of collect(record, parsed)) {
        if (parsed.has(reference.column)) {
            parsed.set(reference.column, setArchiveJsonLeaf(parsed.get(reference.column), reference.path, undefined));
            changed.add(reference.column);
        } else delete residual[reference.column];
    }
    for (const column of changed) residual[column] = JSON.stringify(parsed.get(column));
    return residual;
}

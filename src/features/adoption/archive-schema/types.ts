export type ArchiveRow = Record<string, unknown>;
export type ReferenceKind = 'person' | 'business' | 'alias';
export type JsonPath = readonly (string | number)[];
export interface SelectorContext {
    row: ArchiveRow;
    root: unknown;
    parent: unknown;
    path?: JsonPath;
}
/** Wildcards traverse array elements only; they never infer roles from object keys. */
export interface ReferenceSelector {
    column: string;
    path?: JsonPath;
    kind: ReferenceKind;
    targets: readonly string[];
    identity?: boolean;
    applies?: (context: SelectorContext) => boolean;
    when?: (context: SelectorContext) => boolean;
    keyOf?: (value: string, row: ArchiveRow, context: SelectorContext) => string;
}
export interface ArchiveTableSchema {
    keyFields: readonly string[];
    personIdentity?: boolean;
    tombstone?: boolean;
    references: readonly ReferenceSelector[];
}
export interface ArchiveRecord { table: string; key: string; row: ArchiveRow }
export interface ArchiveReference {
    fromTable: string;
    fromKey: string;
    field: string;
    column: string;
    path: JsonPath;
    targets: string[];
    key: string;
    value: string;
    kind: ReferenceKind;
    identity: boolean;
}
export interface ArchiveMapping {
    person?: (value: string, reference: ArchiveReference) => string;
    /** Supply only when restoring into a different workspace, not for erasure projection. */
    business?: (value: string, reference: ArchiveReference) => string;
    /** Native history aliases belong to their original installation and default to unchanged. */
    alias?: (value: string, reference: ArchiveReference) => string;
    workspaceId?: string;
}
export class ArchiveSchemaError extends Error {
    constructor(public readonly code: string, public readonly field: string) {
        super(`Invalid archive field: ${field}`);
        this.name = 'ArchiveSchemaError';
    }
}
export const person = (column: string, targets: readonly string[] = ['identities', 'work_people']): ReferenceSelector => ({ column, kind: 'person', targets });
export const business = (column: string, ...targets: string[]): ReferenceSelector => ({ column, kind: 'business', targets });
export const json = (column: string, path: JsonPath, kind: ReferenceKind, targets: readonly string[] = [], when?: ReferenceSelector['when']): ReferenceSelector => ({ column, path, kind, targets, when });

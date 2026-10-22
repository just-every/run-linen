import { ArchiveSchemaError, type JsonPath } from './types';
export interface JsonLeaf { path: JsonPath; value: unknown; parent: unknown }
export function archiveJsonLeaves(root: unknown, path: JsonPath): JsonLeaf[] {
    const out: JsonLeaf[] = [];
    function visit(value: unknown, at: number, actual: (string | number)[], parent: unknown) {
        if (at === path.length) { out.push({ path: actual, value, parent }); return; }
        if (value === undefined || value === null) return;
        const segment = path[at];
        if (segment === '*') {
            if (!Array.isArray(value)) throw new ArchiveSchemaError('archive_reference_shape', actual.join('.'));
            value.forEach((child, index) => visit(child, at + 1, [...actual, index], value));
        } else {
            // An optional nested object may instead be an opaque scalar (for
            // example a history change value). Its content stays untyped.
            if (typeof value !== 'object' || Array.isArray(value) !== (typeof segment === 'number')) return;
            if (Object.hasOwn(value, segment)) visit((value as Record<string | number, unknown>)[segment], at + 1, [...actual, segment], value);
        }
    }
    visit(root, 0, [], undefined);
    return out;
}
export function setArchiveJsonLeaf(root: unknown, path: JsonPath, value: unknown): unknown {
    if (!path.length) return value;
    let parent = root as Record<string | number, unknown>;
    for (const segment of path.slice(0, -1)) parent = parent[segment] as Record<string | number, unknown>;
    parent[path[path.length - 1]] = value;
    return root;
}

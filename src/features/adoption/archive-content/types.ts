import type { Row } from '../core';

export type { Row } from '../core';
export type IdentityMatcher = (identity: string) => Promise<boolean>;
export interface ContentContext {
    env: { DB: D1Database };
    principal: { workspaceId: string };
}
export type JsonObject = Record<string, unknown>;
export type ContentPath = readonly (string | '*')[];

export function object(value: unknown): JsonObject | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined;
}
export function json(value: unknown): unknown {
    return typeof value === 'string' ? JSON.parse(value) : value;
}
export async function anyIdentity(matches: IdentityMatcher, ...values: unknown[]): Promise<boolean> {
    const results = await Promise.all(values.filter((value): value is string => typeof value === 'string' && !!value).map(matches));
    return results.some(Boolean);
}
export function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

/** These are declared content fields, not a search through arbitrary JSON keys. */
export function clearPaths(value: unknown, paths: readonly ContentPath[], replacement: unknown = '[erased]'): unknown {
    function clear(current: unknown, path: ContentPath): unknown {
        if (!path.length) return current == null ? current : replacement;
        const [key, ...rest] = path;
        if (key === '*') return Array.isArray(current) ? current.map(item => clear(item, rest)) : current;
        const record = object(current);
        if (!record || !Object.hasOwn(record, key)) return current;
        return { ...record, [key]: clear(record[key], rest) };
    }
    return paths.reduce<unknown>((current, path) => clear(current, path), value);
}
export function columns(row: Row, changes: Row): Row {
    const next = { ...row };
    for (const [field, value] of Object.entries(changes)) if (Object.hasOwn(row, field)) next[field] = value;
    return next;
}
export function contentJson(row: Row, column: string, paths: readonly ContentPath[], replacement?: unknown): Row {
    if (row[column] == null) return row;
    const prior = json(row[column]), next = clearPaths(prior, paths, replacement);
    return JSON.stringify(prior) === JSON.stringify(next) ? row : { ...row, [column]: JSON.stringify(next) };
}

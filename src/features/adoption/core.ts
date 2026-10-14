import type { Env, Principal } from '../../platform/types';
import { ApiError, id, now } from '../../platform/http';
import { plainMessage } from './messages';
export interface AdoptionContext {
    env: Env;
    principal: Principal;
}
export type Row = Record<string, string | number | null>;
export function check(v: unknown, code: string, status = 422): asserts v {
    if (!v)
        throw new ApiError(status, code, plainMessage(code));
}
export async function owner(ctx: AdoptionContext) {
    const m = await ctx.env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(ctx.principal.workspaceId, ctx.principal.userId).first<{
        roles_json: string;
    }>();
    check(m && JSON.parse(m.roles_json).includes('owner'), 'owner_required', 403);
}
export function statement(ctx: AdoptionContext, action: string, target: string, detail: unknown = {}) { return ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(), ctx.principal.workspaceId, ctx.principal.userId, action, target, JSON.stringify(detail), now()); }
export async function audited(ctx: AdoptionContext, action: string, target: string, detail: unknown = {}) { await ctx.env.DB.batch([statement(ctx, action, target, detail)]); }
export async function sha(bytes: BufferSource) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join(''); }
export const encode = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
export async function identityHash(identity: string) { return sha(new TextEncoder().encode(identity)); }
export async function erased(ctx: AdoptionContext, row: Row) { const identities = new Set<string>(); function collect(value: unknown, depth = 0) { if (depth > 20)
    return; if (typeof value === 'string') {
    if (value.length <= 320) {
        identities.add(value);
        if (value.includes('@'))
            identities.add(value.toLowerCase());
    }
    if (value.startsWith('{') || value.startsWith('[')) {
        try {
            collect(JSON.parse(value), depth + 1);
        }
        catch { }
    }
}
else if (Array.isArray(value))
    value.forEach(v => collect(v, depth + 1));
else if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (object.source && object.source_id)
        identities.add(`${object.source}:${object.source_id}`);
    Object.values(object).forEach(v => collect(v, depth + 1));
} } collect(row); for (const identity of identities)
    if (await ctx.env.DB.prepare('SELECT 1 FROM adoption_tombstones WHERE workspace_id=? AND identity_hash=?').bind(ctx.principal.workspaceId, await identityHash(identity)).first())
        return true; return false; }
export async function getRun(ctx: AdoptionContext, kind: 'exports' | 'imports', runId: string) { await owner(ctx); const r = await ctx.env.DB.prepare(`SELECT * FROM adoption_${kind} WHERE workspace_id=? AND id=?`).bind(ctx.principal.workspaceId, runId).first<Row>(); check(r, 'not_found', 404); return r; }
export async function queueDelete(ctx: AdoptionContext, key: string) { check(key.startsWith(ctx.principal.workspaceId + '/'), 'invalid_object_scope'); await ctx.env.DB.prepare("INSERT OR IGNORE INTO adoption_deletions VALUES(?,?,?,'pending',0,?)").bind(id(), ctx.principal.workspaceId, key, now()).run(); }

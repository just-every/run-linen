import { ApiError, id, now } from '../../platform/http';
import type { Role } from '../../platform/types';
import type { IntelligenceContext, Commitment } from './types';
export function assert(value: unknown, code: string, status = 400): asserts value {
    if (!value)
        throw new ApiError(status, code, code.replaceAll('_', ' '));
}
export async function current(ctx: IntelligenceContext, roles: Role[] = []) {
    const m = await ctx.env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(ctx.principal.workspaceId, ctx.principal.userId).first<{
        roles_json: string;
    }>();
    assert(m, 'membership_revoked', 403);
    const p = { ...ctx.principal, roles: JSON.parse(m.roles_json) as Role[] };
    assert(!roles.length || roles.some(r => p.roles.includes(r)), 'role_denied', 403);
    return { ...ctx, principal: p };
}
export function visible(ctx: IntelligenceContext, c: Commitment) {
    const p = ctx.principal;
    return p.roles.includes('owner') || (c.sensitivity === 'hr' ? p.roles.includes('hr') && (c.ownerId === p.userId || c.participants.includes(p.userId)) : c.ownerId === p.userId || c.participants.includes(p.userId) || (c.sensitivity === 'internal' && p.roles.some(r => ['operator', 'auditor'].includes(r))));
}
export async function audit(ctx: IntelligenceContext, action: string, target: string, detail: unknown = {}) {
    await ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(), ctx.principal.workspaceId, ctx.principal.userId, action, target, JSON.stringify(detail), now()).run();
}
export const iso = (v: unknown) => {
    assert(typeof v === 'string' && Number.isFinite(Date.parse(v)), 'invalid_date');
    return new Date(v).toISOString();
};
export const strings = (v: unknown, allowEmpty = false): string[] => {
    assert(Array.isArray(v) && v.length <= 100 && (allowEmpty || v.length > 0) && v.every(x => typeof x === 'string' && x.length > 0 && x.length <= 200), 'invalid_list');
    return [...new Set(v)];
};
export const num = (v: unknown, min: number, max: number) => {
    assert(typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max, 'invalid_number');
    return v;
};
export const errorCode = (e: unknown) => e instanceof ApiError ? e.code : 'unexpected_failure';

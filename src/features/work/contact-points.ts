import { ApiError, id, now, requiredString } from '../../platform/http';
import { permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';

export const normalizePhone = (value: string) => {
  const digits = value.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  if (!/^\+?\d{7,15}$/.test(digits)) throw new ApiError(422, 'phone_invalid', 'A phone number with 7 to 15 digits is required');
  return digits.startsWith('+') ? digits : (digits.length === 10 ? '+1' : '+') + digits;
};
export const normalizeBadge = (value: string) => {
  const badge = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9 _.-]{0,63}$/.test(badge)) throw new ApiError(422, 'badge_invalid', 'A badge number of up to 64 letters or digits is required');
  return badge;
};
/** Owner-reviewed mapping of a badge or phone number to one active member. Identity is never inferred from a name or number alone. */
export async function mapContactPoint(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const kind = input.kind === 'badge' ? 'badge' : input.kind === 'phone' ? 'phone' : null;
  if (!kind) throw new ApiError(422, 'kind_invalid', 'Choose a badge or a phone number');
  const value = kind === 'badge' ? normalizeBadge(requiredString(input.value, 'value', 80)) : normalizePhone(requiredString(input.value, 'value', 40));
  const userId = requiredString(input.userId, 'userId'), w = ctx.principal.workspaceId;
  const member = await ctx.env.DB.prepare('SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(w, userId).first();
  if (!member) throw new ApiError(422, 'member_missing', 'Map to an active authenticated workspace member');
  if (await ctx.env.DB.prepare('SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id=?').bind(w, userId).first()) throw new ApiError(409, 'erased', 'An erased identity cannot be mapped');
  const prior = await ctx.env.DB.prepare('SELECT user_id FROM work_contact_points WHERE workspace_id=? AND kind=? AND value=?').bind(w, kind, value).first<{ user_id: string }>();
  if (prior && prior.user_id !== userId && input.replace !== true) throw new ApiError(409, 'contact_point_taken', 'This number already belongs to another member; confirm the replacement');
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO work_contact_points VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_id,kind,value) DO UPDATE SET user_id=excluded.user_id,actor_id=excluded.actor_id,created_at=excluded.created_at').bind(w, kind, value, userId, ctx.principal.userId, now()),
    ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(), w, ctx.principal.userId, 'work.contact_point.mapped', userId, JSON.stringify({ kind, replaced: Boolean(prior) }), now()),
  ]);
  return { state: 'mapped', kind };
}
export async function listContactPoints(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  return { items: (await ctx.env.DB.prepare('SELECT c.kind,c.value,c.user_id,u.name FROM work_contact_points c JOIN users u ON u.id=c.user_id WHERE c.workspace_id=? ORDER BY u.name,c.kind').bind(ctx.principal.workspaceId).all()).results };
}
export async function memberByContact(ctx: WorkContext, kind: 'badge' | 'phone', value: string) {
  return ctx.env.DB.prepare(`SELECT m.user_id,m.roles_json FROM work_contact_points c JOIN memberships m ON m.workspace_id=c.workspace_id AND m.user_id=c.user_id AND m.active=1
    WHERE c.workspace_id=? AND c.kind=? AND c.value=? AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=c.workspace_id AND e.person_id=c.user_id)`).bind(ctx.principal.workspaceId, kind, value).first<{ user_id: string; roles_json: string }>();
}

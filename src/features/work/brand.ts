import { ApiError, id, now } from '../../platform/http';
import type { Env } from '../../platform/types';
import { permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';

const LOGO_TYPES: Record<string, number[]> = { 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff], 'image/webp': [0x52, 0x49, 0x46, 0x46] };
const MAX_LOGO_BYTES = 150 * 1024;
const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255); };
const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
// Buttons carry Linen's dark ink on the primary color; links and headings carry the accent on white.
const INK = '#17243a';
export interface Brand { portalName: string; primaryColor: string; accentColor: string; logoUrl: string | null; revision: number }
const row = (env: Env, workspaceId: string) => env.DB.prepare('SELECT * FROM work_portal_brand WHERE workspace_id=?').bind(workspaceId).first<any>();
const shape = (env: Env, workspaceId: string, r: any): Brand => ({
  portalName: r.portal_name, primaryColor: r.primary_color, accentColor: r.accent_color, revision: r.revision,
  logoUrl: r.logo_base64 ? `${env.APP_ORIGIN ? new URL(env.APP_ORIGIN).origin : ''}/api/v1/branding/${encodeURIComponent(workspaceId)}/logo?v=${r.revision}` : null,
});
/** Owner sets the portal's name, two colors that stay readable, and an optional PNG, JPEG or WebP logo (never SVG, which can carry script). */
export async function saveBrand(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const w = ctx.principal.workspaceId, prior = await row(ctx.env, w), revision = Number(input.revision ?? 0);
  if (revision !== (prior?.revision ?? 0)) throw new ApiError(409, 'revision_conflict', 'Branding changed; reload');
  const name = typeof input.portalName === 'string' ? input.portalName.trim() : '';
  if (!name || name.length > 60 || /[\x00-\x1f\x7f<>]/.test(name)) throw new ApiError(422, 'brand_name', 'A portal name of up to 60 characters is required');
  const primary = String(input.primaryColor ?? '').toLowerCase(), accent = String(input.accentColor ?? '').toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(primary) || !/^#[0-9a-f]{6}$/.test(accent)) throw new ApiError(422, 'brand_color', 'Colors are six-digit hex values such as #f5a623');
  if (contrast(primary, INK) < 4.5) throw new ApiError(422, 'brand_contrast', 'The primary color is too dark for the dark button text; choose a lighter one');
  if (contrast(accent, '#ffffff') < 4.5) throw new ApiError(422, 'brand_contrast', 'The accent color is too light to read on white; choose a darker one');
  let logoType: string | null = prior?.logo_type ?? null, logo: string | null = prior?.logo_base64 ?? null;
  if (input.removeLogo === true) { logoType = null; logo = null; }
  if (input.logo && typeof input.logo === 'object') {
    const { type, base64 } = input.logo as { type?: unknown; base64?: unknown };
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(String(base64)), c => c.charCodeAt(0)); } catch { throw new ApiError(422, 'brand_logo', 'The logo must be base64 image bytes'); }
    const magic = typeof type === 'string' ? LOGO_TYPES[type] : undefined;
    if (!magic || bytes.length < 16 || bytes.length > MAX_LOGO_BYTES || !magic.every((b, i) => bytes[i] === b)) throw new ApiError(422, 'brand_logo', 'A PNG, JPEG or WebP logo of at most 150 KB is required');
    logoType = type as string; logo = String(base64);
  }
  const at = now();
  const result = await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO work_portal_brand VALUES(?,?,?,?,?,?,1,?,?) ON CONFLICT(workspace_id) DO UPDATE SET portal_name=excluded.portal_name,primary_color=excluded.primary_color,accent_color=excluded.accent_color,
      logo_type=excluded.logo_type,logo_base64=excluded.logo_base64,revision=work_portal_brand.revision+1,actor_id=excluded.actor_id,updated_at=excluded.updated_at WHERE work_portal_brand.revision=?`).bind(w, name, primary, accent, logoType, logo, ctx.principal.userId, at, revision),
    ctx.env.DB.prepare('INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()>0').bind(id(), w, ctx.principal.userId, 'work.brand.saved', w, JSON.stringify({ logo: Boolean(logo) }), at),
  ]);
  if (!result[0].meta.changes) throw new ApiError(409, 'revision_conflict', 'Branding changed; reload');
  return shape(ctx.env, w, await row(ctx.env, w));
}
export async function readBrand(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  const r = await row(ctx.env, ctx.principal.workspaceId);
  return { brand: r ? shape(ctx.env, ctx.principal.workspaceId, r) : null };
}
/** The logo is public by nature: mail clients fetch it without a session. Only a workspace's own stored image is ever served. */
export async function brandLogo(env: Env, workspaceId: string) {
  const r = await row(env, workspaceId);
  if (!r?.logo_base64) return new Response('Not found', { status: 404 });
  return new Response(Uint8Array.from(atob(r.logo_base64), c => c.charCodeAt(0)), { headers: { 'Content-Type': r.logo_type, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
}
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** The buyer's branded HTML for a plain notification text, or null when the workspace has set no branding. */
export async function brandedHtml(env: Env, workspaceId: string, text: string) {
  const r = await row(env, workspaceId);
  if (!r) return null;
  const brand = shape(env, workspaceId, r);
  const logo = brand.logoUrl && env.APP_ORIGIN ? `<img src="${escape(brand.logoUrl)}" alt="${escape(brand.portalName)}" height="40" style="display:block;margin:0 0 8px;border:0;height:40px">` : '';
  return `<div style="font:14px/1.5 Arial,Helvetica,sans-serif;color:#17243a;max-width:560px"><div style="border-top:6px solid ${brand.primaryColor};padding:12px 0">${logo}<strong style="font-size:16px;color:${brand.accentColor}">${escape(brand.portalName)}</strong></div><div>${escape(text).replace(/\r?\n/g, '<br>')}</div></div>`;
}

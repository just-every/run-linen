import { ApiError, id, now } from '../../platform/http';
import { permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';

/** Effort roles a declared labor rate can price (REPORT-004). */
export const effortRoles = ['employee', 'agent', 'approver', 'owner', 'vendor', 'technician'] as const;
export type LaborRates = Partial<Record<(typeof effortRoles)[number], number>>;

/** Rates are owner-declared costing assumptions per effort role, never a person's pay. */
export async function laborRates(ctx: WorkContext): Promise<LaborRates> {
  const row = await ctx.env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id=?')
    .bind(ctx.principal.workspaceId).first<{ settings_json: string }>();
  return JSON.parse(row?.settings_json || '{}').laborRatesUsdPerHour || {};
}
export async function readLaborRates(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'operator', 'auditor']);
  return { rates: await laborRates(ctx), unit: 'USD per active hour' };
}
/** Only the owner declares rates. A null rate withdraws it; withdrawn roles report labor cost as unknown. */
export async function declareLaborRates(ctx: WorkContext, input: { rates?: unknown }) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const submitted = input.rates;
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted) || !Object.keys(submitted).length)
    throw new ApiError(422, 'labor_rates', 'Declare at least one role rate');
  const next: LaborRates = { ...await laborRates(ctx) };
  for (const [role, value] of Object.entries(submitted as Record<string, unknown>)) {
    if (!(effortRoles as readonly string[]).includes(role)) throw new ApiError(422, 'labor_rate_role', `Unknown effort role ${role}`);
    if (value === null) { delete next[role as keyof LaborRates]; continue; }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000)
      throw new ApiError(422, 'labor_rate_value', 'A rate is USD per active hour from 0 to 10,000');
    next[role as keyof LaborRates] = Math.round(value * 100) / 100;
  }
  const t = now(), db = ctx.env.DB;
  await db.batch([
    db.prepare("INSERT INTO workspace_settings(workspace_id,settings_json) VALUES(?,'{}') ON CONFLICT(workspace_id) DO NOTHING").bind(ctx.principal.workspaceId),
    db.prepare("UPDATE workspace_settings SET settings_json=json_set(settings_json,'$.laborRatesUsdPerHour',json(?)) WHERE workspace_id=?")
      .bind(JSON.stringify(next), ctx.principal.workspaceId),
    db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
      .bind(id(), ctx.principal.workspaceId, ctx.principal.userId, 'work.labor_rates_declared', 'labor-rates', JSON.stringify({ rates: next }), t),
  ]);
  return { rates: next, unit: 'USD per active hour', declaredAt: t };
}

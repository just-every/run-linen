import { now } from '../../platform/http';
import type { IntelligenceContext } from './types';

/** Calendar months in UTC. Reservations are liabilities until reconciled, even in later months. */
export async function refreshBudget(ctx: IntelligenceContext) {
  const period = now().slice(0, 7) + '-01T00:00:00.000Z';
  await ctx.env.DB.prepare(`UPDATE intelligence_budgets SET
    spent_usd=COALESCE((SELECT SUM(cost_usd) FROM intelligence_attempts WHERE workspace_id=intelligence_budgets.workspace_id AND charge_status='estimated' AND created_at>=?),0),
    period_start=?,revision=revision+1 WHERE workspace_id=? AND period_start<>?`)
    .bind(period, period, ctx.principal.workspaceId, period).run();
  return ctx.env.DB.prepare('SELECT * FROM intelligence_budgets WHERE workspace_id=?')
    .bind(ctx.principal.workspaceId).first();
}

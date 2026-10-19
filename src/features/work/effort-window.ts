import type { WorkContext } from './core';
import type { LaborRates } from './labor-rates';

interface Cohort { id: string; requestType: string; state: string; failed: number; verified: number }
interface Charge { workId: string; attempts: number; usd: number; unknown: number }
export interface EffortGroup { requestType: string; role: string; actorRole: string; source: string; touchKind: string; entries: number; touches: number; activeMinutes: number; unfinishedTimers: number }

/**
 * One reporting window [from,to) (REPORT-004). Labor is recorded human minutes at the
 * owner's declared role rate; model charges are configured-price estimates of calls that
 * named the request; provider dispatches carry no charge Linen receives, so they stay unknown.
 */
export async function effortWindow(ctx: WorkContext, from: string, to: string, rates: LaborRates) {
  const db = ctx.env.DB, w = ctx.principal.workspaceId;
  const groups = (await db.prepare(`SELECT e.request_type requestType,e.effort_role role,e.actor_role actorRole,e.source,e.touch_kind touchKind,
    COUNT(*) entries,SUM(e.touches) touches,SUM(e.active_ms)/60000.0 activeMinutes,
    SUM(CASE WHEN e.state='active' THEN 1 ELSE 0 END) unfinishedTimers
    FROM work_time_entries e JOIN work_records w ON w.workspace_id=e.workspace_id AND w.id=e.work_id
    WHERE e.workspace_id=? AND w.sensitivity='normal' AND e.created_at>=? AND e.created_at<?
    GROUP BY e.request_type,e.effort_role,e.actor_role,e.source,e.touch_kind ORDER BY e.request_type,e.effort_role,e.actor_role,e.source,e.touch_kind`)
    .bind(w, from, to).all<EffortGroup>()).results;
  const providerAttempts = `SELECT 1 FROM execution_plans p JOIN execution_operations o ON o.workspace_id=p.workspace_id AND o.plan_id=p.id
    JOIN execution_attempts x ON x.workspace_id=o.workspace_id AND x.operation_id=o.id
    WHERE p.workspace_id=w.workspace_id AND p.work_id=w.id AND p.context_type='work' AND x.started_at>=? AND x.started_at<?`;
  const cohort = (await db.prepare(`SELECT w.id,w.kind,w.state,
    COALESCE((SELECT c.name FROM work_fulfilments f JOIN work_catalog c ON c.workspace_id=f.workspace_id AND c.id=f.catalog_id WHERE f.workspace_id=w.workspace_id AND f.work_id=w.id ORDER BY c.id LIMIT 1),w.kind) requestType,
    EXISTS(SELECT 1 FROM work_obligations o WHERE o.workspace_id=w.workspace_id AND o.work_id=w.id AND o.state='failed') failed,
    (EXISTS(SELECT 1 FROM work_obligations o WHERE o.workspace_id=w.workspace_id AND o.work_id=w.id) AND NOT EXISTS(SELECT 1 FROM work_obligations o WHERE o.workspace_id=w.workspace_id AND o.work_id=w.id AND o.state<>'verified')) verified
    FROM work_records w WHERE w.workspace_id=? AND w.sensitivity='normal' AND ((w.created_at>=? AND w.created_at<?)
      OR EXISTS(SELECT 1 FROM work_time_entries e WHERE e.workspace_id=w.workspace_id AND e.work_id=w.id AND e.created_at>=? AND e.created_at<?)
      OR EXISTS(SELECT 1 FROM intelligence_attempts a WHERE a.workspace_id=w.workspace_id AND a.work_id=w.id AND a.created_at>=? AND a.created_at<?)
      OR EXISTS(${providerAttempts}))`)
    .bind(w, from, to, from, to, from, to, from, to).all<Cohort>()).results;
  const model = (await db.prepare(`SELECT a.work_id workId,COUNT(*) attempts,
    SUM(CASE WHEN a.charge_status='estimated' THEN COALESCE(a.cost_usd,0) ELSE 0 END) usd,
    SUM(CASE WHEN a.charge_status='estimated' THEN 0 ELSE 1 END) unknown
    FROM intelligence_attempts a JOIN work_records w ON w.workspace_id=a.workspace_id AND w.id=a.work_id
    WHERE a.workspace_id=? AND w.sensitivity='normal' AND a.charge_status<>'not_dispatched' AND a.created_at>=? AND a.created_at<? GROUP BY a.work_id`)
    .bind(w, from, to).all<Charge>()).results;
  const provider = (await db.prepare(`SELECT p.work_id workId,COUNT(*) attempts,0 usd,COUNT(*) unknown
    FROM execution_attempts x JOIN execution_operations o ON o.workspace_id=x.workspace_id AND o.id=x.operation_id
    JOIN execution_plans p ON p.workspace_id=o.workspace_id AND p.id=o.plan_id
    JOIN work_records w ON w.workspace_id=p.workspace_id AND w.id=p.work_id
    WHERE x.workspace_id=? AND p.context_type='work' AND w.sensitivity='normal' AND x.started_at>=? AND x.started_at<? GROUP BY p.work_id`)
    .bind(w, from, to).all<Charge>()).results;
  const typeOf = new Map(cohort.map(r => [r.id, r.requestType]));
  const types = [...new Set([...cohort.map(r => r.requestType), ...groups.map(g => String(g.requestType))])].sort();
  const byRequestType = types.map(requestType => {
    const rows = cohort.filter(r => r.requestType === requestType), effort = groups.filter(g => g.requestType === requestType);
    const byRole: Record<string, { touches: number; activeMinutes: number }> = {};
    for (const g of effort) {
      const role = byRole[g.role] ||= { touches: 0, activeMinutes: 0 };
      role.touches += g.touches; role.activeMinutes += g.activeMinutes;
    }
    const byTouchKind: Record<string, { touches: number; activeMinutes: number }> = {};
    for (const g of effort) {
      const kind = byTouchKind[g.touchKind] ||= { touches: 0, activeMinutes: 0 };
      kind.touches += g.touches; kind.activeMinutes += g.activeMinutes;
    }
    const unpricedRoles = Object.keys(byRole).filter(role => byRole[role].activeMinutes > 0 && rates[role as keyof LaborRates] === undefined);
    const laborUsd = Object.entries(byRole).reduce((n, [role, v]) => n + v.activeMinutes / 60 * (rates[role as keyof LaborRates] ?? 0), 0);
    const charges = (list: Charge[]) => list.filter(c => typeOf.get(c.workId) === requestType)
      .reduce((n, c) => ({ attempts: n.attempts + c.attempts, usd: n.usd + c.usd, unknownCharges: n.unknownCharges + c.unknown }), { attempts: 0, usd: 0, unknownCharges: 0 });
    const m = charges(model), p = charges(provider);
    const verified = rows.filter(r => r.verified).length, knownCostUsd = laborUsd + m.usd;
    const costComplete = !unpricedRoles.length && !m.unknownCharges && !p.unknownCharges;
    return {
      requestType, incoming: rows.length, verified, failed: rows.filter(r => r.failed).length,
      pending: rows.filter(r => !r.verified && !r.failed).length, closed: rows.filter(r => r.state === 'closed').length,
      touches: effort.reduce((n, g) => n + g.touches, 0), activeMinutes: effort.reduce((n, g) => n + g.activeMinutes, 0), byRole, byTouchKind,
      labor: { usd: laborUsd, unpricedRoles },
      model: { attempts: m.attempts, estimatedUsd: m.usd, unknownCharges: m.unknownCharges },
      provider: { attempts: p.attempts, unknownCharges: p.unknownCharges },
      knownCostUsd, costComplete,
      knownCostPerVerifiedOutcomeUsd: verified ? knownCostUsd / verified : null,
    };
  });
  return { from, to, groups, byRequestType };
}

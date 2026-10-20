import type { Principal } from '../../platform/types';
import { ApiError, now } from '../../platform/http';
import { date, dto, readable, staff, type RecordRow, type ServiceRecord } from './store';
import { assertProblemSources } from './problem-source-access';
import { changeProblemMetrics, incidentMetrics, inRange } from './operations-kpi-metrics';
import { assetMetrics, type PhysicalAsset, type AssetFinancial, type AssetContract } from './operations-kpi-assets';

/** Unbounded source population; do not reuse the capped interactive service list. */
async function serviceSources(db: D1Database, p: Principal) {
  const rows = await db.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind IN ('incident','change','problem','asset','service','supplier') ORDER BY id")
    .bind(p.workspaceId).all<RecordRow>();
  const visible: ServiceRecord[] = [];
  for (const record of rows.results.map(dto).filter(r => readable(p, r))) {
    try {
      if (record.kind === 'problem' && record.data.sourceProposalId) await assertProblemSources(db, p, record);
      visible.push(record);
    } catch (error) {
      if (!(error instanceof ApiError) || ![403, 404].includes(error.status)) throw error;
    }
  }
  return visible;
}
export async function operationsKpis(db: D1Database, p: Principal, start: string, end: string, timezone: string) {
  if (!p.roles.some(r => ['owner', 'operator', 'auditor'].includes(r))) throw new ApiError(403, 'forbidden', 'Service report audience required');
  // Require actual instants. The IANA zone labels the period; it never rewrites its boundaries.
  const instant = (value: string, name: string) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value || ''))
      throw new ApiError(400, 'date', `${name} requires an ISO timestamp with UTC or an explicit offset`);
    return date(value, name);
  };
  const range = { start: instant(start, 'start'), end: instant(end, 'end'), timezone };
  if (Date.parse(range.start) >= Date.parse(range.end)) throw new ApiError(400, 'range', 'Positive report range required');
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); }
  catch { throw new ApiError(400, 'timezone', 'An IANA time zone is required'); }
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(timezone)) throw new ApiError(400, 'timezone', 'An IANA time zone is required');
  const observedAt = now(), snapshotAt = new Date(Math.min(Date.parse(range.end), Date.parse(observedAt))).toISOString();
  const [sources, physicalResult, financialResult, contractResult] = await Promise.all([
    serviceSources(db, p),
    staff(p) ? db.prepare(`SELECT a.*, (SELECT MIN(c.created_at) FROM work_custody c WHERE c.workspace_id=a.workspace_id AND c.asset_id=a.id) first_recorded_at
      FROM work_assets a WHERE a.workspace_id=? ORDER BY a.id`).bind(p.workspaceId).all<PhysicalAsset>() : Promise.resolve({ results: [] as PhysicalAsset[] }),
    staff(p) ? db.prepare('SELECT asset_id,in_service_date,useful_months,recorded_at FROM work_asset_financials WHERE workspace_id=?').bind(p.workspaceId).all<AssetFinancial>() : Promise.resolve({ results: [] as AssetFinancial[] }),
    staff(p) ? db.prepare('SELECT id,asset_id,vendor_id,name,kind,expires_at FROM work_asset_contracts WHERE workspace_id=?').bind(p.workspaceId).all<AssetContract>() : Promise.resolve({ results: [] as AssetContract[] }),
  ]);
  const kind = (name: ServiceRecord['kind']) => sources.filter(r => r.kind === name);
  const incidents = kind('incident').filter(r => inRange(r.createdAt, range)), changes = kind('change').filter(r => inRange(r.createdAt, range));
  const beforeEnd = (r: ServiceRecord) => Date.parse(r.createdAt) < Date.parse(range.end);
  const suppliers = kind('supplier').filter(beforeEnd), supplierIds = new Set(suppliers.map(r => r.id));
  const physical = physicalResult.results.filter(r => !r.first_recorded_at || Date.parse(r.first_recorded_at) < Date.parse(range.end));
  const financials = financialResult.results.filter(f => Date.parse(f.recorded_at) <= Date.parse(observedAt));
  const assets = assetMetrics(kind('asset').filter(beforeEnd), physical, financials, contractResult.results.filter(c => supplierIds.has(c.vendor_id)), suppliers, range, observedAt);
  const incident = incidentMetrics(incidents, kind('service'));
  return { range: { ...range, snapshotAt }, observedAt, metrics: [...incident.metrics,
    ...changeProblemMetrics(changes, incidents, kind('problem').filter(beforeEnd), snapshotAt), ...assets.metrics], incidentGroups: incident.incidentGroups,
    upcomingRange: assets.upcomingRange, licenseSpend: assets.licenseSpend,
    scope: { audience: 'owner/operator/auditor with existing source visibility', physicalAssets: staff(p) ? 'available' : 'unavailable: existing native asset doors require owner or operator',
      serviceSources: 'Current readable source records; accepted derived problems also recheck their original evidence visibility', truncated: false },
    limitations: [
      'Incident and change cohorts use creation instants in [start,end). Time zone labels those instants; it does not shift explicit input boundaries.',
      'Lifecycle, problem and change outcomes use current recorded state. Historical state is not reconstructed. Ages and observation freshness use snapshotAt, the earlier of report end and observedAt.',
      'Missing causal investigation, compliance, usage and invoice evidence remains unknown. Operator observations do not claim provider verification.',
      'Unknown and non-USD charges are excluded from known USD spend; no exchange rate or unrecorded charge is inferred.',
    ] };
}

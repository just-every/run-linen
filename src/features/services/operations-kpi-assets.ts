import { average, inRange, metric, reference, type KpiRange, type KpiRecord } from './operations-kpi-metrics';
import type { ServiceRecord } from './store';

export interface PhysicalAsset { id: string; serial: string; asset_tag: string | null; state: string; observed_at: string; revision: number; first_recorded_at: string | null }
export interface AssetFinancial { asset_id: string; in_service_date: string; useful_months: number; recorded_at: string }
export interface AssetContract { id: string; asset_id: string; vendor_id: string; name: string; kind: string; expires_at: string | null }
const software = (r: ServiceRecord) => ['software', 'license', 'licence', 'subscription', 'entitlement'].includes(String(r.data.assetType).toLowerCase());
const device = (r: ServiceRecord) => ['device', 'laptop', 'desktop', 'mobile', 'computer', 'hardware', 'server', 'tablet', 'phone'].includes(String(r.data.assetType).toLowerCase());
const age = (at: unknown, end: number) => typeof at === 'string' && Number.isFinite(Date.parse(at)) && Date.parse(at) <= end ? end - Date.parse(at) : null;
function latestObservation(r: ServiceRecord, at: number) {
  return (r.data.operationsObservations || []).filter((o: any) => Date.parse(o.observedAt) <= at).sort((a: any, b: any) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || Date.parse(b.recordedAt) - Date.parse(a.recordedAt))[0];
}
function refreshDate(start: string, months: number) {
  const at = new Date(start + 'T00:00:00Z'), day = at.getUTCDate();
  at.setUTCDate(1); at.setUTCMonth(at.getUTCMonth() + months);
  at.setUTCDate(Math.min(day, new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0)).getUTCDate()));
  return at.toISOString();
}
export function assetMetrics(assets: ServiceRecord[], physical: PhysicalAsset[], financials: AssetFinancial[], contracts: AssetContract[], suppliers: ServiceRecord[], range: KpiRange, observedAt: string) {
  const end = Math.min(Date.parse(range.end), Date.parse(observedAt));
  const physicalRows: KpiRecord[] = physical.map(r => {
    const financial = financials.find(f => f.asset_id === r.id), from = financial?.in_service_date || r.first_recorded_at;
    return { id: r.id, label: r.asset_tag || r.serial, path: `#/assets/${encodeURIComponent(r.id)}`, sourceKind: 'physical', state: r.state,
      ageMs: age(from, end), ageBasis: financial ? 'recorded-in-service-date' : from ? 'first-custody-record' : 'unknown',
      ageStartsAt: from, compliance: 'unknown', complianceProvenance: 'No native device compliance observation is recorded', revision: r.revision };
  });
  const serviceRows = assets.map(r => {
    const observation = latestObservation(r, end), fresh = observation && Date.parse(observation.observedAt) + observation.freshnessMs > end;
    return reference(r, { sourceKind: 'service', assetType: r.data.assetType, state: r.data.lifecycle || 'unknown', ageMs: age(r.createdAt, end), ageBasis: 'asset-record-creation',
      ageStartsAt: r.createdAt, compliance: fresh ? observation.compliance : 'unknown', complianceProvenance: observation ? 'operator-recorded; not independently provider-verified' : 'No observation',
      observationSource: observation?.source || null, observationAt: observation?.observedAt || null, observationExpiresAt: observation ? new Date(Date.parse(observation.observedAt) + observation.freshnessMs).toISOString() : null });
  });
  const rows = [...physicalRows, ...serviceRows], ages = rows.map(r => r.ageMs).filter((x): x is number => typeof x === 'number');
  const deviceIds = new Set(assets.filter(device).map(r => r.id)), devices = [...physicalRows, ...serviceRows.filter(r => deviceIds.has(r.id))];
  const noncompliant = devices.filter(r => r.compliance === 'noncompliant'), unknownCompliance = devices.filter(r => r.compliance === 'unknown');
  const metrics = [metric('asset.count', 'Assets', rows.length, 'count', 'Current readable physical custody and service asset records created or first recorded before report end. Each source record counts once; no inferred cross-source identity deduplication. Current lifecycle state is used, not a reconstructed historical snapshot.', rows),
    metric('asset.age', 'Mean recorded asset age', average(ages), 'ms', 'Age at the earlier of report end and report observation time: native financial in-service date, otherwise first custody record; service assets use record creation. These bases are disclosed per record and do not assert manufacture age. Missing dates are unknown.', rows, { denominator: ages.length, unknown: rows.length - ages.length }),
    metric('device.noncompliant', 'Devices out of compliance', noncompliant.length, 'count', 'Current physical devices and explicitly device-typed service assets with a fresh attributed noncompliant observation at the earlier of report end and report observation time. No or expired observations are unknown; operator recordings are not provider verification.', devices,
      { numerator: noncompliant.length, denominator: devices.length, unknown: unknownCompliance.length })];
  for (const state of [...new Set(rows.map(r => String(r.state)))].sort()) {
    const group = rows.filter(r => r.state === state);
    metrics.push(metric(`asset.state.${state}`, `Assets · ${state}`, group.length, 'count', 'Current recorded lifecycle state among readable assets in the asset population; no historical lifecycle reconstruction.', group));
  }
  const licenses = assets.filter(software);
  const usage = licenses.map(r => {
    const candidates = (r.data.usage || []).filter((u: any) => inRange(u.periodStart, range) && Date.parse(u.periodEnd) <= Date.parse(range.end)
      && Date.parse(u.observedAt) <= Date.parse(observedAt) && Number.isFinite(u.activeUsers) && Number.isFinite(u.allocatedSeats)
      && u.activeUsers >= 0 && u.allocatedSeats >= u.activeUsers);
    const latest = candidates.sort((a: any, b: any) => Date.parse(b.periodEnd) - Date.parse(a.periodEnd) || Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
    return { asset: r, latest };
  });
  const active = usage.reduce((sum, r) => sum + (r.latest?.activeUsers || 0), 0), allocated = usage.reduce((sum, r) => sum + (r.latest?.allocatedSeats || 0), 0);
  metrics.push(metric('license.utilization', 'License utilization', allocated ? active / allocated * 100 : null, '%',
    'Sum of active users / sum of allocated seats, ×100, using the latest recorded usage period wholly within [start,end) per explicitly software/license/subscription/entitlement asset. No usage or a zero total denominator is unknown; assignments do not prove usage.',
    usage.map(({ asset: r, latest: u }) => reference(r, { activeUsers: u?.activeUsers ?? null, allocatedSeats: u?.allocatedSeats ?? null, periodStart: u?.periodStart || null, periodEnd: u?.periodEnd || null, source: u?.source || null })),
    { numerator: active, denominator: allocated, unknown: usage.filter(r => !r.latest || !r.latest.allocatedSeats).length }));
  let usd = 0, recordedCharges = 0, unpriced = 0, nonUsd = 0;
  const spendRows = licenses.map(r => {
    const charges = (r.data.costs || []).filter((c: any) => inRange(c.periodStart, range) && Date.parse(c.periodEnd) <= Date.parse(range.end));
    if (!charges.length) unpriced++;
    const known = charges.filter((c: any) => c.currency === 'USD' && typeof c.amount === 'number' && Number.isFinite(c.amount));
    const other = charges.filter((c: any) => c.currency !== 'USD');
    usd += known.reduce((sum: number, c: any) => sum + c.amount, 0); recordedCharges += known.length; nonUsd += other.length;
    return reference(r, { usd: known.length ? known.reduce((sum: number, c: any) => sum + c.amount, 0) : null, chargeCount: charges.length,
      charges: charges.map((c: any) => ({ id: c.id, amount: c.amount, currency: c.currency, source: c.source, invoice: c.invoice, periodStart: c.periodStart, periodEnd: c.periodEnd })), unknown: !charges.length,
      nonUsdCharges: other.length });
  });
  metrics.push(metric('license.spend-usd', 'Known license spend in USD', recordedCharges ? usd : null, 'USD',
    'Sum of recorded USD invoice charges for explicitly software/license/subscription/entitlement assets with charge periods wholly in [start,end). Usage cost observations, acquisition prices and supplier totals are excluded to avoid double counting. Missing charges and non-USD charges are disclosed, never converted or treated as $0.', spendRows,
    { denominator: licenses.length, unknown: unpriced + licenses.filter(r => (r.data.costs || []).some((c: any) => inRange(c.periodStart, range) && Date.parse(c.periodEnd) <= Date.parse(range.end) && c.currency !== 'USD')).length }));
  const upcomingStart = Date.parse(range.end), upcomingEnd = upcomingStart + 30 * 86400000;
  const upcoming = (at: unknown) => typeof at === 'string' && Date.parse(at) >= upcomingStart && Date.parse(at) < upcomingEnd;
  const renewals: KpiRecord[] = [...assets, ...suppliers].filter(r => upcoming(r.data.renewalAt)).map(r => reference(r, { dueAt: r.data.renewalAt, kind: r.kind === 'supplier' ? 'supplier-renewal' : 'asset-renewal' }));
  for (const contract of contracts.filter(c => upcoming(c.expires_at) && physical.some(a => a.id === c.asset_id))) {
    const asset = physicalRows.find(r => r.id === contract.asset_id)!;
    renewals.push({ ...asset, contractId: contract.id, label: `${asset.label} · ${contract.name}`, dueAt: contract.expires_at, kind: `${contract.kind}-expiry` });
  }
  const refreshes: KpiRecord[] = assets.flatMap(r => {
    const observation = latestObservation(r, end);
    return observation && upcoming(observation.refreshAt) ? [reference(r, { dueAt: observation.refreshAt, basis: 'operator-recorded-refresh-plan', source: observation.source })] : [];
  });
  for (const f of financials) {
    const asset = physicalRows.find(r => r.id === f.asset_id);
    if (!asset) continue;
    const dueAt = refreshDate(f.in_service_date, f.useful_months);
    if (upcoming(dueAt)) refreshes.push({ ...asset, dueAt, basis: 'recorded-in-service-date-plus-useful-months; planning indicator' });
  }
  const horizon = 'Dates in [report end, report end + 30 elapsed days). Current recorded plans, not historical snapshots or automated renewal authority.';
  metrics.push(metric('upcoming.renewals', 'Upcoming renewals and coverage expiries', renewals.length, 'count', horizon + ' Service asset and supplier renewals plus readable native asset contract expiries; each dated obligation counts separately.', renewals,
    { unknown: [...assets, ...suppliers].filter(r => !r.data.renewalAt).length }),
    metric('upcoming.refreshes', 'Upcoming asset refreshes', refreshes.length, 'count', horizon + ' Service asset operator-recorded refresh dates and native financial useful-life anniversaries. Financial end-of-life is a planning indicator, not a verified replacement requirement.', refreshes,
      { unknown: assets.filter(r => !latestObservation(r, end)?.refreshAt).length + physical.filter(r => !financials.some(f => f.asset_id === r.id)).length }));
  return { metrics, upcomingRange: { start: new Date(upcomingStart).toISOString(), end: new Date(upcomingEnd).toISOString(), timezone: range.timezone }, licenseSpend: { knownUsd: recordedCharges ? usd : null, missingChargeAssets: unpriced, nonUsdCharges: nonUsd } };
}

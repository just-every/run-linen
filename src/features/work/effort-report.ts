import { ApiError } from '../../platform/http';
import { permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';
import { laborRates } from './labor-rates';
import { effortWindow } from './effort-window';

export const effortDefinition = 'Normal-sensitivity requests created in the period, plus requests with effort entries, model calls or provider dispatches started in [from,to). Active minutes are persisted manual declarations or bounded browser activity, attributed to the recorded role. A touch is one entry or resumed measured work session; heartbeats are not additional touches. Entry totals include all recorded activity for that entry through asOf. External wait and machine runtime are excluded. Request type is the first selected catalog service, otherwise request kind; entries retain the type at recording. Failed and pending work are retained; closure is not verification: a verified outcome is a request whose every duty was independently verified.';
export const costDefinition = 'Labor USD = active minutes / 60 × the owner-declared rate for the effort role, using the current rates for every window. Model USD = configured-price estimates of model calls that named the request; a dispatched call without usage is an unknown charge. Linen receives no provider invoice, so every provider dispatch is an unknown charge, never $0. Known cost per verified outcome = known USD for all work of the type in the window (including failed and pending work) / verified outcomes; it is labelled known cost only whenever a role is unpriced or any charge is unknown. Amounts are unrounded USD.';

function range(from: string, to: string, label: string) {
  if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(from) >= Date.parse(to))
    throw new ApiError(422, 'range', `Valid ascending ${label} date range required`);
  return [new Date(from).toISOString(), new Date(to).toISOString()];
}
async function reader(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'operator', 'auditor']);
  return laborRates(ctx);
}

/** Entry-start cohort. All recorded effort stays visible even when its request fails or remains pending. */
export async function effortReport(ctx: WorkContext, from: string, to: string) {
  const rates = await reader(ctx);
  [from, to] = range(from, to, 'report');
  return { ...await effortWindow(ctx, from, to, rates), asOf: new Date().toISOString(), rates, definition: effortDefinition, costDefinition };
}

/** REPORT-004: the owner-chosen baseline (before automation) beside the current window, per request type. */
export async function workSavedReport(ctx: WorkContext, q: { baselineFrom: string; baselineTo: string; currentFrom: string; currentTo: string }) {
  const rates = await reader(ctx);
  const [baselineFrom, baselineTo] = range(q.baselineFrom, q.baselineTo, 'baseline');
  const [currentFrom, currentTo] = range(q.currentFrom, q.currentTo, 'current');
  if (Date.parse(baselineTo) > Date.parse(currentFrom))
    throw new ApiError(422, 'range_overlap', 'The baseline window must end at or before the current window starts');
  const baseline = await effortWindow(ctx, baselineFrom, baselineTo, rates), current = await effortWindow(ctx, currentFrom, currentTo, rates);
  const types = [...new Set([...baseline.byRequestType, ...current.byRequestType].map(r => r.requestType))].sort();
  return {
    asOf: new Date().toISOString(), rates,
    baseline: { from: baselineFrom, to: baselineTo }, current: { from: currentFrom, to: currentTo },
    requestTypes: types.map(requestType => ({
      requestType,
      baseline: baseline.byRequestType.find(r => r.requestType === requestType) || null,
      current: current.byRequestType.find(r => r.requestType === requestType) || null,
    })),
    definition: `${effortDefinition} Baseline and current are owner-chosen, non-overlapping windows; Linen does not infer when automation started.`,
    costDefinition,
  };
}

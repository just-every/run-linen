import type { Env, Principal } from '../../platform/types';
import { ApiError, now, requiredString } from '../../platform/http';
import { currentPrincipal } from '../work/identity';
import { assertPlatformAdmission } from '../../platform/privacy';
import { assertAdoptionEffectAllowed } from '../adoption/authority';
import { getService, type ServiceRecord } from './store';

export interface SoftwareContext { env: Env; principal: Principal }
export interface SoftwareBinding {
  connectionId: string; kind: 'zoom' | 'entra-signins' | 'jamf' | 'intune'; appId?: string;
  aliases?: { title: string; publisher: string; productId?:string }[];
  removalGroupId?: string; removalPolicyId?: string; removalPackageId?: string;
}
export interface SoftwareInstallation {
  id: string; connectionId: string; deviceId: string; serial: string; userId: string | null;
  title: string; publisher: string; productId: string; version: string; observedAt: string;
}
export function check(value: unknown, code: string, status = 409): asserts value {
  if (!value) throw new ApiError(status, code, code.replaceAll('_', ' '));
}
export const normalizedSoftware = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function count(value: unknown, field: string) {
  check(Number.isSafeInteger(value) && Number(value) >= 0, field + '_required', 422); return Number(value);
}
export async function softwarePrincipal(ctx: SoftwareContext, owner = false) {
  const p = await currentPrincipal(ctx.env.DB, ctx.principal);
  check(p.roles.some(r => (owner ? ['owner'] : ['owner', 'operator', 'auditor']).includes(r)), 'software_role_denied', 403);
  ctx.principal = p;
  await livePerson(ctx, p.userId);
  return p;
}
export async function livePerson(ctx: SoftwareContext, personId: string, roles?: string[]) {
  const row = await ctx.env.DB.prepare('SELECT u.email,m.roles_json FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND m.user_id=? AND m.active=1')
    .bind(ctx.principal.workspaceId, personId).first<{email:string;roles_json:string}>();
  check(row && (!roles || JSON.parse(row.roles_json).some((r: string) => roles.includes(r))), 'software_person_unavailable', 409);
  check(!await ctx.env.DB.prepare('SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id=?').bind(ctx.principal.workspaceId, personId).first(), 'software_identity_erased');
  await assertPlatformAdmission(ctx.env.DB, ctx.principal.workspaceId, personId, row.email);
  return row;
}
export async function softwareRecord(ctx: SoftwareContext, key: string, revision?: unknown, write = false) {
  await softwarePrincipal(ctx, write);
  const r = await getService(ctx.env.DB, ctx.principal, key, 'asset');
  check(r.data.softwareLicense === true && !r.data.adoption?.historical && r.data.lifecycle !== 'disposed', 'software_license_unavailable', 404);
  check(r.ownerId === r.data.titleOwnerId && !r.ownerId.startsWith('erased-'), 'software_privacy_review');
  await livePerson(ctx, r.ownerId, ['owner', 'operator']);
  await getService(ctx.env.DB, ctx.principal, r.data.serviceId, 'service');
  if(write)check(!r.data.softwarePrivacyReview,'software_privacy_review');
  if (revision !== undefined) check(revision === r.revision, 'revision_conflict');
  return r;
}
export async function softwareEffectAllowed(ctx: SoftwareContext, r: ServiceRecord) {
  await softwarePrincipal(ctx);
  check(ctx.principal.roles.some(r => ['owner','operator'].includes(r)), 'software_role_denied', 403);
  const latest = await softwareRecord(ctx, r.id, r.revision);
  check(!latest.data.adoption && latest.data.executionHeld !== true, 'software_execution_held');
  await assertAdoptionEffectAllowed(ctx, { resource: `software-license:${r.id}`, action: 'software.manage' });
  check(!await ctx.env.DB.prepare("SELECT 1 FROM adoption_erasure_jobs WHERE workspace_id=? AND state NOT IN ('completed','failed')").bind(ctx.principal.workspaceId).first(), 'software_erasure_pending');
}
export function softwareTarget(value: unknown, field: string) {
  const s = requiredString(value, field); check(s.length <= 300 && !/[\r\n]/.test(s), 'software_target_invalid', 422); return s;
}
export function contractInput(value: any) {
  check(value && typeof value === 'object' && value.currency === 'USD', 'software_usd_contract_required', 422);
  check(typeof value.renewalAt === 'string' && Number.isFinite(Date.parse(value.renewalAt)), 'software_renewal_required', 422);
  for (const field of ['annualCostUsd','trueUpUnitUsd']) check(typeof value[field] === 'number' && Number.isFinite(value[field]) && value[field] >= 0, 'software_cost_required', 422);
  return { seats: count(value.seats, 'seats'), currency: 'USD', renewalAt: new Date(value.renewalAt).toISOString(),
    annualCostUsd: value.annualCostUsd, trueUpUnitUsd: value.trueUpUnitUsd, reference: softwareTarget(value.reference, 'reference'), recordedAt: now() };
}

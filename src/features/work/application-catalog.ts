import { ApiError } from '../../platform/http';
import type { WorkContext } from './core';
import type { ApplicationData } from './application-schema';
export interface ApplicationSnapshot {
  applicationId: string; applicationName: string; applicationRevision: number;
  entitlementId: string; entitlementName: string; target: string; ownerId: string;
  approverIds: string[]; connector: string; sensitivity: string;
  costCents: number; billingPeriod: string;
}
export async function resolveApplication(ctx: WorkContext, applicationId: string, entitlementId: string): Promise<ApplicationSnapshot> {
  const row = await ctx.env.DB.prepare("SELECT owner_id,data_json,revision FROM svc_records WHERE workspace_id=? AND id=? AND kind='application'")
    .bind(ctx.principal.workspaceId,applicationId).first<{owner_id:string;data_json:string;revision:number}>();
  if (!row) throw new ApiError(404,'application_not_found','Application entitlement is unavailable');
  const data = JSON.parse(row.data_json) as ApplicationData;
  const entitlement = data.entitlements?.find(e=>e.id===entitlementId);
  if (!entitlement || !Number.isSafeInteger(entitlement.costCents) || !['month','year','one-time'].includes(entitlement.billingPeriod))
    throw new ApiError(409,'application_entitlement_unavailable','Review the application entitlement registration');
  if (!await ctx.env.DB.prepare('SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(ctx.principal.workspaceId,row.owner_id).first())
    throw new ApiError(409,'application_owner_unavailable','Application owner needs current membership before a new request');
  return {applicationId,applicationName:data.name,applicationRevision:row.revision,entitlementId,entitlementName:entitlement.name,
    target:entitlement.target,ownerId:row.owner_id,approverIds:data.approverIds,connector:data.connector,sensitivity:data.sensitivity,
    costCents:entitlement.costCents,billingPeriod:entitlement.billingPeriod};
}
export function applicationProjection(ctx: WorkContext, snapshot: ApplicationSnapshot) {
  return ctx.principal.roles.some(r=>['owner','operator'].includes(r)) ? snapshot : {
    entitlementName:snapshot.entitlementName,costCents:snapshot.costCents,billingPeriod:snapshot.billingPeriod,
  };
}
export async function applicationForRequest(ctx: WorkContext, workId: string, catalog: {id:string;target:string;application_id?:string|null;entitlement_id?:string|null}) {
  const previous = await ctx.env.DB.prepare('SELECT application_json FROM work_fulfilments WHERE workspace_id=? AND work_id=? AND catalog_id=?')
    .bind(ctx.principal.workspaceId,workId,catalog.id).first<{application_json:string|null}>();
  if (previous?.application_json) return JSON.parse(previous.application_json) as ApplicationSnapshot;
  if (!catalog.application_id || !catalog.entitlement_id) return null;
  const snapshot=await resolveApplication(ctx,catalog.application_id,catalog.entitlement_id);
  if(snapshot.target!==catalog.target)throw new ApiError(409,'application_catalog_changed','Create a catalog item for the current entitlement target before requesting it');
  return snapshot;
}

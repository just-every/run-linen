import { ApiError } from '../../platform/http';
import type { WorkContext } from './core';
import type { ApplicationSnapshot } from './application-catalog';
export async function prepareApplicationWorkRestore(ctx:WorkContext,table:string,row:Record<string,unknown>) {
  if(table==='work_catalog' && Boolean(row.application_id)!==Boolean(row.entitlement_id))throw new ApiError(422,'restore_application_link','Application and entitlement references must stay together');
  if(table!=='work_fulfilments'||row.application_json==null)return;
  let value:ApplicationSnapshot;
  try {value=JSON.parse(String(row.application_json));}catch{throw new ApiError(422,'restore_application_snapshot','Valid request application snapshot required');}
  if(!value || typeof value!=='object' || !['applicationId','applicationName','entitlementId','entitlementName','ownerId','connector','target','sensitivity'].every(k=>typeof (value as any)[k]==='string')
    || !Array.isArray(value.approverIds)||value.approverIds.some(v=>typeof v!=='string')||!Number.isSafeInteger(value.costCents)||value.costCents<0||!['month','year','one-time'].includes(value.billingPeriod))
    throw new ApiError(422,'restore_application_snapshot','Typed entitlement, cost and routing snapshot required');
  const ids=[value.ownerId,...value.approverIds];
  for(const subject of ids)if(await ctx.env.DB.prepare('SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id=?').bind(ctx.principal.workspaceId,subject).first())
    throw new ApiError(409,'erased','Restore cannot revive erased application actors');
}

import { ApiError, id, now } from '../../platform/http';
import { softwareConnection } from './software-license-connections';
import { check, livePerson, softwareEffectAllowed, softwareRecord, softwareTarget, type SoftwareContext } from './software-license-core';
import { softwareCommit } from './software-license-store';
import type { ServiceRecord } from './store';

export interface SoftwareDeviceUser {
  connectionId:string; connectionRevision:number; deviceId:string; userId:string;
  issuerId:string; ownerId:string; confirmed:true; reason:string; issuedAt:string; version:number;
}
/** A provider email is an observation, never authority to associate a member. */
export async function currentSoftwareDeviceUser(ctx:SoftwareContext,r:ServiceRecord,row:{id:string;revision:number;status:string},deviceId:string) {
  const mapping=(r.data.deviceUsers||[]).find((m:SoftwareDeviceUser)=>m.connectionId===row.id&&m.deviceId===deviceId) as SoftwareDeviceUser|undefined;
  if(!mapping||mapping.confirmed!==true||row.status!=='active'||mapping.connectionRevision!==row.revision||mapping.ownerId!==r.ownerId||r.data.adoption||r.data.softwarePrivacyReview)return null;
  if(!r.data.sourceBindings.some((s:any)=>s.connectionId===row.id&&['jamf','intune'].includes(s.kind)))return null;
  try {
    await livePerson(ctx,mapping.issuerId,['owner']);
    await livePerson(ctx,r.ownerId,['owner','operator']);
    await livePerson(ctx,mapping.userId);
  } catch(error) {
    if(error instanceof ApiError&&['software_person_unavailable','software_identity_erased','identity_erased'].includes(error.code))return null;
    throw error;
  }
  return mapping;
}
export async function bindSoftwareDeviceUser(ctx:SoftwareContext,key:string,b:Record<string,any>) {
  const r=await softwareRecord(ctx,key,b.revision,true);await softwareEffectAllowed(ctx,r);
  check(b.confirmed===true,'software_device_user_confirmation_required',422);
  const connectionId=softwareTarget(b.connectionId,'connectionId'),deviceId=softwareTarget(b.deviceId,'deviceId'),reason=softwareTarget(b.reason,'reason');
  const source=r.data.sourceBindings.find((s:any)=>s.connectionId===connectionId&&['jamf','intune'].includes(s.kind));
  check(source,'software_device_source_required',422);
  const conn=await softwareConnection(ctx,connectionId,source.kind==='intune'?'microsoft-graph':'jamf');
  check(conn.status==='active','software_connection_validation_required');
  if(b.connectionRevision!==undefined)check(b.connectionRevision===conn.revision,'software_connection_changed');
  const userId=b.userId===null?null:softwareTarget(b.userId,'userId');
  if(userId)await livePerson(ctx,userId);
  const prior=(r.data.deviceUsers||[]) as SoftwareDeviceUser[];
  const mappings=prior.filter(m=>m.connectionId!==connectionId||m.deviceId!==deviceId);
  if(userId)mappings.push({connectionId,connectionRevision:conn.revision,deviceId,userId,issuerId:ctx.principal.userId,ownerId:r.ownerId,confirmed:true,reason,issuedAt:now(),version:r.data.grantVersion+1});
  await softwareRecord(ctx,key,r.revision,true);await softwareEffectAllowed(ctx,r);
  check((await softwareConnection(ctx,connectionId)).revision===conn.revision,'software_connection_changed');
  const before=prior.find(m=>m.connectionId===connectionId&&m.deviceId===deviceId);
  const guard=id(),w=ctx.principal.workspaceId;
  return softwareCommit(ctx,r,{...r.data,deviceUsers:mappings,lastDeviceUserChange:{connectionId,deviceId,beforeUserId:before?.userId||null,userId,issuerId:ctx.principal.userId,reason,at:now()},observation:null,grant:null,grantVersion:r.data.grantVersion+1},userId?'software-device-user-confirmed':'software-device-user-unmapped',[
    ctx.env.DB.prepare(`INSERT INTO svc_software_guards VALUES(?,CASE WHEN
      EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) role WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND role.value='owner')
      AND EXISTS(SELECT 1 FROM connections WHERE workspace_id=? AND id=? AND revision=? AND status='active')
      AND (? IS NULL OR EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1))
      AND NOT EXISTS(SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id=?)
      AND NOT EXISTS(SELECT 1 FROM adoption_erasure_jobs WHERE workspace_id=? AND state NOT IN ('completed','failed'))
      THEN 1 ELSE 0 END)`).bind(guard,w,ctx.principal.userId,w,connectionId,conn.revision,userId,w,userId,w,userId,w),
    ctx.env.DB.prepare('DELETE FROM svc_software_guards WHERE id=?').bind(guard),
  ]);
}

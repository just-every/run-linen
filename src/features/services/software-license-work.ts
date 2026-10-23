import { ApiError, id, now } from '../../platform/http';
import { createWork, getWork } from '../work/core';
import { notifyWorkEvent } from '../work/notification-port';
import { currentPrincipal } from '../work/identity';
import { softwareCommit } from './software-license-store';
import { softwareSummary } from './software-license-summary';
import { check, livePerson, softwareEffectAllowed, softwareRecord, type SoftwareContext, type SoftwareInstallation } from './software-license-core';
import { list, type RecordRow, dto, type ServiceRecord } from './store';

export async function openSoftwareComplianceWork(ctx:SoftwareContext,r:ServiceRecord) {
  if(r.data.policy==='ignored')return r;
  const summary=await softwareSummary(ctx,r);if(!summary.fresh)return r;
  let offending:SoftwareInstallation[]=[];
  const installations=[...r.data.observation.installations].sort((a,b)=>a.id.localeCompare(b.id));
  if(r.data.policy==='prohibited')offending=installations;
  else if(summary.overLicensed) {
    if(r.data.metric==='per-device') {
      const allowed=new Set([...new Set(installations.map(i=>i.serial.toUpperCase()))].slice(0,r.data.contract.seats));
      offending=installations.filter(i=>!allowed.has(i.serial.toUpperCase()));
    } else if(r.data.metric==='per-user') {
      const allowed=new Set([...new Set(installations.map(i=>i.userId))].slice(0,r.data.contract.seats));offending=installations.filter(i=>!allowed.has(i.userId));
    }
  }
  const work=[...r.data.complianceWork];
  for(const installation of offending) {
    if(work.some(w=>w.installationId===installation.id))continue;
    await softwareEffectAllowed(ctx,r);
    if(installation.userId)await livePerson(ctx,installation.userId);
    const reason=r.data.policy==='prohibited'?'prohibited':'unlicensed',personId=installation.userId||r.ownerId;
    const taskId=id(), taskTarget=`software:${r.id}:${installation.id}`;
    const finding=reason==='prohibited'?`${r.data.name} by ${r.data.publisher} is prohibited on device ${installation.serial}.`:
      `${r.data.name} by ${r.data.publisher} exceeds its recorded entitlement. Device ${installation.serial} is an excess-installation review candidate; the aggregate contract does not identify which individual device owns a license.`;
    const ticket=await createWork(ctx,{title:`${r.data.name}: ${reason==='prohibited'?'prohibited installation':'license compliance review'}`,body:`${finding} The software owner is responsible for reviewing this installation. Removal requires a current scoped grant and later inventory verification.`,
      kind:'incident',beneficiaryId:personId,sensitivity:'normal',deduplicationKey:taskTarget,
      context:{softwareLicenseId:r.id,installationId:installation.id,serial:installation.serial,titleOwnerId:r.ownerId,reason,unmappedDeviceUser:!installation.userId}},
      {statements:workId=>[ctx.env.DB.prepare(`INSERT OR IGNORE INTO work_obligations(id,workspace_id,work_id,kind,target,beneficiary_id,due_at,state,owner_id)
        SELECT ?,?,?,'task.manual',?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=?)`)
        .bind(taskId,ctx.principal.workspaceId,workId,taskTarget,personId,now(),r.ownerId,ctx.principal.workspaceId,workId)]});
    // The native notification engine uses configured rules. A portal notice is
    // available below even when no external notification transport is configured.
    await notifyWorkEvent(ctx,{workId:ticket.id,event:'security.task',sourceId:taskTarget});
    work.push({installationId:installation.id,workId:ticket.id,reason,personId:installation.userId,ownerId:r.ownerId,noticeAvailableAt:now()});
  }
  return work.length===r.data.complianceWork.length?r:softwareCommit(ctx,r,{...r.data,complianceWork:work},'software-compliance-work-opened');
}

/** Only the affected member's own installation notice; contract/other users stay private. */
export async function softwareLicenseNotices(ctx:SoftwareContext) {
  ctx.principal=await currentPrincipal(ctx.env.DB,ctx.principal);await livePerson(ctx,ctx.principal.userId);
  const rows=(await ctx.env.DB.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind='asset' AND json_extract(data_json,'$.softwareLicense')=1").bind(ctx.principal.workspaceId).all<RecordRow>()).results;
  const items=[];
  for(const raw of rows) {
    const r=dto(raw);if(r.data.adoption?.historical)continue;
    for(const notice of r.data.complianceWork||[]) {
      if(notice.personId!==ctx.principal.userId)continue;
      try {
        const work=await getWork(ctx,notice.workId);
        if(work.sensitivity==='hr'||work.beneficiary_id!==ctx.principal.userId)continue;
        items.push({workId:work.id,title:r.data.name,publisher:r.data.publisher,reason:notice.reason,availableAt:notice.noticeAvailableAt,state:work.state});
      }catch(error){if(!(error instanceof ApiError)||![403,404].includes(error.status))throw error;}
    }
  }
  return {items};
}
export async function queueSoftwareRenewals(ctx:SoftwareContext,key:string,revision:unknown) {
  const r=await softwareRecord(ctx,key,revision,true);await softwareEffectAllowed(ctx,r);
  const remaining=(Date.parse(r.data.contract.renewalAt)-Date.now())/86400000;
  check(remaining>0,'software_contract_expired');
  const reminders=[...r.data.reminders],extra:D1PreparedStatement[]=[];
  for(const days of [90,60,30]) {
    if(remaining>days||reminders.some(m=>m.days===days&&m.renewalAt===r.data.contract.renewalAt))continue;
    const key=`software-renewal:${r.id}:${r.data.contract.renewalAt}:${days}`,t=now();
    reminders.push({days,renewalAt:r.data.contract.renewalAt,queuedAt:t,notificationId:key});
    extra.push(ctx.env.DB.prepare(`INSERT OR IGNORE INTO svc_outbox(id,workspace_id,record_id,recipient_id,kind,payload_json,next_at) VALUES(?,?,?,?,?,?,?)`)
      .bind(key,ctx.principal.workspaceId,r.id,r.ownerId,'software-renewal',JSON.stringify({message:`${r.data.name} renewal is due within ${days} days`,days,renewalAt:r.data.contract.renewalAt}),t));
  }
  if(extra.length)await softwareCommit(ctx,r,{...r.data,reminders},'software-renewal-reminders-queued',extra);
  return {record:await softwareRecord(ctx,key),queued:extra.length};
}
export async function processSoftwareRenewals(ctx:SoftwareContext) {
  const results=[];
  for(const r of await list(ctx.env.DB,ctx.principal,'asset')) {
    if(!r.data.softwareLicense||r.data.adoption||Date.parse(r.data.renewalAt)<=Date.now()||Date.parse(r.data.renewalAt)>Date.now()+90*86400000)continue;
    try {results.push({id:r.id,...await queueSoftwareRenewals(ctx,r.id,r.revision)});}
    catch(error){results.push({id:r.id,state:'held',reason:error instanceof Error?error.message:'software_renewal_unavailable'});}
  }
  return results;
}

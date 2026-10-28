import { id, now } from '../../platform/http';
import { hashToken } from '../../platform/crypto';
import { softwareCommit } from './software-license-store';
import { softwareConnection, softwareClient } from './software-license-connections';
import { softwareSummary } from './software-license-summary';
import { check, livePerson, softwareEffectAllowed, softwareRecord, softwareTarget, type SoftwareBinding, type SoftwareContext } from './software-license-core';
import { jamfRemovalPolicy, readDesktop, removeJamf } from './software-license-inventory';
import { readZoom, reclaimZoom } from './software-license-zoom';
import type { ServiceRecord } from './store';
import { currentSoftwareDeviceUser } from './software-license-device-users';

function targetsInput(input:unknown) {
  check(Array.isArray(input)&&input.length>0&&input.length<=100&&input.every(t=>typeof t==='string'),'software_targets_required',422);
  check(new Set(input).size===input.length,'software_duplicate_target',422);return input as string[];
}
async function eligibleTargets(ctx:SoftwareContext,r:ServiceRecord,action:string,targets:string[]) {
  check((await softwareSummary(ctx,r)).fresh,'software_observation_required');
  check(r.data.policy!=='ignored','software_title_ignored');
  if(action==='reclaim') {
    check(r.data.sourceBindings.some((s:any)=>s.kind==='zoom'),'software_reclaim_unsupported',422);
    check(targets.every(t=>r.data.observation.users.some((u:any)=>u.id===t&&u.licensed&&!u.active)),'software_target_not_reclaimable');
  } else {
    check(targets.every(t=>r.data.observation.installations.some((i:any)=>i.id===t && r.data.sourceBindings.some((s:any)=>s.connectionId===i.connectionId&&s.kind==='jamf'))),'software_removal_unsupported',422);
    for(const t of targets) {
      const installation=r.data.observation.installations.find((i:any)=>i.id===t);
      check(installation.userId,'software_device_user_unmapped');await livePerson(ctx,installation.userId);
      const conn=await softwareConnection(ctx,installation.connectionId);
      check((await currentSoftwareDeviceUser(ctx,r,conn,installation.deviceId))?.userId===installation.userId,'software_device_user_unmapped');
      check(r.data.complianceWork.some((w:any)=>w.installationId===t),'software_compliance_work_required');
    }
  }
}
export async function grantSoftwareEffect(ctx:SoftwareContext,key:string,b:Record<string,any>) {
  const r=await softwareRecord(ctx,key,b.revision,true);await softwareEffectAllowed(ctx,r);
  check(b.confirmed===true&&['reclaim','remove-app'].includes(b.action),'software_explicit_confirmation_required',422);
  const targets=targetsInput(b.targets);await eligibleTargets(ctx,r,b.action,targets);
  const principalId=softwareTarget(b.principalId,'principalId'),principal=await livePerson(ctx,principalId,['owner','operator']);
  check(principalId===r.ownerId||JSON.parse(principal.roles_json).includes('owner'),'software_executor_record_scope',422);
  check(typeof b.expiresAt==='string'&&Date.parse(b.expiresAt)>Date.now()&&Date.parse(b.expiresAt)<=Date.now()+7*86400000,'software_grant_expiry',422);
  const version=r.data.grantVersion+1;
  const removalPolicies=[];
  if(b.action==='remove-app')for(const target of targets) {
    const installation=r.data.observation.installations.find((i:any)=>i.id===target);
    const binding=r.data.sourceBindings.find((s:any)=>s.connectionId===installation.connectionId) as SoftwareBinding;
    const conn=await softwareConnection(ctx,binding.connectionId,'jamf');
    const policy=await jamfRemovalPolicy(await softwareClient(ctx,conn),binding);
    removalPolicies.push({target,policyDigest:policy.policyDigest,policyId:binding.removalPolicyId,groupId:binding.removalGroupId,packageId:binding.removalPackageId});
  }
  await softwareRecord(ctx,key,r.revision,true);await softwareEffectAllowed(ctx,r);
  const grant={version,action:b.action,principalId,targets,expiresAt:new Date(b.expiresAt).toISOString(),issuerId:ctx.principal.userId,reason:softwareTarget(b.reason,'reason'),issuedAt:now(),
    observationAt:r.data.observation.observedAt,sourceRevisions:r.data.observation.sources,removalPolicies,revokedAt:null};
  await softwareCommit(ctx,r,{...r.data,grant,grantVersion:version},'software-effect-granted');return softwareRecord(ctx,key);
}
export async function revokeSoftwareGrant(ctx:SoftwareContext,key:string,b:Record<string,any>) {
  const r=await softwareRecord(ctx,key,b.revision,true);
  await softwareCommit(ctx,r,{...r.data,grant:r.data.grant?{...r.data.grant,revokedAt:now()}:null,grantVersion:r.data.grantVersion+1},'software-grant-revoked');
  return softwareRecord(ctx,key);
}
async function effectGrant(ctx:SoftwareContext,r:ServiceRecord,action:string,version:unknown,target:string,forReadback=false) {
  if(forReadback) {
    // Reconciliation is read-only and remains possible after a grant expires or
    // is revoked. It never reauthorizes or resubmits the original write.
    await softwareRecord(ctx,r.id,r.revision);
    check(ctx.principal.roles.some(role=>['owner','operator'].includes(role)),'software_role_denied',403);
    return null;
  }
  await softwareEffectAllowed(ctx,r);
  const g=r.data.grant;
  check(g&&g.version===version&&r.data.grantVersion===version&&g.action===action&&g.principalId===ctx.principal.userId&&!g.revokedAt&&Date.parse(g.expiresAt)>Date.now()&&g.targets.includes(target),'software_grant_denied',403);
  await livePerson(ctx,g.issuerId,['owner']);await livePerson(ctx,g.principalId,['owner','operator']);
  check(g.observationAt===r.data.observation?.observedAt,'software_grant_observation_changed');
  for(const source of g.sourceRevisions)check((await softwareConnection(ctx,source.connectionId)).revision===source.revision,'software_grant_connection_changed');
  if(!forReadback)await eligibleTargets(ctx,r,action,[target]);
  return g;
}
export async function executeSoftwareEffect(ctx:SoftwareContext,key:string,b:Record<string,any>,action:'reclaim'|'remove-app') {
  let r=await softwareRecord(ctx,key,b.revision);
  const targets=action==='reclaim'?targetsInput(b.userIds):[softwareTarget(b.installationId,'installationId')];
  // Validate the complete requested scope before the first effect.
  for(const target of targets)await effectGrant(ctx,r,action,b.grantVersion,target);
  const operationIds:string[]=[];
  for(const target of targets) {
    const grant=await effectGrant(ctx,r,action,b.grantVersion,target),targetHash=await hashToken(target);
    check(grant,'software_grant_denied',403);
    const prior=await ctx.env.DB.prepare("SELECT id FROM svc_software_effects WHERE workspace_id=? AND record_id=? AND action=? AND target_hash=? AND state IN ('sending','submitted','unknown')")
      .bind(ctx.principal.workspaceId,key,action,targetHash).first<any>();
    check(!prior,'software_reconcile_required');
    const installation=action==='remove-app'?r.data.observation.installations.find((i:any)=>i.id===target):null;
    const binding=r.data.sourceBindings.find((s:any)=>action==='reclaim'?s.kind==='zoom':s.connectionId===installation.connectionId) as SoftwareBinding;
    const conn=await softwareConnection(ctx,binding.connectionId,action==='reclaim'?'zoom':'jamf');
    const client=await softwareClient(ctx,conn);
    if(action==='remove-app') {
      const group=await jamfRemovalPolicy(client,binding);
      check(grant.removalPolicies?.some((p:any)=>p.target===target&&p.policyDigest===group.policyDigest),'software_removal_policy_changed');
      check(!group.computers.some((d:any)=>String(d.id)===installation.deviceId),'software_removal_already_scoped');
    }
    // Credential and policy reads above can take time; authority and holds are
    // checked again immediately before the durable intent and network write.
    await effectGrant(ctx,r,action,b.grantVersion,target);
    const operationId=id(),t=now();
    r=await softwareCommit(ctx,r,{...r.data,effectTargets:[...r.data.effectTargets,{operationId,targetId:target,personId:installation?.userId||null,...(installation?{installation}:{})}]},'software-effect-started',[
      ctx.env.DB.prepare(`INSERT INTO svc_software_effects VALUES(?,?,?,?,?,?,?,?,?,'sending',?,?)`)
        .bind(operationId,ctx.principal.workspaceId,key,grant.version,targetHash,action,conn.id,conn.revision,r.revision+1,t,t),
    ]);
    operationIds.push(operationId);
    try {
      await effectGrant(ctx,r,action,b.grantVersion,target);
      if(action==='reclaim')await reclaimZoom(client,target,operationId);else await removeJamf(client,binding,installation.deviceId,operationId);
      await ctx.env.DB.prepare("UPDATE svc_software_effects SET state='submitted',updated_at=? WHERE workspace_id=? AND id=? AND state='sending'").bind(now(),ctx.principal.workspaceId,operationId).run();
    } catch {
      await ctx.env.DB.prepare("UPDATE svc_software_effects SET state='unknown',updated_at=? WHERE workspace_id=? AND id=? AND state='sending'").bind(now(),ctx.principal.workspaceId,operationId).run();
      // Stop the batch on uncertainty, leaving later targets unattempted.
      break;
    }
    // A durable result is not an inventory readback; no automatic resend.
  }
  return {record:await softwareRecord(ctx,key),operationIds};
}
export async function reconcileSoftwareEffect(ctx:SoftwareContext,key:string,operationId:string,b:Record<string,any>) {
  const r=await softwareRecord(ctx,key,b.revision);
  const op=await ctx.env.DB.prepare('SELECT * FROM svc_software_effects WHERE workspace_id=? AND record_id=? AND id=?').bind(ctx.principal.workspaceId,key,operationId).first<any>();
  check(op,'software_effect_unavailable',404);
  const targetSnapshot=r.data.effectTargets.find((t:any)=>t.operationId===op.id);
  const target=targetSnapshot?.targetId;check(target,'software_effect_privacy_review');
  await effectGrant(ctx,r,op.action,op.grant_version,target,true);
  if(op.state==='verified')return {state:'verified',record:r};
  const conn=await softwareConnection(ctx,op.connection_id);check(conn.revision===op.connection_revision,'software_grant_connection_changed');
  let observation={...r.data.observation},verified=false;
  if(op.action==='reclaim') {
    const users=await readZoom(ctx,conn,observation.periodStart,now());
    for(const user of users)user.active=user.active||(observation.idpActiveEmails||[]).includes(user.email);
    const remote=users.find(u=>u.id===target);check(remote,'software_reclaim_user_missing');
    verified=!remote.licensed;observation={...observation,users};
  } else {
    const installation=targetSnapshot.installation;check(installation,'software_installation_missing');
    const binding=r.data.sourceBindings.find((s:any)=>s.connectionId===op.connection_id) as SoftwareBinding;
    const fresh=await readDesktop(ctx,conn,binding,r);
    const device=fresh.devices.find(d=>d.deviceId===installation.deviceId&&d.serial===installation.serial);
    // Missing/offline/replaced devices cannot prove app absence. The inventory
    // report timestamp must advance past the original attempted effect.
    verified=!!device&&Date.parse(device.observedAt)>Date.parse(op.attempted_at)&&!fresh.installations.some(i=>i.deviceId===installation.deviceId&&i.productId===installation.productId);
    observation={...observation,devices:[...observation.devices.filter((d:any)=>d.connectionId!==conn.id),...fresh.devices],installations:[...observation.installations.filter((i:any)=>i.connectionId!==conn.id),...fresh.installations]};
  }
  await effectGrant(ctx,r,op.action,op.grant_version,target,true);
  // Keep the original observation identity, binding other unattempted targets
  // to this same approved review. Readback updates facts, never grant scope.
  await softwareCommit(ctx,r,{...r.data,observation,lastReadbackAt:now()},verified?'software-effect-verified':'software-effect-still-unverified',[
    ctx.env.DB.prepare('UPDATE svc_software_effects SET state=?,updated_at=? WHERE workspace_id=? AND id=? AND state<>?').bind(verified?'verified':op.state==='sending'?'unknown':op.state,now(),ctx.principal.workspaceId,op.id,'verified'),
  ]);
  return {state:verified?'verified':'unverified',record:await softwareRecord(ctx,key)};
}

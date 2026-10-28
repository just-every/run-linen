import { ApiError, now } from '../../platform/http';
import { assertPlatformAdmission } from '../../platform/privacy';
import { create, getService, list } from './store';
import { check, contractInput, count, livePerson, normalizedSoftware, softwareEffectAllowed, softwarePrincipal, softwareRecord, softwareTarget, type SoftwareBinding, type SoftwareContext } from './software-license-core';
import { completeConnectionRead, softwareConnection } from './software-license-connections';
import { readDesktop, readEntra } from './software-license-inventory';
import { readZoom } from './software-license-zoom';
import { softwareCommit } from './software-license-store';
import { softwareSummary } from './software-license-summary';
import { openSoftwareComplianceWork } from './software-license-work';

async function bindingsInput(ctx: SoftwareContext, input: unknown) {
  check(Array.isArray(input)&&input.length<=20,'software_sources_required',422);
  const bindings:SoftwareBinding[]=[];
  for(const value of input) {
    check(value&&['zoom','entra-signins','jamf','intune'].includes(value.kind),'software_source_kind',422);
    const b:SoftwareBinding={kind:value.kind,connectionId:softwareTarget(value.connectionId,'connectionId')};
    await softwareConnection(ctx,b.connectionId,b.kind==='intune'||b.kind==='entra-signins'?'microsoft-graph':b.kind);
    if(b.kind==='entra-signins') {check(/^[a-f0-9-]{36}$/i.test(value.appId),'software_app_id_required',422);b.appId=value.appId;}
    if(value.aliases!==undefined) {
      check(Array.isArray(value.aliases)&&value.aliases.length<=100,'software_aliases_invalid',422);
      b.aliases=value.aliases.map((a:any)=>({title:softwareTarget(a.title,'title'),publisher:softwareTarget(a.publisher,'publisher'),...(a.productId?{productId:softwareTarget(a.productId,'productId')}:{})}));
    }
    for(const field of ['removalGroupId','removalPolicyId','removalPackageId'] as const)if(value[field]!==undefined){check(b.kind==='jamf'&&/^\d+$/.test(value[field]),'software_removal_binding',422);b[field]=value[field];}
    bindings.push(b);
  }
  check(bindings.filter(b=>b.kind==='zoom').length<=1 && new Set(bindings.map(b=>b.connectionId+':'+b.kind)).size===bindings.length,'software_duplicate_source',422);
  check(!(bindings.some(b=>b.kind==='zoom')&&bindings.some(b=>['jamf','intune'].includes(b.kind))),'software_mixed_consumption_metric',422);
  return bindings;
}
export async function newSoftwareLicense(ctx: SoftwareContext,b:Record<string,any>) {
  const p=await softwarePrincipal(ctx,true), ownerId=softwareTarget(b.ownerId||p.userId,'ownerId');
  await livePerson(ctx,ownerId,['owner','operator']);
  const service=await getService(ctx.env.DB,p,softwareTarget(b.serviceId,'serviceId'),'service');
  check(['per-device','per-user','concurrent'].includes(b.metric),'software_metric_required',422);
  check(['managed','ignored','prohibited'].includes(b.policy),'software_policy_required',422);
  const sourceBindings=await bindingsInput(ctx,b.sourceBindings||[]), contract=contractInput(b.contract);
  check(!sourceBindings.some(s=>s.kind==='zoom')||b.metric==='per-user','software_zoom_metric_per_user',422);
  const freshnessMs=b.freshnessMs===undefined?86400000:count(b.freshnessMs,'freshnessMs');check(freshnessMs>0&&freshnessMs<=604800000,'software_freshness_invalid',422);
  const name=softwareTarget(b.name,'name'),publisher=softwareTarget(b.publisher,'publisher');
  const existing=(await list(ctx.env.DB,p,'asset')).some(r=>r.data.softwareLicense&&normalizedSoftware(r.data.name)===normalizedSoftware(name)&&normalizedSoftware(r.data.publisher)===normalizedSoftware(publisher));
  check(!existing,'software_title_exists');
  const r=await create(ctx.env.DB,p,'asset',{softwareLicense:true,name,publisher,titleOwnerId:ownerId,serviceId:service.id,metric:b.metric,policy:b.policy,contract,sourceBindings,
    assetType:'license',externalId:name,source:'owner-recorded contract',lifecycle:'acquired',currency:'USD',acquisitionCost:contract.annualCostUsd,renewalAt:contract.renewalAt,
    assignments:[],usage:[],costs:[],decisions:[],history:[],observation:null,deviceUsers:[],freshnessMs,grant:null,grantVersion:0,effectTargets:[],reminders:[],complianceWork:[]}, {visibility:'restricted',ownerId});
  return presentSoftwareLicense(ctx,r.id);
}
export async function presentSoftwareLicense(ctx:SoftwareContext,key:string) {
  const r=await softwareRecord(ctx,key);
  const effects=(await ctx.env.DB.prepare('SELECT id,action,state,grant_version,attempted_at,updated_at FROM svc_software_effects WHERE workspace_id=? AND record_id=? ORDER BY attempted_at').bind(ctx.principal.workspaceId,r.id).all()).results;
  return {...r,summary:await softwareSummary(ctx,r),effects};
}
export async function editSoftwareLicense(ctx:SoftwareContext,key:string,b:Record<string,any>) {
  const r=await softwareRecord(ctx,key,b.revision,true); const data={...r.data};
  // Owner transfer is explicit; records use a restrictive owner boundary and do
  // not widen it through contract edits or arbitrary client fields.
  check(b.ownerId===undefined||b.ownerId===r.ownerId,'software_owner_transfer_requires_review',422);
  if(b.policy!==undefined){check(['managed','ignored','prohibited'].includes(b.policy),'software_policy_required',422);data.policy=b.policy;}
  if(b.contract!==undefined){data.contract=contractInput(b.contract);data.renewalAt=data.contract.renewalAt;}
  if(b.sourceBindings!==undefined){data.sourceBindings=await bindingsInput(ctx,b.sourceBindings);check(!data.sourceBindings.some((s:SoftwareBinding)=>s.kind==='zoom')||r.data.metric==='per-user','software_zoom_metric_per_user',422);data.observation=null;}
  data.grant=null;data.grantVersion=(data.grantVersion||0)+1;
  await softwareCommit(ctx,r,data,'software-contract-amended');return presentSoftwareLicense(ctx,key);
}
export async function syncSoftwareLicense(ctx:SoftwareContext,key:string,b:Record<string,any>) {
  const r=await softwareRecord(ctx,key,b.revision,true);check(r.data.sourceBindings.length,'software_sources_required',422);
  const end=now(),start=new Date(Date.now()-29*86400000).toISOString(), sources:any[]=[],installations:any[]=[],devices:any[]=[],users:any[]=[],signins=new Set<string>();
  try {
    for(const binding of r.data.sourceBindings as SoftwareBinding[]) {
      const conn=await softwareConnection(ctx,binding.connectionId,binding.kind==='intune'||binding.kind==='entra-signins'?'microsoft-graph':binding.kind);
      if(binding.kind==='zoom')users.push(...await readZoom(ctx,conn,start,end));
      else if(binding.kind==='entra-signins')for(const email of await readEntra(ctx,conn,binding,start,end))signins.add(email);
      else {const inventory=await readDesktop(ctx,conn,binding,r);installations.push(...inventory.installations);devices.push(...inventory.devices);}
      await completeConnectionRead(ctx,conn);sources.push({connectionId:conn.id,revision:conn.revision,kind:binding.kind});
    }
    for(const user of users){user.active=user.active||signins.has(user.email);await assertPlatformAdmission(ctx.env.DB,ctx.principal.workspaceId,user.id,user.email);}
    for(const d of devices)if(d.userId)await livePerson(ctx,d.userId);
    await softwareRecord(ctx,key,r.revision,true);
    for(const source of sources)check((await softwareConnection(ctx,source.connectionId)).revision===source.revision,'software_connection_changed');
    const serials=new Map<string,number>();for(const d of devices)serials.set(d.serial.toUpperCase(),(serials.get(d.serial.toUpperCase())||0)+1);
    const observation={observedAt:now(),periodStart:start,periodEnd:end,sources,users,idpActiveEmails:[...signins],installations,devices,conflictingSerials:[...serials].filter(([,n])=>n>1).map(([s])=>s),concurrency:null};
    const usage=users.length?[...r.data.usage,{source:'Zoom admin report and configured Entra sign-ins',observedAt:observation.observedAt,periodStart:start,periodEnd:end,activeUsers:users.filter(u=>u.active&&u.licensed).length,allocatedSeats:users.filter(u=>u.licensed).length,currency:'USD',cost:null}]:r.data.usage;
    const updated=await softwareCommit(ctx,r,{...r.data,observation,observationError:null,usage},'software-provider-observed');
    // Observation is useful even during a hold. Creating work is a separate
    // effect and requires the current hold and identity boundary.
    try {await softwareEffectAllowed(ctx,updated);await openSoftwareComplianceWork(ctx,updated);}catch(error){if(!(error instanceof ApiError)||!['restore_execution_held','software_erasure_pending','software_execution_held'].includes(error.code))throw error;}
  } catch(error) {
    const current=await softwareRecord(ctx,key);
    if(current.revision===r.revision)await softwareCommit(ctx,current,{...current.data,observationError:error instanceof ApiError?error.code:'software_provider_unavailable'},'software-observation-failed');
    throw error;
  }
  return presentSoftwareLicense(ctx,key);
}

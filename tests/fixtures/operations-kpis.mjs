import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// Public-door data used by HTTP and native-browser REPORT-005 journeys. Only the
// deployment/probe provider is a fixture; execution, authority and persistence are real.
export async function seedOperationsKpis({ok, implementation, executorId, providerState, cohorts = ['sales']}) {
  const at = new Date().toISOString(), refs = [];
  const nextMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth()+1, 2)).toISOString();
  const service = await ok('POST','/services',{name:'Denver orders',description:'Prepare customer orders',businessImpact:'Sales cannot work',source:'Denver IT service register',observedAt:at,visibility:'operators'});
  const incidents=[];
  for(let n=0;n<40;n++) {
    let incident=await ok('POST','/incidents',{title:`Denver orders interruption ${n+1}`,serviceId:service.id,impact:'Order entry unavailable',cohorts,priority:n<20?'P1':'P2',major:n<2});
    if(n<39) incident=await ok('POST',`/incidents/${incident.id}/acknowledge`,{revision:incident.revision});
    incidents.push(incident);
  }
  for(const phase of ['canary','rollout']) {
    const payload={...implementation.payload,phase,cohorts,implementationRevision:1};
    const grant=await ok('POST','/grants',{principalId:executorId,beneficiaryId:implementation.beneficiaryId,action:`deployment.${phase}`,actionVersion:1,target:implementation.target,connectionId:implementation.connectionId,
      validFrom:new Date(Date.now()-60000).toISOString(),validUntil:new Date(Date.now()+3600000).toISOString(),maxUses:100,
      conditions:{payloadHash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')}});
    refs.push({id:grant.id,version:grant.version,phase});
  }
  const changes=[];
  for(let n=0;n<25;n++) {
    // Failed changes retain their own fence. Separate affected services model
    // distinct failed releases without bypassing that production safety rule.
    const targetService=n<23?service:await ok('POST','/services',{name:`Denver failed release ${n}`,description:'Separate release',businessImpact:'Separate bounded cohort',source:'Service register',observedAt:at});
    await providerState({failDeployment:n>=23});
    let change=await ok('POST','/changes',{title:`Denver release ${n+1}`,services:[targetService.id],risk:'Bounded release',impact:'Sales workflow',emergency:n<3,
      ...(n<3?{emergencyReason:'Urgent owned service repair'}:{}),window:{start:new Date(Date.now()-60000).toISOString(),end:new Date(Date.now()+3600000).toISOString()},cohorts,canaryCohorts:cohorts,
      implementation,compensation:implementation});
    change=await ok('POST',`/changes/${change.id}/authorize`,{revision:change.revision,reason:'Approve exact release with separate current grants',grantReferences:refs});
    for(const phase of n<23?['canary','rollout']:['canary']) {
      change=await ok('POST',`/changes/${change.id}/dispatch`,{revision:change.revision,phase,idempotencyKey:`kpi-${n}-${phase}`},executorId);
      if(n>=23) await ok('POST',`/operations/${change.data.invocations.at(-1).executionId}/reconcile`,{},executorId);
      change=await ok('POST',`/changes/${change.id}/verify`,{revision:change.revision,invocationId:change.data.invocations.at(-1).id},executorId);
    }
    assert.equal(change.data.state,n<23?'verified':'failed','REPORT-005 real engine records each verified or terminally failed deployment');
    changes.push(change);
  }
  await providerState({failDeployment:false});
  await ok('POST','/services/process-due',{});
  const assets=[];
  for(let n=0;n<300;n++) assets.push(await ok('POST','/software-assets',{name:`Denver ${n<2?'laptop':'license'} ${n+1}`,assetType:n<2?'device':'software',serviceId:service.id,externalId:`denver-${n}`,source:'Purchase register',currency:'USD',acquisitionCost:120,observedAt:at}));
  let asset=await ok('POST',`/software-assets/${assets[0].id}/operations-observation`,{revision:assets[0].revision,source:'Recorded MDM export',evidence:'Denver device register row 1',observedAt:at,freshnessMs:86400000,compliance:'noncompliant',refreshAt:nextMonth});
  assets[0]=asset;
  const usageAt = new Date().toISOString();
  asset=await ok('POST',`/software-assets/${assets[2].id}/usage`,{revision:assets[2].revision,source:'License usage statement',observedAt:usageAt,periodStart:at,periodEnd:usageAt,activeUsers:8,allocatedSeats:10,cost:120,currency:'USD'});
  asset=await ok('POST',`/software-assets/${asset.id}/charges`,{revision:asset.revision,source:'Supplier invoice',invoice:'DEN-USD-120',amount:120,currency:'USD',periodStart:at,periodEnd:usageAt});
  assets[2]=asset;
  asset=await ok('POST',`/software-assets/${assets[3].id}/usage`,{revision:assets[3].revision,source:'Foreign usage statement',observedAt:usageAt,periodStart:at,periodEnd:usageAt,activeUsers:3,allocatedSeats:5,cost:90,currency:'CAD'});
  asset=await ok('POST',`/software-assets/${asset.id}/charges`,{revision:asset.revision,source:'Canadian supplier invoice',invoice:'DEN-CAD-90',amount:90,currency:'CAD',periodStart:at,periodEnd:usageAt});
  assets[3]=asset;
  const problem=await ok('POST','/problems',{title:'Recurring Denver order failure',serviceId:service.id,incidentIds:[incidents[0].id],symptoms:'Repeated order interruption'});
  await ok('POST',`/problems/${problem.id}/known-error`,{revision:problem.revision,cause:'Recorded stale service configuration',evidenceIds:[incidents[0].id]});
  const supplier=await ok('POST','/suppliers',{name:'Denver software supplier',services:[service.id],contract:'Signed service agreement',currency:'USD',cost:120,costPeriod:'month',renewalAt:nextMonth});
  return {service,incidents,changes,assets,problem,supplier};
}

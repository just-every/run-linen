import type { Principal } from '../../platform/types';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { currentPrincipal } from '../work/identity';
import { getService, readable, dto, type RecordRow, type ServiceRecord } from './store';
import { serviceEvent, serviceSnapshot } from './history';

export async function watchingChecks(db:D1Database,p:Principal,input:Record<string,any>,services:string[]){
  const ids=input.monitorIds??[];
  if(!Array.isArray(ids)||ids.length>20||ids.some(x=>typeof x!=='string'||!x)||new Set(ids).size!==ids.length)
    throw new ApiError(422,'change_monitors','Choose distinct watching checks');
  const covered=new Set<string>();
  for(const checkId of ids){
    const monitor=await getService(db,p,checkId,'monitor');
    covered.add(monitor.data.serviceId);
    if(!services.includes(monitor.data.serviceId))throw new ApiError(422,'change_monitors','Watching checks must watch an affected service');
  }
  if(ids.length&&services.some(serviceId=>!covered.has(serviceId)))throw new ApiError(422,'change_monitors','Each affected service needs a watching check');
  const duration=input.observationWindowMs??86400000;
  if(!Number.isSafeInteger(duration)||duration<1||duration>365*86400000)
    throw new ApiError(422,'change_observation_window','Declare a positive observation window up to 365 days');
  return {monitorIds:ids as string[],observationWindowMs:duration as number};
}
const pendingCause=(alias:string)=>`EXISTS(SELECT 1 FROM svc_records incident,json_each(incident.data_json,'$.suspectedChanges') cause WHERE incident.workspace_id=${alias}.workspace_id AND incident.kind='incident' AND json_extract(cause.value,'$.changeId')=${alias}.id AND json_extract(cause.value,'$.implementationRevision')=json_extract(${alias}.data_json,'$.implementationRevision') AND json_extract(cause.value,'$.state')='suspected')`;
/** Missing, stale, out-of-order or truncated evidence cannot certify continuous health. */
export async function observedHealth(db:D1Database,p:Principal,r:ServiceRecord){
  const fail=()=>new ApiError(409,'change_health_unready','Watching checks and incident review do not yet prove the observation window');
  const start=Date.parse(r.data.implementationStartedAt),at=Date.now(),duration=r.data.observationWindowMs??86400000;
  if(!Number.isFinite(start)||!r.data.monitorIds?.length)throw fail();
  const pending=await db.prepare(`SELECT 1 FROM svc_records change WHERE change.workspace_id=? AND change.id=? AND ${pendingCause('change')}`).bind(p.workspaceId,r.id).first();
  if(pending)throw fail();
  const checks=[];
  for(const monitorId of r.data.monitorIds as string[]){
    let monitor:ServiceRecord;
    try{monitor=await getService(db,p,monitorId,'monitor');}catch(error){if(error instanceof ApiError&&[403,404].includes(error.status))throw fail();throw error;}
    const d=monitor.data;
    if(!r.data.services.includes(d.serviceId)||d.status!=='healthy'||!Number.isFinite(d.freshnessMs)||d.freshnessMs<=0)throw fail();
    const connection=await db.prepare("SELECT id,revision FROM connections WHERE workspace_id=? AND id=? AND status IN('active','inbound-unobserved')").bind(p.workspaceId,d.connectionId??'').first<{id:string;revision:number}>();
    if(!connection)throw fail();
    const observations=(d.observations??[]).filter((o:any)=>Date.parse(o.observedAt)>=start);
    // Work backwards from the most recent observation; any interruption starts a new run.
    const healthy:any[]=[];
    for(const observation of [...observations].reverse()){
      if(observation.status!=='healthy'||observation.stale||observation.outOfOrder)break;
      const measured=Date.parse(observation.observedAt),received=Date.parse(observation.receivedAt);
      if(!Number.isFinite(measured)||!Number.isFinite(received)||measured>at||received>at||received-measured>d.freshnessMs)throw fail();
      if(healthy.length&&Date.parse(healthy.at(-1).observedAt)-measured>d.freshnessMs)break;
      healthy.push(observation);
    }
    const latest=healthy[0],first=healthy.at(-1);
    if(!latest||at-Date.parse(latest.observedAt)>d.freshnessMs||Date.parse(latest.observedAt)-Date.parse(first.observedAt)<duration)throw fail();
    checks.push({id:monitor.id,revision:monitor.revision,connectionId:connection.id,connectionRevision:connection.revision,eventIds:healthy.map(o=>o.id),from:first.observedAt,through:latest.observedAt});
  }
  return {checkedAt:now(),windowMs:duration,checks};
}
/** Recheck the monitor revisions and all pending causes inside the outcome write. */
export async function recordObservedVerification(db:D1Database,p:Principal,r:ServiceRecord,revision:unknown,data:Record<string,any>,event='execution-verification'){
  p=await currentPrincipal(db,p);
  if(!p.roles.some(role=>['owner','operator'].includes(role)))throw new ApiError(403,'forbidden','Current service operator required');
  if(revision!==r.revision)throw new ApiError(409,'revision_conflict','Reload the current revision');
  const health=await observedHealth(db,p,r),guardId=id(),finishId=id(),at=now();
  const matches=health.checks.map(()=>"EXISTS(SELECT 1 FROM svc_records monitor WHERE monitor.workspace_id=change.workspace_id AND monitor.id=? AND monitor.kind='monitor' AND monitor.revision=? AND EXISTS(SELECT 1 FROM connections connection WHERE connection.workspace_id=monitor.workspace_id AND connection.id=? AND connection.revision=? AND connection.status IN('active','inbound-unobserved')))").join(' AND ');
  const incidentSources=data.postImplementationReview?.incidentSources as {id:string;revision:number}[]|undefined;
  const sourceSql=incidentSources===undefined?'':` AND (SELECT COUNT(*) FROM svc_records incident WHERE incident.workspace_id=change.workspace_id AND incident.kind='incident' AND EXISTS(SELECT 1 FROM json_each(incident.data_json,'$.suspectedChanges') cause WHERE json_extract(cause.value,'$.changeId')=change.id AND json_extract(cause.value,'$.implementationRevision')=json_extract(change.data_json,'$.implementationRevision'))) = json_array_length(?) AND NOT EXISTS(SELECT 1 FROM json_each(?) source WHERE NOT EXISTS(SELECT 1 FROM svc_records incident WHERE incident.workspace_id=change.workspace_id AND incident.id=json_extract(source.value,'$.id') AND incident.revision=json_extract(source.value,'$.revision')))`;
  const sourceBindings=incidentSources===undefined?[]:[JSON.stringify(incidentSources),JSON.stringify(incidentSources)];
  const guard=(key:string,expected:number)=>db.prepare(`INSERT INTO work_fulfilment_link_guards SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM svc_records change WHERE change.workspace_id=? AND change.id=? AND change.revision=? AND NOT (${pendingCause('change')}) AND ${matches} AND EXISTS(SELECT 1 FROM memberships member,json_each(member.roles_json) role WHERE member.workspace_id=change.workspace_id AND member.user_id=? AND member.active=1 AND role.value IN('owner','operator')) ${sourceSql}) THEN 1 ELSE 0 END`)
    .bind(key,p.workspaceId,r.id,expected,...health.checks.flatMap(check=>[check.id,check.revision,check.connectionId,check.connectionRevision]),p.userId,...sourceBindings);
  const next={...data,healthEvidence:health,...(event==='post-implementation-reviewed'?{postImplementationReview:{...data.postImplementationReview,healthEvidence:health}}:{})};
  try{
    await db.batch([
      guard(guardId,r.revision),
      db.prepare('UPDATE svc_records SET data_json=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?').bind(JSON.stringify(next),at,p.workspaceId,r.id,r.revision),
      serviceEvent(db,p,r,serviceSnapshot(r),serviceSnapshot({...r,data:next}),event,at),
      guard(finishId,r.revision+1),
      db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id IN(?,?)').bind(guardId,finishId),
    ]);
  }catch(error){if(String(error).includes('CHECK constraint failed'))throw new ApiError(409,'change_health_unready','Health, incident review or authority changed');throw error;}
  return getService(db,p,r.id,'change');
}

/** Review closure records work facts; it never authorizes a deployment or backout. */
export async function closeChangeReview(db:D1Database,p:Principal,r:ServiceRecord,input:Record<string,unknown>){
  p=await currentPrincipal(db,p);
  if(!p.roles.some(role=>['owner','operator'].includes(role)))throw new ApiError(403,'forbidden','Current service operator required');
  const summary=requiredString(input.summary,'summary',4000);
  if(!['verified','compensated'].includes(r.data.state)||r.data.invocations.some((i:any)=>!['verified','failed','cancelled'].includes(i.state)))
    throw new ApiError(409,'change_review_unready','Verified rollout or backout and resolved execution outcomes are required');
  if(input.revision!==r.revision)throw new ApiError(409,'revision_conflict','Reload the current revision');
  if(r.data.reviewState==='closed'){
    if(r.data.postImplementationReview?.summary!==summary)throw new ApiError(409,'change_review_closed','The recorded review is closed');
    return r;
  }
  const current=r.data.invocations.filter((i:any)=>i.implementationRevision===r.data.implementationRevision);
  if(!current.some((i:any)=>['rollout','compensate'].includes(i.phase)&&i.state==='verified'&&i.evidenceIds?.length))
    throw new ApiError(409,'change_review_unready','Current implementation requires verified outcome evidence');
  const incidents=(await db.prepare(`SELECT * FROM svc_records incident WHERE incident.workspace_id=? AND incident.kind='incident'
    AND EXISTS(SELECT 1 FROM json_each(incident.data_json,'$.suspectedChanges') cause WHERE json_extract(cause.value,'$.changeId')=? AND json_extract(cause.value,'$.implementationRevision')=?)`)
    .bind(p.workspaceId,r.id,r.data.implementationRevision).all<RecordRow>()).results.map(dto);
  if(incidents.some(incident=>!readable(p,incident)))throw new ApiError(409,'change_review_unready','Current source access is required to close the review');
  const confirmed=incidents.some(incident=>incident.data.changeCause?.changeId===r.id&&incident.data.changeCause?.state==='confirmed');
  const backouts=current.filter((i:any)=>i.phase==='compensate').map((i:any)=>({invocationId:i.id,state:i.state,evidenceIds:i.evidenceIds??[]}));
  return recordObservedVerification(db,p,r,input.revision,{...r.data,reviewState:'closed',postImplementationReview:{
    summary,closedAt:now(),implementationRevision:r.data.implementationRevision,incidentIds:incidents.map(incident=>incident.id),incidentSources:incidents.map(incident=>({id:incident.id,revision:incident.revision})),
    outcome:confirmed?'failed':r.data.state==='compensated'?'backed-out':'successful',
    backoutOutcome:backouts.length?'recorded':'not-attempted',backouts,
  }},'post-implementation-reviewed');
}

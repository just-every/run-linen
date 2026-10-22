import { decodeHistory, fieldClass, retainedValue, type ValueClass } from './registry';
import { erasedPerson, erasedValue, isErased, type HistoryEnvelope } from './types';
export type HistoryCounts = Record<string,number>;
export function historyEventKey(store:string,eventId:string,envelope?:HistoryEnvelope|null):string {
  return envelope?.source ? 'source:'+JSON.stringify(envelope.source) : store+':'+eventId;
}
async function matchesValue(value:unknown,matches:(value:string)=>Promise<boolean>):Promise<boolean> {
  if(isErased(value))return false;
  if(typeof value==='string')return matches(value);
  if(Array.isArray(value)){for(const v of value)if(await matchesValue(v,matches))return true;}
  else if(value && typeof value==='object'){for(const v of Object.values(value))if(await matchesValue(v,matches))return true;}
  return false;
}
/** The sole retained-value policy. Personal and unregistered payloads never gain
 * retention by supplying a tag; the registry validates every field/value pair. */
export async function redactHistory(payload:unknown,at:string,matches:(value:string)=>Promise<boolean>,actorId?:string) {
  const envelope=decodeHistory(payload),counts:HistoryCounts={};
  const count=(key:string)=>{counts[key]=(counts[key]||0)+1;};
  if(!envelope){count('unregistered');return {payload:{redacted:'erasure',redactedAt:at},counts,affected:true,actorErased:actorId?await matches(actorId):false};}
  const e=structuredClone(envelope);
  const actorErased=await matches(e.actor.id)||['person','integration'].includes(e.actor.kind)&&!!e.actor.name&&await matches(e.actor.name);
  const initiatorErased=!!e.actor.initiatedBy&&await matches(e.actor.initiatedBy);
  const storedActorErased=actorErased||!!actorId&&await matches(actorId);
  const subjectErased=(await Promise.all(e.subjects.map(matches))).some(Boolean);
  let valueErased=false;
  for(const c of e.changes)if(await matchesValue(c.before,matches)||await matchesValue(c.after,matches)||c.evidence?.label&&await matches(c.evidence.label)||c.beforeEvidence?.label&&await matches(c.beforeEvidence.label)||c.afterEvidence?.label&&await matches(c.afterEvidence.label))valueErased=true;
  if(!actorErased&&!initiatorErased&&!storedActorErased&&!subjectErased&&!valueErased)return {payload:e,counts,affected:false,actorErased:false};
  if(actorErased){e.actor={kind:e.actor.kind,id:'[erased]',name:'Erased person'};count('actor');}
  if(initiatorErased&&!actorErased){e.actor.initiatedBy='[erased]';count('initiator');}
  e.subjects=(await Promise.all(e.subjects.map(async v=>await matches(v)?null:v))).filter((v):v is string=>v!==null);
  const strict=subjectErased&&e.protection!=='normal';
  for(const c of e.changes){
    const kind=fieldClass(e.action,c.field);
    for(const side of ['before','after'] as const){
      const value=c[side];if(isErased(value))continue;
      const evidence=c[side==='before'?'beforeEvidence':'afterEvidence']??c.evidence;
      const identityHit=await matchesValue(value,matches)||!!evidence?.label&&await matches(evidence.label);
      const retain=!identityHit && (!strict||(['state','priority','sla','timing'] as ValueClass[]).includes(kind)) && retainedValue(e.action,c.field,value,evidence);
      if(kind==='person'){
        if(identityHit||strict){c[side]=erasedPerson;count('person');}
        else count('retained.person');
      } else if(retain){count('retained.'+kind);}
      else {c[side]=erasedValue;count(kind);}
    }
    // Evidence itself is content. Keep only proof for a value that survived.
    if(isErased(c.before)&&isErased(c.after)){delete c.evidence;delete c.beforeEvidence;delete c.afterEvidence;}
    else {
      if(c.evidence?.options)c.evidence.options=[...new Set([c.before,c.after].flat().filter(v=>typeof v==='string'&&!isErased(v)))];
      if(c.evidence?.label&&await matches(c.evidence.label))delete c.evidence.label;
      if(isErased(c.before))delete c.beforeEvidence;
      if(isErased(c.after))delete c.afterEvidence;
    }
  }
  e.redacted='erasure';e.redactedAt=e.redactedAt??at;
  return {payload:e,counts,affected:true,actorErased:storedActorErased};
}
/** A durable earlier removal wins over every later source/archive revision. */
export function intersectRedaction(incoming:unknown,previous:unknown):unknown {
  const next=decodeHistory(incoming),prior=decodeHistory(previous);
  if(!prior)return previous;
  if(!next)return {redacted:'erasure',redactedAt:prior.redactedAt};
  const result=structuredClone(next);
  if(prior.actor.id==='[erased]')result.actor=prior.actor;
  result.subjects=result.subjects.filter(v=>prior.subjects.includes(v));
  for(const c of result.changes){const old=prior.changes.find(p=>p.field===c.field);
    if(!old){c.before=erasedValue;c.after=erasedValue;delete c.evidence;delete c.beforeEvidence;delete c.afterEvidence;continue;}
    for(const side of ['before','after'] as const)if(isErased(old[side])){c[side]=old[side];delete c[side==='before'?'beforeEvidence':'afterEvidence'];}
    if(isErased(c.before)&&isErased(c.after))delete c.evidence;
  }
  result.redacted='erasure';result.redactedAt=prior.redactedAt;return result;
}

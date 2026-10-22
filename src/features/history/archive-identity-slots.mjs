import { archivePersonPath,isArchiveAlias,erasedArchivePerson } from './archive-identity-crypto.mjs';
export const removedArchiveReference=value=>value==='[erased]'||value==='Erased person'||isArchiveAlias(value)||erasedArchivePerson(value);
/** A business rule/scenario and the person who initiated it are distinct identities. */
export function erasedArchiveSlots(payload,outerActor){
 const paths=[],actor=payload?.actor;
 if(removedArchiveReference(actor?.id))paths.push('actor');
 if(removedArchiveReference(outerActor))paths.push(!actor||removedArchiveReference(actor.id)?'actor':'rowActor');
 if(removedArchiveReference(actor?.initiatedBy))paths.push('initiatedBy');
 for(const change of payload?.changes??[])for(const side of ['before','after'])
  if(erasedArchivePerson(change[side]))paths.push(archivePersonPath(change.field,side));
 return [...new Set(paths)];
}
export function originalArchiveSlots(original,safe,personFields,actorId,redactedActorId){
 const candidates=[];
 if(safe.actor?.id==='[erased]')candidates.push({path:'actor',value:original.actor?.id,canonical:true});
 if(safe.actor?.initiatedBy==='[erased]')candidates.push({path:'initiatedBy',value:original.actor?.initiatedBy,canonical:true});
 if(redactedActorId==='[erased]' && safe.actor && !removedArchiveReference(safe.actor.id))
  candidates.push({path:'rowActor',value:actorId??original.actor?.initiatedBy,canonical:true});
 else if(redactedActorId===undefined && safe.actor?.initiatedBy==='[erased]' && !removedArchiveReference(safe.actor.id))
  candidates.push({path:'rowActor',value:actorId??original.actor?.initiatedBy,canonical:true});
 for(const change of original.changes??[]){
  if(!personFields.includes(change.field))continue;
  const after=safe.changes?.find(candidate=>candidate.field===change.field);
  for(const side of ['before','after'])if(erasedArchivePerson(after?.[side]))candidates.push({path:archivePersonPath(change.field,side),value:change[side],canonical:false});
 }
 return candidates;
}
export function archiveSlotValue(payload,path,outerActor){
 if(path==='actor')return payload?.actor?.id??outerActor;
 if(path==='rowActor')return outerActor;
 if(path==='initiatedBy')return payload?.actor?.initiatedBy;
 const match=/^change:(.*):(before|after)$/.exec(path);
 if(!match)return undefined;
 return payload?.changes?.find(change=>change.field===decodeURIComponent(match[1]))?.[match[2]]?.alias;
}
export const validArchiveSlotPath=path=>['actor','rowActor','initiatedBy'].includes(path)||/^change:.+:(before|after)$/.test(path);

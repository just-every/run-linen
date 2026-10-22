import { archiveIdentityDigest,archiveLocalOrigin } from './archive-identity-crypto.mjs';
import { originalArchiveSlots,removedArchiveReference } from './archive-identity-slots.mjs';
import { unattributedArchiveSlot } from './archive-identity-capture.mjs';
/** Before clearing a newly written event, reuse only a cryptographically known identity association. */
export async function captureKnownArchiveAliasStatements(ctx,{eventId,store,payload,redactedPayload,personFields,at,actorId,redactedActorId}){
 const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{throw Error('Archive history payload is invalid');}};
 const original=parse(payload),safe=parse(redactedPayload);
 if(original?.schema!=='linen.history'||safe?.schema!=='linen.history')return [];
 const candidates=originalArchiveSlots(original,safe,personFields,actorId,redactedActorId)
  .filter(candidate=>typeof candidate.value==='string'&&candidate.value&&!removedArchiveReference(candidate.value));
 if(!candidates.length)return [];
 const env=ctx.env,w=ctx.principal.workspaceId,origin=await archiveLocalOrigin(env),statements=[];
 const existing=(await env.DB.prepare('SELECT path FROM history_archive_slots WHERE workspace_id=? AND store=? AND event_id=?').bind(w,store,eventId).all()).results;
 for(const candidate of candidates){
  if(existing.some(slot=>slot.path===candidate.path))continue;
  const digest=await archiveIdentityDigest(env,w,candidate.value);
  const known=(await env.DB.prepare('SELECT DISTINCT origin,alias FROM history_archive_identity_digests WHERE workspace_id=? AND digest=?').bind(w,digest).all()).results;
  if(known.length===1){
   const alias=known[0];
   statements.push(env.DB.prepare('INSERT OR IGNORE INTO history_archive_slots VALUES(?,?,?,?,?,?,?)').bind(w,store,eventId,candidate.path,alias.origin,alias.alias,at));
  }else statements.push(...await unattributedArchiveSlot(env,w,store,eventId,candidate.path,at,origin));
 }
 return statements;
}

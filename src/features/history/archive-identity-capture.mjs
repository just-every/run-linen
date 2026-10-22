import { archiveHmac,archiveIdentityDigest,archiveLocalOrigin,archiveSlotKey,archivePersonPath,normalizeArchiveIdentity,isArchiveAlias,erasedArchivePerson } from './archive-identity-crypto.mjs';
const decoded=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{throw Error('Archive history payload is invalid');}};
const removed=value=>value==='[erased]'||value==='Erased person'||isArchiveAlias(value)||erasedArchivePerson(value);
/** Only digest/alias associations and typed event slots are persisted. The caller includes these in its erasure CAS batch. */
export async function captureArchiveAliasStatements(ctx,{eventId,store,payload,redactedPayload,identities,canonicalPersonKey,personFields,at}){
 const original=decoded(payload),safe=decoded(redactedPayload),w=ctx.principal.workspaceId,env=ctx.env;
 if(original?.schema!=='linen.history'||safe?.schema!=='linen.history')return [];
 const origin=await archiveLocalOrigin(env),statements=[],known=new Set(identities.map(normalizeArchiveIdentity));
 const grouped=await Promise.all(identities.filter(Boolean).map(value=>archiveIdentityDigest(env,w,value)));
 const saved=(await env.DB.prepare('SELECT digest,alias FROM history_archive_identity_digests WHERE workspace_id=? AND origin=?').bind(w,origin).all()).results;
 const existing=[...new Set(saved.filter(row=>grouped.includes(row.digest)).map(row=>row.alias))];
 if(existing.length>1)throw Error('Archive identity association conflicts; retain the existing redaction');
 const canonical=existing[0]??'erased-a1-'+await archiveHmac(env,'linen/archive/alias/v1',origin,w,normalizeArchiveIdentity(canonicalPersonKey));
 async function slot(path,value,group){
  if(typeof value!=='string'||!value||removed(value))return;
  const digest=await archiveIdentityDigest(env,w,value),prior=saved.find(row=>row.digest===digest);
  const alias=group?canonical:prior?.alias??'erased-a1-'+await archiveHmac(env,'linen/archive/alias/v1',origin,w,normalizeArchiveIdentity(value));
  const digests=group?[...new Set([...grouped,digest])]:[digest];
  statements.push(env.DB.prepare("INSERT OR IGNORE INTO history_archive_aliases VALUES(?,?,?,'person',?)").bind(w,origin,alias,at));
  for(const key of digests)statements.push(env.DB.prepare('INSERT OR IGNORE INTO history_archive_identity_digests VALUES(?,?,?,?,?)').bind(w,origin,key,alias,at));
  const associationGuard=crypto.randomUUID();
  statements.push(env.DB.prepare('INSERT INTO history_write_guards SELECT ?,CASE WHEN NOT EXISTS(SELECT 1 FROM history_archive_identity_digests WHERE workspace_id=? AND origin=? AND digest IN(SELECT value FROM json_each(?)) AND alias<>?) THEN 1 ELSE 0 END').bind(associationGuard,w,origin,JSON.stringify(digests),alias),env.DB.prepare('DELETE FROM history_write_guards WHERE id=?').bind(associationGuard));
  statements.push(env.DB.prepare('INSERT OR IGNORE INTO history_archive_slots VALUES(?,?,?,?,?,?,?)').bind(w,store,eventId,path,origin,alias,at));
  const guard=crypto.randomUUID();
  statements.push(env.DB.prepare('INSERT INTO history_write_guards SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM history_archive_slots WHERE workspace_id=? AND store=? AND event_id=? AND path=? AND alias=?) THEN 1 ELSE 0 END').bind(guard,w,store,eventId,path,alias),env.DB.prepare('DELETE FROM history_write_guards WHERE id=?').bind(guard));
 }
 if(safe.actor?.id==='[erased]' && !removed(original.actor?.id))await slot('actor',original.actor.id,true);
 for(const change of original.changes??[]){
  if(!personFields.includes(change.field))continue;
  const after=safe.changes?.find(candidate=>candidate.field===change.field);
  for(const side of ['before','after'])if(erasedArchivePerson(after?.[side]))await slot(archivePersonPath(change.field,side),change[side],typeof change[side]==='string'&&known.has(normalizeArchiveIdentity(change[side])));
 }
 return statements;
}
/** Earlier-cleared values stay unknown: a distinct stable slot alias never asserts who the person was. */
export async function unattributedArchiveSlot(env,workspace,store,eventId,path,at,origin){
 const alias='erased-a1-'+await archiveHmac(env,'linen/archive/unattributed/v1',origin,archiveSlotKey(workspace,store,eventId,path));
 return [env.DB.prepare("INSERT OR IGNORE INTO history_archive_aliases VALUES(?,?,?,'unattributed',?)").bind(workspace,origin,alias,at),
  env.DB.prepare('INSERT OR IGNORE INTO history_archive_slots VALUES(?,?,?,?,?,?,?)').bind(workspace,store,eventId,path,origin,alias,at)];
}

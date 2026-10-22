const encoder=new TextEncoder();
export const normalizeArchiveIdentity=value=>value.trim().toLowerCase();
export const isArchiveAlias=value=>typeof value==='string' && /^erased-a1-[a-f0-9]{64}$/.test(value);
export const isArchiveTombstone=value=>typeof value==='string' && /^ak1:[a-f0-9]{32}:[a-f0-9]{64}$/.test(value);
export async function archiveHmac(env,domain,...parts){
 if(!env.ENCRYPTION_KEY)throw Error('Archive identity key is not configured');
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.ENCRYPTION_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const value=await crypto.subtle.sign('HMAC',key,encoder.encode(JSON.stringify([domain,...parts])));
 return [...new Uint8Array(value)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function archiveIdentityDigest(env,workspace,value){
 return 'ai1:'+await archiveHmac(env,'linen/archive/identity/v1',workspace,normalizeArchiveIdentity(value));
}
export async function archiveLocalOrigin(env){
 const row=await env.DB.prepare('SELECT origin FROM history_archive_origin WHERE id=1').first();
 if(!row || !/^[a-f0-9]{32}$/.test(row.origin))throw Error('Archive identity migration is required');
 return row.origin;
}
export async function archiveTombstone(env,workspace,legacyDigest,origin){
 if(isArchiveTombstone(legacyDigest))return legacyDigest;
 if(!/^[a-f0-9]{64}$/.test(legacyDigest))throw Error('Unsupported archive identity digest');
 return 'ak1:'+origin+':'+await archiveHmac(env,'linen/archive/tombstone/v1',origin,workspace,legacyDigest);
}
/** A foreign carried digest grants no identity authority. A match needs this installation's key. */
export async function archiveIdentityMatches(env,workspace,value,digest){
 if(!isArchiveTombstone(digest))return false;
 const hash=await crypto.subtle.digest('SHA-256',encoder.encode(value));
 const legacy=[...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
 return await archiveTombstone(env,workspace,legacy,digest.split(':')[1])===digest;
}
export const archiveSlotKey=(workspace,store,eventId,path)=>JSON.stringify([workspace,store,eventId,path]);
export const archivePersonPath=(field,side)=>'change:'+encodeURIComponent(field)+':'+side;
export const erasedArchivePerson=value=>!!value && typeof value==='object' && value.redacted==='erasure' && value.person===true;

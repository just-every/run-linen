import type { Env } from '../../platform/types';
import { hashToken } from '../../platform/crypto';
export const normalizeIdentity=(value:string)=>value.trim().toLowerCase();
/** Separate domain from credential/artifact hashing. The installation encryption
 * key never leaves runtime memory; archives contain only these keyed digests. */
export async function historyIdentityDigest(env:Pick<Env,'ENCRYPTION_KEY'>,workspaceId:string,value:string) {
  if(!env.ENCRYPTION_KEY)throw new Error('History identity key is not configured');
  const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(env.ENCRYPTION_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signed=await crypto.subtle.sign('HMAC',key,encoder.encode('linen/history/identity/v1\0'+workspaceId+'\0'+normalizeIdentity(value)));
  return 'h1:'+Array.from(new Uint8Array(signed),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function identityMatcher(env:Pick<Env,'DB'|'ENCRYPTION_KEY'>,workspaceId:string,identities:string[]=[]) {
  const exact=new Set(identities.filter(Boolean).map(normalizeIdentity));
  const known=(await env.DB.prepare('SELECT digest FROM history_identity_tombstones WHERE workspace_id=?').bind(workspaceId).all<{digest:string}>()).results;
  const old=(await env.DB.prepare('SELECT identity_hash FROM adoption_tombstones WHERE workspace_id=?').bind(workspaceId).all<{identity_hash:string}>()).results;
  const keyed=new Set(known.map(r=>r.digest)),legacy=new Set(old.map(r=>r.identity_hash));
  const cache=new Map<string,boolean>();
  return async(value:string)=>{
    if(!value)return false;
    if(exact.has(normalizeIdentity(value)))return true;
    if(cache.has(value))return cache.get(value)!;
    const result=keyed.has(await historyIdentityDigest(env,workspaceId,value)) || legacy.has(await hashToken(value)) || legacy.has(await hashToken(normalizeIdentity(value)));
    cache.set(value,result);return result;
  };
}

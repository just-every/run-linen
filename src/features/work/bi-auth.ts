import { ApiError } from '../../platform/http';
import type { BiCredential } from './bi-destinations';

const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const encoded=(value:object)=>b64(new TextEncoder().encode(JSON.stringify(value)));
/** Google service-account JWT grant; no delegated user, configurable issuer URL or token cache. */
export async function googleAccessToken(credential:BiCredential,provider:'gcs'|'bigquery'):Promise<string> {
  if('accessToken' in credential)return credential.accessToken;
  if(!('privateKey' in credential))throw new ApiError(422,'bi_credentials','Google credentials are unavailable');
  try {
    const pem=credential.privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,''),der=Uint8Array.from(atob(pem),s=>s.charCodeAt(0));
    const key=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
    const at=Math.floor(Date.now()/1000),scope=provider==='gcs'?'https://www.googleapis.com/auth/devstorage.read_write':'https://www.googleapis.com/auth/bigquery';
    const unsigned=encoded({alg:'RS256',typ:'JWT'})+'.'+encoded({iss:credential.clientEmail,scope,aud:'https://oauth2.googleapis.com/token',iat:at,exp:at+3600});
    const signature=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(unsigned)));
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+b64(signature)}),redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('token rejected');
    const value=await response.json() as {access_token?:unknown;token_type?:unknown;expires_in?:unknown};
    if(typeof value.access_token!=='string'||!/^[^\s\x00-\x1f\x7f]+$/.test(value.access_token)||value.token_type!=='Bearer'||typeof value.expires_in!=='number'||value.expires_in<60)throw new Error('token response invalid');
    return value.access_token;
  }catch {throw new ApiError(409,'bi_token_unavailable','Google service account token exchange failed; no destination delivery attempted');}
}

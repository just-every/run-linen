import type { AzureDestination, GcsDestination, BiCredential } from './bi-destinations';
export interface BiOutcome {state:'delivered'|'unknown'|'rejected'|'not_delivered';reference:string|null;error:string|null}
export const providerReference=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value)?value:null;
const path=(value:string)=>value.split('/').map(encodeURIComponent).join('/');
/** Real fixed provider origins. SAS is used only at the network edge, never in receipts/errors. */
export async function storageRequest(destination:GcsDestination|AzureDestination,credential:BiCredential,key:string,method:'PUT'|'GET',body?:string) {
  let url:string;
  const headers:Record<string,string>={};
  if(destination.provider==='gcs') {
    url=`https://storage.googleapis.com/${destination.bucket}/${path(key)}`;
    if(!('accessToken' in credential))throw new Error('Missing Google access token');
    headers.authorization='Bearer '+credential.accessToken;
    if(method==='PUT')headers['x-goog-if-generation-match']='0';
  } else {
    url=`https://${destination.account}.blob.core.windows.net/${destination.container}/${path(key)}`;
    headers['x-ms-version']='2023-11-03';headers['x-ms-date']=new Date().toUTCString();
    if('sasToken' in credential)url+='?'+credential.sasToken;
    else if('accessToken' in credential)headers.authorization='Bearer '+credential.accessToken;
    else throw new Error('Missing Azure credential');
    if(method==='PUT'){headers['x-ms-blob-type']='BlockBlob';headers['if-none-match']='*';}
  }
  if(method==='PUT')headers['content-type']='text/csv; charset=utf-8';
  return fetch(url,{method,headers,body:method==='PUT'?body:undefined,redirect:'manual',signal:AbortSignal.timeout(15000)});
}
export function storageOutcome(response:Response,provider:'gcs'|'azure'):BiOutcome {
  const reference=providerReference(response.headers.get(provider==='gcs'?'x-guploader-uploadid':'x-ms-request-id'));
  if(response.status===(provider==='gcs'?200:201))return {state:'delivered',reference,error:null};
  if(response.status>=400&&response.status<500&&![408,409,412,429].includes(response.status))return {state:'rejected',reference,error:`${provider} rejected upload (${response.status})`};
  return {state:'unknown',reference,error:`${provider} delivery uncertain (${response.status}); readback required`};
}
/** Hash the retrieved bytes rather than trusting owner-writable object metadata. */
export async function storageReadback(response:Response,digest:string):Promise<BiOutcome> {
  const reference=providerReference(response.headers.get('x-ms-request-id')??response.headers.get('x-guploader-uploadid'));
  if(response.status===404)return {state:'not_delivered',reference,error:'Provider confirms this object is absent'};
  if(response.status===200&&response.body) {
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>8*1024*1024){await reader.cancel();return {state:'unknown',reference,error:'Readback exceeded export limit'};}chunks.push(part.value);}
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
    const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(actual===digest)return {state:'delivered',reference,error:null};
  }
  return {state:'unknown',reference,error:'Provider did not prove the exact payload present or absent'};
}

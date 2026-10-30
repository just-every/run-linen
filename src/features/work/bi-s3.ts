import { hashToken } from '../../platform/crypto';
import { ApiError } from '../../platform/http';
export interface S3Destination {bucket:string;region:string;prefix:string}
export interface S3Credential {accessKeyId:string;secretAccessKey:string;sessionToken?:string}
const encode=(s:string)=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const bytes=(s:string)=>new TextEncoder().encode(s);
export const s3Checksum=(digest:string)=>btoa(String.fromCharCode(...(digest.match(/../g)??[]).map(pair=>parseInt(pair,16))));
const hex=(a:ArrayBuffer)=>Array.from(new Uint8Array(a),b=>b.toString(16).padStart(2,'0')).join('');
async function hmac(key:Uint8Array,message:string) {const k=await crypto.subtle.importKey('raw',key as BufferSource,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,bytes(message)));}
export function s3Destination(input:Record<string,unknown>):S3Destination {
  if(typeof input.bucket!=='string'||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(input.bucket)||/^\d+(-\d+){3}$/.test(input.bucket)||typeof input.region!=='string'||!/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(input.region)||typeof input.prefix!=='string'||input.prefix.length>300||!/^[-a-zA-Z0-9_/]*$/.test(input.prefix)||input.prefix.split('/').some(s=>s==='..'))throw new ApiError(422,'bi_destination','Use an S3 bucket name, AWS region and a simple object prefix');
  return {bucket:input.bucket,region:input.region,prefix:input.prefix.replace(/^\/+|\/+$/g,'')};
}
/** Fixed AWS HTTPS origin, no redirects, one attempt. Based on AWS S3 Signature V4 REST API. */
export async function s3Request(destination:S3Destination,credential:S3Credential,key:string,method:'PUT'|'HEAD',body?:string) {
  const host=`${destination.bucket}.s3.${destination.region}.amazonaws.com`,path='/'+key.split('/').map(encode).join('/');
  const at=new Date().toISOString().replace(/[-:]|\.\d{3}/g,''),date=at.slice(0,8),digest=await hashToken(body??'');
  const headers:Record<string,string>={'host':host,'x-amz-date':at,'x-amz-content-sha256':digest};
  if(credential.sessionToken)headers['x-amz-security-token']=credential.sessionToken;
  if(method==='PUT'){headers['content-type']='text/csv; charset=utf-8';headers['if-none-match']='*';headers['x-amz-meta-linen-sha256']=digest;headers['x-amz-checksum-sha256']=s3Checksum(digest);}
  else headers['x-amz-checksum-mode']='ENABLED';
  const names=Object.keys(headers).sort(),signed=names.join(';'),canonical=names.map(k=>`${k}:${headers[k].trim()}\n`).join('');
  const scope=`${date}/${destination.region}/s3/aws4_request`,canonicalRequest=`${method}\n${path}\n\n${canonical}\n${signed}\n${digest}`;
  let signing=await hmac(bytes('AWS4'+credential.secretAccessKey),date);for(const value of [destination.region,'s3','aws4_request'])signing=await hmac(signing,value);
  const signature=hex((await hmac(signing,`AWS4-HMAC-SHA256\n${at}\n${scope}\n${await hashToken(canonicalRequest)}`)).buffer as ArrayBuffer);
  headers.authorization=`AWS4-HMAC-SHA256 Credential=${credential.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
  return fetch(`https://${host}${path}`,{method,headers,body:method==='PUT'?body:undefined,redirect:'manual',signal:AbortSignal.timeout(15000)});
}

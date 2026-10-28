import { ApiError, requiredString } from '../../platform/http';
import { s3Destination, type S3Credential, type S3Destination } from './bi-s3';

export type GoogleMode = 'oauth' | 'service_account';
export interface GcsDestination { provider:'gcs'; bucket:string; prefix:string; credentialMode:GoogleMode }
export interface AzureDestination { provider:'azure'; account:string; container:string; prefix:string; authMode:'oauth'|'sas' }
export interface SnowflakeDestination { provider:'snowflake'; account:string; database:string; schema:string; table:string; warehouse:string; role?:string; tokenType:'OAUTH'|'PROGRAMMATIC_ACCESS_TOKEN' }
export interface BigQueryDestination { provider:'bigquery'; project:string; dataset:string; table:string; location:string; credentialMode:GoogleMode }
export type BiDestination = (S3Destination & {provider?:'s3'}) | GcsDestination | AzureDestination | SnowflakeDestination | BigQueryDestination;
export type BiCredential = S3Credential | {accessToken:string} | {sasToken:string} | {clientEmail:string;privateKey:string};
const fail=(message:string):never=>{throw new ApiError(422,'bi_destination',message);};
const field=(input:Record<string,unknown>,key:string,pattern:RegExp,max=200)=>{const value=requiredString(input[key],key,max);if(!pattern.test(value))fail(`Invalid ${key} for this provider`);return value;};
const token=(input:Record<string,unknown>,key='accessToken')=>field(input,key,/^[^\s\x00-\x1f\x7f]+$/,16000);
const prefix=(input:Record<string,unknown>)=>{
  if(typeof input.prefix!=='string'||input.prefix.length>300||!/^[-a-zA-Z0-9_/]*$/.test(input.prefix)||input.prefix.split('/').some(s=>s==='..'))fail('Use a simple object prefix');
  return (input.prefix as string).replace(/^\/+|\/+$/g,'');
};
function google(input:Record<string,unknown>):{credentialMode:GoogleMode;credential:BiCredential} {
  const mode=input.credentialMode??'oauth';
  if(mode==='oauth')return {credentialMode:mode,credential:{accessToken:token(input)}};
  if(mode!=='service_account')fail('Choose oauth or service_account credentials');
  const clientEmail=field(input,'clientEmail',/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.iam\.gserviceaccount\.com$/,320);
  const privateKey=requiredString(input.privateKey,'privateKey',16000);
  if(!/^-----BEGIN PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PRIVATE KEY-----\s*$/.test(privateKey))fail('A PKCS8 service account private key is required');
  return {credentialMode:'service_account',credential:{clientEmail,privateKey}};
}
/** All origins are constructed from provider-specific validated names. No supplied URL is fetched. */
export function biDestination(input:Record<string,unknown>):{destination:BiDestination;credential:BiCredential} {
  if(input.format!==undefined&&input.format!=='csv'&&input.format!=='rows')fail('Storage exports support CSV; warehouse loads support rows');
  if(input.provider===undefined||input.provider==='s3') {
    if(input.format==='rows')fail('S3 exports support CSV');
    const credential:S3Credential={accessKeyId:token(input,'accessKeyId'),secretAccessKey:token(input,'secretAccessKey'),...(input.sessionToken?{sessionToken:token(input,'sessionToken')}:{})};
    return {destination:{...s3Destination(input),provider:'s3'},credential};
  }
  if(input.provider==='gcs') {
    if(input.format==='rows')fail('Cloud Storage exports support CSV');
    const auth=google(input),bucket=field(input,'bucket',/^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$/,63);
    return {destination:{provider:'gcs',bucket,prefix:prefix(input),credentialMode:auth.credentialMode},credential:auth.credential};
  }
  if(input.provider==='azure') {
    if(input.format==='rows')fail('Azure Blob exports support CSV');
    const account=field(input,'account',/^[a-z0-9]{3,24}$/,24),container=field(input,'container',/^[a-z0-9](?:[a-z0-9]|-(?!-)){1,61}[a-z0-9]$/,63),authMode=input.authMode;
    if(authMode!=='oauth'&&authMode!=='sas')fail('Choose oauth or a container-scoped SAS');
    let credential:BiCredential;
    if(authMode==='oauth')credential={accessToken:token(input)};
    else {
      const sasToken=token(input,'sasToken').replace(/^\?/,'');
      if(sasToken.includes('://')||sasToken.includes('#'))fail('Supply only the container SAS query, never a URL');
      const params=new URLSearchParams(sasToken);
      if(params.get('sr')!=='c'||!params.get('sig')||!params.get('sv')||!params.get('se')||params.get('spr')!=='https'||params.has('ss')||params.has('srt')||!params.get('sp')?.includes('r')||!/[cw]/.test(params.get('sp')??''))fail('SAS must be HTTPS-only, container-scoped, expiring, with read and create and write permissions');
      if([...params.keys()].some(k=>params.getAll(k).length!==1))fail('Duplicate SAS parameters are not supported');
      credential={sasToken};
    }
    return {destination:{provider:'azure',account,container,prefix:prefix(input),authMode:authMode as 'sas'|'oauth'},credential};
  }
  if(input.provider==='snowflake') {
    if(input.format==='csv')fail('Snowflake uses direct row upserts');
    const account=field(input,'account',/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?){0,3}$/,200);
    const identifier=(key:string)=>field(input,key,/^[A-Za-z_][A-Za-z0-9_$]*$/,255),tokenType=input.tokenType??'PROGRAMMATIC_ACCESS_TOKEN';
    if(tokenType!=='OAUTH'&&tokenType!=='PROGRAMMATIC_ACCESS_TOKEN')fail('Choose a Snowflake OAuth or programmatic access token');
    return {destination:{provider:'snowflake',account,database:identifier('database'),schema:identifier('schema'),table:identifier('table'),warehouse:identifier('warehouse'),...(input.role?{role:identifier('role')}:{}),tokenType:tokenType as SnowflakeDestination['tokenType']},credential:{accessToken:token(input)}};
  }
  if(input.provider==='bigquery') {
    if(input.format==='csv')fail('BigQuery uses direct row upserts');
    const auth=google(input);
    return {destination:{provider:'bigquery',project:field(input,'project',/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/,63),dataset:field(input,'dataset',/^[A-Za-z_][A-Za-z0-9_]*$/,1024),table:field(input,'table',/^[A-Za-z_][A-Za-z0-9_]*$/,1024),location:field(input,'location',/^[A-Za-z0-9-]+$/,64),credentialMode:auth.credentialMode},credential:auth.credential};
  }
  return fail('Choose s3, gcs, azure, snowflake or bigquery');
}
export const isWarehouse=(d:BiDestination):d is SnowflakeDestination|BigQueryDestination=>d.provider==='snowflake'||d.provider==='bigquery';
export const providerName=(d:BiDestination)=>d.provider??'s3';

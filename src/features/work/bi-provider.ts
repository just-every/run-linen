import { ApiError } from '../../platform/http';
import { s3Request, s3Checksum, type S3Credential } from './bi-s3';
import { googleAccessToken } from './bi-auth';
import { isWarehouse, providerName, type BiDestination, type BiCredential } from './bi-destinations';
import { storageRequest, storageOutcome, storageReadback, providerReference, type BiOutcome } from './bi-storage';
import { snowflakeRequest, snowflakeOutcome } from './bi-snowflake';
import { bigQueryRequest, bigQueryOutcome } from './bi-bigquery';

export async function providerCredential(destination:BiDestination,credential:BiCredential):Promise<BiCredential> {
  return destination.provider==='gcs'||destination.provider==='bigquery'?{accessToken:await googleAccessToken(credential,destination.provider)}:credential;
}
export const objectKey=(destination:BiDestination,runId:string)=>isWarehouse(destination)?runId:[destination.prefix,`${runId}.csv`].filter(Boolean).join('/');
export async function deliverBi(destination:BiDestination,credential:BiCredential,key:string,runId:string,body:string,digest:string):Promise<BiOutcome> {
  if(destination.provider==='gcs'||destination.provider==='azure')return storageOutcome(await storageRequest(destination,credential,key,'PUT',body),destination.provider);
  if(destination.provider==='snowflake'||destination.provider==='bigquery') {
    if(!('accessToken' in credential))throw new Error('Missing warehouse credential');
    if(destination.provider==='snowflake')return snowflakeOutcome(await snowflakeRequest(destination,credential.accessToken,runId,body));
    return bigQueryOutcome(await bigQueryRequest(destination,credential.accessToken,runId,body),destination,runId,digest);
  }
  const response=await s3Request(destination,credential as S3Credential,key,'PUT',body),reference=providerReference(response.headers.get('x-amz-request-id'));
  if(response.status===200)return {state:'delivered',reference,error:null};
  if(response.status>=400&&response.status<500&&![408,409,412,429].includes(response.status))return {state:'rejected',reference,error:`S3 rejected PUT (${response.status})`};
  return {state:'unknown',reference,error:`S3 delivery uncertain (${response.status}); readback required`};
}
export async function readbackBi(destination:BiDestination,credential:BiCredential,key:string,runId:string,digest:string,reference:string|null):Promise<BiOutcome> {
  if(destination.provider==='gcs'||destination.provider==='azure')return storageReadback(await storageRequest(destination,credential,key,'GET'),digest);
  if(destination.provider==='snowflake'||destination.provider==='bigquery') {
    if(!('accessToken' in credential))throw new Error('Missing warehouse credential');
    if(destination.provider==='bigquery')return bigQueryOutcome(await bigQueryRequest(destination,credential.accessToken,runId),destination,runId,digest,true);
    if(!reference)throw new ApiError(409,'bi_unknown','Snowflake statement handle was not received; delivery remains uncertain and cannot be resent');
    return snowflakeOutcome(await snowflakeRequest(destination,credential.accessToken,runId,undefined,reference),reference);
  }
  const response=await s3Request(destination,credential as S3Credential,key,'HEAD'),ref=providerReference(response.headers.get('x-amz-request-id'));
  if(response.status===200&&response.headers.get('x-amz-checksum-sha256')===s3Checksum(digest))return {state:'delivered',reference:ref,error:null};
  if(response.status===404)return {state:'not_delivered',reference:ref,error:'S3 confirms this object is absent'};
  return {state:'unknown',reference:ref,error:`${providerName(destination)} did not prove this payload present or absent`};
}

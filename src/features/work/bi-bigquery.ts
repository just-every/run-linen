import { hashToken } from '../../platform/crypto';
import type { BigQueryDestination } from './bi-destinations';
import type { BiOutcome } from './bi-storage';
import { reportSources } from './report-data';

export const bigQueryJobId=(runId:string)=>'linen_'+runId.replace(/-/g,'');
export function bigQueryMerge(destination:BigQueryDestination) {
  const columns=[...reportSources.tickets],q=(s:string)=>'`'+s+'`';
  const select=columns.map(c=>`${c==='revision'?`CAST(JSON_VALUE(r, '$.${c}') AS INT64)`:`JSON_VALUE(r, '$.${c}')`} AS ${q(c)}`).join(', ');
  return `MERGE ${q(`${destination.project}.${destination.dataset}.${destination.table}`)} T USING (SELECT ${select} FROM UNNEST(JSON_QUERY_ARRAY(PARSE_JSON(@rows))) r) S ON T.id=S.id WHEN MATCHED THEN UPDATE SET ${columns.filter(c=>c!=='id').map(c=>`${q(c)}=S.${q(c)}`).join(', ')} WHEN NOT MATCHED THEN INSERT (${columns.map(q).join(', ')}) VALUES (${columns.map(c=>`S.${q(c)}`).join(', ')})`;
}
/** Query jobs give deterministic operation identity, atomic MERGE and independent status lookup. */
export async function bigQueryRequest(destination:BigQueryDestination,token:string,runId:string,rows?:string) {
  const origin=`https://bigquery.googleapis.com/bigquery/v2/projects/${destination.project}/jobs`,jobId=bigQueryJobId(runId),headers={'authorization':'Bearer '+token,'content-type':'application/json'};
  if(rows!==undefined)return fetch(origin,{method:'POST',headers,body:JSON.stringify({jobReference:{projectId:destination.project,jobId,location:destination.location},configuration:{query:{query:bigQueryMerge(destination),useLegacySql:false,parameterMode:'NAMED',queryParameters:[{name:'rows',parameterType:{type:'STRING'},parameterValue:{value:rows}}]}}}),redirect:'manual',signal:AbortSignal.timeout(15000)});
  return fetch(`${origin}/${jobId}?location=${encodeURIComponent(destination.location)}`,{headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
}
export async function bigQueryOutcome(response:Response,destination:BigQueryDestination,runId:string,payloadDigest:string,readback=false):Promise<BiOutcome> {
  const reference=bigQueryJobId(runId),unknown=(error:string):BiOutcome=>({state:'unknown',reference,error});
  // A missing async job cannot prove non-delivery during propagation. Do not clear an uncertain run.
  if(!response.ok) {
    if(!readback&&[400,401,403,404,413,422].includes(response.status))return {state:'rejected',reference,error:`BigQuery rejected job submission (${response.status})`};
    return unknown(`BigQuery execution uncertain (${response.status}); job readback required`);
  }
  type Job={jobReference?:{projectId?:string;jobId?:string;location?:string};configuration?:{query?:{query?:string;useLegacySql?:boolean;parameterMode?:string;queryParameters?:{name?:string;parameterType?:{type?:string};parameterValue?:{value?:string}}[]}};status?:{state?:string;errorResult?:unknown}};
  let job:Job;try{job=await response.json();}catch{return unknown('BigQuery returned no verifiable job receipt');}
  const ref=job.jobReference,q=job.configuration?.query,parameters=q?.queryParameters;
  if(ref?.projectId!==destination.project||ref.jobId!==reference||ref.location?.toLowerCase()!==destination.location.toLowerCase()||q?.query!==bigQueryMerge(destination)||q.useLegacySql!==false||q.parameterMode!=='NAMED'||parameters?.length!==1||parameters[0].name!=='rows'||parameters[0].parameterType?.type!=='STRING'||typeof parameters[0].parameterValue?.value!=='string'||await hashToken(parameters[0].parameterValue.value)!==payloadDigest)return unknown('BigQuery job identity or scoped payload does not match this run');
  if(job.status?.state==='DONE')return job.status.errorResult?{state:'rejected',reference,error:'BigQuery confirms the MERGE job failed'}:{state:'delivered',reference,error:null};
  return unknown('BigQuery job is still pending; status readback required');
}

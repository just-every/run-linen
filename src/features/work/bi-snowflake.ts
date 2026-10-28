import type { SnowflakeDestination } from './bi-destinations';
import type { BiOutcome } from './bi-storage';
import { providerReference } from './bi-storage';
import { reportSources } from './report-data';

const quoted=(s:string)=>`"${s}"`;
export function snowflakeMerge(destination:SnowflakeDestination) {
  const columns=[...reportSources.tickets],table=[destination.database,destination.schema,destination.table].map(quoted).join('.');
  const select=columns.map(c=>`IFF(IS_NULL_VALUE(value:${quoted(c)}), NULL, value:${quoted(c)}::${c==='revision'?'NUMBER(38,0)':'VARCHAR'}) AS ${quoted(c)}`).join(', ');
  return `MERGE INTO ${table} T USING (SELECT ${select} FROM TABLE(FLATTEN(INPUT => PARSE_JSON(?)))) S ON T."id"=S."id" WHEN MATCHED THEN UPDATE SET ${columns.filter(c=>c!=='id').map(c=>`T.${quoted(c)}=S.${quoted(c)}`).join(', ')} WHEN NOT MATCHED THEN INSERT (${columns.map(quoted).join(', ')}) VALUES (${columns.map(c=>`S.${quoted(c)}`).join(', ')})`;
}
export async function snowflakeRequest(destination:SnowflakeDestination,token:string,runId:string,rows?:string,handle?:string) {
  const origin=`https://${destination.account}.snowflakecomputing.com/api/v2/statements`;
  const headers={'authorization':'Bearer '+token,'x-snowflake-authorization-token-type':destination.tokenType,'content-type':'application/json','accept':'application/json','user-agent':'Linen-BI/1'};
  if(rows!==undefined)return fetch(`${origin}?requestId=${runId}&async=true`,{method:'POST',headers,body:JSON.stringify({statement:snowflakeMerge(destination),warehouse:destination.warehouse,database:destination.database,schema:destination.schema,...(destination.role?{role:destination.role}:{}),timeout:60,bindings:{'1':{type:'TEXT',value:rows}}}),redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!handle||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle))throw new Error('Statement handle unavailable');
  return fetch(`${origin}/${handle}`,{headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
}
/** 202 is only acceptance, never completion. Provider errors are deliberately not copied. */
export async function snowflakeOutcome(response:Response,expectedHandle?:string):Promise<BiOutcome> {
  let body:{statementHandle?:unknown;code?:unknown;sqlState?:unknown}={};try{body=await response.json();}catch{/* No proven receipt. */}
  const reference=typeof body.statementHandle==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.statementHandle)?providerReference(body.statementHandle):null;
  if(expectedHandle&&reference!==expectedHandle)return {state:'unknown',reference:expectedHandle,error:'Snowflake returned a different statement receipt'};
  if(response.status===200&&reference&&body.code==='090001'&&body.sqlState==='00000')return {state:'delivered',reference,error:null};
  if(response.status===422&&reference)return {state:'rejected',reference,error:'Snowflake confirms the MERGE statement failed'};
  if([400,401,403,404].includes(response.status)&&!expectedHandle)return {state:'rejected',reference,error:`Snowflake rejected statement submission (${response.status})`};
  return {state:'unknown',reference:reference??expectedHandle??null,error:response.status===202?'Snowflake statement is still pending; status readback required':`Snowflake execution uncertain (${response.status}); status readback required`};
}

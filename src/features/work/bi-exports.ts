import type { Env } from '../../platform/types';
import { decryptSecret, encryptSecret, hashToken } from '../../platform/crypto';
import { ApiError, id, now, requiredString } from '../../platform/http';
import type { WorkContext } from './core';
import { reportAudit, reportOwner, reportWrite } from './report-store';
import { biDestination, isWarehouse, providerName, type BiCredential, type BiDestination } from './bi-destinations';
import { biEffectGate } from './bi-guard';
import { biSnapshot } from './bi-snapshot';
import { deliverBi, readbackBi, objectKey, providerCredential } from './bi-provider';
interface BiExport {id:string;workspace_id:string;owner_id:string;name:string;destination_json:string;credential_cipher:string;active:number;revision:number;next_at:string;consented_at:string}
interface BiRun {id:string;workspace_id:string;export_id:string;state:string;object_key:string;payload_sha256:string;row_count:number;snapshot_json:string;provider_ref:string|null;error:string|null;created_at:string;finished_at:string|null}
const dto=(r:BiExport)=>{
  const destination=JSON.parse(r.destination_json) as BiDestination,warehouse=isWarehouse(destination);
  return {id:r.id,name:r.name,ownerId:r.owner_id,destination,active:Boolean(r.active),revision:r.revision,nextAt:r.next_at,consentedAt:r.consented_at,frequency:'nightly',format:warehouse?'rows':'csv',source:'tickets',credentialConfigured:Boolean(r.credential_cipher),limitations:[
    'Upserts only: deletion and lost-scope tombstones are not exported; destination retention and deletion remain owner obligations.',
    'Storage exports use CSV. Warehouse loads use an atomic MERGE into a pre-existing table with ticket projection columns; no DDL.',
    'Maximum 10000 current scoped rows and 8 MiB per run; larger populations refuse without partial data.',
    ...((destination.provider==='gcs'||destination.provider==='bigquery')&&destination.credentialMode==='oauth'?['Owner-supplied OAuth access tokens expire; use service_account credentials for renewable nightly delivery.']:[]),
    ...(destination.provider==='azure'&&destination.authMode==='oauth'?['Owner-supplied Azure OAuth tokens expire; no automatic token refresh is configured.']:[]),
    ...(destination.provider==='snowflake'?['A lost submission response without a statement handle remains uncertain; automatic resubmission is blocked.']:[]),
  ]};
};
const runDto=({snapshot_json,...run}:BiRun)=>run;
const nextNight=()=>{const date=new Date();date.setUTCDate(date.getUTCDate()+1);date.setUTCHours(0,0,0,0);return date.toISOString();};
export async function listBiExports(ctx:WorkContext) {await reportOwner(ctx);return (await ctx.env.DB.prepare('SELECT * FROM work_bi_exports WHERE workspace_id=? ORDER BY consented_at DESC').bind(ctx.principal.workspaceId).all<BiExport>()).results.map(dto);}
export async function getBiExport(ctx:WorkContext,key:string) {
  await reportOwner(ctx);
  const record=await ctx.env.DB.prepare('SELECT * FROM work_bi_exports WHERE workspace_id=? AND id=? AND owner_id=?').bind(ctx.principal.workspaceId,key,ctx.principal.userId).first<BiExport>();
  if(!record)throw new ApiError(404,'not_found','Export unavailable');return record;
}
export async function createBiExport(ctx:WorkContext,input:Record<string,unknown>) {
  await reportOwner(ctx);
  if(input.consent!==true)throw new ApiError(422,'destination_consent','Explicit consent to nightly scoped ticket delivery to this exact destination is required');
  const {destination,credential}=biDestination(input),name=requiredString(input.name,'name',120),key=id();
  await biEffectGate(ctx,key);
  const cipher=await encryptSecret(ctx.env.ENCRYPTION_KEY,JSON.stringify(credential));
  await reportWrite(ctx,[ctx.env.DB.prepare('INSERT INTO work_bi_exports VALUES(?,?,?,?,?,?,1,1,?,?)').bind(key,ctx.principal.workspaceId,ctx.principal.userId,name,JSON.stringify(destination),cipher,nextNight(),now()),reportAudit(ctx,'bi.destination_consented',key,{provider:providerName(destination),destination,source:'tickets',format:isWarehouse(destination)?'rows':'csv',frequency:'nightly'})]);
  return dto(await getBiExport(ctx,key));
}
export async function biReceipts(ctx:WorkContext,key:string) {const record=await getBiExport(ctx,key);return {...dto(record),runs:(await ctx.env.DB.prepare('SELECT * FROM work_bi_runs WHERE workspace_id=? AND export_id=? ORDER BY created_at DESC').bind(ctx.principal.workspaceId,key).all<BiRun>()).results.map(runDto)};}
export async function setBiActive(ctx:WorkContext,key:string,input:Record<string,unknown>) {
  const row=await getBiExport(ctx,key);if(input.revision!==row.revision||typeof input.active!=='boolean')throw new ApiError(409,'revision_conflict','Current revision and active flag required');
  if(input.active&&!row.credential_cipher)throw new ApiError(409,'bi_credentials_required','Restored destinations require new credentials and fresh owner consent; create a new destination');
  await reportWrite(ctx,[ctx.env.DB.prepare('UPDATE work_bi_exports SET active=?,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=?').bind(Number(input.active),row.workspace_id,key,row.revision),reportAudit(ctx,'bi.schedule_changed',key,{active:input.active})]);return dto(await getBiExport(ctx,key));
}
async function finish(ctx:WorkContext,run:BiRun,state:string,reference:string|null,error:string|null) {
  const db=ctx.env.DB,t=state==='unknown'?null:now(),statements=[db.prepare("UPDATE work_bi_runs SET state=?,provider_ref=?,error=?,finished_at=? WHERE id=? AND workspace_id=? AND state IN ('dispatching','unknown')").bind(state,reference,error,t,run.id,run.workspace_id)];
  if(state==='delivered')statements.push(db.prepare(`INSERT INTO work_bi_checkpoints(workspace_id,export_id,row_id,row_sha256) SELECT ?,?,json_extract(value,'$.id'),json_extract(value,'$.sha256') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM work_bi_runs r JOIN work_bi_exports e ON e.id=r.export_id AND e.workspace_id=r.workspace_id WHERE r.id=? AND r.state='delivered') AND EXISTS(SELECT 1 FROM work_records w WHERE w.workspace_id=? AND w.id=json_extract(value,'$.id') AND NOT EXISTS(SELECT 1 FROM work_erasure x WHERE x.workspace_id=w.workspace_id AND x.person_id IN(w.requester_id,w.beneficiary_id))) ON CONFLICT(workspace_id,export_id,row_id) DO UPDATE SET row_sha256=excluded.row_sha256`).bind(run.workspace_id,run.export_id,run.snapshot_json,run.id,run.workspace_id));
  statements.push(db.prepare('UPDATE work_bi_exports SET next_at=? WHERE workspace_id=? AND id=?').bind(nextNight(),run.workspace_id,run.export_id),reportAudit(ctx,`bi.${state}`,run.export_id,{runId:run.id,rowCount:run.row_count,objectKey:run.object_key}));
  await db.batch(statements);
}
export async function runBiExport(ctx:WorkContext,key:string) {
  const record=await getBiExport(ctx,key);if(!record.active)throw new ApiError(409,'bi_paused','Export is paused');
  if(!record.credential_cipher)throw new ApiError(409,'bi_credentials_required','Fresh encrypted destination credentials and consent are required');
  await biEffectGate(ctx,key);
  const db=ctx.env.DB;
  if(await db.prepare("SELECT 1 FROM work_bi_runs WHERE export_id=? AND state IN ('dispatching','unknown')").bind(key).first())throw new ApiError(409,'bi_reconcile','An uncertain delivery needs readback before another export');
  const destination=JSON.parse(record.destination_json) as BiDestination,data=await biSnapshot(ctx,key,destination),runId=id(),deliveryKey=objectKey(destination,runId);
  const run:BiRun={id:runId,workspace_id:record.workspace_id,export_id:key,state:'dispatching',object_key:deliveryKey,payload_sha256:await hashToken(data.body),row_count:data.count,snapshot_json:JSON.stringify(data.hashes),provider_ref:null,error:null,created_at:now(),finished_at:null};
  try {await reportWrite(ctx,[db.prepare('INSERT INTO work_bi_runs VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(run.id,run.workspace_id,key,run.state,deliveryKey,run.payload_sha256,run.row_count,run.snapshot_json,null,null,run.created_at,null),reportAudit(ctx,'bi.dispatch_started',key,{runId,rowCount:data.count})]);}
  catch(error){if(/UNIQUE constraint failed/i.test(String(error)))throw new ApiError(409,'bi_reconcile','Another run is already in progress');throw error;}
  // Re-read principal, consent, and exact source projection directly before crossing the network edge.
  let credential:BiCredential;
  try {
    credential=await providerCredential(destination,JSON.parse(await decryptSecret(ctx.env.ENCRYPTION_KEY,record.credential_cipher)) as BiCredential);
    const live=await getBiExport(ctx,key),fresh=await biSnapshot(ctx,key,destination);
    if(!live.active||live.revision!==record.revision||await hashToken(fresh.body)!==run.payload_sha256)throw new ApiError(409,'bi_scope_changed','Export scope or data changed before dispatch; no delivery attempted');
    await biEffectGate(ctx,key);
  }catch(error){await finish(ctx,run,'rejected',null,error instanceof ApiError?error.code:'configuration_error');if(error instanceof ApiError)throw error;throw new ApiError(409,'bi_credentials','Destination credentials could not be opened; no delivery attempted');}
  try {const outcome=await deliverBi(destination,credential,deliveryKey,runId,data.body,run.payload_sha256);await finish(ctx,run,outcome.state,outcome.reference,outcome.error);}
  catch {await finish(ctx,run,'unknown',null,`${providerName(destination)} response lost; reconcile this operation before another run`);}
  return runDto((await db.prepare('SELECT * FROM work_bi_runs WHERE id=?').bind(runId).first<BiRun>())!);
}
export async function reconcileBiExport(ctx:WorkContext,key:string) {
  const record=await getBiExport(ctx,key),run=await ctx.env.DB.prepare("SELECT * FROM work_bi_runs WHERE workspace_id=? AND export_id=? AND state IN ('dispatching','unknown') ORDER BY created_at DESC LIMIT 1").bind(record.workspace_id,key).first<BiRun>();
  if(!run)throw new ApiError(409,'bi_no_unknown','No uncertain delivery to reconcile');
  // Readback never resends an object. Stale dispatching rows are only reconciled after the network deadline.
  if(Date.now()-Date.parse(run.created_at)<30000)throw new ApiError(409,'bi_in_progress','Wait for the in-flight request to finish before reconciliation');
  const destination=JSON.parse(record.destination_json) as BiDestination;
  let credential:BiCredential;
  try {credential=await providerCredential(destination,JSON.parse(await decryptSecret(ctx.env.ENCRYPTION_KEY,record.credential_cipher)) as BiCredential);}
  catch(error){if(error instanceof ApiError)throw error;throw new ApiError(409,'bi_credentials','Destination credentials are unavailable');}
  await biEffectGate(ctx,key);
  try {const outcome=await readbackBi(destination,credential,run.object_key,run.id,run.payload_sha256,run.provider_ref);await finish(ctx,run,outcome.state,outcome.reference,outcome.error);}
  catch(error){if(error instanceof ApiError)throw error;throw new ApiError(409,'bi_unknown','Provider readback failed; delivery remains uncertain');}
  return biReceipts(ctx,key);
}
export async function processDueBiExports(env:Env) {
  const rows=(await env.DB.prepare('SELECT * FROM work_bi_exports WHERE active=1 AND next_at<=? ORDER BY next_at LIMIT 10').bind(now()).all<BiExport>()).results;
  for(const row of rows)try {await runBiExport({env,principal:{workspaceId:row.workspace_id,userId:row.owner_id,roles:['owner']}},row.id);}catch{/* Per-destination refusal stays isolated; no provider retry. */}
}

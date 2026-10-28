import { hashToken } from '../../platform/crypto';
import { ApiError } from '../../platform/http';
import type { WorkContext } from './core';
import { isWarehouse, type BiDestination } from './bi-destinations';
import { reportRows, reportSources } from './report-data';
import { reportCsv } from './report-files';

export async function biSnapshot(ctx:WorkContext,key:string,destination:BiDestination) {
  const source=await reportRows(ctx,'tickets');
  const erased=new Set((await ctx.env.DB.prepare(`SELECT r.id FROM work_records r WHERE r.workspace_id=? AND EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=r.workspace_id AND e.person_id IN(r.requester_id,r.beneficiary_id))`).bind(ctx.principal.workspaceId).all<{id:string}>()).results.map(r=>r.id));
  const rows=source.filter(r=>!erased.has(String(r.id))),checkpoints=new Map((await ctx.env.DB.prepare('SELECT row_id,row_sha256 FROM work_bi_checkpoints WHERE workspace_id=? AND export_id=?').bind(ctx.principal.workspaceId,key).all<{row_id:string;row_sha256:string}>()).results.map(r=>[r.row_id,r.row_sha256]));
  const hashes=await Promise.all(rows.map(async row=>({id:String(row.id),sha256:await hashToken(JSON.stringify(row))})));
  const changed=rows.filter((row,i)=>checkpoints.get(String(row.id))!==hashes[i].sha256);
  const body=isWarehouse(destination)?JSON.stringify(changed):reportCsv([...reportSources.tickets],changed);
  if(new TextEncoder().encode(body).length>8*1024*1024)throw new ApiError(422,'bi_size','Export payload exceeds 8 MiB; no partial delivery was attempted');
  return {body,hashes:hashes.filter(h=>checkpoints.get(h.id)!==h.sha256),count:changed.length};
}

import { retireD1ImportCustody, upgradeD1ImportErasureIndex, sha256, type D1Sql } from '../../../modules/import-kit/src/d1/index';
import type { ErasurePort } from '../retention';
import { importContext } from './context';
import { ApiError } from '../../../platform/http';
import { loadPlans } from '../../../modules/import-kit/src/d1/plans';

/** Owner erasure withdraws whole artifacts linked to affected source records, not forged rewritten originals. */
export const freshserviceErasurePort: ErasurePort = {name:'freshservice-import',async erase(ctx,identity) {
  const w=ctx.principal.workspaceId, hash=sha256(identity);
  const tombstone=await ctx.env.DB.prepare('SELECT 1 FROM adoption_tombstones WHERE workspace_id=? AND identity_hash=?').bind(w,hash).first();
  if(!tombstone)throw new Error('ERASURE_TOMBSTONE_REQUIRED');
  const inventory=(await ctx.env.DB.prepare('SELECT * FROM freshservice_import_items WHERE workspace_id=? ORDER BY work_id').bind(w).all()).results;
  const items=(await ctx.env.DB.prepare('SELECT i.work_id FROM freshservice_import_items i JOIN work_records w ON w.id=i.work_id AND w.workspace_id=i.workspace_id WHERE i.workspace_id=? AND (EXISTS(SELECT 1 FROM json_each(i.identities_json) WHERE value=?) OR (length(?)>3 AND (instr(lower(w.title),lower(?))>0 OR EXISTS(SELECT 1 FROM work_messages m WHERE m.workspace_id=i.workspace_id AND m.work_id=i.work_id AND instr(lower(m.body),lower(?))>0))))').bind(w,hash,identity,identity,identity).all<{work_id:string}>()).results;
  const mentions=(value:unknown):boolean=> typeof value==='string' ? value===identity || (identity.length>3 && value.toLowerCase().includes(identity.toLowerCase())) : !!value&&typeof value==='object'&&Object.values(value).some(mentions);
  const affectedOriginals=new Set<string>();
  const linkedArtifacts=(record:{payload:unknown}):string[]=>{if(!mentions(record.payload))return [];const hashes=(record.payload as {sourceArtifacts?:unknown}).sourceArtifacts;if(!Array.isArray(hashes)||!hashes.every(h=>typeof h==='string'))throw new Error('SOURCE_ARTIFACT_RELATION_MISSING');return hashes;};
  const source=(record:{payload:unknown})=>{const hashes=linkedArtifacts(record);if(hashes.some(hash=>!affectedOriginals.has(hash)))throw new Error('SOURCE_ARTIFACT_CLOSURE_CHANGED');return mentions(record.payload);};
  const native:D1Sql[]=items.flatMap(({work_id})=>[
    {sql:"UPDATE work_records SET title='[erased]',context_json='{}',requester_id='[erased]',beneficiary_id='[erased]',revision=revision+1 WHERE workspace_id=? AND id=?",params:[w,work_id]},
    {sql:"UPDATE work_messages SET body='[erased]',author_id='[erased]' WHERE workspace_id=? AND work_id=?",params:[w,work_id]},
    {sql:'DELETE FROM freshservice_import_items WHERE workspace_id=? AND work_id=?',params:[w,work_id]},
  ]);
  const context=await importContext(ctx,'freshservice-erasure');
  const upgrade=await upgradeD1ImportErasureIndex(context,4);
  if(!upgrade.complete)throw new ApiError(409,'freshservice_erasure_index_pending','Import erasure index advanced; resume this erasure job');
  // Resolve the linked byte closure before entering the kit. Matchers stay pure;
  // a newly observed affected artifact aborts instead of escaping this erasure.
  const jobs=(await ctx.env.DB.prepare('SELECT * FROM ik_jobs WHERE destination=?').bind(w).all()).results;
  for(const job of jobs){const plan=(await loadPlans([job],context.storage.database)).get(String(job.id))!;for(const entry of plan.entries)linkedArtifacts(entry.source).forEach(hash=>affectedOriginals.add(hash));}
  native.unshift({sql:`SELECT CASE WHEN (SELECT COUNT(*) FROM freshservice_import_items WHERE workspace_id=?)=? AND NOT EXISTS(SELECT 1 FROM json_each(?) e LEFT JOIN freshservice_import_items i ON i.workspace_id=? AND i.work_id=json_extract(e.value,'$.work_id') WHERE i.import_revision IS NOT json_extract(e.value,'$.import_revision') OR i.identities_json IS NOT json_extract(e.value,'$.identities_json')) THEN 1 ELSE json('FRESHSERVICE_ERASURE_INVENTORY_CHANGED') END`,params:[w,inventory.length,JSON.stringify(inventory),w]});
  try { await retireD1ImportCustody({target:{kind:'work',id:'freshservice-erasure:'+hash},values:[identity],related:{source,original:(_bytes,original)=>affectedOriginals.has(original.sha256)}},native,context,[{sql:'INSERT INTO freshservice_import_privacy VALUES(?,1) ON CONFLICT(workspace_id) DO UPDATE SET revision=revision+1',params:[w]}]); }
  catch(error){const message=error instanceof Error?error.message:'';throw new ApiError(409,/^[A-Z][A-Z0-9_]+$/.test(message)?message:'freshservice_erasure_failed','Freshservice source erasure remains pending; reconcile retained import custody');}
}};

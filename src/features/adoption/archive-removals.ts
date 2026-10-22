import { archiveLocalOrigin,archiveTombstone,isArchiveTombstone } from '../history/archive-identity-crypto.mjs';
import { check,identityHash,type AdoptionContext } from './core';
import type { NativeRecord } from './import';

export const removalTables=new Set(['adoption_tombstones','work_erasure','platform_identity_erasures','history_identity_tombstones']);
export function archiveRemoval(record:NativeRecord):string|null {
 if(!removalTables.has(record.table))return null;
 const value=record.table==='work_erasure'?record.row.person_id:record.table==='history_identity_tombstones'?record.row.digest:record.row.identity_hash;
 check(typeof value==='string'&&!!value,'invalid_tombstone');
 return record.table+':'+value;
}

/** Carried foreign removals have no live identity authority, but an older
 * snapshot from that source may never discard them. No digest is inverted. */
export async function assertPreservedArchiveRemovals(ctx:AdoptionContext,sourceWorkspace:string,incoming:Set<string>) {
 const w=ctx.principal.workspaceId;
 const saved=(await ctx.env.DB.prepare("SELECT table_name,row_json FROM adoption_history WHERE workspace_id=? AND source_id=? AND table_name IN ('adoption_tombstones','work_erasure','platform_identity_erasures','history_identity_tombstones') AND state<>'erased'").bind(w,'linen:'+sourceWorkspace).all<{table_name:string;row_json:string}>()).results;
 for(const item of saved){const row=JSON.parse(item.row_json);if(!Object.keys(row).length)continue;const marker=archiveRemoval({table:item.table_name,key:'',row});check(marker&&incoming.has(marker),'erasure_invalidated_snapshot',409);}
 if(sourceWorkspace!==w)return;
 const origin=await archiveLocalOrigin(ctx.env);
 for(const table of removalTables){
  const rows=(await ctx.env.DB.prepare(`SELECT * FROM ${table} WHERE workspace_id=?`).bind(w).all<Record<string,any>>()).results;
  for(let row of rows){
   if(table==='work_erasure')row={...row,person_id:isArchiveTombstone(row.person_id)?row.person_id:await archiveTombstone(ctx.env,w,await identityHash(row.person_id),origin)};
   if(['adoption_tombstones','platform_identity_erasures'].includes(table))row={...row,identity_hash:await archiveTombstone(ctx.env,w,row.identity_hash,origin)};
   const marker=archiveRemoval({table,key:'',row});check(marker&&incoming.has(marker),'erasure_invalidated_snapshot',409);
  }
 }
}

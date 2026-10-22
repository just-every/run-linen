import { captureArchivePrivacyState } from './archive-fence';
import { archiveHmac,archiveIdentityDigest,archiveLocalOrigin,archiveTombstone,isArchiveAlias,isArchiveTombstone,archiveIdentityMatches } from '../history/archive-identity-crypto.mjs';
import { prepareArchiveIdentityProjection } from '../history/archive-identities.mjs';
import { historyArchiveRow } from '../history/archive';
import { identityMatcher } from '../history/identity';
import { legacyIdentityContent } from '../history/redact';
import { projectArchiveContent } from './archive-content';
import { archiveReferences,archiveRowKey,mapArchiveRow,archiveTableSchema } from './archive-schema';
import { check,identityHash,type AdoptionContext,type Row } from './core';
import type { NativeRecord } from './import';
import { ApiError } from '../../platform/http';

/** A private checkpoint, never an identity inventory or exported key. */
export async function archivePrivacyRevision(ctx:AdoptionContext) {
 const snapshot=await captureArchivePrivacyState(ctx);
 return archivePrivacyStateRevision(ctx,snapshot.rows);
}

export async function archivePrivacyStateRevision(ctx:AdoptionContext,rows:unknown) {
 return 'ap1:'+await archiveHmac(ctx.env,'linen/archive/privacy-checkpoint/v1',ctx.principal.workspaceId,rows);
}

/** Earlier safe archives remain usable until this workspace has a removal. */
export async function assertExportPrivacy(ctx:AdoptionContext,metadata:Record<string,unknown>) {
 const revision=await archivePrivacyRevision(ctx);
 if(metadata.privacyRevision!==undefined)check(metadata.privacyRevision===revision,'erasure_invalidated_snapshot',409);
 else {
  const w=ctx.principal.workspaceId;
  check(!await ctx.env.DB.prepare('SELECT 1 FROM adoption_tombstones WHERE workspace_id=? UNION ALL SELECT 1 FROM work_erasure WHERE workspace_id=? UNION ALL SELECT 1 FROM history_identity_tombstones WHERE workspace_id=? LIMIT 1').bind(w,w,w).first(),'erasure_invalidated_snapshot',409);
 }
 return revision;
}

export async function archiveIdentityMatcher(ctx:AdoptionContext,sourceWorkspace=ctx.principal.workspaceId) {
 const match=await identityMatcher(ctx.env,ctx.principal.workspaceId);
 const work=(await ctx.env.DB.prepare('SELECT person_id FROM work_erasure WHERE workspace_id=?').bind(ctx.principal.workspaceId).all<{person_id:string}>()).results;
 const exact=new Set(work.filter(r=>!isArchiveTombstone(r.person_id)).map(r=>r.person_id));
 const carried=(await ctx.env.DB.prepare('SELECT identity_hash FROM adoption_tombstones WHERE workspace_id=?').bind(ctx.principal.workspaceId).all<{identity_hash:string}>()).results.filter(r=>isArchiveTombstone(r.identity_hash));
 const mappings=(await ctx.env.DB.prepare('SELECT source_key,target_id FROM adoption_identity_map WHERE workspace_id=?').bind(ctx.principal.workspaceId).all<{source_key:string;target_id:string}>()).results;
 for(const mapping of mappings)if(exact.has(mapping.target_id)||await match(mapping.target_id))exact.add(mapping.source_key);
 const cache=new Map<string,boolean>();
 return async(value:string)=>{
  if(cache.has(value))return cache.get(value)!;
  let yes=exact.has(value)||await match(value);
  if(!yes)for(const row of carried)if(await archiveIdentityMatches(ctx.env,sourceWorkspace,value,row.identity_hash)){yes=true;break;}
  cache.set(value,yes);return yes;
 };
}

/** One projection for every legacy archive row; unknown identity content refuses. */
export async function archiveProjector(ctx:AdoptionContext,exportId?:string) {
 const w=ctx.principal.workspaceId,origin=await archiveLocalOrigin(ctx.env),matches=await archiveIdentityMatcher(ctx);
 const history=await prepareArchiveIdentityProjection(ctx.env),aliases=new Map<string,string>();
 const known=(await ctx.env.DB.prepare('SELECT digest,alias FROM history_archive_identity_digests WHERE workspace_id=? AND origin=?').bind(w,origin).all<{digest:string;alias:string}>()).results;
 const aliasRows=new Map<string,Row>();
 async function alias(value:string,slot:string) {
  if(isArchiveAlias(value))return value;
  const unknown=value==='[erased]'||value==='erased';
  const lookup=unknown?'slot:'+slot:value;
  if(aliases.has(lookup))return aliases.get(lookup)!;
  const digest=unknown?null:await archiveIdentityDigest(ctx.env,w,value);
  const result=known.find(r=>r.digest===digest)?.alias??'erased-a1-'+await archiveHmac(ctx.env,unknown?'linen/archive/domain-unattributed/v1':'linen/archive/alias/v1',origin,w,unknown?slot:value.trim().toLowerCase());
  const row={workspace_id:w,origin,alias:result,kind:unknown?'unattributed':'person',created_at:new Date().toISOString()};
  aliases.set(lookup,result);aliasRows.set(result,row);return result;
 }
 async function project(record:NativeRecord,depth=0):Promise<NativeRecord> {
  check(depth<20,'archive_nesting_limit');
  const original=record.row,table=record.table;
  let row=await projectArchiveContent(ctx,table,original,matches) as Row;
  if(table==='work_people'&&(await matches(String(original.id))||await matches(`${original.source}:${original.source_id}`)))
   row={...row,source_id:await alias(String(original.id),table+':'+record.key+':id')};
  if(table==='identities'&&Object.hasOwn(row,'source_id')&&await matches(String(original.id)))
   row={...row,source_id:await alias(String(original.id),table+':'+record.key+':id')};
  row=history.project(table,(await historyArchiveRow(ctx,table,row)).row) as Row;
  if(table==='adoption_history'&&typeof row.row_json==='string'){
   let nested:Row;try{nested=JSON.parse(row.row_json);}catch{check(false,'invalid_record_json');}
   if(Object.keys(nested!).length){
    const next=await project({table:String(row.table_name),key:String(row.source_key),row:nested!},depth+1);
    row={...row,row_json:JSON.stringify(next.row),source_key:next.key};
   }else if(typeof row.source_key==='string'&&await matches(row.source_key))row={...row,source_key:await alias(row.source_key,table+':'+record.key+':source_key')};
  }
  if(['adoption_tombstones','platform_identity_erasures'].includes(table))row={...row,identity_hash:await archiveTombstone(ctx.env,w,String(row.identity_hash),origin)};
  if(table==='work_erasure')row={...row,person_id:isArchiveTombstone(row.person_id)?row.person_id:await archiveTombstone(ctx.env,w,await identityHash(String(row.person_id)),origin)};
  if(table==='audit_events'&&['adoption.erase.request','adoption.erase.checkpoint'].includes(String(row.action))&&/^[a-f0-9]{64}$/.test(String(row.target)))row={...row,target:await archiveTombstone(ctx.env,w,String(row.target),origin)};
  const replacements=new Map<string,string>();
  for(const ref of archiveReferences({table,key:record.key,row}))if(ref.kind==='person'&&!isArchiveAlias(ref.value)&&(ref.value==='[erased]'||ref.value==='erased'||await matches(ref.value)))
   replacements.set(ref.field+'\0'+ref.value,await alias(ref.value,table+':'+record.key+':'+ref.field));
  row=mapArchiveRow(table,row,{person:(value,ref)=>replacements.get(ref.field+'\0'+value)??value}) as Row;
  const key=archiveTableSchema(table)?archiveRowKey(table,row):record.key;
  if(await legacyIdentityContent({key,row},matches)){
   let field='key';for(const [name,value]of Object.entries(row))if(await legacyIdentityContent({[name]:value},matches)){field=name;break;}
   throw new ApiError(409,'erasure_untyped_archive_content',`An erased identity remains in untyped archive field ${table}.${field}; reconcile that content before exporting`);
  }
  return {table,key,row};
 }
 async function flushAliases() {
  for(const row of aliasRows.values()){
   await ctx.env.DB.prepare('INSERT OR IGNORE INTO history_archive_aliases VALUES(?,?,?,?,?)').bind(w,row.origin,row.alias,row.kind,row.created_at).run();
   if(exportId){
    const key=archiveRowKey('history_archive_aliases',row);
    await ctx.env.DB.prepare("INSERT INTO adoption_snapshot(export_id,workspace_id,table_name,source_key,row_json) SELECT ?,?,'history_archive_aliases',?,? WHERE NOT EXISTS(SELECT 1 FROM adoption_snapshot WHERE export_id=? AND table_name='history_archive_aliases' AND source_key=?)").bind(exportId,w,key,JSON.stringify(row),exportId,key).run();
   }
  }
 }
 return {project,flushAliases};
}

/** Validate raw input before history normalization can hide a stale snapshot. */
export async function validateArchivePrivacy(ctx:AdoptionContext,record:NativeRecord,sourceWorkspace:string) {
 const matches=await archiveIdentityMatcher(ctx,sourceWorkspace);
 check(!await legacyIdentityContent({key:record.key,row:record.row},matches),'erasure_invalidated_snapshot',409);
}

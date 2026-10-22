import { erasedArchiveSlots as erasedSlots,archiveSlotValue as slotValue,validArchiveSlotPath } from './archive-identity-slots.mjs';
import { archiveLocalOrigin,archiveSlotKey,archivePersonPath,isArchiveAlias,erasedArchivePerson } from './archive-identity-crypto.mjs';
import { unattributedArchiveSlot } from './archive-identity-capture.mjs';
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const key=(workspace,origin,alias)=>JSON.stringify([workspace,origin,alias]);
const parsePayload=value=>{try{return JSON.parse(value);}catch{throw Error('Archive history payload is invalid');}};
function eventShape(table,row){
 if(table==='audit_events')return {store:'audit',id:row.id,column:'detail_json'};
 if(table==='svc_events')return {store:'service',id:row.id,column:'data_json'};
 if(table==='history_redactions'&&['audit','service'].includes(row.store))return {store:row.store,id:row.event_id,column:'envelope_json'};
 return null;
}
async function pageRows(db,table,visit){
 let after=0;
 for(;;){const rows=(await db.prepare(`SELECT rowid AS archive_rowid,* FROM ${quote(table)} WHERE rowid>? ORDER BY rowid LIMIT 100`).bind(after).all()).results;
  if(!rows.length)return;
  for(const row of rows)await visit(row);
  after=rows.at(-1).archive_rowid;
 }
}
function projector(slots){
 return (table,input)=>{
  const shape=eventShape(table,input);if(!shape)return input;
  const row={...input},payload=parsePayload(row[shape.column]);
  for(const path of erasedSlots(payload,row.actor_id)){
   const slot=slots.get(archiveSlotKey(row.workspace_id,shape.store,shape.id,path));
   if(!slot)throw Error('Archive erased-reference attribution is not prepared');
   if(path==='actor'){
    if(payload?.actor)payload.actor={...payload.actor,id:slot.alias,name:'Erased person'};
    if(Object.hasOwn(row,'actor_id')&&(row.actor_id==='[erased]'||isArchiveAlias(row.actor_id)))row.actor_id=slot.alias;
   }else if(path==='rowActor'){
    if(Object.hasOwn(row,'actor_id'))row.actor_id=slot.alias;
   }else if(path==='initiatedBy'){
    payload.actor={...payload.actor,initiatedBy:slot.alias};
   }else {
    const match=/^change:(.*):(before|after)$/.exec(path),change=payload.changes.find(value=>value.field===decodeURIComponent(match[1]));
    change[match[2]]={redacted:'erasure',person:true,alias:slot.alias};
   }
  }
  return {...row,[shape.column]:JSON.stringify(payload)};
 };
}
/** Prepare before RER's synchronous snapshot normalizer. No key or raw identity enters archive rows. */
export async function prepareArchiveIdentityProjection(env){
 const origin=await archiveLocalOrigin(env);
 const known=(await env.DB.prepare('SELECT * FROM history_archive_slots').all()).results;
 const slots=new Map(known.map(slot=>[archiveSlotKey(slot.workspace_id,slot.store,slot.event_id,slot.path),slot]));
 for(const table of ['audit_events','svc_events','history_redactions'])await pageRows(env.DB,table,async row=>{
  const shape=eventShape(table,row);if(!shape)return;
  const payload=parsePayload(row[shape.column]);
  for(const path of erasedSlots(payload,row.actor_id)){
   const id=archiveSlotKey(row.workspace_id,shape.store,shape.id,path);if(slots.has(id))continue;
   // Already-carried aliases are never reassigned to a different person or origin.
   const carried=slotValue(payload,path,row.actor_id)??(path==='actor'?row.actor_id:null);
   if(isArchiveAlias(carried))throw Error('Archive alias has no retained attribution');
   await env.DB.batch(await unattributedArchiveSlot(env,row.workspace_id,shape.store,shape.id,path,new Date().toISOString(),origin));
   const saved=await env.DB.prepare('SELECT * FROM history_archive_slots WHERE workspace_id=? AND store=? AND event_id=? AND path=?').bind(row.workspace_id,shape.store,shape.id,path).first();
   slots.set(id,saved);
  }
 });
 const project=projector(slots);
 return {project,validateStaged:async input=>{
  if(!await validateArchiveIdentityStaged(input))return false;
  // A known association cannot be deleted or reassigned by an older snapshot.
  const staged=input.tables.history_archive_slots;
  if(slots.size&&!staged)return false;
  for(const slot of slots.values())if(!await input.db.prepare(`SELECT 1 FROM ${quote(staged)} WHERE workspace_id=? AND store=? AND event_id=? AND path=? AND origin=? AND alias=?`)
   .bind(slot.workspace_id,slot.store,slot.event_id,slot.path,slot.origin,slot.alias).first())return false;
  return true;
 }};
}
/** The same typed slot schema validates incoming aliases; no directory or live identity is inferred. */
export async function validateArchiveIdentityStaged({db,tables}){
 const aliasTable=tables.history_archive_aliases,digestTable=tables.history_archive_identity_digests,slotTable=tables.history_archive_slots;
 if(!aliasTable&&!digestTable&&!slotTable){
  for(const table of ['audit_events','svc_events','history_redactions'])if(tables[table]){
   const column=table==='audit_events'?'detail_json':table==='svc_events'?'data_json':'envelope_json';
   if(await db.prepare(`SELECT 1 FROM ${quote(tables[table])} WHERE ${quote(column)} LIKE '%erased-a1-%' LIMIT 1`).first())return false;
  }
  return true;
 }
 if(!aliasTable||!digestTable||!slotTable)return false;
 const aliases=(await db.prepare(`SELECT * FROM ${quote(aliasTable)}`).all()).results;
 const available=new Set();
 for(const row of aliases){
  if(!/^[a-f0-9]{32}$/.test(row.origin)||!isArchiveAlias(row.alias)||!['person','unattributed'].includes(row.kind))return false;
  available.add(key(row.workspace_id,row.origin,row.alias));
 }
 const digests=(await db.prepare(`SELECT * FROM ${quote(digestTable)}`).all()).results;
 if(digests.some(row=>!/^ai1:[a-f0-9]{64}$/.test(row.digest)||!available.has(key(row.workspace_id,row.origin,row.alias))))return false;
 const slots=(await db.prepare(`SELECT * FROM ${quote(slotTable)}`).all()).results;
 const indexed=new Map();
 for(const row of slots){
  if(!['audit','service'].includes(row.store)||typeof row.event_id!=='string'||!row.event_id||!validArchiveSlotPath(row.path)||!available.has(key(row.workspace_id,row.origin,row.alias)))return false;
  indexed.set(archiveSlotKey(row.workspace_id,row.store,row.event_id,row.path),row);
 }
 for(const table of ['audit_events','svc_events','history_redactions'])if(tables[table]){
  let valid=true;
  await pageRows(db,tables[table],async row=>{
   if(!valid)return;
   const shape=eventShape(table,row);if(!shape)return;
   let payload;try{payload=parsePayload(row[shape.column]);}catch{valid=false;return;}
   function typedAliases(value,path=[]){
    if(typeof value==='string'&&isArchiveAlias(value))return path.length===2&&path[0]==='actor'&&['id','initiatedBy'].includes(path[1]);
    if(erasedArchivePerson(value))return Object.keys(value).every(name=>['redacted','person','alias'].includes(name))&&isArchiveAlias(value.alias);
    if(Array.isArray(value))return value.every((item,index)=>typedAliases(item,[...path,String(index)]));
    return !value||typeof value!=='object'||Object.entries(value).every(([name,item])=>typedAliases(item,[...path,name]));
   }
   if(!typedAliases(payload)){valid=false;return;}
   for(const path of erasedSlots(payload,row.actor_id)){
    const slot=indexed.get(archiveSlotKey(row.workspace_id,shape.store,shape.id,path));
    if(!slot){valid=false;return;}
    const value=slotValue(payload,path,row.actor_id)??(path==='actor'?row.actor_id:null);
    if(value!==slot.alias || ['actor','rowActor'].includes(path)&&Object.hasOwn(row,'actor_id')&&row.actor_id!==slot.alias){valid=false;return;}
   }
  });
  if(!valid)return false;
 }
 return true;
}

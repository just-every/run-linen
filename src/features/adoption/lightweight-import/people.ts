import type { Context,Hono } from 'hono';
import type { AppEnv } from '../../../platform/types';
import { ApiError,id,now } from '../../../platform/http';
import { canonicalJson,sha256 } from '../../../modules/import-kit/src/d1/index';
import { identityMatcher } from '../../history/identity';
import { readCsv } from '../csv';
import { importBody } from '../body';
import { requestContext } from '../freshservice-import/context';
import { readFile,account,sourceId,timestamp,requireInput } from './files';

interface Person {id:string;sourceId:string;name:string;effectiveAt:string;observedAt:string}
const omissions=[
  {reason:'Source facts only: no account, member binding, manager, HR feed authority, lifecycle, access policy or notification is created. Match current accounts separately in Linen.'},
  {reason:'Only id, name, effective_at and observed_at are imported. Email, roles, managers and custom fields are omitted. The file is not retained.'},
];
async function review(c:Context<AppEnv>,body:Record<string,unknown>) {
  const slug=account(body.account),source=`csv:${slug}`,context=await requestContext(c,`csv-people:${c.get('principal').workspaceId}:${slug}`);
  const file=readFile(body.file),rows=readCsv(file.text,['id','name','effective_at','observed_at'],requireInput);
  requireInput(rows.length>0&&rows.length<=1000,'Supply 1–1,000 people per reviewed import');
  const seen=new Set<string>(),people:Person[]=rows.map(row=>{
    const key=sourceId(row.id);requireInput(!seen.has(key),'Duplicate person source ID');seen.add(key);
    requireInput(row.name.trim().length>0&&row.name.length<=999,'A person name of 1–999 characters required');
    return {id:'csvp_'+sha256(canonicalJson([context.destination,source,key])).slice(0,40),sourceId:key,name:row.name,effectiveAt:timestamp(row.effective_at),observedAt:timestamp(row.observed_at)};
  });
  const existing=(await c.env.DB.prepare('SELECT source_id,id FROM work_people WHERE workspace_id=? AND source=? AND source_id IN (SELECT value FROM json_each(?)) ORDER BY source_id').bind(context.destination,source,JSON.stringify([...seen])).all<{source_id:string;id:string}>()).results;
  requireInput(body.skipIds===undefined||Array.isArray(body.skipIds)&&body.skipIds.every((v:unknown)=>typeof v==='string'),'skipIds must be a list of conflicting source IDs');
  const skip=new Set<string>((body.skipIds??[]) as string[]);
  for(const key of skip)requireInput(existing.some(p=>p.source_id===key),'Only an existing source identity may be skipped');
  const conflicts=existing.map(p=>({sourceId:p.source_id,personId:p.id,resolution:skip.has(p.source_id)?'skip':null}));
  const ready=people.filter(p=>!existing.some(e=>e.source_id===p.sourceId));
  const matches=await identityMatcher(c.env,context.destination);
  for(const person of people)for(const value of [person.id,person.sourceId,person.name,`${source}:${person.sourceId}`])
    if(await matches(value))throw new ApiError(409,'identity_erased','Source includes an erased identity; supply a sanitized export');
  requireInput(!(await c.env.DB.prepare('SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id IN (SELECT value FROM json_each(?))').bind(context.destination,JSON.stringify(people.flatMap(p=>[p.id,`${source}:${p.sourceId}`]))).first()),'Erased source identities cannot be replayed');
  const privacy={history:(await c.env.DB.prepare('SELECT digest FROM history_identity_tombstones WHERE workspace_id=? ORDER BY digest').bind(context.destination).all()).results,legacy:(await c.env.DB.prepare('SELECT identity_hash FROM adoption_tombstones WHERE workspace_id=? ORDER BY identity_hash').bind(context.destination).all()).results};
  const fingerprint=sha256(canonicalJson({format:'linen-csv-people-v1',destination:context.destination,source,file:{name:file.name,hash:file.hash},people,conflicts,privacy}));
  const report={fingerprint,counts:{rows:people.length,ready:ready.length,conflicts:conflicts.length,unresolved:conflicts.filter(p=>!p.resolution).length},conflicts,omissions:[...omissions,...Object.keys(rows[0]).filter(k=>!['id','name','effective_at','observed_at'].includes(k)).map(field=>({field,reason:'Not imported'}))]};
  return {context,file,people,ready,source,privacy,report};
}
async function apply(c:Context<AppEnv>,body:Record<string,unknown>) {
  const {context,file,people,ready,source,privacy,report}=await review(c,body);
  if(body.reviewedFingerprint!==report.fingerprint)throw new ApiError(409,'csv_review_changed','The file, decisions or destination changed; review again');
  if(report.counts.unresolved)throw new ApiError(409,'csv_conflicts_unresolved','Resolve every existing identity as skip before apply; importing never overwrites people');
  requireInput(body.acceptOmissions===true,'Explicitly accept the omissions');requireInput(ready.length>0,'Nothing to import');
  const db=c.env.DB,w=context.destination,actor=c.get('principal').userId,guard=id(),at=now(),authority=context.authorization.predicate('apply',w);
  const privacyJson=JSON.stringify(privacy),keys=JSON.stringify(ready.map(p=>p.sourceId)),personJson=JSON.stringify(ready);
  try{await db.batch([
    db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN (${authority.sql})
      AND NOT EXISTS(SELECT 1 FROM work_people WHERE workspace_id=? AND source=? AND source_id IN (SELECT value FROM json_each(?)))
      AND NOT EXISTS(SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id IN (SELECT value FROM json_each(?)))
      AND json(?)=json_object('history',json((SELECT json_group_array(json_object('digest',digest)) FROM (SELECT digest FROM history_identity_tombstones WHERE workspace_id=? ORDER BY digest))),
        'legacy',json((SELECT json_group_array(json_object('identity_hash',identity_hash)) FROM (SELECT identity_hash FROM adoption_tombstones WHERE workspace_id=? ORDER BY identity_hash))))
      THEN 1 ELSE 0 END)`).bind(guard,...authority.params??[],w,source,keys,w,JSON.stringify(people.flatMap(p=>[p.id,`${source}:${p.sourceId}`])),privacyJson,w,w),
    db.prepare(`INSERT INTO work_people(id,workspace_id,source,source_id,name,effective_at,observed_at)
      SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.sourceId'),json_extract(value,'$.name'),json_extract(value,'$.effectiveAt'),json_extract(value,'$.observedAt') FROM json_each(?)`).bind(w,source,personJson),
    db.prepare(`INSERT INTO audit_events SELECT ?,?,?,'adoption.csv.people',?,?,?`).bind(id(),w,actor,file.hash,JSON.stringify({created:ready.length,personIds:ready.map(p=>p.id),source}),at),
    db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard),
  ]);}catch(error){if(String(error).includes('CHECK constraint failed')||String(error).includes('UNIQUE constraint failed'))throw new ApiError(409,'csv_review_changed','Owner authority, source or destination changed; review again');throw error;}
  return {created:ready.length,people:ready.map(p=>({id:p.id,sourceId:p.sourceId}))};
}
export function registerPeopleCsvImportRoutes(app:Hono<AppEnv>) {
  const base='/adoption/csv-imports/people';
  app.post(base+'/dry-run',async c=>{c.header('Cache-Control','private, no-store');return c.json((await review(c,await importBody(c.req.raw))).report);});
  app.post(base,async c=>{c.header('Cache-Control','private, no-store');return c.json(await apply(c,await importBody(c.req.raw)),201);});
}

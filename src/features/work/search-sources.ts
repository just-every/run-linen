import { personForMember } from './person-binding';
import { ApiError } from '../../platform/http';
import { getService } from '../services/store';
import { operator, type WorkContext, type WorkRecord } from './core';
import { workReadable, workPrivateReadable } from './scope';
import { searchKnowledge } from './knowledge';

export const searchTypes = ['ticket','person','asset','ci','change','problem','catalog','article'] as const;
export type SearchType = typeof searchTypes[number];
export interface SearchDocument {
  id: string; type: SearchType; title: string; summary: string; href: string | null; fields: string[]; identityKind?: 'person' | 'member';
}
const strings = (...values: unknown[]) => values.filter((v): v is string => typeof v === 'string' && !!v);
function group<T>(rows:T[], key:(row:T)=>string) {
  const groups=new Map<string,T[]>();
  for (const row of rows) { const k=key(row);const existing=groups.get(k);if(existing)existing.push(row);else groups.set(k,[row]); }
  return groups;
}
/** Read projections, not a second index. Each source retains its current door's scope. */
export async function searchDocuments(ctx: WorkContext): Promise<SearchDocument[]> {
  const {env,principal:p}=ctx, db=env.DB, w=p.workspaceId, out:SearchDocument[]=[];
  const [work, messages, people, members, assets, repairs, duties, catalog, services, articles] = await Promise.all([
    db.prepare(`SELECT w.*,u.name requester_name FROM work_records w LEFT JOIN users u ON u.id=w.requester_id WHERE w.workspace_id=?`).bind(w).all<WorkRecord & {requester_name:string}>(),
    db.prepare('SELECT work_id,body,visibility FROM work_messages WHERE workspace_id=?').bind(w).all<{work_id:string;body:string;visibility:string}>(),
    db.prepare('SELECT id,name,member_id,binding_id,active,merged_into FROM work_people WHERE workspace_id=?').bind(w).all<{id:string;name:string;member_id:string|null;binding_id:string|null;active:number;merged_into:string|null}>(),
    db.prepare('SELECT u.id,u.name FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND m.active=1').bind(w).all<{id:string;name:string}>(),
    db.prepare('SELECT id,serial,asset_tag,person_id,state,location FROM work_assets WHERE workspace_id=?').bind(w).all<{id:string;serial:string;asset_tag:string|null;person_id:string|null;state:string;location:string|null}>(),
    db.prepare('SELECT work_id,asset_id FROM work_asset_repairs WHERE workspace_id=?').bind(w).all<{work_id:string;asset_id:string}>(),
    db.prepare('SELECT work_id,target FROM work_obligations WHERE workspace_id=?').bind(w).all<{work_id:string;target:string}>(),
    db.prepare('SELECT id,name,kind,target FROM work_catalog WHERE workspace_id=?').bind(w).all<{id:string;name:string;kind:string;target:string}>(),
    db.prepare("SELECT id,kind FROM svc_records WHERE workspace_id=? AND kind IN ('service','change','problem')").bind(w).all<{id:string;kind:'service'|'change'|'problem'}>(),
    searchKnowledge(ctx,'',null),
  ]);
  const deviceRows=operator(p)?assets.results:[];
  const devices=new Map(deviceRows.map(a=>[a.id,a]));
  const messagesByWork=group(messages.results,m=>m.work_id),repairsByWork=group(repairs.results,r=>r.work_id),
    dutiesByWork=group(duties.results,d=>d.work_id),devicesByPerson=group(deviceRows,a=>a.person_id||'');
  for (const row of work.results.filter(r=>workReadable(p,r))) {
    const privateAllowed=workPrivateReadable(p,row);
    const content=(messagesByWork.get(row.id)||[]).filter(m=>m.visibility==='public'||privateAllowed).map(m=>m.body);
    const context=JSON.parse(row.context_json || '{}');
    const linkedIds=new Set([
      ...(repairsByWork.get(row.id)||[]).map(r=>r.asset_id),
      ...(dutiesByWork.get(row.id)||[]).map(r=>r.target),
      ...strings(context.assetId),
    ]);
    const related=[...linkedIds].flatMap(id=>{const a=devices.get(id);return a?strings(a.serial,a.asset_tag):[];});
    out.push({id:row.id,type:'ticket',title:row.title,summary:`${row.state} · ${row.requester_name || 'Requester unavailable'}`,
      href:`#/work/${encodeURIComponent(row.id)}`,fields:strings(row.id,row.title,row.requester_name,...content,...related)});
  }
  if(!p.roles.some(r=>['owner','operator','hr'].includes(r)))return out;
  for (const a of deviceRows) out.push({id:a.id,type:'asset',title:a.serial,summary:strings(a.asset_tag,a.state,a.location).join(' · '),
    href:`#/assets/${encodeURIComponent(a.id)}`,fields:strings(a.id,a.serial,a.asset_tag)});
  const boundMembers=new Map<string,{id:string;name:string}>();
  for (const member of members.results) {
    const person=await personForMember(ctx,member.id);
    if(person)boundMembers.set(person.id,member);
  }
  for (const person of people.results) {
    const assigned=devicesByPerson.get(person.id)||[];
    out.push({id:person.id,type:'person',identityKind:'person',title:person.name,summary:assigned.length?`Assigned devices: ${assigned.map(a=>a.serial).join(', ')}`:'Recorded person',
      href:null,fields:strings(person.id,person.name,boundMembers.get(person.id)?.name,...assigned.flatMap(a=>strings(a.serial,a.asset_tag)))});
  }
  const representedMembers=new Set([...boundMembers.values()].map(member=>member.id));
  for (const member of members.results) if (!representedMembers.has(member.id))
    out.push({id:member.id,type:'person',identityKind:'member',title:member.name,summary:'Active workspace member',href:null,fields:strings(member.id,member.name)});
  for (const c of catalog.results) out.push({id:c.id,type:'catalog',title:c.name,summary:c.kind,href:null,fields:strings(c.id,c.name,c.target)});
  for (const candidate of services.results) {
    try {
      const record=await getService(db,p,candidate.id,candidate.kind), d=record.data;
      const type=record.kind==='service'?'ci':record.kind as 'change'|'problem';
      out.push({id:record.id,type,title:d.name || d.title,summary:strings(d.ciType,d.state,d.causeState).join(' · '),
        href:`#/${record.kind==='service'?'services':record.kind==='change'?'changes':'problems'}/${encodeURIComponent(record.id)}`,
        fields:strings(record.id,d.name,d.title,d.description,d.businessImpact,d.symptoms,d.cause,d.impact)});
    } catch (error) { if (!(error instanceof ApiError)||![403,404].includes(error.status)) throw error; }
  }
  for (const a of articles) out.push({id:a.id,type:'article',title:a.title,summary:'Reviewed knowledge',href:`#/knowledge?q=${encodeURIComponent(a.title)}`,fields:strings(a.id,a.title,a.body)});
  return out;
}

import { ApiError, id, now } from '../../platform/http';
import { permit, type WorkContext, type WorkRecord } from './core';
import { pendingPerson } from './pending-people';
export const pendingHoldReason='Waiting for this person to sign in with their verified email account';
export async function preparePendingRequest(ctx:WorkContext,input:{pendingPersonId?:string;catalogIds?:string[];beneficiaryId?:string;body:string;kind?:string}) {
 if(!input.pendingPersonId) {
  if(input.catalogIds!==undefined)throw new ApiError(422,'pending_person_required','Selected services on creation require a pending person');
  return null;
 }
 permit(ctx,['owner','operator','hr']);
 if(input.beneficiaryId || input.kind==='incident' || !Array.isArray(input.catalogIds) || !input.catalogIds.length || input.catalogIds.length>30 || input.catalogIds.some(c=>typeof c!=='string'||!c) || new Set(input.catalogIds).size!==input.catalogIds.length)
 throw new ApiError(422,'pending_request_input','Pending person and distinct selected catalogue services required; do not supply an account beneficiary');
 const person=await pendingPerson(ctx,input.pendingPersonId);
 if(!person || person.state!=='pending' || !person.active || person.merged_into || person.member_id)
 throw new ApiError(409,'pending_person_unavailable','Current unbound pending person required');
 const db=ctx.env.DB,w=ctx.principal.workspaceId,items=(await db.prepare('SELECT id,revision FROM work_catalog WHERE workspace_id=? AND id IN (SELECT value FROM json_each(?))').bind(w,JSON.stringify(input.catalogIds)).all<{id:string;revision:number}>()).results;
 if(items.length!==input.catalogIds.length)throw new ApiError(404,'catalog_unavailable','Selected catalogue service is unavailable');
 return {person,statements:(workId:string)=> {
  const t=now(),guard=id();
  return [
   db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM work_people p JOIN work_pending_people h ON h.workspace_id=p.workspace_id AND h.id=p.id WHERE p.workspace_id=? AND p.id=? AND p.revision=? AND p.member_id IS NULL AND p.active=1 AND p.merged_into IS NULL AND h.state='pending')
   AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value IN ('owner','operator','hr'))
   AND (SELECT COUNT(*) FROM work_catalog WHERE workspace_id=? AND (id,revision) IN (SELECT json_extract(value,'$.id'),json_extract(value,'$.revision') FROM json_each(?)))=? THEN 1 ELSE 0 END)`).bind(guard,w,person.id,person.revision,w,ctx.principal.userId,w,JSON.stringify(items),items.length),
   ...items.flatMap(c=>[
    db.prepare(`INSERT OR IGNORE INTO work_pending_services SELECT ?,?,?,?,'held',?,?,?,NULL WHERE EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=?)`).bind(w,workId,c.id,person.id,pendingHoldReason,input.body,t,w,workId),
    db.prepare(`INSERT INTO audit_events SELECT ?,?,?,'work.pending_service_held',?,?,? WHERE changes()=1`).bind(id(),w,ctx.principal.userId,workId,JSON.stringify({personId:person.id,catalogId:c.id}),t),
   ]),
   db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard),
  ];
 }};
}
export async function pendingRequestSnapshot(ctx:WorkContext,work:WorkRecord & {pending_person_id?:string|null}) {
 if(!work.pending_person_id)return {pendingPerson:null,heldServices:[]};
 const person=await pendingPerson(ctx,work.pending_person_id);
 // The beneficiary sees their own reviewed starter details after authentication.
 const heldServices=(await ctx.env.DB.prepare(`SELECT h.catalog_id,c.name,c.kind,h.state,h.reason FROM work_pending_services h JOIN work_catalog c
 ON c.workspace_id=h.workspace_id AND c.id=h.catalog_id WHERE h.workspace_id=? AND h.work_id=? ORDER BY c.name`).bind(ctx.principal.workspaceId,work.id).all()).results;
 return {pendingPerson:person,heldServices};
}

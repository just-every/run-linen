import {ticketHistory} from './work-history';
import { ApiError, id, now } from '../../platform/http';
import { platformAdmissionGuard } from '../../platform/privacy';
import { permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';
import { attributeDimensions, normalizeAttributes, validateValues } from './catalog-audience';

export const pendingPersonSelect = `SELECT p.*,h.email,h.start_date,h.team,h.state,h.reviewed_by,h.reviewed_at,h.bound_at,h.withdrawn_at
 FROM work_people p JOIN work_pending_people h ON h.workspace_id=p.workspace_id AND h.id=p.id`;
export async function pendingPerson(ctx: WorkContext, personId: string) {
 return ctx.env.DB.prepare(`${pendingPersonSelect} WHERE p.workspace_id=? AND p.id=?`).bind(ctx.principal.workspaceId,personId).first<any>();
}
export function pendingReviewerGuard(ctx: WorkContext, guardId: string) {
 return ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(
 SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1
 AND r.value IN ('owner','operator','hr')) THEN 1 ELSE 0 END)`).bind(guardId,ctx.principal.workspaceId,ctx.principal.userId);
}
function facts(input: {name:string;email:string;startDate:string;team:string;reviewed:boolean}) {
 if(input.reviewed!==true || typeof input.name!=='string' || !input.name.trim() || input.name.length>120 ||
 typeof input.email!=='string' || input.email.length>320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) ||
 typeof input.team!=='string' || !input.team.trim() || input.team.length>120 ||
 typeof input.startDate!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ||
 !Number.isFinite(Date.parse(input.startDate)) || new Date(input.startDate).toISOString().slice(0,10)!==input.startDate)
 throw new ApiError(422,'pending_person_input','Review name, valid email, start date and team');
 return {name:input.name.trim(),email:input.email.trim().toLowerCase(),startDate:input.startDate,team:input.team.trim()};
}
export async function listPendingPeople(ctx: WorkContext) {
 await currentWorkPrincipal(ctx);permit(ctx,['owner','operator','hr']);
 return (await ctx.env.DB.prepare(`${pendingPersonSelect} WHERE p.workspace_id=? ORDER BY h.state,h.start_date,p.name`).bind(ctx.principal.workspaceId).all()).results;
}
export async function savePendingPerson(ctx: WorkContext,input: Parameters<typeof facts>[0] & {expectedRevision?:number;attributes?:unknown},personId?:string) {
 await currentWorkPrincipal(ctx);permit(ctx,['owner','operator','hr']);
 // CATALOG-007: reviewed department, location and employment type gate audience-controlled services; owner or HR only, never inferred.
 const reviewsAttributes=Object.hasOwn(input,'attributes');
 if(reviewsAttributes)permit(ctx,['owner','hr']);
 const attributes=reviewsAttributes?normalizeAttributes(input.attributes):{},values=await validateValues(ctx,Object.fromEntries(attributeDimensions.map(d=>[d,attributes[d]?[attributes[d]]:[]])));
 const value=facts(input),db=ctx.env.DB,w=ctx.principal.workspaceId,t=now(),pid=personId||id(),guard=id(),reviewGuard=id(),valueGuard=id();
 const previous=personId?await pendingPerson(ctx,pid):null;
 if(personId && (!previous || previous.state!=='pending' || previous.revision!==input.expectedRevision || !previous.active || previous.merged_into))
 throw new ApiError(409,'revision_conflict','Current unbound pending person required');
 const admission=await platformAdmissionGuard(db,w,pid,value.email);
 const linked=(await db.prepare('SELECT * FROM work_records WHERE workspace_id=? AND pending_person_id=?').bind(w,pid).all<any>()).results;
 try {await db.batch([
 pendingReviewerGuard(ctx,reviewGuard),
 db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN ${values.sql} THEN 1 ELSE 0 END)`).bind(valueGuard,...values.bindings),
 db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN ${admission.sql}
 AND (?=1 OR NOT EXISTS(SELECT 1 FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND m.active=1 AND lower(trim(u.email))=?))
 ${personId?`AND EXISTS(SELECT 1 FROM work_people p JOIN work_pending_people h ON h.workspace_id=p.workspace_id AND h.id=p.id WHERE p.workspace_id=? AND p.id=? AND p.revision=? AND h.state='pending' AND p.member_id IS NULL AND p.active=1 AND p.merged_into IS NULL)`:''}
 THEN 1 ELSE 0 END)`).bind(guard,...admission.bindings,Number(!!previous && previous.email===value.email),w,value.email,...(personId?[w,pid,input.expectedRevision]:[])),
 personId?db.prepare('UPDATE work_people SET name=?,effective_at=?,observed_at=?,attributes_json=CASE WHEN ?=1 THEN ? ELSE attributes_json END,revision=revision+1 WHERE workspace_id=? AND id=?').bind(value.name,value.startDate+'T00:00:00.000Z',t,Number(reviewsAttributes),JSON.stringify(attributes),w,pid):
 db.prepare(`INSERT INTO work_people(id,workspace_id,source,source_id,name,effective_at,observed_at,attributes_json) VALUES(?,?,'pending-reviewed',?,?,?,?,?)`).bind(pid,w,pid,value.name,value.startDate+'T00:00:00.000Z',t,JSON.stringify(attributes)),
 personId?db.prepare('UPDATE work_pending_people SET email=?,start_date=?,team=?,reviewed_by=?,reviewed_at=? WHERE workspace_id=? AND id=?').bind(value.email,value.startDate,value.team,ctx.principal.userId,t,w,pid):
 db.prepare('INSERT INTO work_pending_people(workspace_id,id,email,start_date,team,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?,?)').bind(w,pid,value.email,value.startDate,value.team,ctx.principal.userId,t),
 ...linked.flatMap(work=>{const context=JSON.parse(work.context_json);return [db.prepare(`UPDATE work_records SET context_json=json_set(context_json,'$.requestedFor',?,'$.team',?,'$.neededBy',?),revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?`).bind(value.name,value.team,value.startDate,t,w,work.id,work.revision),ticketHistory(ctx,work,'work.requested_for_updated',{requestedFor:context.requestedFor??null,team:context.team??null,neededBy:context.neededBy??null},{requestedFor:value.name,team:value.team,neededBy:value.startDate},t)];}),
 db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),w,ctx.principal.userId,personId?'work.pending_person_edited':'work.pending_person_created',pid,JSON.stringify({revision:(previous?.revision||0)+1,reviewed:true,...(reviewsAttributes?{attributeDimensions:Object.keys(attributes)}:{})}),t),
 db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard),
 // Review guards are transaction-local and carry no continuing authority.
 db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id IN (?,?)').bind(reviewGuard,valueGuard),
 ]);}catch(error){if(/constraint|pending_person/i.test(String(error)))throw new ApiError(409,'pending_person_conflict','Person, account, email or reviewer changed; reload before reviewing');throw error;}
 return pendingPerson(ctx,pid);
}
export async function withdrawPendingPerson(ctx: WorkContext,personId:string,input:{expectedRevision:number;reason:string}) {
 await currentWorkPrincipal(ctx);permit(ctx,['owner','operator','hr']);
 if(!Number.isSafeInteger(input.expectedRevision)||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>2000)
 throw new ApiError(422,'pending_person_input','Current revision and withdrawal reason required');
 const db=ctx.env.DB,w=ctx.principal.workspaceId,t=now(),guard=id(),reviewGuard=id();
 const linked=(await db.prepare("SELECT * FROM work_records WHERE workspace_id=? AND pending_person_id=? AND state<>'cancelled'").bind(w,personId).all<any>()).results;
 try {await db.batch([
 pendingReviewerGuard(ctx,reviewGuard),
 db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM work_people p JOIN work_pending_people h
 ON h.workspace_id=p.workspace_id AND h.id=p.id WHERE p.workspace_id=? AND p.id=? AND p.revision=? AND h.state='pending' AND p.member_id IS NULL) THEN 1 ELSE 0 END)`).bind(guard,w,personId,input.expectedRevision),
 db.prepare("UPDATE work_pending_people SET state='withdrawn',withdrawn_at=? WHERE workspace_id=? AND id=?").bind(t,w,personId),
 db.prepare('UPDATE work_people SET active=0,revision=revision+1 WHERE workspace_id=? AND id=?').bind(w,personId),
 ...linked.flatMap(work=>[db.prepare("UPDATE work_records SET state='cancelled',revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?").bind(t,w,work.id,work.revision),ticketHistory(ctx,work,'work.transitioned',{state:work.state},{state:'cancelled'},t)]),
 db.prepare(`INSERT INTO audit_events SELECT 'withdraw-hold:'||work_id||':'||catalog_id,workspace_id,?,'work.pending_service_cancelled',work_id,json_object('catalogId',catalog_id,'personId',person_id),? FROM work_pending_services WHERE workspace_id=? AND person_id=? AND state='held'`).bind(ctx.principal.userId,t,w,personId),
 db.prepare("UPDATE work_pending_services SET state='cancelled',reason='Pending person withdrawn' WHERE workspace_id=? AND person_id=? AND state='held'").bind(w,personId),
 db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),w,ctx.principal.userId,'work.pending_person_withdrawn',personId,JSON.stringify({reason:input.reason,revision:input.expectedRevision+1}),t),
 db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id IN (?,?)').bind(guard,reviewGuard),
 ]);}catch(error){if(/constraint/i.test(String(error)))throw new ApiError(409,'revision_conflict','Person already bound, withdrawn or changed');throw error;}
 return pendingPerson(ctx,personId);
}

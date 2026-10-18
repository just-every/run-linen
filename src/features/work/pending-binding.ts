import type { Env, Role } from '../../platform/types';
import { id, now } from '../../platform/http';
import { platformAdmissionGuard } from '../../platform/privacy';
import { bindingErasureGuard } from './person-binding';
import { requestFulfilment } from './requests';
import { pendingPerson } from './pending-people';

/** Called only after normal authentication. A current persisted session and
 * credential version are checked again in the binding transaction. Neither
 * member creation nor a reviewed name/email alone admits an account link. */
export async function authenticatePendingPerson(env:Env,input:{workspaceId:string;userId:string;sessionId:string}) {
 const db=env.DB,w=input.workspaceId,uid=input.userId,t=now();
 const account=await db.prepare(`SELECT u.email,m.roles_json FROM users u JOIN memberships m ON m.user_id=u.id
 JOIN platform_auth_versions v ON v.user_id=u.id JOIN sessions s ON s.user_id=u.id AND s.workspace_id=m.workspace_id
 JOIN platform_auth_session_proofs proof ON proof.session_id=s.id AND proof.version=v.version
 WHERE m.workspace_id=? AND u.id=? AND m.active=1 AND s.id=? AND s.expires_at>? AND proof.kind IN ('native','password','dev')`)
 .bind(w,uid,input.sessionId,t).first<{email:string;roles_json:string}>();
 if(!account)return;
 const ctx={env,principal:{workspaceId:w,userId:uid,roles:JSON.parse(account.roles_json) as Role[]}};
 // Native workspace imports map identities as historical nonmembers. Even an
 // already signed-in destination account needs fresh proof after materialization.
 const freshRestoreProof=`NOT EXISTS(SELECT 1 FROM work_restore_records restored WHERE restored.workspace_id=h.workspace_id
   AND restored.table_name='work_pending_people' AND restored.record_id=h.id
   AND restored.restored_at>(SELECT created_at FROM sessions WHERE id=?))`;
 const candidate=await db.prepare(`SELECT h.id FROM work_pending_people h JOIN work_people p ON p.workspace_id=h.workspace_id AND p.id=h.id WHERE h.workspace_id=? AND h.email=? AND h.state IN ('pending','bound') AND p.member_id IS NULL AND p.active=1 AND p.merged_into IS NULL AND ${freshRestoreProof}`).bind(w,account.email.trim().toLowerCase(),input.sessionId).first<{id:string}>();
 if(candidate) {
  const person=await pendingPerson(ctx,candidate.id);
  const admission=await platformAdmissionGuard(db,w,uid,account.email),erasure=await bindingErasureGuard(ctx,person,uid,null),guard=id(),bindingId=id();
  try {await db.batch([
   db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM work_people p JOIN work_pending_people h ON h.workspace_id=p.workspace_id AND h.id=p.id WHERE p.workspace_id=? AND p.id=? AND p.revision=? AND p.active=1 AND p.merged_into IS NULL AND p.member_id IS NULL AND h.state IN ('pending','bound') AND h.email=? AND ${freshRestoreProof})
   AND EXISTS(SELECT 1 FROM sessions s JOIN platform_auth_session_proofs proof ON proof.session_id=s.id JOIN platform_auth_versions v ON v.user_id=s.user_id AND v.version=proof.version JOIN users u ON u.id=s.user_id JOIN memberships m ON m.user_id=u.id AND m.workspace_id=s.workspace_id WHERE s.id=? AND s.user_id=? AND s.workspace_id=? AND s.expires_at>? AND m.active=1 AND lower(trim(u.email))=? AND proof.kind IN ('native','password','dev'))
   AND ${admission.sql} AND ${erasure.sql} THEN 1 ELSE 0 END)`).bind(guard,w,person.id,person.revision,account.email.trim().toLowerCase(),input.sessionId,input.sessionId,uid,w,t,account.email.trim().toLowerCase(),...admission.bindings,...erasure.bindings),
   db.prepare('UPDATE work_people SET member_id=?,binding_id=?,revision=revision+1 WHERE workspace_id=? AND id=?').bind(uid,bindingId,w,person.id),
   db.prepare("UPDATE work_pending_people SET state='bound',bound_at=? WHERE workspace_id=? AND id=?").bind(t,w,person.id),
   db.prepare('UPDATE work_records SET beneficiary_id=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND pending_person_id=?').bind(uid,t,w,person.id),
   db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),w,uid,'work.pending_person_bound',person.id,JSON.stringify({memberId:uid,bindingId,revision:person.revision+1}),t),
   db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard),
  ]);}catch(error){
   // A racing withdrawal, another sign-in, or an existing reviewed account link
   // must leave its holds intact. Do not replace an existing reviewed person.
   if(!/constraint|person_binding_invalid/i.test(String(error)))throw error;
  }
 }
 await releaseBoundServices(env,w,uid);
}

async function releaseBoundServices(env:Env,w:string,memberId:string) {
 const db=env.DB;
 const rows=(await db.prepare(`SELECT h.*,r.requester_id,r.state work_state,m.roles_json FROM work_pending_services h
 JOIN work_pending_people p ON p.workspace_id=h.workspace_id AND p.id=h.person_id AND p.state='bound'
 JOIN work_people person ON person.workspace_id=p.workspace_id AND person.id=p.id AND person.member_id=? AND person.binding_id IS NOT NULL
 JOIN work_records r ON r.workspace_id=h.workspace_id AND r.id=h.work_id AND r.beneficiary_id=person.member_id
 LEFT JOIN memberships m ON m.workspace_id=r.workspace_id AND m.user_id=r.requester_id AND m.active=1
 WHERE h.workspace_id=? AND h.state='held' ORDER BY h.created_at,h.catalog_id LIMIT 100`).bind(memberId,w).all<any>()).results;
 for(const row of rows) {
  if(['cancelled','closed'].includes(row.work_state))continue;
  if(await db.prepare("SELECT 1 FROM work_restore_records WHERE workspace_id=? AND table_name='work_records' AND record_id=?").bind(w,row.work_id).first()) {
   await db.prepare("UPDATE work_pending_services SET reason='Restored held service; reconcile source effects and review current fulfilment authority' WHERE workspace_id=? AND work_id=? AND catalog_id=? AND state='held'").bind(w,row.work_id,row.catalog_id).run();continue;
  }
  const roles=row.roles_json?JSON.parse(row.roles_json):[];
  if(!roles.some((r:string)=>['owner','operator','hr'].includes(r))) {
   await db.prepare("UPDATE work_pending_services SET reason='Request creator no longer has authority; service team must review' WHERE workspace_id=? AND work_id=? AND catalog_id=? AND state='held'").bind(w,row.work_id,row.catalog_id).run();continue;
  }
  const ctx={env,principal:{workspaceId:w,userId:row.requester_id,roles}};
  try {
   const result=await requestFulfilment(ctx,row.work_id,{catalogId:row.catalog_id,beneficiaryId:memberId,purpose:row.purpose});
   await db.batch([
    db.prepare(`UPDATE work_pending_services SET state='released',reason=?,released_at=? WHERE workspace_id=? AND work_id=? AND catalog_id=? AND state='held'`).bind(result.reason||'Account verified; normal service fulfilment checks apply',now(),w,row.work_id,row.catalog_id),
    db.prepare(`INSERT INTO audit_events SELECT ?,?,?,'work.pending_service_released',?,?,? WHERE changes()=1`).bind(id(),w,memberId,row.work_id,JSON.stringify({personId:row.person_id,catalogId:row.catalog_id,requesterId:row.requester_id,state:result.state}),now()),
   ]);
  }catch(error){
   await db.prepare("UPDATE work_pending_services SET reason=? WHERE workspace_id=? AND work_id=? AND catalog_id=? AND state='held'").bind(error instanceof Error?error.message:'Normal fulfilment requires review',w,row.work_id,row.catalog_id).run();
  }
 }
}

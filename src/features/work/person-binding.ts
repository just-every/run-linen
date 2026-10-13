import { hashToken } from '../../platform/crypto';
import { ApiError, id, now } from '../../platform/http';
import { currentWorkPrincipal } from './identity';
import { permit, type WorkContext } from './core';

/** No source/name/equal-ID inference at runtime. Only a reviewed current account link. */
export async function personForMember(ctx: WorkContext, memberId: string) {
  const person=await ctx.env.DB.prepare(`SELECT p.* FROM work_people p JOIN memberships m
    ON m.workspace_id=p.workspace_id AND m.user_id=p.member_id AND m.active=1
    WHERE p.workspace_id=? AND p.member_id=? AND p.binding_id IS NOT NULL
    AND p.active=1 AND p.merged_into IS NULL
    AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=p.workspace_id
      AND e.person_id IN (p.id,p.source||':'||p.source_id,p.member_id,'member:'||p.member_id))`)
    .bind(ctx.principal.workspaceId,memberId).first<any>();
  if(!person)return null;
  const admission=await bindingErasureGuard(ctx,person,memberId,person.manager_id);
  return await ctx.env.DB.prepare('SELECT 1 WHERE '+admission.sql).bind(...admission.bindings).first()?person:null;
}

export async function bindingErasureGuard(ctx: WorkContext, person: any, memberId: string | null, managerId: string | null) {
  const w=ctx.principal.workspaceId,identities=[person.id,`${person.source}:${person.source_id}`];
  for(const member of [memberId,managerId])if(member) {
    identities.push(member);
    const user=await ctx.env.DB.prepare('SELECT u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND m.user_id=?').bind(w,member).first<{email:string}>();
    if(user)identities.push(user.email,user.email.trim().toLowerCase());
  }
  const hashes=await Promise.all([...new Set(identities)].map(hashToken));
  return {sql:`NOT EXISTS(SELECT 1 FROM adoption_tombstones WHERE workspace_id=? AND identity_hash IN (${hashes.map(()=>'?').join(',')}))`,bindings:[w,...hashes]};
}

export async function reviewPersonBinding(ctx: WorkContext, personId: string, input: {
  expectedRevision: number; memberId: string | null; managerId?: string | null;
}) {
  await currentWorkPrincipal(ctx);
  permit(ctx,['owner','hr']);
  if(!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision<1 ||
    !(input.memberId===null || (typeof input.memberId==='string' && input.memberId.length>0)) ||
    !(input.managerId===undefined || input.managerId===null || (typeof input.managerId==='string' && input.managerId.length>0)))
    throw new ApiError(422,'person_binding_input','Current revision and explicit memberId (or null to unbind) required');
  const db=ctx.env.DB,w=ctx.principal.workspaceId,bindingId=id(),guard=id();
  const person=await db.prepare('SELECT * FROM work_people WHERE workspace_id=? AND id=?').bind(w,personId).first<any>();
  if(!person || person.revision!==input.expectedRevision || (input.memberId!==null && (!person.active || person.merged_into)))
    throw new ApiError(409,'revision_conflict','Current active unmerged person required');
  const manager=input.memberId===null?null:input.managerId===undefined?person.manager_id:input.managerId;
  const admission=await bindingErasureGuard(ctx,person,input.memberId,manager);
  try {
    await db.batch([
      db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN
        EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value IN ('owner','hr'))
        AND EXISTS(SELECT 1 FROM work_people WHERE workspace_id=? AND id=? AND revision=? AND (? IS NULL OR (active=1 AND merged_into IS NULL)))
        AND (? IS NULL OR EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1))
        AND (? IS NULL OR ${admission.sql})
        THEN 1 ELSE 0 END)`).bind(guard,w,ctx.principal.userId,w,personId,input.expectedRevision,input.memberId,manager,w,manager,input.memberId,...admission.bindings),
      db.prepare('UPDATE work_people SET member_id=?,binding_id=?,manager_id=?,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=?')
        .bind(input.memberId,input.memberId?bindingId:null,manager,w,personId,input.expectedRevision),
      db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),w,ctx.principal.userId,'work.person_binding_reviewed',personId,
        JSON.stringify({memberId:input.memberId,previousMemberId:person.member_id,bindingId:input.memberId?bindingId:null,managerId:manager,revision:input.expectedRevision+1}),now()),
      db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard),
    ]);
  } catch(error) {
    if(/constraint|person_binding_invalid/i.test(String(error)))throw new ApiError(409,'person_binding_conflict','Person, reviewer or membership changed, or member already bound; reload and review');
    throw error;
  }
  return db.prepare('SELECT * FROM work_people WHERE workspace_id=? AND id=?').bind(w,personId).first();
}

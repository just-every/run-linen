import { personForMember } from './person-binding';
import { currentWorkPrincipal } from "./identity";
import { ApiError, id, now } from '../../platform/http';
import { getWork, type WorkContext, type WorkRecord } from './core';
import { resolveManager } from './delegation';
import type { Step } from '../execution/types';

/** Business approval is separate from the provider action grant; neither manufactures the other. */
export async function fulfilmentManagerApproval(ctx: WorkContext, work: WorkRecord, catalog: any,
  fulfilment: { id?: string; revision?: number; beneficiary_id: string; purpose: string; expires_at: string | null }, step?: Step) {
  if(!catalog.requires_manager)return {allowed:true,holderId:null};
  const db=ctx.env.DB,w=ctx.principal.workspaceId;
  const person=await personForMember(ctx,fulfilment.beneficiary_id);
  const holder=await resolveManager(ctx,person?.manager_id||null);
  if(!holder)return {allowed:false,holderId:null};
  const approval=fulfilment.id ? await db.prepare(`SELECT 1 FROM work_fulfilment_approvals a WHERE a.workspace_id=?
    AND a.work_id=? AND a.fulfilment_id=? AND a.work_revision=? AND a.fulfilment_revision=? AND a.catalog_revision=?
    AND a.person_revision=? AND a.person_id=? AND a.binding_id=? AND a.manager_id=? AND a.holder_id=? AND a.beneficiary_id=? AND a.purpose=?
    AND EXISTS(SELECT 1 FROM work_people p
      JOIN memberships employee ON employee.workspace_id=p.workspace_id AND employee.user_id=p.member_id AND employee.active=1
      JOIN memberships manager ON manager.workspace_id=p.workspace_id AND manager.user_id=p.manager_id AND manager.active=1
      WHERE p.workspace_id=a.workspace_id AND p.id=a.person_id AND p.member_id=a.beneficiary_id
      AND p.binding_id=a.binding_id AND p.revision=a.person_revision AND p.manager_id=a.manager_id AND p.active=1 AND p.merged_into IS NULL
      AND a.holder_id=COALESCE((SELECT d.delegate_id FROM work_delegations d
        JOIN memberships holder ON holder.workspace_id=d.workspace_id AND holder.user_id=d.delegate_id AND holder.active=1
        WHERE d.workspace_id=p.workspace_id AND d.manager_id=p.manager_id AND d.revoked_at IS NULL
        AND d.starts_at<=? AND d.expires_at>? ORDER BY d.starts_at DESC LIMIT 1),p.manager_id))
    AND (a.expires_at IS NULL OR (? IS NOT NULL AND a.expires_at>=?))
    AND (a.grant_id IS NULL OR EXISTS(SELECT 1 FROM execution_grants g WHERE g.workspace_id=a.workspace_id
      AND g.id=a.grant_id AND g.version=a.grant_version AND g.issuer_id=a.holder_id
      AND g.valid_from<=? AND g.valid_until>? AND (? IS NULL OR (g.id=? AND g.version=?))
      AND NOT EXISTS(SELECT 1 FROM execution_grant_revocations r WHERE r.workspace_id=g.workspace_id AND r.grant_id=g.id AND r.version=g.version)
      AND NOT EXISTS(SELECT 1 FROM execution_grants n WHERE n.workspace_id=g.workspace_id AND n.id=g.id AND n.version>g.version)))`)
    .bind(w,work.id,fulfilment.id,work.revision,fulfilment.revision,catalog.revision,person.revision,person.id,person.binding_id,
      person.manager_id,holder,fulfilment.beneficiary_id,fulfilment.purpose,now(),now(),fulfilment.expires_at,fulfilment.expires_at,
      now(),now(),step?.grantId||null,step?.grantId||null,step?.grantVersion||null).first():null;
  return {allowed:!!approval,holderId:holder};
}

export async function assertWorkFulfilmentAuthority(ctx: WorkContext, step: Step, planId: string) {
  if(!['group.add','license.add'].includes(step.action))return;
  const db=ctx.env.DB,w=ctx.principal.workspaceId;
  const kind=step.action==='group.add'?'access':'software';
  const beneficiary=step.localBeneficiaryId||step.beneficiaryId;
  if(await db.prepare(`SELECT 1 FROM work_pending_people h WHERE h.workspace_id=? AND (h.id=? OR (h.state<>'bound' AND h.email=(SELECT lower(trim(email)) FROM users WHERE id=?)))`).bind(w,beneficiary,beneficiary).first())
    throw new ApiError(409,'pending_person_unbound','A pending person cannot receive provider access before normal account authentication');
  const pendingWork=planId.startsWith('work:')?{work_id:planId.slice(5),context_type:'work'}:
    await db.prepare('SELECT work_id,context_type FROM execution_plans WHERE workspace_id=? AND id=?').bind(w,planId).first<any>();
  if(pendingWork?.context_type==='work' && await db.prepare(`SELECT 1 FROM work_records r JOIN work_pending_people h ON h.workspace_id=r.workspace_id AND h.id=r.pending_person_id JOIN work_people p ON p.workspace_id=h.workspace_id AND p.id=h.id WHERE r.workspace_id=? AND r.id=? AND (h.state<>'bound' OR p.member_id IS NULL OR p.member_id<>r.beneficiary_id OR p.binding_id IS NULL)`).bind(w,pendingWork.work_id).first())
    throw new ApiError(409,'pending_person_unbound','Pending person services cannot execute before verified account binding');
  const requiresManager=await db.prepare('SELECT 1 FROM work_catalog WHERE workspace_id=? AND target=? AND kind=? AND requires_manager=1 LIMIT 1')
    .bind(w,step.target,kind).first();
  if(!requiresManager)return;
  const plan=planId.startsWith('work:')?{work_id:planId.slice(5),context_type:'work'}:
    await db.prepare('SELECT work_id,context_type FROM execution_plans WHERE workspace_id=? AND id=?').bind(w,planId).first<any>();
  if(!plan || plan.context_type!=='work')return;
  // The caller is an execution actor; ACL for the originating requester was checked by dispatch.
  const work=await db.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=?').bind(w,plan.work_id).first<WorkRecord>();
  if(!work)return;
  const rows=(await db.prepare(`SELECT c.*,f.id fulfilment_id,f.revision fulfilment_revision,f.beneficiary_id,f.purpose,f.expires_at
    FROM work_fulfilments f JOIN work_catalog c ON c.workspace_id=f.workspace_id AND c.id=f.catalog_id
    WHERE f.workspace_id=? AND f.work_id=? AND c.target=? AND c.kind=? AND f.beneficiary_id=?`)
    .bind(w,work.id,step.target,kind,step.localBeneficiaryId||'').all<any>()).results;
  if(!rows.some(row=>row.requires_manager) || rows.some(row=>!row.requires_manager) || step.localBeneficiaryId!==work.beneficiary_id)
    throw new ApiError(403,'manager_approval_required','Exact catalogue fulfilment and beneficiary required for manager approval');
  for(const row of rows) {
    if((step.expiresAt||null)!==row.expires_at)
      throw new ApiError(403,'manager_approval_required','Execution expiry must match the approved current fulfilment');
    const approval=await fulfilmentManagerApproval(ctx,work,row,{id:row.fulfilment_id,revision:row.fulfilment_revision,
      beneficiary_id:row.beneficiary_id,purpose:row.purpose,expires_at:row.expires_at},step);
    if(!approval.allowed)throw new ApiError(403,'manager_approval_required','Current scoped manager approval required; manager identity is not approval');
  }
}

export interface FulfilmentApprovalInput {
  catalogId:string;expectedWorkRevision:number;expectedFulfilmentRevision:number;idempotencyKey:string;
  expectedCatalogRevision:number;expectedPersonId:string;expectedPersonRevision:number;expectedBindingId:string;expectedHolderId:string;
}
export async function approveFulfilment(ctx: WorkContext, workId: string, input: FulfilmentApprovalInput) {
  await currentWorkPrincipal(ctx);
  if(await ctx.env.DB.prepare('SELECT 1 FROM work_bundle_requests WHERE workspace_id=? AND work_id=?').bind(ctx.principal.workspaceId,workId).first())
    throw new ApiError(409,'bundle_decision_required','Approve a bundle with one decision covering every item that needs approval');
  const prepared=await prepareFulfilmentApproval(ctx,workId,input);
  if(prepared.statements.length)await ctx.env.DB.batch(prepared.statements);
  return {id:prepared.approvalId,state:'approved' as const};
}
/** Checks one manager approval and returns its guarded writes, so a bundle can record several in one atomic batch (CATALOG-004). */
export async function prepareFulfilmentApproval(ctx: WorkContext, workId: string, input: FulfilmentApprovalInput) {
  const db=ctx.env.DB,w=ctx.principal.workspaceId;
  const work=await db.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=?').bind(w,workId).first<WorkRecord>();
  if(!work)throw new ApiError(404,'not_found','Work not found');
  const f=await db.prepare('SELECT * FROM work_fulfilments WHERE workspace_id=? AND work_id=? AND catalog_id=?').bind(w,workId,input.catalogId).first<any>();
  const catalog=await db.prepare('SELECT * FROM work_catalog WHERE workspace_id=? AND id=?').bind(w,input.catalogId).first<any>();
  if(!f||!catalog)throw new ApiError(404,'not_found','Fulfilment not found');
  if(!catalog.requires_manager || ['closed','cancelled'].includes(work.state) || (f.expires_at && f.expires_at<=now()))
    throw new ApiError(409,'approval_unavailable','Only active unexpired manager-required fulfilments can be approved');
  const person=await personForMember(ctx,f.beneficiary_id);
  const holder=await resolveManager(ctx,person?.manager_id||null);
  if(holder!==ctx.principal.userId || holder===f.beneficiary_id)throw new ApiError(403,'manager_approval_denied','Current independent manager or delegated decision holder required');
  if(work.revision!==input.expectedWorkRevision||f.revision!==input.expectedFulfilmentRevision||!input.idempotencyKey)
    throw new ApiError(409,'revision_conflict','Exact current work and fulfilment revisions required');
  if(catalog.revision!==input.expectedCatalogRevision || person.id!==input.expectedPersonId ||
    person.revision!==input.expectedPersonRevision || person.binding_id!==input.expectedBindingId || holder!==input.expectedHolderId)
    throw new ApiError(409,'revision_conflict','Review the current catalogue and person binding before approving');
  const previous=await db.prepare('SELECT * FROM work_fulfilment_approvals WHERE workspace_id=? AND work_id=? AND event_key=?').bind(w,workId,input.idempotencyKey).first<any>();
  if(previous) {
    if(previous.fulfilment_id!==f.id||previous.work_revision!==work.revision||previous.fulfilment_revision!==f.revision||previous.catalog_revision!==catalog.revision||previous.person_revision!==person.revision||previous.person_id!==person.id||previous.binding_id!==person.binding_id||previous.holder_id!==holder)
      throw new ApiError(409,'idempotency_conflict','Approval event describes another authority revision');
    return {approvalId:previous.id as string,statements:[] as D1PreparedStatement[]};
  }
  const approvalId=id(),guard=id();
  return {approvalId,statements:[
    db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN
      EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=? AND revision=?) AND
      EXISTS(SELECT 1 FROM work_fulfilments WHERE workspace_id=? AND id=? AND revision=?) AND
      EXISTS(SELECT 1 FROM work_people WHERE workspace_id=? AND id=? AND revision=? AND member_id=? AND binding_id=? AND active=1 AND merged_into IS NULL) AND
      EXISTS(SELECT 1 FROM work_catalog WHERE workspace_id=? AND id=? AND revision=?) THEN 1 ELSE 0 END)`)
      .bind(guard,w,workId,work.revision,w,f.id,f.revision,w,person.id,person.revision,f.beneficiary_id,person.binding_id,w,catalog.id,catalog.revision),
    db.prepare('INSERT INTO work_fulfilment_approvals(id,workspace_id,work_id,fulfilment_id,work_revision,fulfilment_revision,catalog_revision,person_revision,manager_id,holder_id,beneficiary_id,purpose,expires_at,event_key,created_at,person_id,binding_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(approvalId,w,workId,f.id,work.revision,f.revision,catalog.revision,person.revision,person.manager_id,holder,f.beneficiary_id,f.purpose,f.expires_at,input.idempotencyKey,now(),person.id,person.binding_id),
    db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),w,ctx.principal.userId,'work.fulfilment_approved',approvalId,
      JSON.stringify({workId,fulfilmentId:f.id,catalogId:catalog.id,workRevision:work.revision,fulfilmentRevision:f.revision,
        catalogRevision:catalog.revision,personRevision:person.revision,managerId:person.manager_id,holderId:holder,
        beneficiaryId:f.beneficiary_id,expiresAt:f.expires_at}),now()),
    db.prepare('UPDATE work_records SET updated_at=? WHERE workspace_id=? AND id=?').bind(now(),w,workId),
    db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard)]};
}


/** Grant creation calls this after persisting the issued version. It captures the exact
 * business context the manager approved, never expands the provider grant. */
export async function recordWorkManagerGrantApproval(ctx: WorkContext, grantId: string, version: number) {
  await currentWorkPrincipal(ctx);
  const db=ctx.env.DB,w=ctx.principal.workspaceId;
  const grant=await db.prepare('SELECT * FROM execution_grants WHERE workspace_id=? AND id=? AND version=?')
    .bind(w,grantId,version).first<any>();
  if(!grant || grant.issuer_id!==ctx.principal.userId || !['group.add','license.add'].includes(grant.action))return;
  const workId=JSON.parse(grant.conditions_json).workId;
  if(!workId)return;
  const work=await db.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=?').bind(w,workId).first<WorkRecord>();
  if(!work || work.beneficiary_id!==grant.local_beneficiary_id)return;
  const rows=(await db.prepare(`SELECT f.*,c.revision catalog_revision FROM work_fulfilments f JOIN work_catalog c
    ON c.workspace_id=f.workspace_id AND c.id=f.catalog_id WHERE f.workspace_id=? AND f.work_id=?
    AND f.beneficiary_id=? AND c.target=? AND c.kind=? AND c.requires_manager=1`)
    .bind(w,workId,grant.local_beneficiary_id,grant.target,grant.action==='group.add'?'access':'software').all<any>()).results;
  const person=await personForMember(ctx,grant.local_beneficiary_id);
  const holder=await resolveManager(ctx,person?.manager_id||null);
  if(holder!==grant.issuer_id || holder===grant.local_beneficiary_id)return;
  for(const f of rows) {
    if(f.expires_at && grant.valid_until<=f.expires_at)continue;
    const approvalId=id(),at=now();
    await db.batch([db.prepare(`INSERT OR IGNORE INTO work_fulfilment_approvals
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=? AND revision=?)
      AND EXISTS(SELECT 1 FROM work_fulfilments WHERE workspace_id=? AND id=? AND revision=?)
      AND EXISTS(SELECT 1 FROM work_people WHERE workspace_id=? AND id=? AND revision=? AND member_id=? AND binding_id=? AND active=1 AND merged_into IS NULL)
      AND EXISTS(SELECT 1 FROM work_catalog WHERE workspace_id=? AND id=? AND revision=?)`)
      .bind(approvalId,w,workId,f.id,work.revision,f.revision,f.catalog_revision,person.revision,person.manager_id,holder,
        f.beneficiary_id,f.purpose,grant.valid_until,`standing:${grant.id}:${version}:${f.id}`,at,grant.id,version,person.id,person.binding_id,
        w,workId,work.revision,w,f.id,f.revision,w,person.id,person.revision,f.beneficiary_id,person.binding_id,w,f.catalog_id,f.catalog_revision),
      db.prepare('INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()=1')
        .bind(id(),w,ctx.principal.userId,'work.fulfilment_approved',approvalId,
          JSON.stringify({workId,fulfilmentId:f.id,catalogId:f.catalog_id,workRevision:work.revision,
            fulfilmentRevision:f.revision,catalogRevision:f.catalog_revision,holderId:holder,grantId:grant.id,grantVersion:version}),at)]);
  }
}

import {ticketHistory} from './work-history';
import { approvalGuard } from './approval-guard';
import { personForMember } from './person-binding';
import { currentWorkPrincipal } from "./identity";
import { ApiError, id, now } from '../../platform/http';
import { getWork, type WorkContext, type WorkRecord } from './core';
import { resolveManager } from './delegation';
import type { Step } from '../execution/types';
import { chainStatus, managerRejected, stagesOf,activateStageStatements } from './approval-chain';

/** Business approval is separate from the provider action grant; neither manufactures the other. */
type FulfilmentFacts = { id?: string; revision?: number; beneficiary_id: string; purpose: string; expires_at: string | null };
/** A decision witnesses the quote frozen in this exact fulfilment revision; no file name or content is copied. */
export function approvalQuoteWitness(fulfilment:{catalog_snapshot_json?:string|null}) {
  const quote=fulfilment.catalog_snapshot_json?JSON.parse(fulfilment.catalog_snapshot_json).quote:null;
  return quote?{quoteSha256:quote.sha256}:{};
}

/** The manager stage alone: the current manager, or their delegate while they are out of office, approved this exact revision. */
export async function managerStageAuthority(ctx: WorkContext, work: WorkRecord, catalog: any, fulfilment: FulfilmentFacts, step?: Step) {
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
        JOIN memberships holder ON holder.workspace_id=d.workspace_id AND holder.user_id=d.delegate_id AND holder.active=1 AND EXISTS(SELECT 1 FROM json_each(holder.roles_json) r WHERE r.value IN ('approver','owner'))
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
export const managerStageApproved = async (ctx: WorkContext, work: any, catalog: any, f: any) => (await managerStageAuthority(ctx, work, catalog, f)).allowed;
export async function managerHolder(ctx: WorkContext, f: { beneficiary_id: string }) {
  const person = await personForMember(ctx, f.beneficiary_id);
  return resolveManager(ctx, person?.manager_id || null);
}
/** The whole chain: the manager stage, then every applicable stage in order. Approval here is business approval only. */
export async function fulfilmentManagerApproval(ctx: WorkContext, work: WorkRecord, catalog: any, fulfilment: FulfilmentFacts, step?: Step) {
  const stages = stagesOf(catalog), manager = await managerStageAuthority(ctx, work, catalog, fulfilment, step);
  const refused = Boolean(fulfilment.id && catalog.requires_manager && await managerRejected(ctx, work, catalog, { id: fulfilment.id, revision: fulfilment.revision ?? 0 }));
  if (!stages.length && !fulfilment.id) return { allowed: manager.allowed && !refused, holderId: manager.holderId, pendingStage: null as string | null, rejected: refused };
  if (!fulfilment.id) return { allowed: false, holderId: manager.holderId, pendingStage: (manager.allowed ? stages[0].name : null) as string | null, rejected: false };
  const f = await ctx.env.DB.prepare('SELECT id,revision,beneficiary_id,application_json FROM work_fulfilments WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, fulfilment.id).first<any>();
  const chain = await chainStatus(ctx, work, catalog, { ...f, revision: fulfilment.revision ?? f.revision }, manager.allowed);
  return { allowed: manager.allowed && chain.satisfied && !refused, holderId: manager.holderId, pendingStage: (manager.allowed ? chain.pendingStages.map(s=>s.name).join(', ')||null : null) as string | null, rejected: chain.rejected || refused };
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
  const requiresManager=await db.prepare(`SELECT 1 FROM work_catalog WHERE workspace_id=? AND target=? AND kind=? AND (requires_manager=1 OR approvals_json<>'[]' OR EXISTS(SELECT 1 FROM work_fulfilments f JOIN work_approval_stages s ON s.workspace_id=f.workspace_id AND s.fulfilment_id=f.id WHERE f.workspace_id=work_catalog.workspace_id AND f.catalog_id=work_catalog.id)) LIMIT 1`)
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
  if(!rows.length || step.localBeneficiaryId!==work.beneficiary_id)
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
  expectedCatalogRevision:number;expectedPersonId:string;expectedPersonRevision:number;expectedBindingId:string;expectedHolderId:string;comment?:unknown;
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
export async function prepareFulfilmentApproval(ctx: WorkContext, workId: string, input: FulfilmentApprovalInput, channel: 'portal' | 'email' = 'portal') {
  const authorityGuard = await approvalGuard(ctx, workId, input.catalogId);
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
  if(await managerRejected(ctx,work,catalog,f))throw new ApiError(409,'approval_not_open','The manager rejected this revision; submit a revised request');
  const approvalId=id(),guard=id();
  return {approvalId,statements:[authorityGuard.start,
    db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN
      EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=? AND revision=?) AND
      EXISTS(SELECT 1 FROM work_fulfilments WHERE workspace_id=? AND id=? AND revision=?) AND
      EXISTS(SELECT 1 FROM work_people WHERE workspace_id=? AND id=? AND revision=? AND member_id=? AND binding_id=? AND active=1 AND merged_into IS NULL) AND
      EXISTS(SELECT 1 FROM work_catalog WHERE workspace_id=? AND id=? AND revision=?) THEN 1 ELSE 0 END)`)
      .bind(guard,w,workId,work.revision,w,f.id,f.revision,w,person.id,person.revision,f.beneficiary_id,person.binding_id,w,catalog.id,catalog.revision),
    db.prepare('INSERT INTO work_fulfilment_approvals(id,workspace_id,work_id,fulfilment_id,work_revision,fulfilment_revision,catalog_revision,person_revision,manager_id,holder_id,beneficiary_id,purpose,expires_at,event_key,created_at,person_id,binding_id,comment,channel) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(approvalId,w,workId,f.id,work.revision,f.revision,catalog.revision,person.revision,person.manager_id,holder,f.beneficiary_id,f.purpose,f.expires_at,input.idempotencyKey,now(),person.id,person.binding_id,
        typeof input.comment==='string'&&input.comment.trim()?input.comment.trim().slice(0,2000):null,channel),
    ...await openFirstStage(ctx,work,catalog,f),
    ticketHistory(ctx,work,'work.fulfilment_approved',null,{approval:{approvalId,catalogId:catalog.id,workRevision:work.revision,fulfilmentRevision:f.revision,catalogRevision:catalog.revision,holderId:holder},approvalOutcome:'approved',workRevision:work.revision,fulfilmentRevision:f.revision,catalogRevision:catalog.revision,holderId:holder,...approvalQuoteWitness(f)},now(),{target:approvalId,conditional:false}),
    db.prepare('UPDATE work_records SET updated_at=? WHERE workspace_id=? AND id=?').bind(now(),w,workId),
    db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard),authorityGuard.end]};
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
    await db.batch([db.prepare(`INSERT OR IGNORE INTO work_fulfilment_approvals(id,workspace_id,work_id,fulfilment_id,work_revision,fulfilment_revision,catalog_revision,person_revision,manager_id,holder_id,beneficiary_id,purpose,expires_at,event_key,created_at,grant_id,grant_version,person_id,binding_id)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=? AND revision=?)
      AND EXISTS(SELECT 1 FROM work_fulfilments WHERE workspace_id=? AND id=? AND revision=?)
      AND EXISTS(SELECT 1 FROM work_people WHERE workspace_id=? AND id=? AND revision=? AND member_id=? AND binding_id=? AND active=1 AND merged_into IS NULL)
      AND EXISTS(SELECT 1 FROM work_catalog WHERE workspace_id=? AND id=? AND revision=?)`)
      .bind(approvalId,w,workId,f.id,work.revision,f.revision,f.catalog_revision,person.revision,person.manager_id,holder,
        f.beneficiary_id,f.purpose,grant.valid_until,`standing:${grant.id}:${version}:${f.id}`,at,grant.id,version,person.id,person.binding_id,
        w,workId,work.revision,w,f.id,f.revision,w,person.id,person.revision,f.beneficiary_id,person.binding_id,w,f.catalog_id,f.catalog_revision),
      ticketHistory(ctx,work,'work.fulfilment_approved',null,{approval:{approvalId,catalogId:f.catalog_id,workRevision:work.revision,fulfilmentRevision:f.revision,catalogRevision:f.catalog_revision,holderId:holder,grantId:grant.id,grantVersion:version},approvalOutcome:'approved',workRevision:work.revision,fulfilmentRevision:f.revision,catalogRevision:f.catalog_revision,holderId:holder,grantVersion:version,...approvalQuoteWitness(f)},at,{target:approvalId})]);
  }
}

/** The first applicable stage after the manager opens at the manager's decision, counting its reminder and SLA from that instant. */
async function openFirstStage(ctx: WorkContext, work:WorkRecord,catalog:any,f:any) {
  const chain=await chainStatus(ctx,work,catalog,f,true);
  return activateStageStatements(ctx,f.id,chain.pendingStages,now());
}

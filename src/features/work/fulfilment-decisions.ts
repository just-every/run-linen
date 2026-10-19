import { currentWorkPrincipal } from './identity';
import { type WorkContext, type WorkRecord } from './core';
import { fulfilmentManagerApproval } from './fulfilment-authority';
import { now } from '../../platform/http';
export interface FulfilmentDecision {
  workId:string; title:string; catalogId:string; catalogName:string; beneficiaryId:string; beneficiaryName:string;
  requesterName:string; requestForName:string; serviceForOtherPerson:boolean;
  purpose:string; expiresAt:string|null; expectedWorkRevision:number; expectedFulfilmentRevision:number;
  expectedCatalogRevision:number; expectedPersonId:string; expectedPersonRevision:number; expectedBindingId:string;
  holderId:string; holderName:string; state:'needs_approval'; reason:string;
  /** CATALOG-004: set when the item is a bundle child; bundle children are approved together. */
  bundleName:string|null;
}
/** Only the current decision holder sees the minimal business scope, never conversation or context. */
export async function listFulfilmentDecisions(ctx: WorkContext): Promise<{items:FulfilmentDecision[]}> {
  await currentWorkPrincipal(ctx);
  const db=ctx.env.DB,w=ctx.principal.workspaceId;
  const candidates=(await db.prepare(`SELECT f.*,c.name catalog_name,c.revision catalog_revision,c.target,c.kind,c.requires_manager,
    r.title,r.revision work_revision,r.requester_id,r.beneficiary_id request_beneficiary_id,r.state work_state,p.name beneficiary_name,
    COALESCE(rq.name,'Unknown person') requester_name,COALESCE(rb.name,'Unknown person') request_for_name,
    p.id person_id,p.revision person_revision,p.binding_id person_binding_id,
    (SELECT b.name FROM work_bundle_requests br JOIN work_catalog_bundles b ON b.workspace_id=br.workspace_id AND b.id=br.bundle_id WHERE br.workspace_id=f.workspace_id AND br.work_id=f.work_id) bundle_name
    FROM work_fulfilments f JOIN work_catalog c ON c.workspace_id=f.workspace_id AND c.id=f.catalog_id
    JOIN work_records r ON r.workspace_id=f.workspace_id AND r.id=f.work_id
    LEFT JOIN users rq ON rq.id=r.requester_id LEFT JOIN users rb ON rb.id=r.beneficiary_id
    JOIN work_people p ON p.workspace_id=f.workspace_id AND p.member_id=f.beneficiary_id AND p.binding_id IS NOT NULL AND p.active=1 AND p.merged_into IS NULL
    WHERE f.workspace_id=? AND c.requires_manager=1 AND r.state NOT IN ('cancelled','closed')
    AND (f.expires_at IS NULL OR f.expires_at>?) AND (p.manager_id=? OR EXISTS(
      SELECT 1 FROM work_delegations d WHERE d.workspace_id=f.workspace_id AND d.manager_id=p.manager_id
      AND d.delegate_id=? AND d.revoked_at IS NULL AND d.starts_at<=? AND d.expires_at>?))
    ORDER BY r.created_at LIMIT 200`)
    .bind(w,now(),ctx.principal.userId,ctx.principal.userId,now(),now()).all<any>()).results;
  const holder=await db.prepare('SELECT name FROM users WHERE id=?').bind(ctx.principal.userId).first<{name:string}>();
  const items:FulfilmentDecision[]=[];
  for(const f of candidates) {
    const work={id:f.work_id,revision:f.work_revision} as WorkRecord;
    const authority=await fulfilmentManagerApproval(ctx,work,{...f,revision:f.catalog_revision},f);
    if(authority.allowed || authority.holderId!==ctx.principal.userId || f.beneficiary_id===ctx.principal.userId)continue;
    items.push({workId:f.work_id,title:f.title,catalogId:f.catalog_id,catalogName:f.catalog_name,beneficiaryId:f.beneficiary_id,
      beneficiaryName:f.beneficiary_name,requesterName:f.requester_name,requestForName:f.request_for_name,
      serviceForOtherPerson:f.beneficiary_id!==f.request_beneficiary_id,purpose:f.purpose,expiresAt:f.expires_at,expectedWorkRevision:f.work_revision,
      expectedFulfilmentRevision:f.revision,expectedCatalogRevision:f.catalog_revision,
      expectedPersonId:f.person_id,expectedPersonRevision:f.person_revision,expectedBindingId:f.person_binding_id,
      holderId:ctx.principal.userId,holderName:holder?.name||'Current manager',
      state:'needs_approval',reason:'Current scoped manager approval is required before independently granted fulfillment can proceed.',bundleName:f.bundle_name??null});
  }
  return {items};
}

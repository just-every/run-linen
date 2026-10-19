import { getWork, type WorkContext } from './core';
import { fulfilmentManagerApproval } from './fulfilment-authority';
import { now } from '../../platform/http';
/** Read-only business gate for durable intake resumption. Execution independently checks grants at effects. */
export async function getFulfilmentReadiness(ctx: WorkContext, workId: string, catalogId: string): Promise<{
  ready:boolean;reason:string|null;ownerId:string|null;
}> {
  const work=await getWork(ctx,workId),db=ctx.env.DB,w=ctx.principal.workspaceId;
  const catalog=await db.prepare('SELECT * FROM work_catalog WHERE workspace_id=? AND id=?').bind(w,catalogId).first<any>();
  const saved=await db.prepare('SELECT application_json FROM work_fulfilments WHERE workspace_id=? AND work_id=? AND catalog_id=?').bind(w,workId,catalogId).first<{application_json:string|null}>();
  const ownerId=(saved?.application_json?JSON.parse(saved.application_json).ownerId:null)||catalog?.owner_id||work.assignee_id||work.requester_id;
  const blocked=(reason:string,holder:string|null=ownerId)=>({ready:false,reason,ownerId:holder});
  if(!catalog)return blocked('Catalogue item is unavailable; fulfilment owner must review');
  if(['closed','cancelled'].includes(work.state))return blocked('Work is closed or cancelled');
  const f=await db.prepare('SELECT * FROM work_fulfilments WHERE workspace_id=? AND work_id=? AND catalog_id=?').bind(w,workId,catalogId).first<any>();
  if(!f || f.beneficiary_id!==work.beneficiary_id)return blocked('Current exact fulfilment beneficiary required');
  if(f.expires_at && f.expires_at<=now())return blocked('Requested access expiry has passed');
  const erased=await db.prepare('SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id=?').bind(w,f.beneficiary_id).first();
  const person=await db.prepare('SELECT active,merged_into FROM work_people WHERE workspace_id=? AND member_id=?').bind(w,f.beneficiary_id).first<any>();
  const member=await db.prepare('SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(w,f.beneficiary_id).first();
  if(erased || (person && (!person.active || person.merged_into)) || !member)
    return blocked('Current active beneficiary identity required');
  const manager=await fulfilmentManagerApproval(ctx,work,catalog,f);
  // Only a recorded manager other than the person can decide; without one, the step is recording a manager, not a fallback holder.
  if(!manager.allowed && (!manager.holderId || manager.holderId===f.beneficiary_id))
    return blocked('Missing authoritative manager; owner must resolve authority',null);
  if(!manager.allowed)return blocked('Current scoped manager approval is required',manager.holderId);
  if(catalog.capacity!==null) {
    const reservation=await db.prepare(`SELECT 1 FROM work_catalog_reservations WHERE workspace_id=? AND catalog_id=?
      AND work_id=? AND beneficiary_id=? AND released_at IS NULL`).bind(w,catalogId,workId,f.beneficiary_id).first();
    const count=await db.prepare('SELECT COUNT(*) n FROM work_catalog_reservations WHERE workspace_id=? AND catalog_id=? AND released_at IS NULL')
      .bind(w,catalogId).first<{n:number}>();
    if(!reservation || catalog.capacity<=0 || (count?.n||0)>catalog.capacity)
      return blocked('Current catalogue capacity and an owned reservation are required');
  }
  const held=await db.prepare("SELECT 1 FROM work_obligations WHERE workspace_id=? AND work_id=? AND target=? AND last_error LIKE 'Restored held obligation%' LIMIT 1")
    .bind(w,workId,catalog.target).first();
  if(held)return blocked('Restored fulfilment is held for source-effect reconciliation');
  const prepared=await db.prepare("SELECT 1 FROM work_fulfilment_amendments WHERE workspace_id=? AND work_id=? AND state='prepared'").bind(w,workId).first();
  if(prepared)return blocked('Expiry correction is being reconciled; retain the existing effect');
  return {ready:true,reason:null,ownerId};
}

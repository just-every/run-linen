import { fulfilmentManagerApproval } from "./fulfilment-authority";
import { ApiError, id, now } from '../../platform/http';
import { getWork, type WorkContext } from './core';
import { authorize, membership } from '../execution/authority';
import { cancelOrTakeover } from '../execution/engine';
import { dispatchGrantedPlan } from '../execution/automation';
import type { FulfilmentAmendResult } from './fulfilment-amend';
import type { Operation, Step } from '../execution/types';

/** Resume a prepared handoff. Only execution's cancellation service changes its old operation. */
export async function resumeFulfilmentAmendment(ctx: WorkContext, row: any): Promise<FulfilmentAmendResult> {
  const db = ctx.env.DB, w = ctx.principal.workspaceId;
  const current = await db.prepare('SELECT * FROM work_fulfilment_amendments WHERE workspace_id=? AND id=?')
    .bind(w,row.id).first<any>();
  if (!current) throw new ApiError(404,'not_found','Amendment not found');
  if (current.state !== 'prepared') return JSON.parse(current.result_json);
  const prior = JSON.parse(current.prior_json), request = JSON.parse(current.request_json);
  const work = await getWork(ctx, current.work_id);
  let reason: string | null = null, replace = !current.old_operation_id;
  let old: Operation | null = current.old_operation_id ? await db.prepare('SELECT * FROM execution_operations WHERE workspace_id=? AND id=?')
    .bind(w,current.old_operation_id).first<Operation>() : null;
  if (work.revision !== prior.work.revision || work.context_json !== prior.work.context_json)
    reason = 'Work changed during amendment; original security deadline retained for owner review';
  try {
    const roles = await membership(ctx,current.actor_id);
    if (!roles.includes('integration')) throw new ApiError(403,'actor_unavailable','Automation actor unavailable');
    const actor = {env:ctx.env,principal:{...ctx.principal,userId:current.actor_id,roles:roles as typeof ctx.principal.roles}};
    // The original provider write is never repeated; renewed authority is only read.
    if (old?.state === 'cancelled' && old.cancel_requested) replace = true;
    if (!reason) {
      const catalog=await db.prepare('SELECT * FROM work_catalog WHERE workspace_id=? AND id=?').bind(w,request.catalogId).first<any>();
      const initial=await db.prepare(`SELECT o.* FROM work_fulfilment_execution l JOIN execution_operations o
        ON o.workspace_id=l.workspace_id AND o.id=l.operation_id WHERE l.workspace_id=? AND l.fulfilment_id=? AND l.phase='initial'`)
        .bind(w,current.fulfilment_id).first<Operation>();
      if(!catalog || catalog.revision!==prior.catalogRevision || !initial || initial.state!=='verified')
        throw new ApiError(409,'amendment_scope_changed','Catalogue or initial effect changed');
      const approval=await fulfilmentManagerApproval(ctx,work,catalog,{id:current.fulfilment_id,revision:prior.fulfilment.revision,
        beneficiary_id:prior.fulfilment.beneficiaryId,purpose:prior.fulfilment.purpose,expires_at:request.expiresAt});
      if(!approval.allowed)throw new ApiError(403,'manager_approval_required','Current manager approval required');
      const currentScope:Step={...JSON.parse(initial.step_json),expiresAt:prior.fulfilment.expiresAt||undefined};
      await authorize(actor,currentScope,initial.plan_id,initial.id);
      if(request.expiresAt>prior.fulfilment.expiresAt)
        await authorize(actor,currentScope,initial.plan_id,initial.id,request.expiresAt);
      await authorize(actor,JSON.parse(current.step_json),`work:${work.id}`,undefined,request.expiresAt);
      if (old && !replace) {
        if (old.state !== 'queued' || old.revision !== current.old_operation_revision || old.cancel_requested)
          throw new ApiError(409,'removal_changed','Removal started; reconcile its outcome');
        const cancelled = await cancelOrTakeover(actor,{operationId:old.id,expectedRevision:old.revision,
          reason:`Replace security expiry with durable amendment ${current.id}`});
        replace = cancelled.state === 'cancelled';
        if (!replace) throw new ApiError(409,'removal_unknown','Old removal requires reconciliation');
      }
    }
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    reason = `Expiry handoff pending (${error.code}); original deadline and effect history retained`;
  }
  const result: FulfilmentAmendResult = {workId:work.id,fulfilmentId:current.fulfilment_id,
    state:reason ? 'pending_decision':'amended',reason,ownerId:current.owner_id,
    workRevision:work.revision+(reason?0:1),fulfilmentRevision:prior.fulfilment.revision+(reason?0:1),
    expiresAt:reason ? prior.fulfilment.expiresAt:request.expiresAt};
  const guard = id(), statements = [db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN
    EXISTS(SELECT 1 FROM work_fulfilment_amendments WHERE workspace_id=? AND id=? AND state='prepared') AND
    EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=? AND revision=?) AND
    EXISTS(SELECT 1 FROM work_fulfilments WHERE workspace_id=? AND id=? AND revision=?) THEN 1 ELSE 0 END)`)
    .bind(guard,w,current.id,w,work.id,work.revision,w,current.fulfilment_id,prior.fulfilment.revision)];
  if (!reason) statements.push(
    db.prepare('UPDATE work_records SET revision=revision+1,updated_at=? WHERE workspace_id=? AND id=?').bind(now(),w,work.id),
    db.prepare('UPDATE work_fulfilments SET expires_at=?,revision=revision+1 WHERE workspace_id=? AND id=?')
      .bind(request.expiresAt,w,current.fulfilment_id),
    // Carry the same bounded decision through this proven expiry-only revision;
    // its issuer, person/catalog revision, grant version and authorized horizon stay fixed.
    db.prepare(`INSERT INTO work_fulfilment_approvals
      SELECT lower(hex(randomblob(16))),workspace_id,work_id,fulfilment_id,?, ?,catalog_revision,person_revision,
        manager_id,holder_id,beneficiary_id,purpose,expires_at,?||id,?,grant_id,grant_version,person_id,binding_id
      FROM work_fulfilment_approvals WHERE workspace_id=? AND work_id=? AND fulfilment_id=?
        AND work_revision=? AND fulfilment_revision=? AND catalog_revision=?
        AND (expires_at IS NULL OR expires_at>=?)`)
      .bind(result.workRevision,result.fulfilmentRevision,`amend:${current.id}:`,now(),w,work.id,current.fulfilment_id,
        prior.work.revision,prior.fulfilment.revision,prior.catalogRevision,request.expiresAt));
  if (replace) statements.push(
    db.prepare(`INSERT INTO work_fulfilment_removals VALUES(?,?,?,?,NULL,NULL)
      ON CONFLICT(workspace_id,obligation_id) DO UPDATE SET amendment_id=excluded.amendment_id,
      step_json=excluded.step_json,operation_id=NULL,plan_id=NULL`).bind(w,current.obligation_id,current.id,current.step_json),
    db.prepare(`INSERT INTO work_execution_bindings VALUES(?,?,?,1) ON CONFLICT(workspace_id,obligation_id)
      DO UPDATE SET step_json=excluded.step_json,revision=work_execution_bindings.revision+1`).bind(w,current.obligation_id,current.step_json),
    db.prepare(`UPDATE work_obligations SET operation_id=NULL,due_at=?,state='pending',last_error=?,revision=revision+1,is_expiry=1
      WHERE workspace_id=? AND id=?`).bind(result.expiresAt,reason,w,current.obligation_id));
  else statements.push(db.prepare('UPDATE work_obligations SET due_at=? WHERE workspace_id=? AND id=?')
    .bind(prior.fulfilment.expiresAt,w,current.obligation_id));
  statements.push(
    db.prepare('UPDATE work_fulfilment_amendments SET state=?,reason=?,result_json=? WHERE workspace_id=? AND id=?')
      .bind(result.state,reason,JSON.stringify(result),w,current.id),
    db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
      .bind(id(),w,ctx.principal.userId,'work.fulfilment_amended',current.id,JSON.stringify(result),now()),
    db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard));
  try { await db.batch(statements); }
  catch (error) {
    const completed = await db.prepare('SELECT state,result_json FROM work_fulfilment_amendments WHERE workspace_id=? AND id=?')
      .bind(w,current.id).first<any>();
    if (completed?.state !== 'prepared') return JSON.parse(completed.result_json);
    if (/constraint|CHECK/i.test(String(error))) throw new ApiError(409,'revision_conflict','Correction raced with another edit; replay this event to finish durable handoff');
    throw error;
  }
  return result;
}

export async function ensureAmendedRemoval(ctx: WorkContext, obligationId: string) {
  const db=ctx.env.DB,w=ctx.principal.workspaceId;
  const row=await db.prepare(`SELECT r.*,a.work_id FROM work_fulfilment_removals r JOIN work_fulfilment_amendments a
    ON a.workspace_id=r.workspace_id AND a.id=r.amendment_id WHERE r.workspace_id=? AND r.obligation_id=?`)
    .bind(w,obligationId).first<any>();
  if(!row)return null;
  if(row.operation_id)return {operationId:row.operation_id as string};
  const work=await getWork(ctx,row.work_id);
  const result=await dispatchGrantedPlan(ctx,{workId:work.id,revision:work.revision,
    steps:[JSON.parse(row.step_json)],idempotencyKey:`amendment:${row.amendment_id}:removal`});
  const op=result.operations[0];
  if(!op?.id)throw new ApiError(503,'intent_missing','Removal intent missing');
  const operation=await db.prepare('SELECT * FROM execution_operations WHERE workspace_id=? AND id=? AND plan_id=?')
    .bind(w,op.id,result.planId).first<Operation>();
  const expected=JSON.parse(row.step_json),normalized=operation?JSON.parse(operation.step_json):null;
  if(!normalized || Object.keys(expected).some(key=>JSON.stringify(expected[key])!==JSON.stringify(normalized[key])))
    throw new ApiError(409,'amendment_binding_changed','Execution normalized a material removal scope');
  await db.batch([
    db.prepare('UPDATE work_fulfilment_removals SET operation_id=?,plan_id=?,step_json=? WHERE workspace_id=? AND obligation_id=? AND amendment_id=?')
      .bind(op.id,result.planId,operation!.step_json,w,obligationId,row.amendment_id),
    db.prepare('UPDATE work_execution_bindings SET step_json=? WHERE workspace_id=? AND obligation_id=?')
      .bind(operation!.step_json,w,obligationId)]);
  return {operationId:String(op.id)};
}

export async function inspectAmendedRemoval(ctx: WorkContext, operationId: string) {
  const w=ctx.principal.workspaceId,db=ctx.env.DB;
  const row=await db.prepare(`SELECT r.*,a.work_id FROM work_fulfilment_removals r JOIN work_fulfilment_amendments a
    ON a.workspace_id=r.workspace_id AND a.id=r.amendment_id WHERE r.workspace_id=? AND r.operation_id=?`)
    .bind(w,operationId).first<any>();
  if(!row)return null;
  await getWork(ctx,row.work_id);
  const op=await db.prepare('SELECT * FROM execution_operations WHERE workspace_id=? AND id=? AND plan_id=?')
    .bind(w,operationId,row.plan_id).first<Operation>();
  if(!op || op.step_json!==row.step_json || op.cancel_requested)
    return {state:'unknown' as const,reason:'Amended removal changed; reconcile existing effect'};
  const step:Step=JSON.parse(op.step_json);
  if(op.state==='verified') {
    const evidence=await db.prepare(`SELECT 1 FROM execution_verifications WHERE workspace_id=? AND operation_id=?
      AND state='verified' AND target=? AND beneficiary_id=? AND action_version=? AND verifier_version=1`)
      .bind(w,op.id,step.target,step.beneficiaryId,step.actionVersion).first();
    return evidence ? {state:'verified' as const,reason:'verified'} : {state:'unknown' as const,reason:'Independent removal verification missing'};
  }
  return {state: ['unknown','cancel_requested'].includes(op.state)?'unknown' as const:op.state==='failed'?'failed' as const:'pending' as const,reason:op.state};
}

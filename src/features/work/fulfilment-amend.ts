import { restrictedAudience } from './catalog-audience';
import { normalizeCatalogForm } from './catalog-form-schema';
import { fulfilmentManagerApproval } from "./fulfilment-authority";
import { ApiError, id, now } from '../../platform/http';
import { getWork, permit, type WorkContext } from './core';
import { authorize, membership } from '../execution/authority';
import type { Step, Operation } from '../execution/types';
import { inspectFulfilmentExecution } from './fulfilment-execution';
import { resumeFulfilmentAmendment } from './fulfilment-amend-execution';

export interface FulfilmentSnapshot {
  id: string; workId: string; workRevision: number; catalogId: string; revision: number;
  beneficiaryId: string; purpose: string; expiresAt: string | null;
}
export interface FulfilmentAmendInput {
  catalogId: string; expectedWorkRevision: number; expectedFulfilmentRevision: number;
  idempotencyKey: string; beneficiaryId: string; purpose: string; expiresAt?: string | null;
}
export interface FulfilmentAmendResult {
  workId: string; fulfilmentId: string; state: 'amended' | 'pending_decision'; reason: string | null;
  ownerId: string; workRevision: number; fulfilmentRevision: number; expiresAt: string | null;
}
export async function getFulfilment(ctx: WorkContext, workId: string, catalogId: string): Promise<FulfilmentSnapshot | null> {
  const work = await getWork(ctx, workId);
  const f = await ctx.env.DB.prepare('SELECT * FROM work_fulfilments WHERE workspace_id=? AND work_id=? AND catalog_id=?')
    .bind(ctx.principal.workspaceId, workId, catalogId).first<any>();
  return f ? { id: f.id, workId, workRevision: work.revision, catalogId, revision: f.revision,
    beneficiaryId: f.beneficiary_id, purpose: f.purpose, expiresAt: f.expires_at } : null;
}
export async function amendFulfilment(ctx: WorkContext, workId: string, input: FulfilmentAmendInput): Promise<FulfilmentAmendResult> {
  const work = await getWork(ctx, workId), db = ctx.env.DB, w = ctx.principal.workspaceId;
  if (work.requester_id !== ctx.principal.userId) permit(ctx, ['owner','operator','hr']);
  if (!input.purpose?.trim() || !input.beneficiaryId || !input.idempotencyKey?.trim() ||
    input.idempotencyKey.length > 500 || !Number.isInteger(input.expectedWorkRevision) ||
    !Number.isInteger(input.expectedFulfilmentRevision) || (input.expiresAt &&
      (!Number.isFinite(Date.parse(input.expiresAt)) || new Date(input.expiresAt).toISOString() !== input.expiresAt)))
    throw new ApiError(422, 'amendment_input', 'Exact revisions, event key, beneficiary, purpose and ISO expiry required');
  const request = JSON.stringify({ catalogId: input.catalogId, expectedWorkRevision: input.expectedWorkRevision,
    expectedFulfilmentRevision: input.expectedFulfilmentRevision, idempotencyKey: input.idempotencyKey,
    beneficiaryId: input.beneficiaryId, purpose: input.purpose, expiresAt: input.expiresAt || null });
  const previous = await db.prepare('SELECT * FROM work_fulfilment_amendments WHERE workspace_id=? AND work_id=? AND event_key=?')
    .bind(w, workId, input.idempotencyKey).first<any>();
  if (previous) {
    if (previous.request_json !== request || previous.requester_id !== ctx.principal.userId)
      throw new ApiError(409, 'idempotency_conflict', 'Event key already describes a different correction');
    return previous.state === 'prepared' ? resumeFulfilmentAmendment(ctx, previous) : JSON.parse(previous.result_json);
  }
  const f = await getFulfilment(ctx, workId, input.catalogId);
  if (!f) throw new ApiError(404, 'not_found', 'Fulfilment not found');
  if (f.workRevision !== input.expectedWorkRevision || f.revision !== input.expectedFulfilmentRevision)
    throw new ApiError(409, 'revision_conflict', 'Work or fulfilment changed; refresh before correction');
  const catalog = await db.prepare('SELECT * FROM work_catalog WHERE workspace_id=? AND id=?')
    .bind(w, input.catalogId).first<any>();
  // An amendment is a fresh submission: it re-gates the audience, binds a quote again and needs new approval (CATALOG-001).
  if(restrictedAudience(catalog) || normalizeCatalogForm(JSON.parse(catalog.form_json)).quoteRequired)throw new ApiError(409,'catalog_amendment_requires_resubmission','Audience-controlled and quote-backed amendments require a fresh catalog submission and renewed approval');
  const initial = await db.prepare(`SELECT o.* FROM work_fulfilment_execution l JOIN execution_operations o
    ON o.workspace_id=l.workspace_id AND o.id=l.operation_id WHERE l.workspace_id=? AND l.fulfilment_id=? AND l.phase='initial'`)
    .bind(w, f.id).first<Operation>();
  const obligation = await db.prepare("SELECT * FROM work_obligations WHERE workspace_id=? AND work_id=? AND kind='access.revoke' AND target=?")
    .bind(w, workId, catalog.target).first<any>();
  const old = obligation?.operation_id ? await db.prepare('SELECT * FROM execution_operations WHERE workspace_id=? AND id=?')
    .bind(w, obligation.operation_id).first<Operation>() : null;
  let reason: string | null = null, step: Step | null = null, actorId: string | null = null;
  if (['cancelled','closed'].includes(work.state)) reason = 'Work is closed or cancelled; owner must review renewal';
  else if (input.beneficiaryId !== f.beneficiaryId || input.purpose !== f.purpose)
    reason = 'Material beneficiary or purpose change requires owner-reviewed renewal; existing access and security removal retained';
  else if (!input.expiresAt || !f.expiresAt || input.expiresAt <= now())
    reason = 'A future bounded expiry requires renewal review; existing security removal retained';
  else if (!initial || (await inspectFulfilmentExecution(ctx, initial.id))?.state !== 'verified')
    reason = 'Initial access is not independently verified; reconcile existing effect before amendment';
  else if (!obligation || (old && (old.state !== 'queued' || old.cancel_requested)) || (!old && obligation.state !== 'pending'))
    reason = 'Existing removal may have started; reconcile before changing expiry';
  else {
    try {
      const manager = await fulfilmentManagerApproval(ctx,work,catalog,{id:f.id,revision:f.revision,
        beneficiary_id:f.beneficiaryId,purpose:f.purpose,expires_at:input.expiresAt});
      if(!manager.allowed) throw new ApiError(403,'manager_approval_required','Corrected expiry needs current scoped manager approval');
      actorId = initial.actor_id;
      const roles = await membership(ctx, actorId);
      if (!roles.includes('integration')) throw new ApiError(403, 'actor_unavailable', 'Current automation principal required');
      const actor = { env: ctx.env, principal: { ...ctx.principal, userId: actorId, roles: roles as typeof ctx.principal.roles } };
      const initialStep: Step = {...JSON.parse(initial.step_json),expiresAt:f.expiresAt||undefined};
      await authorize(actor, initialStep, initial.plan_id, initial.id);
      // Extending access requires the initial authority to cover the new horizon as well.
      if (input.expiresAt > f.expiresAt) await authorize(actor, initialStep, initial.plan_id, initial.id, input.expiresAt);
      const grants = (await db.prepare(`SELECT * FROM execution_grants WHERE workspace_id=? AND principal_id=?
        AND action=? AND target=? AND local_beneficiary_id=? ORDER BY version DESC`)
        .bind(w, actorId, initialStep.action.replace('.add','.remove'), catalog.target, f.beneficiaryId).all<any>()).results;
      for (const grant of grants) {
        const removal: Step = { ...initialStep, action: initialStep.action.replace('.add','.remove') as Step['action'],
          grantId: grant.id, grantVersion: grant.version, expiresAt: undefined, revocationGrantId: undefined,
          compensationGrantId: undefined, expectedPresent: undefined };
        try {
          for (const at of [now(), f.expiresAt, input.expiresAt]) await authorize(actor, removal, initial.plan_id, undefined, at);
          step = removal; break;
        } catch (error) { if (!(error instanceof ApiError)) throw error; }
      }
      if (!step) reason = 'Current scoped removal authority does not cover the corrected expiry; original expiry retained';
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      reason = `Current extension authority unavailable (${error.code}); original expiry retained`;
    }
  }
  const amendmentId = id(), guard = id();
  const result: FulfilmentAmendResult = { workId, fulfilmentId: f.id, state: 'pending_decision', reason,
    ownerId: catalog.owner_id, workRevision: work.revision, fulfilmentRevision: f.revision, expiresAt: f.expiresAt };
  const prior = { fulfilment: f, work, obligation, oldOperation: old, catalogRevision: catalog.revision };
  const statements = [
    db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN
      EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=? AND revision=?) AND
      EXISTS(SELECT 1 FROM work_fulfilments WHERE workspace_id=? AND id=? AND revision=?) AND
      NOT EXISTS(SELECT 1 FROM work_fulfilment_amendments WHERE workspace_id=? AND work_id=? AND state='prepared')
      THEN 1 ELSE 0 END)`).bind(guard,w,workId,work.revision,w,f.id,f.revision,w,workId),
    db.prepare(`INSERT INTO work_fulfilment_amendments VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(amendmentId,w,workId,f.id,input.idempotencyKey,ctx.principal.userId,request,JSON.stringify(prior),
        reason ? 'pending_decision' : 'prepared',reason,catalog.owner_id,step ? JSON.stringify(step) : null,actorId,
        obligation?.id || null,old?.id || null,old?.revision || null,reason ? JSON.stringify(result) : null,now()),
    db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard),
  ];
  // Wake the existing duty at the earlier deadline, including recovery after interruption.
  if (!reason) statements.splice(2,0,db.prepare('UPDATE work_obligations SET due_at=MIN(due_at,?) WHERE workspace_id=? AND id=?')
    .bind(input.expiresAt,w,obligation.id));
  try { await db.batch(statements); }
  catch (error) {
    if (/constraint|CHECK|UNIQUE/i.test(String(error))) {
      const replay=await db.prepare('SELECT * FROM work_fulfilment_amendments WHERE workspace_id=? AND work_id=? AND event_key=?')
        .bind(w,workId,input.idempotencyKey).first<any>();
      if(replay && replay.request_json===request && replay.requester_id===ctx.principal.userId)
        return replay.state==='prepared'?resumeFulfilmentAmendment(ctx,replay):JSON.parse(replay.result_json);
    }
    if (/constraint|CHECK|UNIQUE/i.test(String(error))) throw new ApiError(409,'revision_conflict','Concurrent fulfilment correction; refresh or replay the event');
    throw error;
  }
  if (reason) return result;
  return resumeFulfilmentAmendment(ctx, (await db.prepare('SELECT * FROM work_fulfilment_amendments WHERE id=?').bind(amendmentId).first())!);
}

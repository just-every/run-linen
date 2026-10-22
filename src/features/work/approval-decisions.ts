import { ApiError, id, now } from '../../platform/http';
import type { WorkContext, WorkRecord } from './core';
import { approvalGuard } from './approval-guard';
import { currentWorkPrincipal } from './identity';
import { managerHolder, managerStageApproved } from './fulfilment-authority';
import { chainStatus, timers } from './approval-stages';
import type { StageDef } from './approval-config';

export interface StageDecisionInput { catalogId: string; stageKey: string; decision: string; comment?: unknown; expectedWorkRevision: number; expectedFulfilmentRevision: number; expectedCatalogRevision: number; idempotencyKey: string }
/** Records one approver's decision on the open stage, checked against current authority and revisions, atomically. */
export async function prepareStageDecision(ctx: WorkContext, workId: string, input: StageDecisionInput, channel: 'portal' | 'email') {
  const db = ctx.env.DB, w = ctx.principal.workspaceId;
  const authorityGuard = await approvalGuard(ctx, workId, input.catalogId);
  const work = await db.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=?').bind(w, workId).first<WorkRecord>();
  if (!work) throw new ApiError(404, 'not_found', 'Work not found');
  const f = await db.prepare('SELECT * FROM work_fulfilments WHERE workspace_id=? AND work_id=? AND catalog_id=?').bind(w, workId, input.catalogId).first<any>();
  const catalog = await db.prepare('SELECT * FROM work_catalog WHERE workspace_id=? AND id=?').bind(w, input.catalogId).first<any>();
  if (!f || !catalog) throw new ApiError(404, 'not_found', 'Fulfilment not found');
  if (['closed', 'cancelled'].includes(work.state) || (f.expires_at && f.expires_at <= now())) throw new ApiError(409, 'approval_unavailable', 'Only active unexpired fulfilments can be decided');
  if (!['approved', 'rejected'].includes(input.decision) || !input.idempotencyKey) throw new ApiError(422, 'approval_input', 'Approve or reject, with an event key');
  const comment = typeof input.comment === 'string' && input.comment.trim() ? input.comment.trim().slice(0, 2000) : null;
  if (work.revision !== input.expectedWorkRevision || f.revision !== input.expectedFulfilmentRevision || catalog.revision !== input.expectedCatalogRevision)
    throw new ApiError(409, 'revision_conflict', 'Exact current work, fulfilment and catalog revisions required');
  const previous = await db.prepare('SELECT * FROM work_approval_decisions WHERE workspace_id=? AND work_id=? AND event_key=?').bind(w, workId, input.idempotencyKey).first<any>();
  if (previous) {
    if (previous.work_revision !== work.revision || previous.catalog_revision !== catalog.revision || previous.stage_key !== input.stageKey || previous.approver_id !== ctx.principal.userId || previous.decision !== input.decision || previous.fulfilment_revision !== f.revision) throw new ApiError(409, 'idempotency_conflict', 'Approval event describes another decision');
    return { decisionId: previous.id as string, statements: [] as D1PreparedStatement[], stage: input.stageKey };
  }
  if (input.stageKey === 'manager') {
    const prepared = await prepareManagerRejection(ctx, work, catalog, f, input, comment, channel);
    return {...prepared,statements:[authorityGuard.start,...prepared.statements,authorityGuard.end]};
  }
  const { managerApproved } = await managerState(ctx, work, catalog, f);
  const chain = await chainStatus(ctx, work, catalog, f, managerApproved);
  if(chain.rejected)throw new ApiError(409,'approval_not_open','This request revision was rejected; submit a revised request before deciding again');
  const stage = chain.stages.find(s => s.key === input.stageKey);
  if (!stage || !stage.applies) throw new ApiError(404, 'not_found', 'Approval stage not found');
  if (!stage.approvers.includes(ctx.principal.userId) || ctx.principal.userId === f.beneficiary_id) throw new ApiError(403, 'approval_denied', 'Only a current approver of this stage decides it');
  if (stage.state !== 'pending') throw new ApiError(409, 'approval_not_open', 'This stage is not waiting for a decision (earlier stages come first, and a decided stage is final)');
  if (stage.decisions.some(d => d.approverId === ctx.principal.userId)) throw new ApiError(409, 'approval_decided', 'You already decided this stage for this revision');
  const decisionId = id(), guard = id(), t = now();
  // Whether this decision completes the stage decides what opens next.
  const approvedNow = new Set([...stage.decisions.filter(d => d.decision === 'approved').map(d => d.approverId), ...(input.decision === 'approved' ? [ctx.principal.userId] : [])]);
  const stageDef = JSON.parse((await db.prepare('SELECT definition_json FROM work_approval_stages WHERE workspace_id=? AND fulfilment_id=? AND stage_key=?').bind(w, f.id, stage.key).first<{ definition_json: string }>())!.definition_json) as StageDef;
  const completes = input.decision === 'approved' && (stageDef.mode === 'any' ? approvedNow.size >= 1 : stage.approvers.every(a => approvedNow.has(a)));
  const next = completes ? chain.stages.find(s => s.ordinal > stage.ordinal && s.applies && s.activeAt === null) : undefined;

  const nextDef = next ? JSON.parse((await db.prepare('SELECT definition_json FROM work_approval_stages WHERE workspace_id=? AND fulfilment_id=? AND stage_key=?').bind(w, f.id, next.key).first<{ definition_json: string }>())!.definition_json) as StageDef : null;
  const statements = [
    authorityGuard.start,
    db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=? AND revision=?)
      AND EXISTS(SELECT 1 FROM work_fulfilments WHERE workspace_id=? AND id=? AND revision=?) AND EXISTS(SELECT 1 FROM work_catalog WHERE workspace_id=? AND id=? AND revision=?)
      AND EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1) THEN 1 ELSE 0 END)`)
      .bind(guard, w, workId, work.revision, w, f.id, f.revision, w, catalog.id, catalog.revision, w, ctx.principal.userId),
    db.prepare('INSERT INTO work_approval_decisions(id,workspace_id,work_id,fulfilment_id,stage_key,approver_id,decision,comment,channel,work_revision,fulfilment_revision,catalog_revision,event_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(decisionId, w, workId, f.id, stage.key, ctx.principal.userId, input.decision, comment, channel, work.revision, f.revision, catalog.revision, input.idempotencyKey, t),
    db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(), w, ctx.principal.userId, 'work.approval_stage_decided', decisionId,
      JSON.stringify({ workId, fulfilmentId: f.id, catalogId: catalog.id, stage: stage.key, decision: input.decision, channel, workRevision: work.revision, fulfilmentRevision: f.revision, catalogRevision: catalog.revision }), t),
    ...(input.decision === 'rejected' ? [db.prepare(`UPDATE work_obligations SET state='blocked',last_error=? WHERE workspace_id=? AND work_id=? AND target=? AND state='pending'`)
      .bind(`Approval rejected at ${stage.name}`, w, workId, catalog.target)] : []),
    ...(next && nextDef ? (() => { const tm = timers(nextDef.calendar, nextDef, t); return [db.prepare('UPDATE work_approval_stages SET active_at=?,remind_at=?,sla_at=? WHERE workspace_id=? AND fulfilment_id=? AND stage_key=? AND active_at IS NULL').bind(tm.activeAt, tm.remindAt, tm.slaAt, w, f.id, next.key)]; })() : []),
    db.prepare('UPDATE work_records SET updated_at=? WHERE workspace_id=? AND id=?').bind(t, w, workId),
    db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard), authorityGuard.end,
  ];
  return { decisionId, statements, stage: stage.key };
}

export async function decideStage(ctx: WorkContext, workId: string, input: StageDecisionInput) {
  await currentWorkPrincipal(ctx);
  const prepared = await prepareStageDecision(ctx, workId, input, 'portal');
  if (prepared.statements.length) try { await ctx.env.DB.batch(prepared.statements); } catch (error) {
    if (/CHECK constraint failed/.test(String(error))) throw new ApiError(409, 'revision_conflict', 'The request, item or your membership changed; review it and decide again');
    throw error;
  }
  return { id: prepared.decisionId, state: input.decision };
}

const managerState = async (ctx: WorkContext, work: any, catalog: any, f: any) => ({ managerApproved: await managerStageApproved(ctx, work, catalog, f) });

/** The manager approves through the manager decision; here they may reject. The rejection is bound to the same exact revisions. */
async function prepareManagerRejection(ctx: WorkContext, work: WorkRecord, catalog: any, f: any, input: StageDecisionInput, comment: string | null, channel: 'portal' | 'email') {
  const db = ctx.env.DB, w = ctx.principal.workspaceId;
  if (!catalog.requires_manager || input.decision !== 'rejected') throw new ApiError(422, 'approval_input', 'The manager approves through the manager decision; here they may reject');
  const holder = await managerHolder(ctx, f);
  if (!holder || holder !== ctx.principal.userId || holder === f.beneficiary_id) throw new ApiError(403, 'approval_denied', 'Only the current manager or their delegate decides this');
  if (await managerStageApproved(ctx, work, catalog, f)) throw new ApiError(409, 'approval_not_open', 'The manager stage is already approved');
  const decisionId = id(), guard = id(), t = now();
  return { decisionId, stage: 'manager', statements: [
    db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=? AND revision=?)
      AND EXISTS(SELECT 1 FROM work_fulfilments WHERE workspace_id=? AND id=? AND revision=?) AND EXISTS(SELECT 1 FROM work_catalog WHERE workspace_id=? AND id=? AND revision=?) THEN 1 ELSE 0 END)`)
      .bind(guard, w, work.id, work.revision, w, f.id, f.revision, w, catalog.id, catalog.revision),
    db.prepare('INSERT INTO work_approval_decisions(id,workspace_id,work_id,fulfilment_id,stage_key,approver_id,decision,comment,channel,work_revision,fulfilment_revision,catalog_revision,event_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(decisionId, w, work.id, f.id, 'manager', ctx.principal.userId, 'rejected', comment, channel, work.revision, f.revision, catalog.revision, input.idempotencyKey, t),
    db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(), w, ctx.principal.userId, 'work.approval_stage_decided', decisionId, JSON.stringify({ workId: work.id, fulfilmentId: f.id, catalogId: catalog.id, stage: 'manager', decision: 'rejected' }), t),
    db.prepare(`UPDATE work_obligations SET state='blocked',last_error='Approval rejected by the manager' WHERE workspace_id=? AND work_id=? AND target=? AND state='pending'`).bind(w, work.id, catalog.target),
    db.prepare('UPDATE work_records SET updated_at=? WHERE workspace_id=? AND id=?').bind(t, w, work.id),
    db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard)] };
}
export const managerRejected = async (ctx: WorkContext, work: { revision: number }, catalog: { revision: number }, f: { id: string; revision: number }) =>
  Boolean(await ctx.env.DB.prepare("SELECT 1 FROM work_approval_decisions WHERE workspace_id=? AND fulfilment_id=? AND stage_key='manager' AND decision='rejected' AND work_revision=? AND fulfilment_revision=? AND catalog_revision=?")
    .bind(ctx.principal.workspaceId, f.id, work.revision, f.revision, catalog.revision).first());

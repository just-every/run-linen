import { ApiError, id, now } from '../../platform/http';
import type { WorkContext, WorkRecord } from './core';
import { createWork } from './core';
import { chainStatus,activateStageStatements } from './approval-stages';
import {managerRejected} from './approval-decisions';
import { managerHolder,managerStageApproved } from './fulfilment-authority';

/** Reminder work is normal visibility: copy only owner-configured catalog/stage labels and opaque references, never
 * the originating request title, conversation, purpose, quote or person/HR fields. Reminder and SLA handling for the open stage: one reminder to each undecided approver; one overdue request to the item's owner. */
export async function remindApprovalStages(ctx: WorkContext, at: string) {
  const db = ctx.env.DB, w = ctx.principal.workspaceId, results: Record<string, unknown>[] = [];
  await openPendingStages(ctx,at);
  const rows = (await db.prepare(`SELECT s.*,f.revision f_revision,f.beneficiary_id,f.application_json,f.catalog_id,f.purpose,f.expires_at,r.revision w_revision,r.state w_state,c.name catalog_name,c.owner_id,c.revision c_revision,c.approvals_json,c.requires_manager
    FROM work_approval_stages s JOIN work_fulfilments f ON f.workspace_id=s.workspace_id AND f.id=s.fulfilment_id JOIN work_records r ON r.workspace_id=f.workspace_id AND r.id=f.work_id
    JOIN work_catalog c ON c.workspace_id=f.workspace_id AND c.id=f.catalog_id
    WHERE s.workspace_id=? AND s.applies=1 AND s.active_at IS NOT NULL AND r.state NOT IN ('closed','cancelled') AND (f.expires_at IS NULL OR f.expires_at>?)
    AND ((s.remind_at IS NOT NULL AND s.remind_at<=? AND s.reminded_at IS NULL) OR (s.sla_at IS NOT NULL AND s.sla_at<=? AND s.breached_at IS NULL)) ORDER BY s.active_at LIMIT 100`).bind(w, at, at, at).all<any>()).results;
  for (const row of rows) {
    const work = { id: row.work_id, revision: row.w_revision } as WorkRecord, catalog = { id: row.catalog_id, owner_id: row.owner_id, revision: row.c_revision, approvals_json: row.approvals_json };
    const f = { id: row.fulfilment_id, revision: row.f_revision, beneficiary_id: row.beneficiary_id, application_json: row.application_json,purpose:row.purpose,expires_at:row.expires_at };
    const chain = await chainStatus(ctx, work, catalog, f, await managerStageApproved(ctx, work, {...row,revision:row.c_revision}, f));
    const managerPending=row.stage_key==='manager'&&!await managerStageApproved(ctx,work,{...row,revision:row.c_revision},f)&&!await managerRejected(ctx,work,{revision:row.c_revision},f);
    const holder=managerPending?await managerHolder(ctx,f):null;
    const stage = row.stage_key==='manager'?(managerPending?{key:'manager',name:'Manager approval',state:'pending',approvers:holder&&holder!==f.beneficiary_id?[holder]:[],decisions:[]}:null):chain.stages.find(s => s.key === row.stage_key);
    if (!stage || stage.state !== 'pending') continue;
    const decided = new Set(stage.decisions.map(d => d.approverId)), undecided = stage.approvers.filter(a => !decided.has(a));
    const ask = async (to: string, title: string, body: string, key: string, context: Record<string, unknown>) =>
      createWork(ctx, { title, body, deduplicationKey: key, beneficiaryId: to, context }, { admittedLifecycleBeneficiary: to, statements: () => [] });
    if (row.remind_at && row.remind_at <= at && !row.reminded_at) {
      try {
        for (const to of undecided) await ask(to, `Approval reminder: ${row.catalog_name} (${stage.name})`, `${stage.name} is waiting for your decision. Sign in to Linen and open Decisions (/app#/decisions). Request reference: ${row.work_id}.`, `approval-reminder:${row.fulfilment_id}:${stage.key}:${row.w_revision}:${row.f_revision}:${row.c_revision}:${to}`,
          { approvalReminder: { workId: row.work_id, catalogId: row.catalog_id, stage: stage.key } });
        await db.prepare('UPDATE work_approval_stages SET reminded_at=? WHERE workspace_id=? AND fulfilment_id=? AND stage_key=? AND reminded_at IS NULL').bind(at, w, row.fulfilment_id, stage.key).run();
        results.push({ id: row.fulfilment_id, stage: stage.key, state: 'approval_reminded', recipients: undecided.length });
      } catch (error) { results.push({ id: row.fulfilment_id, stage: stage.key, state: 'approval_reminder_failed', error: error instanceof ApiError ? error.code : 'error' }); }
    }
    if (row.sla_at && row.sla_at <= at && !row.breached_at) {
      try {
        await ask(row.owner_id, `Approval overdue: ${row.catalog_name} (${stage.name})`, `${stage.name} passed its approval SLA (${row.sla_at}) without a decision. Sign in to Linen and review Decisions (/app#/decisions). Request reference: ${row.work_id}.`, `approval-sla:${row.fulfilment_id}:${stage.key}:${row.w_revision}:${row.f_revision}:${row.c_revision}`,
          { approvalOverdue: { workId: row.work_id, catalogId: row.catalog_id, stage: stage.key, slaAt: row.sla_at } });
        await db.batch([db.prepare('UPDATE work_approval_stages SET breached_at=? WHERE workspace_id=? AND fulfilment_id=? AND stage_key=? AND breached_at IS NULL').bind(at, w, row.fulfilment_id, stage.key),
          db.prepare("INSERT INTO audit_events SELECT ?,?,?,'work.approval_sla_breached',?,?,? WHERE changes()=1").bind(id(), w, ctx.principal.userId, row.work_id, JSON.stringify({ stage: stage.key, slaAt: row.sla_at }), at)]);
        results.push({ id: row.fulfilment_id, stage: stage.key, state: 'approval_overdue' });
      } catch (error) { results.push({ id: row.fulfilment_id, stage: stage.key, state: 'approval_overdue_failed', error: error instanceof ApiError ? error.code : 'error' }); }
    }
  }
  return results;
}


/** After a corrected request or standing manager grant, start the now-open stage on its frozen business calendar. */
async function openPendingStages(ctx:WorkContext,at:string){
 const db=ctx.env.DB,w=ctx.principal.workspaceId;
 const rows=(await db.prepare("SELECT DISTINCT f.* FROM work_fulfilments f JOIN work_approval_stages s ON s.workspace_id=f.workspace_id AND s.fulfilment_id=f.id JOIN work_records r ON r.workspace_id=f.workspace_id AND r.id=f.work_id WHERE f.workspace_id=? AND s.applies=1 AND s.active_at IS NULL AND r.state NOT IN ('closed','cancelled') AND (f.expires_at IS NULL OR f.expires_at>?) LIMIT 200").bind(w,at).all<any>()).results;
 for(const f of rows){
  const work=await db.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=?').bind(w,f.work_id).first<WorkRecord>();
  const catalog=await db.prepare('SELECT * FROM work_catalog WHERE workspace_id=? AND id=?').bind(w,f.catalog_id).first<any>();
  if(!work||!catalog)continue;
  const managerApproved=await managerStageApproved(ctx,work,catalog,f);
  const managerRow=await db.prepare("SELECT stage_key,active_at FROM work_approval_stages WHERE workspace_id=? AND fulfilment_id=? AND stage_key='manager'").bind(w,f.id).first<{stage_key:string;active_at:string|null}>();
  const chain=await chainStatus(ctx,work,catalog,f,managerApproved);
  const pending=!managerApproved&&managerRow&&!await managerRejected(ctx,work,catalog,f)?[{key:'manager',activeAt:managerRow.active_at}]:chain.pendingStages;
  const statements=await activateStageStatements(ctx,f.id,pending,at);
  if(statements.length)await db.batch(statements);

 }
}

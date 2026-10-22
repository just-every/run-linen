import {obligationHistory} from './work-history';
import { remindSponsors } from "./contractor-sponsor";
import { remindLifecycleTasks } from "./lifecycle-tasks";
import { remindApprovalStages } from "./approval-chain";
import { sendApprovalMail } from "./approval-mail";
import { processDueRecurrences } from './recurrence';
import { processFollowups } from './escalations';
import { resumeFulfilmentAmendment } from "./fulfilment-amend-execution";
import { currentWorkPrincipal } from "./identity";
import { now } from "../../platform/http";
import { permit, type WorkContext } from "./core";
export interface Obligation {
  id: string;
  workspace_id: string;
  work_id: string;
  kind: string;
  target: string;
  beneficiary_id: string;
  owner_id: string;
  revision: number;
  operation_id: string | null;
  state:string; last_error:string|null;
}
export interface WorkExecutionPort {
  ensureIntent(
    ctx: WorkContext,
    obligation: Obligation,
  ): Promise<{ operationId: string }>;
  inspect(
    ctx: WorkContext,
    operationId: string,
  ): Promise<{
    state: "pending" | "unknown" | "failed" | "verified";
    reason?: string;
  }>;
}
export async function processDueWork(
  ctx: WorkContext,
  execution: WorkExecutionPort,
  at = now(),
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "integration"]);
  await processDueRecurrences(ctx,at);
  const reminders = [...await remindSponsors(ctx, at), ...await remindLifecycleTasks(ctx, at), ...await remindApprovalStages(ctx, at), ...await sendApprovalMail(ctx, at)];
  await processFollowups(ctx, at);
  const prepared = await ctx.env.DB.prepare("SELECT * FROM work_fulfilment_amendments WHERE workspace_id=? AND state='prepared' ORDER BY created_at LIMIT 50")
    .bind(ctx.principal.workspaceId).all();
  // Recovery uses the current scheduler principal and the recorded actor/grants;
  // it never asks the model or requester to repeat consent.
  await Promise.allSettled(prepared.results.map(row => resumeFulfilmentAmendment(ctx,row)));
  const rows = await ctx.env.DB.prepare(
    `SELECT o.* FROM work_obligations o WHERE o.workspace_id=? AND o.kind<>'task.manual' AND o.due_at<=? AND o.state IN ('pending','blocked','executing','unknown') AND COALESCE(o.last_error,'') NOT LIKE 'Restored held obligation%' AND (o.depends_on IS NULL OR EXISTS(SELECT 1 FROM work_obligations d WHERE d.id=o.depends_on AND d.workspace_id=o.workspace_id AND d.state='verified')) ORDER BY o.due_at LIMIT 100`,
  )
    .bind(ctx.principal.workspaceId, at)
    .all<Obligation>();
  // Settle each independent duty separately. No rejected operation may prevent
  // another due duty (including physical handoff) from recording its own status.
  const settled = await Promise.all(rows.results.map(async (o) => {
    try {
      const update=async(after:{state:string;last_error?:string|null;operation_id?:string|null})=>{
        const next={state:after.state,last_error:after.last_error===undefined?o.last_error:after.last_error,operation_id:after.operation_id===undefined?o.operation_id:after.operation_id};
        const [result]=await ctx.env.DB.batch([ctx.env.DB.prepare('UPDATE work_obligations SET state=?,last_error=?,operation_id=? WHERE workspace_id=? AND id=? AND revision=? AND state=? AND operation_id IS ?').bind(next.state,next.last_error,next.operation_id,ctx.principal.workspaceId,o.id,o.revision,o.state,o.operation_id),obligationHistory(ctx,o,'work.obligation_changed',{state:o.state,error:o.last_error,operationId:o.operation_id},{state:next.state,error:next.last_error,operationId:next.operation_id},now())]);
        if(result.meta.changes)Object.assign(o,next);
        return !!result.meta.changes;
      };
      if (o.kind.startsWith('device.')) {
        await update({state:'blocked',last_error:'Physical handoff requires assigned owner evidence'});
        return {id:o.id,state:'physical_pending'};
      }
      const {operationId}=o.operation_id?{operationId:o.operation_id}:await execution.ensureIntent(ctx,o);
      // A competing amendment cannot be overwritten by the observation of an older duty.
      if(!await update({operation_id:operationId,state:'executing'}))return {id:o.id,state:'changed'};
      const observed=await execution.inspect(ctx,operationId);
      await update({state:observed.state==='pending'?'executing':observed.state,last_error:observed.reason||null});
      return { id: o.id, ...observed };
    } catch (error) {
      const reason=error instanceof Error?error.message:'Execution unavailable';
      await ctx.env.DB.batch([ctx.env.DB.prepare("UPDATE work_obligations SET state='blocked',last_error=? WHERE workspace_id=? AND id=? AND revision=? AND state=? AND operation_id IS ?").bind(reason,ctx.principal.workspaceId,o.id,o.revision,o.state,o.operation_id),obligationHistory(ctx,o,'work.obligation_changed',{state:o.state,error:o.last_error},{state:'blocked',error:reason},now())]);
      return { id: o.id, state: "blocked" };
    }
  }));
  return [...reminders, ...settled];
}

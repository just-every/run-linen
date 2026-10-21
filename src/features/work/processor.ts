import { remindSponsors } from "./contractor-sponsor";
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
  const reminders = await remindSponsors(ctx, at);
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
      if (o.kind.startsWith("device.")) {
        await ctx.env.DB.prepare(
          "UPDATE work_obligations SET state='blocked',last_error='Physical handoff requires assigned owner evidence' WHERE workspace_id=? AND id=?",
        )
          .bind(ctx.principal.workspaceId, o.id)
          .run();
        return { id: o.id, state: "physical_pending" };
      }
      const { operationId } = o.operation_id
        ? { operationId: o.operation_id }
        : await execution.ensureIntent(ctx, o);
      await ctx.env.DB.prepare(
        "UPDATE work_obligations SET operation_id=?,state=? WHERE workspace_id=? AND id=? AND revision=?",
      )
        .bind(
          operationId,
          "executing",
          ctx.principal.workspaceId,
          o.id,
          o.revision,
        )
        .run();
      const observed = await execution.inspect(ctx, operationId);
      await ctx.env.DB.prepare(
        "UPDATE work_obligations SET state=?,last_error=? WHERE workspace_id=? AND id=? AND operation_id=?",
      )
        .bind(
          observed.state === "pending" ? "executing" : observed.state,
          observed.reason || null,
          ctx.principal.workspaceId,
          o.id,
          operationId,
        )
        .run();
      return { id: o.id, ...observed };
    } catch (error) {
      await ctx.env.DB.prepare(
        "UPDATE work_obligations SET state='blocked',last_error=? WHERE workspace_id=? AND id=?",
      )
        .bind(
          error instanceof Error ? error.message : "Execution unavailable",
          ctx.principal.workspaceId,
          o.id,
        )
        .run();
      return { id: o.id, state: "blocked" };
    }
  }));
  return [...reminders, ...settled];
}

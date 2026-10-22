import {obligationHistory} from './work-history';
import { currentWorkPrincipal } from "./identity";
import { ApiError, id, now } from "../../platform/http";
import { createWork, getWork, permit, type WorkContext } from "./core";
import { effectiveInstant } from "./lifecycle";
import { calendarFor, redateLifecycleTasks } from "./lifecycle-tasks";
export async function amendLifecycle(
  ctx: WorkContext,
  id: string,
  revision: number,
  effectiveAt: string | undefined,
  cancel: boolean,
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "hr"]);
  const row = await ctx.env.DB.prepare(
    "SELECT l.*,json_extract(r.context_json,'$.ownerId') owner_id FROM work_lifecycle l JOIN work_records r ON r.workspace_id=l.workspace_id AND r.id=l.work_id WHERE l.workspace_id=? AND l.id=?",
  )
    .bind(ctx.principal.workspaceId, id)
    .first<{ timezone: string; work_id: string; owner_id: string;effective_at:string;cancelled_at:string|null;revision:number }>();
  if (!row) throw new ApiError(404, "not_found", "Lifecycle not found");
  await getWork(ctx, row.work_id);
  const due = effectiveAt ? effectiveInstant(effectiveAt, row.timezone) : null;
  if (due && !cancel && await ctx.env.DB.prepare("SELECT 1 FROM work_obligations WHERE workspace_id=? AND lifecycle_id=? AND kind='task.manual' AND state IN ('pending','blocked') AND template_json IS NOT NULL")
    .bind(ctx.principal.workspaceId, id).first()) await calendarFor(ctx, row.timezone, row.owner_id);
  const at=now(),duties=(await ctx.env.DB.prepare("SELECT * FROM work_obligations WHERE workspace_id=? AND lifecycle_id=? AND state<>'verified' AND kind<>'task.manual'").bind(ctx.principal.workspaceId,id).all<any>()).results;
  const [result]=await ctx.env.DB.batch([ctx.env.DB.prepare('UPDATE work_lifecycle SET revision=revision+1,effective_at=COALESCE(?,effective_at),cancelled_at=? WHERE workspace_id=? AND id=? AND revision=?').bind(due,cancel?at:null,ctx.principal.workspaceId,id,revision),
    // Fail the entire transaction if the caller's source revision lost; no detached duty changes.
    ctx.env.DB.prepare('INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN changes()=1 THEN 1 ELSE 0 END)').bind(id+':history-amend'),
    ...duties.flatMap(o=>{
      const state=o.operation_id?'unknown':cancel&&!o.is_expiry?'cancelled':'pending',dueAt=o.is_expiry?o.due_at:due??o.due_at,error=o.operation_id?'Source changed; reconcile existing effect before replacement or compensation':null;
      return [ctx.env.DB.prepare('UPDATE work_obligations SET revision=revision+1,due_at=?,state=?,last_error=? WHERE workspace_id=? AND id=? AND revision=? AND state=? AND operation_id IS ?').bind(dueAt,state,error,ctx.principal.workspaceId,o.id,o.revision,o.state,o.operation_id),obligationHistory(ctx,o,'work.obligation_changed',{state:o.state,dueAt:o.due_at,revision:o.revision,error:o.last_error},{state,dueAt,revision:o.revision+1,error},at)];
    }),
    ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(id+':history-amend')]).catch(error=>{if(/CHECK constraint failed/.test(String(error)))throw new ApiError(409,'revision_conflict','Lifecycle changed');throw error;});
  if(!result.meta.changes)throw new ApiError(409,'revision_conflict','Lifecycle changed');
  await redateLifecycleTasks(ctx, id, { effectiveAt: due, cancel, timezone: row.timezone, ownerId: row.owner_id });
  await ctx.env.DB.prepare(
    "UPDATE work_records SET revision=revision+1,updated_at=? WHERE workspace_id=? AND id=?",
  )
    .bind(now(), ctx.principal.workspaceId, row.work_id)
    .run();
  if (cancel) {
    const applied = (
      await ctx.env.DB.prepare(
        "SELECT * FROM work_obligations WHERE workspace_id=? AND lifecycle_id=? AND (state='verified' OR operation_id IS NOT NULL)",
      )
        .bind(ctx.principal.workspaceId, id)
        .all<{
          kind: string;
          target: string;
          beneficiary_id: string;
          owner_id: string;
        }>()
    ).results;
    for (const original of applied) {
      const kinds =
        original.kind === "identity.create"
          ? ["identity.disable", "sessions.revoke"]
          : original.kind === "access.grant"
            ? ["access.revoke"]
            : original.kind === "device.deliver"
              ? ["device.return"]
              : [];
      // A cancelled hire's sessions are revoked once its disable is verified (one account fence).
      const disableId = crypto.randomUUID();
      for (const kind of kinds) {const taskId=kind==='identity.disable'?disableId:crypto.randomUUID(),at=now();
        await ctx.env.DB.batch([ctx.env.DB.prepare(
          "INSERT OR IGNORE INTO work_obligations(id,workspace_id,work_id,lifecycle_id,kind,target,beneficiary_id,due_at,owner_id,last_error,depends_on) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        )
          .bind(
            taskId,
            ctx.principal.workspaceId,
            row.work_id,
            id,
            kind,
            original.target,
            original.beneficiary_id,
            now(),
            original.owner_id,
            "Cancelled hire: reconcile prior effect and satisfy separate compensation authority",
            kind === "sessions.revoke" ? disableId : null,
          )
          ,obligationHistory(ctx,{id:taskId,work_id:row.work_id,beneficiary_id:original.beneficiary_id,owner_id:original.owner_id},'work.task_created',null,{state:'pending',kind,owner:original.owner_id,dueAt:at},at)]);
      }
    }
  }
  if(cancel){
    const expiry=(await ctx.env.DB.prepare('SELECT * FROM work_obligations WHERE workspace_id=? AND lifecycle_id=? AND is_expiry=1 AND operation_id IS NULL').bind(ctx.principal.workspaceId,id).all<any>()).results,at=now();
    if(expiry.length)await ctx.env.DB.batch(expiry.flatMap(o=>[ctx.env.DB.prepare("UPDATE work_obligations SET due_at=?,state='pending' WHERE workspace_id=? AND id=? AND revision=? AND operation_id IS NULL").bind(at,ctx.principal.workspaceId,o.id,o.revision),obligationHistory(ctx,o,'work.obligation_changed',{state:o.state,dueAt:o.due_at},{state:'pending',dueAt:at},at)]));
  }
  return { id, revision: revision + 1, cancelled: cancel };
}

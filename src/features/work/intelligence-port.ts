import { audienceEvaluation } from './catalog-audience';
import { ApiError, id, now } from "../../platform/http";
import type { WorkIntakePort, IntakeEvent } from "../intelligence/intake-port";
import { getWork, operator, type WorkContext } from "./core";
import { currentWorkPrincipal } from "./identity";
const claims = new WeakMap<object, Map<string, string>>();
export const workIntakePort: WorkIntakePort = {
  async list(ctx, workId) {
    await currentWorkPrincipal(ctx);
    if (workId) await getWork(ctx, workId);
    await ctx.env.DB.prepare(
      "UPDATE work_intake_events SET state='failed',error='Intake lease expired with uncertain model outcome; inspect attempt before explicit new event',lease_token=NULL WHERE workspace_id=? AND state='interpreting' AND lease_until<?",
    )
      .bind(ctx.principal.workspaceId, now())
      .run();
    const rows = (
      await ctx.env.DB.prepare(
        "SELECT id,work_id,sender,state,source_message_id FROM work_intake_events WHERE workspace_id=? AND connection_id='' AND state IN ('pending','needs_configuration','budget_held') AND (? IS NULL OR work_id=?) AND (?=1 OR sender=?) ORDER BY created_at LIMIT 100",
      )
        .bind(
          ctx.principal.workspaceId,
          workId || null,
          workId || null,
          Number(operator(ctx.principal)),
          ctx.principal.userId,
        )
        .all<IntakeEvent>()
    ).results;
    const visible = [];
    for (const row of rows) {
      try {
        const work=await getWork(ctx, row.work_id);
        if(work.pending_person_id && !await ctx.env.DB.prepare("SELECT 1 FROM work_pending_people WHERE workspace_id=? AND id=? AND state='bound'").bind(ctx.principal.workspaceId,work.pending_person_id).first())continue;
        visible.push(row);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) throw error;
      }
    }
    return visible;
  },
  async claim(ctx, eventId) {
    await currentWorkPrincipal(ctx);
    const event = await ctx.env.DB.prepare(
      "SELECT id,work_id,sender,state,source_message_id FROM work_intake_events WHERE workspace_id=? AND id=? AND sender=? AND connection_id='' AND state IN ('pending','needs_configuration','budget_held')",
    )
      .bind(ctx.principal.workspaceId, eventId, ctx.principal.userId)
      .first<IntakeEvent>();
    if (!event) return null;
    const work=await getWork(ctx, event.work_id);
    if(work.pending_person_id && !await ctx.env.DB.prepare("SELECT 1 FROM work_pending_people WHERE workspace_id=? AND id=? AND state='bound'").bind(ctx.principal.workspaceId,work.pending_person_id).first())return null;
    const token = id();
    const result = await ctx.env.DB.prepare(
      "UPDATE work_intake_events SET state='interpreting',lease_token=?,lease_until=? WHERE workspace_id=? AND id=? AND sender=? AND state IN ('pending','needs_configuration','budget_held')",
    )
      .bind(
        token,
        new Date(Date.now() + 180000).toISOString(),
        ctx.principal.workspaceId,
        eventId,
        ctx.principal.userId,
      )
      .run();
    if (!result.meta.changes) return null;
    const owned = claims.get(ctx) || new Map();
    owned.set(eventId, token);
    claims.set(ctx, owned);
    return { ...event, state: "interpreting" };
  },
  async finish(ctx, eventId, result) {
    await currentWorkPrincipal(ctx);
    const token = claims.get(ctx)?.get(eventId);
    if (!token)
      throw new ApiError(409, "intake_claim", "Current intake claim required");
    if (
      !["interpreted", "needs_configuration", "budget_held", "failed"].includes(
        result.state,
      )
    )
      throw new ApiError(
        422,
        "intake_state",
        "Known terminal or held intake state required",
      );
    const changed = await ctx.env.DB.prepare(
      "UPDATE work_intake_events SET state=?,result_json=?,error=?,lease_token=NULL,lease_until=NULL WHERE workspace_id=? AND id=? AND sender=? AND state='interpreting' AND lease_token=? AND lease_until>?",
    )
      .bind(
        result.state,
        result.result === undefined ? null : JSON.stringify(result.result),
        result.error || null,
        ctx.principal.workspaceId,
        eventId,
        ctx.principal.userId,
        token,
        now(),
      )
      .run();
    if (!changed.meta.changes)
      throw new ApiError(
        409,
        "intake_claim_lost",
        "Intake changed or lease expired",
      );
    claims.get(ctx)?.delete(eventId);
    return { id: eventId, state: result.state };
  },
  async catalog(ctx) {
    await currentWorkPrincipal(ctx);
    const rows = (
      await ctx.env.DB.prepare(
        "SELECT id,name,kind,target,owner_id,revision,audience_json FROM work_catalog WHERE workspace_id=? ORDER BY name",
      )
        .bind(ctx.principal.workspaceId)
        .all<{
          id: string;
          name: string;
          kind: string;
          target: string;
          owner_id: string;
          revision: number;
          audience_json: string;
        }>()
    ).results;
    const eligible=[];
    for(const row of rows)if((await audienceEvaluation(ctx,row,ctx.principal.userId)).allowed){
      const {audience_json,...item}=row;eligible.push(item);
    }
    return eligible;
  },
};

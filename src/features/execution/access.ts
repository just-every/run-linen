import { currentPrincipal } from '../work/identity';
import { workReadable } from '../work/scope';
import { getCommitment } from "../intelligence/commitments";
import { assert, membership } from "./authority";
import { getService } from "../services/store";
import type { CoreContext, Plan } from "./types";
export async function accessiblePlan(ctx: CoreContext, planId: string) {
  const roles = await membership(ctx);
  const p = await ctx.env.DB.prepare(
    "SELECT * FROM execution_plans WHERE id=? AND workspace_id=?",
  )
    .bind(planId, ctx.principal.workspaceId)
    .first<Plan>();
  assert(p, "plan_missing", 404);
  if (p.context_type === "commitment") {
    await getCommitment(ctx, p.work_id);
    return p;
  }
  if (p.context_type === "engineering") {
    const job: any = await ctx.env.DB.prepare(
      "SELECT commitment_id FROM intelligence_engineering_jobs WHERE id=? AND workspace_id=?",
    )
      .bind(p.work_id, ctx.principal.workspaceId)
      .first();
    assert(job, "plan_missing", 404);
    await getCommitment(ctx, job.commitment_id);
    return p;
  }
  if (p.context_type === "change") {
    await getService(
      ctx.env.DB,
      { ...ctx.principal, roles: roles as any },
      p.work_id,
      "change",
    );
    return p;
  }
  const work: any = await ctx.env.DB.prepare(
    "SELECT sensitivity,requester_id,beneficiary_id,assignee_id,department_id FROM work_records WHERE id=? AND workspace_id=?",
  )
    .bind(p.work_id, ctx.principal.workspaceId)
    .first();
  const principal = await currentPrincipal(ctx.env.DB, ctx.principal);
  assert(
    work && (!work.department_id || workReadable(principal, work)) &&
      (work.sensitivity === "normal" ||
        roles.includes("owner") ||
        roles.includes("hr") ||
        [work.requester_id, work.beneficiary_id, work.assignee_id].includes(
          ctx.principal.userId,
        )),
    "plan_missing",
    404,
  );
  return p;
}

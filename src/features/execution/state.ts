import { accessiblePlan } from "./access";
import { origin } from "./origin";
import { assert, authorize, privileged, membership } from "./authority";
import type { CoreContext, Operation } from "./types";
export async function getOperation(ctx: CoreContext, operationId: string) {
  await privileged(ctx);
  const o = await ctx.env.DB.prepare(
    "SELECT * FROM execution_operations WHERE id=? AND workspace_id=?",
  )
    .bind(operationId, ctx.principal.workspaceId)
    .first<Operation>();
  assert(o, "operation_missing", 404);
  await accessiblePlan(ctx, o.plan_id);
  return o;
}
export async function acting(ctx: CoreContext, o: Operation) {
  return {
    ...ctx,
    principal: {
      ...ctx.principal,
      userId: o.actor_id,
      roles: (await membership(
        ctx,
        o.actor_id,
      )) as CoreContext["principal"]["roles"],
    },
  };
}
export async function current(ctx: CoreContext, o: Operation) {
  const p: any = await ctx.env.DB.prepare(
    "SELECT * FROM execution_plans WHERE id=? AND workspace_id=?",
  )
    .bind(o.plan_id, o.workspace_id)
    .first();
  assert(p, "plan_missing");
  if (o.parent_id === "initial")
    await origin(
      await acting(ctx, o),
      p.context_type,
      p.work_id,
      p.work_revision,
      JSON.parse(p.context_snapshot_json),
    );
  await authorize(
    await acting(ctx, o),
    JSON.parse(o.step_json),
    o.plan_id,
    o.id,
  );
}
export async function setState(ctx: CoreContext, o: Operation, state: string) {
  await ctx.env.DB.prepare(
    "UPDATE execution_operations SET state=?,revision=revision+1,lease_until=NULL WHERE id=? AND workspace_id=? AND fence=? AND (?!='verified' OR cancel_requested=0)",
  )
    .bind(state, o.id, o.workspace_id, o.fence, state)
    .run();
}

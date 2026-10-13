import { ApiError } from "../../platform/http";
import type { WorkContext } from "./core";
/** Service functions also protect non-HTTP callers and revoked/changed memberships. */
export async function currentWorkPrincipal(ctx: WorkContext) {
  const membership = await ctx.env.DB.prepare(
    "SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1",
  )
    .bind(ctx.principal.workspaceId, ctx.principal.userId)
    .first<{ roles_json: string }>();
  if (!membership)
    throw new ApiError(404, "not_found", "Current membership unavailable");
  const roles = JSON.parse(membership.roles_json);
  ctx.principal = {
    ...ctx.principal,
    roles: ctx.principal.roles.filter((role) => roles.includes(role)),
  };
}

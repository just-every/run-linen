import { ApiError } from "../../platform/http";
import type { Principal } from '../../platform/types';
import type { WorkContext } from "./core";
/** Service functions also protect non-HTTP callers and revoked/changed memberships. */
export async function currentPrincipal(db: D1Database, principal: Principal) {
  const membership = await db.prepare(
    "SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1",
  )
    .bind(principal.workspaceId, principal.userId)
    .first<{ roles_json: string }>();
  if (!membership)
    throw new ApiError(404, "not_found", "Current membership unavailable");
  const roles = JSON.parse(membership.roles_json);
  const departments = await db.prepare(`SELECT d.id FROM work_departments d JOIN work_department_members dm ON dm.workspace_id=d.workspace_id AND dm.department_id=d.id WHERE d.workspace_id=? AND d.active=1 AND dm.user_id=? AND dm.active=1`).bind(principal.workspaceId,principal.userId).all<{id:string}>();
  return {
    ...principal,
    departmentIds: departments.results.map(d=>d.id),
    roles: principal.roles.filter((role) => roles.includes(role)),
  };
}

export async function currentWorkPrincipal(ctx: WorkContext) {
  ctx.principal = await currentPrincipal(ctx.env.DB,ctx.principal);
}

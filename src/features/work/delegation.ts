import { ApiError, id, now } from "../../platform/http";
import { currentWorkPrincipal } from "./identity";
import type { WorkContext } from "./core";
export async function delegateManager(
  ctx: WorkContext,
  input: { managerId: string; delegateId: string; expiresAt: string; startsAt?: string },
) {
  await currentWorkPrincipal(ctx);
  if (
    ctx.principal.userId !== input.managerId &&
    !ctx.principal.roles.includes("owner")
  )
    throw new ApiError(
      403,
      "delegation_issuer",
      "Only current manager or owner can record delegation",
    );
  if (
    input.managerId === input.delegateId ||
    !Number.isFinite(Date.parse(input.expiresAt)) ||
    Date.parse(input.expiresAt) <= Math.max(Date.now(),Date.parse(input.startsAt??now())) || (input.startsAt!==undefined && !Number.isFinite(Date.parse(input.startsAt)))
  )
    throw new ApiError(
      422,
      "delegation_scope",
      "Distinct delegate and future expiry required",
    );
  const manager = await ctx.env.DB.prepare(
    "SELECT user_id FROM memberships WHERE workspace_id=? AND user_id=? AND active=1",
  )
    .bind(ctx.principal.workspaceId, input.managerId)
    .first();
  const delegate = await ctx.env.DB.prepare(
    "SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1",
  )
    .bind(ctx.principal.workspaceId, input.delegateId)
    .first<{ roles_json: string }>();
  if (
    !manager ||
    !delegate ||
    !JSON.parse(delegate.roles_json).some((r: string) =>
      ["approver", "owner"].includes(r),
    )
  )
    throw new ApiError(
      422,
      "delegation_identity",
      "Active manager and authorized decision holder required",
    );
  const delegationId = id();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      "INSERT INTO work_delegations VALUES(?,?,?,?,?,?,NULL)",
    ).bind(
      delegationId,
      ctx.principal.workspaceId,
      input.managerId,
      input.delegateId,
      input.startsAt??now(),
      input.expiresAt,
    ),
    ctx.env.DB.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)").bind(
      id(),
      ctx.principal.workspaceId,
      ctx.principal.userId,
      "work.manager_delegated",
      delegationId,
      JSON.stringify(input),
      now(),
    ),
  ]);
  return {
    id: delegationId,
    authority:
      "Manager decision routing only; provider execution still requires its exact action grant",
  };
}
export async function resolveManager(
  ctx: WorkContext,
  managerId: string | null,
) {
  await currentWorkPrincipal(ctx);
  if (!managerId || !await ctx.env.DB.prepare('SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1')
    .bind(ctx.principal.workspaceId,managerId).first()) return null;
  const delegate = await ctx.env.DB.prepare(
    "SELECT d.delegate_id FROM work_delegations d JOIN memberships m ON m.workspace_id=d.workspace_id AND m.user_id=d.delegate_id AND m.active=1 WHERE d.workspace_id=? AND d.manager_id=? AND d.starts_at<=? AND d.expires_at>? AND d.revoked_at IS NULL AND EXISTS(SELECT 1 FROM json_each(m.roles_json) r WHERE r.value IN ('approver','owner')) ORDER BY d.starts_at DESC LIMIT 1",
  )
    .bind(ctx.principal.workspaceId, managerId, now(), now())
    .first<{ delegate_id: string }>();
  if (delegate) return delegate.delegate_id;
  return (await ctx.env.DB.prepare(
    "SELECT user_id FROM memberships WHERE workspace_id=? AND user_id=? AND active=1",
  )
    .bind(ctx.principal.workspaceId, managerId)
    .first())
    ? managerId
    : null;
}

/** Withdrawal immediately returns future decisions to their holder; already emailed tokens cannot bypass it. */
export async function revokeDelegation(ctx:WorkContext,delegationId:string){
 await currentWorkPrincipal(ctx);
 const row=await ctx.env.DB.prepare('SELECT manager_id FROM work_delegations WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,delegationId).first<{manager_id:string}>();
 if(!row)throw new ApiError(404,'not_found','Delegation not found');
 if(ctx.principal.userId!==row.manager_id) {
  if(!ctx.principal.roles.includes('owner'))throw new ApiError(403,'delegation_issuer','Only the holder or owner may withdraw a delegation');
 }
 await ctx.env.DB.batch([
  ctx.env.DB.prepare('UPDATE work_delegations SET revoked_at=? WHERE workspace_id=? AND id=? AND revoked_at IS NULL').bind(now(),ctx.principal.workspaceId,delegationId),
  ctx.env.DB.prepare("INSERT INTO audit_events SELECT ?,?,?,'work.delegation_revoked',?,'{}',? WHERE changes()=1").bind(id(),ctx.principal.workspaceId,ctx.principal.userId,delegationId,now()),
 ]);
 return {state:'revoked'};
}

import { bindingErasureGuard, personForMember } from './person-binding';
import { fulfilmentManagerApproval } from "./fulfilment-authority";
import { amendFulfilment } from "./fulfilment-amend";
import { resolveManager } from "./delegation";
import { currentWorkPrincipal } from "./identity";
import { ApiError, id, now } from "../../platform/http";
import { getWork, permit, type WorkContext } from "./core";
export async function createCatalogItem(
  ctx: WorkContext,
  input: {
    name: string;
    kind: "access" | "software" | "device";
    target: string;
    ownerId: string;
    requiresManager?: boolean;
    capacity?: number;
  },
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner"]);
  if (
    !input.name ||
    !input.target ||
    !input.ownerId ||
    !["access", "software", "device"].includes(input.kind) ||
    (input.capacity !== undefined &&
      (!Number.isInteger(input.capacity) || input.capacity < 0))
  )
    throw new ApiError(
      422,
      "catalog_invalid",
      "Name, target, owner, kind and nonnegative capacity required",
    );
  const itemId = id();
  await ctx.env.DB.prepare("INSERT INTO work_catalog VALUES(?,?,?,?,?,?,?,?,1)")
    .bind(
      itemId,
      ctx.principal.workspaceId,
      input.name,
      input.kind,
      input.target,
      input.ownerId,
      Number(input.requiresManager || false),
      input.capacity ?? null,
    )
    .run();
  return { id: itemId };
}
export async function requestFulfilment(
  ctx: WorkContext,
  workId: string,
  input: {
    catalogId: string;
    beneficiaryId: string;
    purpose: string;
    expiresAt?: string;
    expectedWorkRevision?: number;
    expectedFulfilmentRevision?: number;
    idempotencyKey?: string;
  },
) {
  await currentWorkPrincipal(ctx);
  if (input.expectedWorkRevision !== undefined && input.expectedFulfilmentRevision !== undefined && input.idempotencyKey)
    return amendFulfilment(ctx,workId,{...input,expectedWorkRevision:input.expectedWorkRevision,
      expectedFulfilmentRevision:input.expectedFulfilmentRevision,idempotencyKey:input.idempotencyKey});
  const work = await getWork(ctx, workId);
  if (input.beneficiaryId !== ctx.principal.userId)
    permit(ctx, ["owner", "operator", "hr"]);
  if (
    !input.purpose ||
    (input.expiresAt &&
      (!Number.isFinite(Date.parse(input.expiresAt)) ||
        Date.parse(input.expiresAt) <= Date.now()))
  )
    throw new ApiError(
      422,
      "invalid_fulfilment",
      "Purpose and future expiry required",
    );
  const catalog = await ctx.env.DB.prepare(
    "SELECT * FROM work_catalog WHERE workspace_id=? AND id=?",
  )
    .bind(ctx.principal.workspaceId, input.catalogId)
    .first<{
      kind: string;
      target: string;
      owner_id: string;
      requires_manager: number;
      capacity: number | null;
    }>();
  if (!catalog) throw new ApiError(404, "not_found", "Catalog item not found");
  const person = await personForMember(ctx, input.beneficiaryId);
  let blocked: string | null = null;
  const decisionOwner = await resolveManager(ctx, person?.manager_id || null);
  if (catalog.requires_manager && !decisionOwner)
    blocked = "Missing authoritative manager; owner must resolve authority";
  if (catalog.capacity === 0)
    blocked =
      catalog.kind === "device"
        ? "No stock; acquisition owner required"
        : "No license capacity; license owner required";
  const previous = await ctx.env.DB.prepare(
    "SELECT id,revision,beneficiary_id,purpose,expires_at FROM work_fulfilments WHERE workspace_id=? AND work_id=? AND catalog_id=?",
  )
    .bind(ctx.principal.workspaceId, workId, input.catalogId)
    .first<{
      id: string; revision: number;
      beneficiary_id: string;
      purpose: string;
      expires_at: string | null;
    }>();
  if (
    previous &&
    (previous.beneficiary_id !== input.beneficiaryId ||
      previous.purpose !== input.purpose ||
      previous.expires_at !== (input.expiresAt || null))
  )
    throw new ApiError(
      409,
      "fulfilment_changed",
      "Material beneficiary, purpose or expiry edit requires revised work and renewed authority",
    );
  if (catalog.requires_manager) {
    const approval = await fulfilmentManagerApproval(ctx,work,{...catalog,id:input.catalogId,
      revision:(await ctx.env.DB.prepare("SELECT revision FROM work_catalog WHERE workspace_id=? AND id=?")
        .bind(ctx.principal.workspaceId,input.catalogId).first<{revision:number}>())!.revision},
      previous || {beneficiary_id:input.beneficiaryId,purpose:input.purpose,expires_at:input.expiresAt||null});
    if(!approval.allowed) blocked = approval.holderId
      ? "Current scoped manager approval required; manager identity alone does not approve this request"
      : "Missing authoritative manager; owner must resolve authority";
  }
  if (catalog.capacity !== null) {
    await ctx.env.DB.prepare(
      "INSERT OR IGNORE INTO work_catalog_reservations SELECT ?,?,?,?,?,NULL WHERE (SELECT COUNT(*) FROM work_catalog_reservations WHERE workspace_id=? AND catalog_id=? AND released_at IS NULL)<?",
    )
      .bind(
        ctx.principal.workspaceId,
        input.catalogId,
        workId,
        input.beneficiaryId,
        now(),
        ctx.principal.workspaceId,
        input.catalogId,
        catalog.capacity,
      )
      .run();
    const reserved = await ctx.env.DB.prepare(
      "SELECT 1 FROM work_catalog_reservations WHERE workspace_id=? AND catalog_id=? AND work_id=? AND released_at IS NULL",
    )
      .bind(ctx.principal.workspaceId, input.catalogId, workId)
      .first();
    if (!reserved)
      blocked =
        catalog.kind === "device"
          ? "No stock; acquisition owner required"
          : "No license capacity; license owner required";
  }
  const fid = id();
  const kind = catalog.kind === "device" ? "device.deliver" : "access.grant";
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      "INSERT OR IGNORE INTO work_fulfilments VALUES(?,?,?,?,?,?,?,1)",
    ).bind(
      fid,
      ctx.principal.workspaceId,
      work.id,
      input.catalogId,
      input.beneficiaryId,
      input.purpose,
      input.expiresAt || null,
    ),
    ctx.env.DB.prepare(
      "INSERT OR IGNORE INTO work_obligations(id,workspace_id,work_id,kind,target,beneficiary_id,due_at,state,owner_id,last_error) VALUES(?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      id(),
      ctx.principal.workspaceId,
      work.id,
      kind,
      catalog.target,
      input.beneficiaryId,
      now(),
      blocked ? "blocked" : "pending",
      catalog.owner_id,
      blocked,
    ),
    // A newly recorded responsibility is a change to the request: its queue row and "Last changed" move.
    ...(previous ? [] : [ctx.env.DB.prepare("UPDATE work_records SET updated_at=? WHERE workspace_id=? AND id=?").bind(now(), ctx.principal.workspaceId, work.id)]),
  ]);
  if (input.expiresAt && catalog.kind !== "device")
    await ctx.env.DB.prepare(
      "INSERT OR IGNORE INTO work_obligations(id,workspace_id,work_id,kind,target,beneficiary_id,due_at,owner_id) VALUES(?,?,?,?,?,?,?,?)",
    )
      .bind(
        id(),
        ctx.principal.workspaceId,
        work.id,
        "access.revoke",
        catalog.target,
        input.beneficiaryId,
        input.expiresAt,
        catalog.owner_id,
      )
      .run();
  return {
    workId: work.id,
    state: blocked ? "blocked" : "pending",
    reason: blocked,
    ownerId: catalog.owner_id,
    decisionOwner,
    authority:
      "Execution must independently check current action grant; manager identity is not a grant",
  };
}
export async function listObligations(ctx: WorkContext, workId: string) {
  await currentWorkPrincipal(ctx);
  await getWork(ctx, workId);
  return (
    await ctx.env.DB.prepare(
      "SELECT id,kind,target,beneficiary_id,due_at,state,owner_id,operation_id,last_error,revision FROM work_obligations WHERE workspace_id=? AND work_id=? ORDER BY due_at",
    )
      .bind(ctx.principal.workspaceId, workId)
      .all()
  ).results;
}
export async function recordPhysicalHandoff(
  ctx: WorkContext,
  obligationId: string,
  input: { revision: number; custodyEventId: string },
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator"]);
  const obligation = await ctx.env.DB.prepare(
    "SELECT * FROM work_obligations WHERE workspace_id=? AND id=? AND kind IN ('device.deliver','device.return')",
  )
    .bind(ctx.principal.workspaceId, obligationId)
    .first<{
      work_id: string;
      lifecycle_id: string | null;
      target: string;
      beneficiary_id: string;
      kind: string;
    }>();
  if (!obligation)
    throw new ApiError(404, "not_found", "Physical obligation not found");
  await getWork(ctx, obligation.work_id);
  // Lifecycle obligations name a domain person explicitly. Catalogue obligations
  // name an account and must resolve its current reviewed relationship.
  const person = obligation.lifecycle_id
    ? await ctx.env.DB.prepare(`SELECT p.* FROM work_people p JOIN work_lifecycle l
        ON l.workspace_id=p.workspace_id AND l.person_id=p.id
        WHERE p.workspace_id=? AND l.id=? AND l.work_id=? AND p.id=? AND p.merged_into IS NULL`)
        .bind(ctx.principal.workspaceId, obligation.lifecycle_id, obligation.work_id, obligation.beneficiary_id).first<any>()
    : await personForMember(ctx, obligation.beneficiary_id);
  const event = await ctx.env.DB.prepare(
    "SELECT * FROM work_custody WHERE workspace_id=? AND id=? AND asset_id=?",
  )
    .bind(ctx.principal.workspaceId, input.custodyEventId, obligation.target)
    .first<{ kind: string; person_id: string | null }>();
  if (
    !person || !event ||
    event.kind !==
      (obligation.kind === "device.return" ? "return" : "receive") ||
    event.person_id !== person.id
  )
    throw new ApiError(
      422,
      "custody_evidence",
      "Matching custody receipt/return required",
    );
  const admission = await bindingErasureGuard(ctx, person,
    obligation.lifecycle_id ? null : obligation.beneficiary_id, null);
  const result = await ctx.env.DB.prepare(`UPDATE work_obligations
    SET state='verified',revision=revision+1,last_error=NULL WHERE workspace_id=? AND id=? AND revision=?
    AND EXISTS(SELECT 1 FROM work_people p WHERE p.workspace_id=work_obligations.workspace_id
      AND p.id=? AND p.revision=? AND p.member_id IS ? AND p.binding_id IS ? AND p.merged_into IS NULL
      AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=p.workspace_id
        AND e.person_id IN (p.id,p.source||':'||p.source_id))
      AND ((work_obligations.lifecycle_id IS NOT NULL AND EXISTS(SELECT 1 FROM work_lifecycle l
        WHERE l.workspace_id=p.workspace_id AND l.id=work_obligations.lifecycle_id
        AND l.work_id=work_obligations.work_id AND l.person_id=p.id AND work_obligations.beneficiary_id=p.id))
        OR (work_obligations.lifecycle_id IS NULL AND p.member_id=work_obligations.beneficiary_id
          AND p.active=1 AND p.binding_id IS NOT NULL AND EXISTS(SELECT 1 FROM memberships m
            WHERE m.workspace_id=p.workspace_id AND m.user_id=p.member_id AND m.active=1)
          AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=p.workspace_id
            AND e.person_id IN (p.member_id,'member:'||p.member_id)))))
    AND EXISTS(SELECT 1 FROM work_custody c WHERE c.workspace_id=work_obligations.workspace_id
      AND c.id=? AND c.asset_id=work_obligations.target AND c.person_id=? AND c.kind=?)
    AND ${admission.sql}`)
    .bind(ctx.principal.workspaceId, obligationId, input.revision, person.id, person.revision,
      person.member_id, person.binding_id, input.custodyEventId, person.id, event.kind, ...admission.bindings)
    .run();
  if (!result.meta.changes)
    throw new ApiError(409, "revision_conflict", "Obligation, person or reviewed binding changed");
  await ctx.env.DB.prepare("UPDATE work_records SET updated_at=? WHERE workspace_id=? AND id=?")
    .bind(now(), ctx.principal.workspaceId, obligation.work_id).run();
  return {
    id: obligationId,
    state: "verified",
    custodyEventId: input.custodyEventId,
  };
}

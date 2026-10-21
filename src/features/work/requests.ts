import { catalogRequestSnapshot } from './catalog-items';
import { applicationForRequest, applicationProjection } from './application-catalog';
import { bindingErasureGuard, personForMember } from './person-binding';
import { fulfilmentManagerApproval } from "./fulfilment-authority";
import { amendFulfilment } from "./fulfilment-amend";
import { resolveManager } from "./delegation";
import { currentWorkPrincipal } from "./identity";
import { ApiError, id, now } from "../../platform/http";
import { getWork, permit, type WorkContext } from "./core";
export { createCatalogItem } from './catalog-items';
export async function requestFulfilment(
  ctx: WorkContext,
  workId: string,
  input: {
    catalogId: string;
    catalogRevision?: number;
    answers?: unknown;
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
  if(await ctx.env.DB.prepare(`SELECT 1 FROM work_pending_people h WHERE h.workspace_id=? AND (h.id=? OR (h.state<>'bound' AND h.email=(SELECT lower(trim(email)) FROM users WHERE id=?)))`).bind(ctx.principal.workspaceId,input.beneficiaryId,input.beneficiaryId).first())
    throw new ApiError(409,'pending_person_unbound','Use the held pending-person request until normal account authentication binds this person');
  if(work.pending_person_id && !await ctx.env.DB.prepare("SELECT 1 FROM work_pending_people WHERE workspace_id=? AND id=? AND state='bound'").bind(ctx.principal.workspaceId,work.pending_person_id).first())
    throw new ApiError(409,'pending_person_unbound','Services are held until this person signs in with their verified email account');
  if (["closed", "cancelled"].includes(work.state))
    throw new ApiError(409, "work_closed", "Reopen the request before choosing a service for it");
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
      id: string; name: string; revision: number; form_json: string;
      application_id: string | null;
      entitlement_id: string | null;
      kind: string;
      target: string;
      owner_id: string;
      requires_manager: number;
      capacity: number | null;
    }>();
  if (!catalog) throw new ApiError(404, "not_found", "Catalog item not found");
  const catalogSnapshot = await catalogRequestSnapshot(ctx,workId,catalog,input);
  const application = await applicationForRequest(ctx,workId,catalog);
  if(application)catalog.owner_id=application.ownerId;
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
  const fid = id(), catalogGuard = id();
  const kind = catalog.kind === "device" ? "device.deliver" : "access.grant";
  try { await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN
      EXISTS(SELECT 1 FROM work_fulfilments WHERE workspace_id=? AND work_id=? AND catalog_id=?) OR
      EXISTS(SELECT 1 FROM work_catalog WHERE workspace_id=? AND id=? AND revision=? AND form_json=?) THEN 1 ELSE 0 END)`)
      .bind(catalogGuard,ctx.principal.workspaceId,work.id,input.catalogId,ctx.principal.workspaceId,input.catalogId,catalogSnapshot.revision,JSON.stringify(catalogSnapshot.form)),
    ctx.env.DB.prepare(
      "INSERT OR IGNORE INTO work_fulfilments(id,workspace_id,work_id,catalog_id,beneficiary_id,purpose,expires_at,revision,application_json,catalog_snapshot_json) VALUES(?,?,?,?,?,?,?,1,?,?)",
    ).bind(
      fid,
      ctx.principal.workspaceId,
      work.id,
      input.catalogId,
      input.beneficiaryId,
      input.purpose,
      input.expiresAt || null,
      application ? JSON.stringify(application) : null,
      JSON.stringify(catalogSnapshot),
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
    ctx.env.DB.prepare("DELETE FROM work_fulfilment_link_guards WHERE id=?").bind(catalogGuard),
  ]); } catch(error) {
    if(String(error).includes('CHECK constraint failed'))throw new ApiError(409,'catalog_changed','Catalog form changed before submission; review it again');
    throw error;
  }
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
    application: application ? applicationProjection(ctx,application) : null,
    catalogSnapshot,
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

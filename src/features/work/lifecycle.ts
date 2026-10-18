import { hashToken } from "../../platform/crypto";
import { currentWorkPrincipal } from "./identity";
import { ApiError, id, now } from "../../platform/http";
import { createWork, getWork, permit, type WorkContext } from "./core";
export interface LifecycleInput {
  personId: string;
  kind: "join" | "move" | "leave";
  effectiveAt: string;
  timezone: string;
  source: string;
  sourceRevision: number;
  retained: string[];
  added: string[];
  removed: string[];
  deviceIds: string[];
  expiresAt?: string;
  ownerId: string;
  urgent?: boolean;
  identityTarget?: string;
}
export function effectiveInstant(value: string, timezone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new ApiError(422, "invalid_timezone", "IANA timezone required");
  }
  if (!/(Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value)))
    throw new ApiError(
      422,
      "ambiguous_time",
      "Effective time must include UTC or explicit offset, including at DST transitions",
    );
  return new Date(value).toISOString();
}
export async function createLifecycle(ctx: WorkContext, input: LifecycleInput) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "hr", "integration"]);
  if (
    !input ||
    ![
      input.personId,
      input.source,
      input.ownerId,
      input.timezone,
      input.effectiveAt,
    ].every((v) => typeof v === "string" && v.length > 0 && v.length < 1000) ||
    !Number.isInteger(input.sourceRevision) ||
    input.sourceRevision < 1
  )
    throw new ApiError(
      422,
      "lifecycle_input",
      "Stable person, source, positive revision, owner and explicit effective time/timezone required",
    );
  if (
    ctx.principal.roles.includes("integration") &&
    !ctx.principal.roles.some((r) => ["owner", "hr"].includes(r))
  ) {
    const settings = await ctx.env.DB.prepare(
      "SELECT settings_json FROM workspace_settings WHERE workspace_id=?",
    )
      .bind(ctx.principal.workspaceId)
      .first<{ settings_json: string }>();
    if (
      !settings ||
      JSON.parse(settings.settings_json).hrSourceConnectionId !== input.source
    )
      throw new ApiError(
        403,
        "hr_source_authority",
        "Integration must match owner-configured authoritative HR source",
      );
  }
  const latest = await ctx.env.DB.prepare(
    "SELECT MAX(source_revision) revision FROM work_lifecycle WHERE workspace_id=? AND source=? AND person_id=?",
  )
    .bind(ctx.principal.workspaceId, input.source, input.personId)
    .first<{ revision: number | null }>();
  if (
    latest?.revision !== null &&
    latest?.revision !== undefined &&
    latest.revision > input.sourceRevision
  )
    throw new ApiError(
      409,
      "stale_hr_source",
      "A newer authoritative HR revision is already retained",
    );
  const effectiveAt = effectiveInstant(input.effectiveAt, input.timezone);
  const expiry = input.expiresAt
    ? effectiveInstant(input.expiresAt, input.timezone)
    : null;
  if (expiry && expiry <= effectiveAt)
    throw new ApiError(
      422,
      "expiry_order",
      "Contractor expiry must follow effective time",
    );
  if (
    !Array.isArray(input.added) ||
    !Array.isArray(input.removed) ||
    !Array.isArray(input.retained) ||
    !Array.isArray(input.deviceIds)
  )
    throw new ApiError(
      422,
      "invalid_obligations",
      "Access differences and devices must be arrays",
    );
  if (
    [
      ...input.added,
      ...input.removed,
      ...input.retained,
      ...input.deviceIds,
    ].some((v) => typeof v !== "string" || !v || v.length > 500) ||
    input.added.length +
      input.removed.length +
      input.retained.length +
      input.deviceIds.length >
      500
  )
    throw new ApiError(
      422,
      "invalid_obligations",
      "Bounded arrays of stable string targets required",
    );
  if (
    input.added.some(
      (x) => input.removed.includes(x) || input.retained.includes(x),
    ) ||
    input.removed.some((x) => input.retained.includes(x))
  )
    throw new ApiError(
      422,
      "overlapping_access",
      "Retained, added and removed rights must be disjoint",
    );
  if (
    !input.ownerId ||
    !input.source ||
    !Number.isInteger(input.sourceRevision)
  )
    throw new ApiError(
      422,
      "invalid_source",
      "Source revision and accountable owner required",
    );
  if (!["join", "move", "leave"].includes(input.kind))
    throw new ApiError(422, "invalid_kind", "Unknown lifecycle kind");
  const person = await ctx.env.DB.prepare(
    "SELECT * FROM work_people WHERE workspace_id=? AND id=? AND merged_into IS NULL",
  )
    .bind(ctx.principal.workspaceId, input.personId)
    .first();
  if (!person)
    throw new ApiError(422, "person_required", "Known stable person required");
  if(await ctx.env.DB.prepare("SELECT 1 FROM work_pending_people WHERE workspace_id=? AND id=? AND state<>'bound'").bind(ctx.principal.workspaceId,input.personId).first())
    throw new ApiError(409,'pending_person_unbound','Pending person services are held until normal account authentication');
  // Source identity is workspace-wide, independent of which admitted HR actor
  // delivered it. Every effect-bearing input belongs to its immutable revision.
  const material = {
    personId: input.personId, kind: input.kind, effectiveAt, timezone: input.timezone,
    source: input.source, sourceRevision: input.sourceRevision, ownerId: input.ownerId,
    retained: [...new Set(input.retained)].sort(), added: [...new Set(input.added)].sort(),
    removed: [...new Set(input.removed)].sort(), deviceIds: [...new Set(input.deviceIds)].sort(),
    expiresAt: expiry, urgent: Boolean(input.urgent), identityTarget: input.identityTarget || input.personId,
  };
  const fingerprint = await hashToken(JSON.stringify(material));
  const prior = await ctx.env.DB.prepare(
    "SELECT id,work_id,source_hash FROM work_lifecycle WHERE workspace_id=? AND source=? AND person_id=? AND source_revision=?",
  ).bind(ctx.principal.workspaceId, input.source, input.personId, input.sourceRevision)
    .first<{ id: string; work_id: string; source_hash: string | null }>();
  if (prior) {
    if (prior.source_hash !== fingerprint)
      throw new ApiError(409, "hr_revision_conflict", "This source revision already binds different material facts, or lacks its original fingerprint; issue a new authoritative revision");
    // Replay is read-only even after an amendment or cancellation.
    return { work: await getWork(ctx, prior.work_id), lifecycleId: prior.id };
  }
  const lifecycleId = id();
  const obligations = [
    ...input.added.map((target) => ({ kind: "access.grant", target })),
    ...input.removed.map((target) => ({ kind: "access.revoke", target })),
    ...input.deviceIds.map((target) => ({
      kind: input.kind === "leave" ? "device.return" : "device.deliver",
      target,
    })),
  ];
  if (input.kind === "leave")
    obligations.unshift(
      {
        kind: "identity.disable",
        target: input.identityTarget || input.personId,
      },
      {
        kind: "sessions.revoke",
        target: input.identityTarget || input.personId,
      },
    );
  if (input.kind === "join")
    obligations.unshift({
      kind: "identity.create",
      target: input.identityTarget || input.personId,
    });
  const identityId = id();
  let work;
  try { work = await createWork(ctx, {
    title: `${input.kind}: ${person.name}`,
    body: `${input.kind} effective ${effectiveAt} (${input.timezone}). Physical and security duties are tracked separately.`,
    deduplicationKey: `hr:${input.source}:${input.personId}:${input.sourceRevision}`,
    sensitivity: "hr", beneficiaryId: input.personId, context: material,
  }, {
    admittedLifecycleBeneficiary: input.personId,
    statements: (workId) => [
      ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN NOT EXISTS(SELECT 1 FROM work_lifecycle WHERE workspace_id=? AND source=? AND person_id=? AND source_revision>?) THEN 1 ELSE 0 END)`).bind(lifecycleId, ctx.principal.workspaceId, input.source, input.personId, input.sourceRevision),
      // Plain INSERT makes a concurrent source replay roll back the entire intake.
      ctx.env.DB.prepare(
        "INSERT INTO work_lifecycle(id,workspace_id,work_id,person_id,kind,effective_at,timezone,source,source_revision,source_hash) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ).bind(lifecycleId, ctx.principal.workspaceId, workId, input.personId, input.kind,
        effectiveAt, input.timezone, input.source, input.sourceRevision, fingerprint),
      ...obligations.map((o, i) => ctx.env.DB.prepare(
        "INSERT OR IGNORE INTO work_obligations(id,workspace_id,work_id,lifecycle_id,kind,target,beneficiary_id,due_at,depends_on,owner_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ).bind(i === 0 ? identityId : id(), ctx.principal.workspaceId, workId, lifecycleId,
        o.kind, o.target, input.personId, input.urgent && input.kind === "leave" ? now() : effectiveAt,
        input.kind === "join" && i > 0 ? identityId : null, input.ownerId)),
      ...(expiry ? ["identity.disable", "sessions.revoke"].map(kind => ctx.env.DB.prepare(
        "INSERT OR IGNORE INTO work_obligations(id,workspace_id,work_id,lifecycle_id,kind,target,beneficiary_id,due_at,owner_id,is_expiry) VALUES(?,?,?,?,?,?,?,?,?,1)",
      ).bind(id(), ctx.principal.workspaceId, workId, lifecycleId, kind, material.identityTarget,
        input.personId, expiry, input.ownerId)) : []),
      ctx.env.DB.prepare("DELETE FROM work_fulfilment_link_guards WHERE id=?").bind(lifecycleId),
    ],
  }); } catch (error) {
    if (String(error).includes("UNIQUE constraint failed: work_lifecycle"))
      throw new ApiError(409, "hr_revision_conflict", "The HR source revision was concurrently admitted; reload its existing record before replay");
    throw error;
  }
  return { work, lifecycleId };
}

export { amendLifecycle } from "./lifecycle-amend";
export { processDueWork } from "./processor";
export type { Obligation, WorkExecutionPort } from "./processor";

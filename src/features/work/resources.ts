import { currentWorkPrincipal } from "./identity";
import { ApiError, id, now } from "../../platform/http";
import { permit, type WorkContext } from "./core";
export async function upsertPerson(
  ctx: WorkContext,
  input: {
    source: string;
    sourceId: string;
    name: string;
    managerId?: string;
    effectiveAt: string;
    observedAt: string;
  },
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "hr", "integration"]);
  if (
    !input ||
    ![
      input.source,
      input.sourceId,
      input.name,
      input.effectiveAt,
      input.observedAt,
    ].every((v) => typeof v === "string" && v.length > 0 && v.length < 1000) ||
    !Number.isFinite(Date.parse(input.effectiveAt)) ||
    !Number.isFinite(Date.parse(input.observedAt))
  )
    throw new ApiError(
      422,
      "person_input",
      "Stable source identity, name and valid source timestamps required",
    );
  if(input.source==='pending-reviewed')throw new ApiError(422,'reserved_person_source','Use the reviewed pending-person route');
  const reviewsManager = Object.hasOwn(input, 'managerId');
  if (reviewsManager) permit(ctx, ['owner','hr']);
  if (input.managerId && !(await ctx.env.DB.prepare('SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(ctx.principal.workspaceId,input.managerId).first()))
    throw new ApiError(422,'manager_invalid','Manager must be a current member of this workspace');
  const tombstone = await ctx.env.DB.prepare(
    "SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id=?",
  )
    .bind(ctx.principal.workspaceId, `${input.source}:${input.sourceId}`)
    .first();
  if (tombstone)
    throw new ApiError(
      409,
      "erased",
      "Erased source identity cannot be replayed",
    );
  const db=ctx.env.DB,w=ctx.principal.workspaceId,guard=id(),personId=id();
  await db.batch([
    db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN
      EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value IN ('owner','hr','integration'))
      AND (?=0 OR EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value IN ('owner','hr')))
      AND (? IS NULL OR EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1)) THEN 1 ELSE 0 END)`)
      .bind(guard,w,ctx.principal.userId,Number(reviewsManager),w,ctx.principal.userId,input.managerId||null,w,input.managerId||null),
    db.prepare(`INSERT INTO work_people(id,workspace_id,source,source_id,name,manager_id,effective_at,observed_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,source,source_id) DO UPDATE SET name=excluded.name,
      manager_id=CASE WHEN ?=1 THEN excluded.manager_id ELSE work_people.manager_id END,
      effective_at=excluded.effective_at,observed_at=excluded.observed_at,revision=work_people.revision+1
      WHERE excluded.effective_at>work_people.effective_at AND work_people.active=1 AND work_people.merged_into IS NULL`)
      .bind(personId,w,input.source,input.sourceId,input.name,input.managerId||null,input.effectiveAt,input.observedAt,Number(reviewsManager)),
    db.prepare(`INSERT INTO audit_events SELECT ?,?,?,?,id,?,? FROM work_people
      WHERE workspace_id=? AND source=? AND source_id=? AND changes()>0`)
      .bind(id(),w,ctx.principal.userId,'work.person_source_reviewed',JSON.stringify({managerReviewed:reviewsManager}),now(),w,input.source,input.sourceId),
    db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard),
  ]);
  return ctx.env.DB.prepare(
    "SELECT * FROM work_people WHERE workspace_id=? AND source=? AND source_id=?",
  )
    .bind(ctx.principal.workspaceId, input.source, input.sourceId)
    .first();
}
export async function changePerson(
  ctx: WorkContext,
  personId: string,
  revision: number,
  command: "deactivate" | "merge",
  target?: string,
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "hr"]);
  if (!["deactivate", "merge"].includes(command))
    throw new ApiError(422, "command", "Invalid person command");
  const person = await ctx.env.DB.prepare(
    "SELECT * FROM work_people WHERE workspace_id=? AND id=? AND revision=?",
  )
    .bind(ctx.principal.workspaceId, personId, revision)
    .first<{ source: string; source_id: string }>();
  if (!person)
    throw new ApiError(409, "revision_conflict", "Person missing or changed");
  if (command === "merge") {
    if (
      target === personId ||
      !(await ctx.env.DB.prepare(
        "SELECT id FROM work_people WHERE workspace_id=? AND id=? AND active=1 AND merged_into IS NULL",
      )
        .bind(ctx.principal.workspaceId, target || "")
        .first())
    )
      throw new ApiError(
        422,
        "invalid_merge",
        "Active distinct destination required",
      );
  }
  const result = await ctx.env.DB.prepare(
    "UPDATE work_people SET active=0,merged_into=?,name=CASE WHEN ?=1 THEN ? ELSE name END,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=?",
  )
    .bind(
      command === "merge" ? target! : null,
      0,
      "[erased]",
      ctx.principal.workspaceId,
      personId,
      revision,
    )
    .run();
  if (!result.meta.changes)
    throw new ApiError(409, "revision_conflict", "Person changed");
  return { id: personId, revision: revision + 1, command };
}
export async function acquireAsset(
  ctx: WorkContext,
  input: { serial: string; source: string; location?: string },
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator", "integration"]);
  if (
    !input ||
    ![input.serial, input.source].every(
      (v) => typeof v === "string" && v.trim().length > 0 && v.length < 1000,
    )
  )
    throw new ApiError(
      422,
      "asset_input",
      "Serial and observation source required",
    );
  const assetId = id();
  try {
    await ctx.env.DB.prepare(
      "INSERT INTO work_assets(id,workspace_id,serial,state,location,source,observed_at) VALUES(?,?,?,'stock',?,?,?)",
    )
      .bind(
        assetId,
        ctx.principal.workspaceId,
        input.serial,
        input.location || null,
        input.source,
        now(),
      )
      .run();
  } catch {
    throw new ApiError(
      409,
      "serial_conflict",
      "Serial already exists; reconcile source identity",
    );
  }
  return { id: assetId };
}
export async function moveAsset(
  ctx: WorkContext,
  assetId: string,
  input: {
    revision: number;
    command:
      | "reserve"
      | "assign"
      | "receive"
      | "return"
      | "repair"
      | "dispose"
      | "missing";
    personId?: string;
    evidence: string;
    location?: string;
  },
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator"]);
  const asset = await ctx.env.DB.prepare(
    "SELECT * FROM work_assets WHERE workspace_id=? AND id=?",
  )
    .bind(ctx.principal.workspaceId, assetId)
    .first<{ state: string; person_id: string | null }>();
  if (!asset) throw new ApiError(404, "not_found", "Asset not found");
  const allowed: Record<string, string[]> = {
    reserve: ["stock"],
    assign: ["stock", "reserved"],
    receive: ["assigned"],
    return: ["assigned", "received", "missing"],
    repair: ["stock", "returned"],
    dispose: ["stock", "returned", "repair"],
    missing: ["assigned", "received"],
  };
  if (!allowed[input.command]?.includes(asset.state) || !input.evidence?.trim())
    throw new ApiError(
      422,
      "invalid_custody",
      "Transition requires compatible lifecycle and attributed evidence",
    );
  if (
    ["reserve", "assign"].includes(input.command) &&
    (!input.personId ||
      !(await ctx.env.DB.prepare(
        "SELECT id FROM work_people WHERE workspace_id=? AND id=? AND active=1 AND merged_into IS NULL",
      )
        .bind(ctx.principal.workspaceId, input.personId)
        .first()))
  )
    throw new ApiError(422, "person_required", "Active person required");
  if (
    ["receive", "return"].includes(input.command) &&
    input.personId &&
    input.personId !== asset.person_id
  )
    throw new ApiError(
      422,
      "custody_person_conflict",
      "Receipt/return must match assigned person",
    );
  if(['reserve','assign'].includes(input.command) && await ctx.env.DB.prepare("SELECT 1 FROM work_pending_people WHERE workspace_id=? AND id=? AND state<>'bound'").bind(ctx.principal.workspaceId,input.personId).first())
    throw new ApiError(409,'pending_person_unbound','Stock is held until this pending person authenticates their account');
  const state = {
    reserve: "reserved",
    assign: "assigned",
    receive: "received",
    return: "returned",
    repair: "repair",
    dispose: "disposed",
    missing: "missing",
  }[input.command];
  const person = ["return", "repair", "dispose"].includes(input.command)
    ? null
    : input.personId || asset.person_id;
  const custodyEventId = id();
  const results = await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      "UPDATE work_assets SET state=?,person_id=?,location=COALESCE(?,location),revision=revision+1,latest_event_id=? WHERE workspace_id=? AND id=? AND revision=?",
    ).bind(
      state,
      person,
      input.location || null,
      custodyEventId,
      ctx.principal.workspaceId,
      assetId,
      input.revision,
    ),
    ctx.env.DB.prepare(
      "INSERT INTO work_custody SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM work_assets WHERE workspace_id=? AND id=? AND latest_event_id=?)",
    ).bind(
      custodyEventId,
      ctx.principal.workspaceId,
      assetId,
      ctx.principal.userId,
      input.command,
      input.command === "return" ? asset.person_id : person,
      input.evidence,
      now(),
      ctx.principal.workspaceId,
      assetId,
      custodyEventId,
    ),
  ]);
  if (!results[0].meta.changes)
    throw new ApiError(409, "revision_conflict", "Custody changed");
  return { id: assetId, state, revision: input.revision + 1, custodyEventId };
}

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
export { acquireAsset, moveAsset } from "./assets";

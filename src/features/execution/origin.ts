import { currentPrincipal } from '../work/identity';
import { workReadable, workDepartmentScoped } from '../work/scope';
import { changeGate } from "../services/changes";
import { getCommitment } from "../intelligence/commitments";
import { assert } from "./authority";
import { getService, writable } from "../services/store";
import type { CoreContext } from "./types";
export async function origin(
  ctx: CoreContext,
  type: string,
  key: string,
  revision: number,
  snapshot: Record<string, any> = {},
) {
  if (type === "commitment") {
    const commitment = await getCommitment(ctx, key);
    assert(commitment.revision === revision, "commitment_changed");
    return;
  }
  if (type === "engineering") {
    const job: any = await ctx.env.DB.prepare(
      "SELECT * FROM intelligence_engineering_jobs WHERE id=? AND workspace_id=?",
    )
      .bind(key, ctx.principal.workspaceId)
      .first();
    assert(job, "engineering_job_missing", 404);
    await getCommitment(ctx, job.commitment_id);
    assert(
      job.grant_version === revision &&
        job.spec_json === JSON.stringify(snapshot.spec),
      "engineering_context_changed",
    );
    return;
  }
  if (type === "change") {
    const change = await getService(ctx.env.DB, ctx.principal, key, "change");
    assert(writable(ctx.principal, change), "change_access_denied", 403);
    assert(
      change.data.implementationRevision === snapshot.implementationRevision,
      "change_implementation_changed",
    );
    const selected =
      snapshot.phase === "compensate"
        ? change.data.compensation
        : change.data.implementation;
    assert(
      JSON.stringify(selected) === JSON.stringify(snapshot.implementation),
      "change_implementation_changed",
    );
    await changeGate(ctx.env.DB, ctx.principal, change, snapshot.phase);
    assert(
      change.data.authorizations.some(
        (a: any) =>
          a.implementationRevision === snapshot.implementationRevision,
      ),
      "change_authority_changed",
    );
    return;
  }
  assert(type === "work", "unsupported_origin", 422);
  const work: any = await ctx.env.DB.prepare(
    "SELECT * FROM work_records WHERE id=? AND workspace_id=?",
  )
    .bind(key, ctx.principal.workspaceId)
    .first();
  assert(work && work.revision === revision, "work_changed");
  if (workDepartmentScoped(work)) {
    const principal = await currentPrincipal(ctx.env.DB, ctx.principal);
    assert(workReadable(principal, work), "restricted_work", 403);
  }
  assert(
    work.sensitivity === "normal" ||
      ctx.principal.roles.includes("owner") ||
      ctx.principal.roles.includes("hr"),
    "restricted_work",
    403,
  );
}

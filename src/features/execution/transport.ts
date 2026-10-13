import { checkEffectBoundary } from "./effect-boundary";
import { id, now } from "../../platform/http";
import type { CoreContext } from "./types";
export async function providerFetch(
  ctx: CoreContext,
  connectionId: string,
  kind: string,
  input: RequestInfo | URL,
  init?: RequestInit,
  operationId?: string,
) {
  const attempt = id(),
    started = Date.now();
  await ctx.env.DB.prepare(
    "INSERT INTO execution_provider_attempts(id,workspace_id,connection_id,kind,state,started_at) VALUES(?,?,?,?,'intent',?)",
  )
    .bind(attempt, ctx.principal.workspaceId, connectionId, kind, now())
    .run();
  try {
    if (operationId) await checkEffectBoundary(ctx, operationId);
    const r = await fetch(input, init);
    await ctx.env.DB.prepare(
      "UPDATE execution_provider_attempts SET state=?,http_status=?,finished_at=?,elapsed_ms=? WHERE id=?",
    )
      .bind(
        r.ok ? "accepted" : "rejected",
        r.status,
        now(),
        Date.now() - started,
        attempt,
      )
      .run();
    return r;
  } catch (e) {
    await ctx.env.DB.prepare(
      "UPDATE execution_provider_attempts SET state='unknown',finished_at=?,elapsed_ms=? WHERE id=?",
    )
      .bind(now(), Date.now() - started, attempt)
      .run();
    throw e;
  }
}

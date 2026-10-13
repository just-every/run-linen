import { currentWorkPrincipal } from "./identity";
import { ApiError, id, now } from "../../platform/http";
import { createWork, operator, permit, type WorkContext } from "./core";
export async function searchKnowledge(ctx: WorkContext, query: string) {
  await currentWorkPrincipal(ctx);
  const p = ctx.principal;
  return (
    await ctx.env.DB.prepare(
      `SELECT id,title,body,revision,scope,reviewed_at,expires_at FROM work_knowledge WHERE workspace_id=? AND reviewed_at IS NOT NULL AND expires_at>? AND (scope='employees' OR (scope='operators' AND ?=1) OR (scope='hr' AND ?=1)) AND (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT 50`,
    )
      .bind(
        p.workspaceId,
        now(),
        Number(operator(p)),
        Number(p.roles.includes("hr") || p.roles.includes("owner")),
        `%${query.replace(/[\\%_]/g, "\\$&")}%`,
        `%${query.replace(/[\\%_]/g, "\\$&")}%`,
      )
      .all()
  ).results;
}
export async function saveArticle(
  ctx: WorkContext,
  input: {
    id?: string;
    revision?: number;
    title: string;
    body: string;
    scope: "employees" | "operators" | "hr";
    expiresAt: string;
    review: boolean;
  },
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, input.scope === "hr" ? ["owner", "hr"] : ["owner", "operator"]);
  if (
    !["employees", "operators", "hr"].includes(input.scope) ||
    !input.title ||
    !input.body ||
    Date.parse(input.expiresAt) <= Date.now() ||
    !Number.isFinite(Date.parse(input.expiresAt))
  )
    throw new ApiError(
      422,
      "invalid_article",
      "Valid content, scope and future expiry required",
    );
  const articleId = input.id || id(),
    t = now();
  if (input.id) {
    const result = await ctx.env.DB.prepare(
      "UPDATE work_knowledge SET title=?,body=?,scope=?,expires_at=?,revision=revision+1,reviewer_id=?,reviewed_at=?,updated_at=? WHERE workspace_id=? AND id=? AND revision=? AND (scope<>? OR ?=1)",
    )
      .bind(
        input.title,
        input.body,
        input.scope,
        input.expiresAt,
        input.review ? ctx.principal.userId : null,
        input.review ? t : null,
        t,
        ctx.principal.workspaceId,
        articleId,
        input.revision || 0,
        "hr",
        Number(ctx.principal.roles.some((r) => ["hr", "owner"].includes(r))),
      )
      .run();
    if (!result.meta.changes)
      throw new ApiError(
        409,
        "revision_conflict",
        "Article changed or inaccessible",
      );
  } else
    await ctx.env.DB.prepare(
      "INSERT INTO work_knowledge VALUES(?,?,?,?,?,1,?,?,?,?)",
    )
      .bind(
        articleId,
        ctx.principal.workspaceId,
        input.title,
        input.body,
        input.scope,
        input.review ? ctx.principal.userId : null,
        input.review ? t : null,
        input.expiresAt,
        t,
      )
      .run();
  await ctx.env.DB.prepare(
    "INSERT INTO work_article_versions VALUES(?,?,?,?,?)",
  )
    .bind(
      ctx.principal.workspaceId,
      articleId,
      (input.revision || 0) + 1,
      JSON.stringify(input),
      t,
    )
    .run();
  return { id: articleId, revision: (input.revision || 0) + 1 };
}
export async function escalateKnowledge(
  ctx: WorkContext,
  articleId: string,
  question: string,
  deduplicationKey: string,
) {
  await currentWorkPrincipal(ctx);
  const articles = await searchKnowledge(ctx, "");
  const article = articles.find((a) => a.id === articleId);
  if (!article)
    throw new ApiError(
      404,
      "not_found",
      "Current reviewed article inaccessible or expired",
    );
  return createWork(ctx, {
    title: question,
    body: question,
    deduplicationKey,
    context: {
      articleId,
      articleRevision: article.revision,
      articleTitle: article.title,
    },
    sensitivity: article.scope === "hr" ? "hr" : "normal",
  });
}
export async function workReport(
  ctx: WorkContext,
  from: string,
  to: string,
  timezone: string,
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator", "auditor"]);
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new ApiError(422, "timezone", "Valid timezone required");
  }
  if (
    !Number.isFinite(Date.parse(from)) ||
    !Number.isFinite(Date.parse(to)) ||
    from >= to
  )
    throw new ApiError(422, "range", "Valid ascending ISO date range required");
  const rows = (
    await ctx.env.DB.prepare(
      "SELECT id,state,created_at,closed_at,paused_ms,paused_at,response_at,resolution_at FROM work_records WHERE workspace_id=? AND sensitivity='normal' AND created_at>=? AND created_at<?",
    )
      .bind(ctx.principal.workspaceId, from, to)
      .all()
  ).results;
  const obligations = (
    await ctx.env.DB.prepare(
      "SELECT o.state,COUNT(*) count FROM work_obligations o JOIN work_records w ON w.id=o.work_id AND w.workspace_id=o.workspace_id WHERE w.workspace_id=? AND w.sensitivity='normal' AND w.created_at>=? AND w.created_at<? GROUP BY o.state",
    )
      .bind(ctx.principal.workspaceId, from, to)
      .all()
  ).results;
  const calendars = (
    await ctx.env.DB.prepare(
      "SELECT c.*,w.paused_at,w.paused_ms FROM work_commitments c JOIN work_records w ON w.id=c.work_id AND w.workspace_id=c.workspace_id WHERE w.workspace_id=? AND w.sensitivity='normal' AND w.created_at>=? AND w.created_at<?",
    )
      .bind(ctx.principal.workspaceId, from, to)
      .all()
  ).results;
  return {
    from,
    to,
    timezone,
    obligations,
    calendars,
    denominator: rows.length,
    definition:
      "Normal-sensitivity work created in [from,to); closure is administrative, not verified fulfilment; ages are elapsed milliseconds excluding explicit pauses.",
    rows: rows.map((r) => ({
      ...r,
      activeAgeMs: Math.max(
        0,
        Date.parse(String(r.closed_at || now())) -
          Date.parse(String(r.created_at)) -
          Number(r.paused_ms) -
          (r.paused_at ? Date.now() - Date.parse(String(r.paused_at)) : 0),
      ),
    })),
    verifiedOutcomeCount: null,
    verificationCoverage: "Execution verification is reported separately",
  };
}

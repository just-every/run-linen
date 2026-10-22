import { departmentReportScope } from './department-report-scope';
import { departmentStaff,departmentStaffSql } from './department-spaces';
import { resolutionReport } from "./desk-fields";
import { slaReport } from "./sla-policies";
import { effortReport } from "./effort-report";
import { deflectionReport } from "./deflection";
import { validateArticle, newArticleWrites, type ArticleInput } from './article-write';
import { currentWorkPrincipal } from "./identity";
import { assertKnowledgeArticleSources } from './knowledge-draft-sources';
import { ApiError, id, now } from "../../platform/http";
import { createWork, operator, permit, type WorkContext } from "./core";
interface KnowledgeArticle {
  id: string; department_id:string|null; title: string; body: string; revision: number;
  scope: 'employees' | 'operators' | 'hr'; reviewed_at: string; expires_at: string;
}
export async function searchKnowledge(ctx: WorkContext, query: string, limit: number | null = 50, departmentId?:string|null) {
  await currentWorkPrincipal(ctx);
  const p = ctx.principal;
  const candidates = (
    await ctx.env.DB.prepare(
      `SELECT id,title,body,revision,scope,reviewed_at,expires_at,department_id,(SELECT name FROM work_departments d WHERE d.workspace_id=work_knowledge.workspace_id AND d.id=work_knowledge.department_id) department_name FROM work_knowledge WHERE workspace_id=? AND reviewed_at IS NOT NULL AND expires_at>? AND (scope='employees' OR (scope='operators' AND ?=1) OR (scope='hr' AND ?=1)) AND (scope='employees' OR department_id IS NULL OR EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=work_knowledge.workspace_id AND m.user_id=? AND m.active=1 AND ${departmentStaffSql('work_knowledge','m')})) AND (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\') AND (?=0 OR department_id IS ?) ORDER BY updated_at DESC ${limit === null ? "" : "LIMIT 50"}`,
    )
      .bind(
        p.workspaceId,
        now(),
        Number(operator(p)),
        Number(p.roles.includes("hr") || p.roles.includes("owner")),
        p.userId,
        `%${query.replace(/[\\%_]/g, "\\$&")}%`,
        `%${query.replace(/[\\%_]/g, "\\$&")}%`,
        Number(departmentId!==undefined),departmentId??null,
      )
      .all<KnowledgeArticle>()
  ).results;
  const visible = [];
  for (const article of candidates) {
    if(departmentId!==undefined && article.department_id!==departmentId)continue;
    if(article.scope!=='employees' && !await departmentStaff(ctx,article.department_id))continue;
    try { visible.push({ ...article,departmentId:article.department_id, sources: await assertKnowledgeArticleSources(ctx, String(article.id)) }); }
    catch (error) { if (!(error instanceof ApiError) || error.status !== 404) throw error; }
  }
  return visible;
}
export async function saveArticle(
  ctx: WorkContext,
  input: ArticleInput,
) {
  await validateArticle(ctx, input);
  const articleId = input.id || id(),
    t = now();
  if (input.id) {
    await assertKnowledgeArticleSources(ctx, input.id);
    const result = await ctx.env.DB.prepare(
      `UPDATE work_knowledge SET title=?,body=?,scope=?,expires_at=?,department_id=?,revision=revision+1,reviewer_id=?,reviewed_at=?,updated_at=? WHERE workspace_id=? AND id=? AND revision=? AND (scope<>? OR ?=1) AND EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=work_knowledge.workspace_id AND m.user_id=? AND m.active=1 AND ${departmentStaffSql('work_knowledge','m')} AND EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value IN (${input.scope==='hr'?"'owner','hr'":"'owner','operator'"})))`,
    )
      .bind(
        input.title,
        input.body,
        input.scope,
        input.expiresAt,
        input.departmentId??null,
        input.review ? ctx.principal.userId : null,
        input.review ? t : null,
        t,
        ctx.principal.workspaceId,
        articleId,
        input.revision || 0,
        "hr",
        Number(ctx.principal.roles.some((r) => ["hr", "owner"].includes(r))),
        ctx.principal.userId,
      )
      .run();
    if (!result.meta.changes)
      throw new ApiError(
        409,
        "revision_conflict",
        "Article changed or inaccessible",
      );
  } else {
    const saved=await ctx.env.DB.batch(newArticleWrites(ctx, articleId, input));
    if(!saved[0].meta.changes)throw new ApiError(409,'article_authority_changed','Current article configuration authority changed; reload');
    return { id: articleId, revision: 1 };
  }
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
  const departmentScope=departmentReportScope(ctx);
  const rows = (
    await ctx.env.DB.prepare(
      `SELECT w.id,w.state,w.created_at,w.closed_at,w.paused_ms,w.paused_at,w.response_at,w.resolution_at FROM work_records w WHERE w.workspace_id=? AND w.sensitivity='normal' AND w.created_at>=? AND w.created_at<? AND ${departmentScope.sql}`,
    )
      .bind(ctx.principal.workspaceId, from, to,...departmentScope.bindings)
      .all()
  ).results;
  const obligations = (
    await ctx.env.DB.prepare(
      `SELECT o.state,COUNT(*) count FROM work_obligations o JOIN work_records w ON w.id=o.work_id AND w.workspace_id=o.workspace_id WHERE w.workspace_id=? AND w.sensitivity='normal' AND w.created_at>=? AND w.created_at<? AND ${departmentScope.sql} GROUP BY o.state`,
    )
      .bind(ctx.principal.workspaceId, from, to,...departmentScope.bindings)
      .all()
  ).results;
  const calendars = (
    await ctx.env.DB.prepare(
      `SELECT c.*,w.paused_at,w.paused_ms FROM work_commitments c JOIN work_records w ON w.id=c.work_id AND w.workspace_id=c.workspace_id WHERE w.workspace_id=? AND w.sensitivity='normal' AND w.created_at>=? AND w.created_at<? AND ${departmentScope.sql}`,
    )
      .bind(ctx.principal.workspaceId, from, to,...departmentScope.bindings)
      .all()
  ).results;
  return {
    from,
    to,
    timezone,
    obligations,
    calendars,
    effort: await effortReport(ctx, from, to),
    sla: await slaReport(ctx, from, to),
    resolutions: await resolutionReport(ctx, from, to),
    deflection: await deflectionReport(ctx, from, to),
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

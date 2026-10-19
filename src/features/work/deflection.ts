/**
 * KB-003: reviewed articles offered before a ticket is filed, and deflection
 * counted only from the asker's own confirmation. Filing after a suggestion is
 * never a deflection, even after an earlier confirmation.
 */
import { ApiError, id, now } from "../../platform/http";
import { currentWorkPrincipal } from "./identity";
import { searchKnowledge } from "./knowledge";
import { normalizeSearch } from "./search-match";
import { createWork, type WorkContext } from "./core";

const STOP = new Set(("the and but how what why when where who which can could does did you your for with are was were " +
  "this that these those please help need want get not cannot cant have has from into about there any would should will " +
  "its it's i'm doesn't dont don't keep still again").split(" "));

/** Distinct normalized tokens of three or more code points that are not common English function words. */
export function contentTokens(question: string) {
  return [...new Set(normalizeSearch(question).split(" ").filter(t => Array.from(t).length >= 3 && !STOP.has(t)))];
}

interface Suggestion { id: string; asker_id: string; articles_json: string; outcome: string; work_id: string | null; }

async function own(ctx: WorkContext, suggestionId: string) {
  const row = await ctx.env.DB.prepare("SELECT * FROM work_knowledge_suggestions WHERE workspace_id=? AND id=? AND asker_id=?")
    .bind(ctx.principal.workspaceId, suggestionId, ctx.principal.userId).first<Suggestion>();
  if (!row) throw new ApiError(404, "not_found", "Suggestion not found");
  return row;
}

/**
 * An article is offered when at least half (rounded up) of the question's
 * content tokens appear among its title and body tokens and at least one
 * appears in its title; at most three, by matched tokens then recency.
 * Only current reviewed articles the asker may read are considered.
 */
export async function suggestArticles(ctx: WorkContext, question: string) {
  await currentWorkPrincipal(ctx);
  const tokens = contentTokens(question);
  if (!tokens.length) return { id: null, items: [] };
  const articles = await searchKnowledge(ctx, "", null);
  const scored = articles.map((article, order) => {
    const title = new Set(normalizeSearch(article.title).split(" "));
    const all = new Set([...title, ...normalizeSearch(article.body).split(" ")]);
    const matched = tokens.filter(t => all.has(t)).length;
    return { article, order, matched, inTitle: tokens.some(t => title.has(t)) };
  }).filter(s => s.inTitle && s.matched >= Math.ceil(tokens.length / 2))
    .sort((a, b) => b.matched - a.matched || a.order - b.order).slice(0, 3);
  if (!scored.length) return { id: null, items: [] };
  const suggestionId = id();
  const offered = scored.map(s => ({ id: s.article.id, revision: s.article.revision }));
  await ctx.env.DB.prepare("INSERT INTO work_knowledge_suggestions(id,workspace_id,asker_id,articles_json,outcome,created_at) VALUES(?,?,?,?,'suggested',?)")
    .bind(suggestionId, ctx.principal.workspaceId, ctx.principal.userId, JSON.stringify(offered), now()).run();
  return { id: suggestionId, items: scored.map(s => s.article) };
}

/** The asker confirms that one offered article, still current and readable, solved the issue. */
export async function confirmSuggestion(ctx: WorkContext, suggestionId: string, articleId: string) {
  await currentWorkPrincipal(ctx);
  const row = await own(ctx, suggestionId);
  if (row.outcome === "filed") throw new ApiError(409, "already_filed", "A request was filed from this question; it is not a deflection");
  const offered = (JSON.parse(row.articles_json) as { id: string }[]).some(a => a.id === articleId);
  const article = offered ? (await searchKnowledge(ctx, "", null)).find(a => a.id === articleId) : undefined;
  if (!article) throw new ApiError(404, "not_found", "Offered article is no longer current or readable");
  if (row.outcome === "suggested")
    await ctx.env.DB.prepare("UPDATE work_knowledge_suggestions SET outcome='confirmed',article_id=?,article_revision=?,resolved_at=? WHERE workspace_id=? AND id=? AND outcome='suggested'")
      .bind(articleId, article.revision, now(), ctx.principal.workspaceId, suggestionId).run();
  return { id: suggestionId, outcome: "confirmed", articleId };
}

/** Filing anyway: the request records the suggestion, and the suggestion records the request. */
export async function fileAfterSuggestion(ctx: WorkContext, suggestionId: string, input: Parameters<typeof createWork>[1]) {
  await currentWorkPrincipal(ctx);
  const row = await own(ctx, suggestionId);
  if (input.beneficiaryId && input.beneficiaryId !== ctx.principal.userId || input.pendingPersonId)
    throw new ApiError(422, "suggestion_self_only", "Article suggestions apply to your own request");
  const context = input.context && typeof input.context === "object" && !Array.isArray(input.context) ? input.context : {};
  const work = await createWork(ctx, { ...input, context: { ...context, knowledgeSuggestionId: suggestionId } });
  if (row.work_id && row.work_id !== work.id) throw new ApiError(409, "already_filed", "A different request was already filed from this question");
  await ctx.env.DB.prepare("UPDATE work_knowledge_suggestions SET outcome='filed',work_id=?,resolved_at=COALESCE(resolved_at,?) WHERE workspace_id=? AND id=?")
    .bind(work.id, now(), ctx.principal.workspaceId, suggestionId).run();
  return work;
}

export const deflectionDefinition =
  "Suggestions made in [from,to) that offered at least one reviewed article before filing. Deflected counts only the asker's own confirmation that an offered article solved it, with no request filed from that question; filing anyway is never a deflection. Unanswered suggestions are not counted as deflected.";

export async function deflectionReport(ctx: WorkContext, from: string, to: string) {
  const row = await ctx.env.DB.prepare("SELECT COUNT(*) offered,COALESCE(SUM(outcome='confirmed'),0) deflected,COALESCE(SUM(outcome='filed'),0) filed,COALESCE(SUM(outcome='suggested'),0) unanswered FROM work_knowledge_suggestions WHERE workspace_id=? AND created_at>=? AND created_at<?")
    .bind(ctx.principal.workspaceId, from, to).first<{ offered: number; deflected: number; filed: number; unanswered: number }>();
  return { offered: Number(row?.offered ?? 0), deflected: Number(row?.deflected ?? 0), filedAfterSuggestion: Number(row?.filed ?? 0), unanswered: Number(row?.unanswered ?? 0), definition: deflectionDefinition };
}

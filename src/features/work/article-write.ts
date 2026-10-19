import { ApiError, now } from '../../platform/http';
import { currentWorkPrincipal } from './identity';
import { permit, type WorkContext } from './core';
export interface ArticleInput {
  id?: string; revision?: number; title: string; body: string;
  scope: 'employees' | 'operators' | 'hr'; expiresAt: string; review: boolean;
}
export async function validateArticle(ctx: WorkContext, input: ArticleInput) {
  await currentWorkPrincipal(ctx);
  permit(ctx, input.scope === 'hr' ? ['owner', 'hr'] : ['owner', 'operator']);
  if (!['employees', 'operators', 'hr'].includes(input.scope) || typeof input.title !== 'string' || !input.title.trim() || typeof input.body !== 'string' || !input.body.trim()
    || !Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= Date.now())
    throw new ApiError(422, 'invalid_article', 'Valid content, scope and future expiry required');
}
/** Shared native article write; an optional internal predicate makes publication part of its source transaction. */
export function newArticleWrites(ctx: WorkContext, articleId: string, input: ArticleInput,
  predicate = '1=1', bindings: (string | number)[] = []) {
  const t = now(), p = ctx.principal;
  return [
    ctx.env.DB.prepare(`INSERT INTO work_knowledge SELECT ?,?,?,?,?,1,?,?,?,? WHERE ${predicate}`)
      .bind(articleId, p.workspaceId, input.title, input.body, input.scope, input.review ? p.userId : null,
        input.review ? t : null, new Date(input.expiresAt).toISOString(), t, ...bindings),
    ctx.env.DB.prepare('INSERT INTO work_article_versions SELECT ?,?,1,?,? WHERE changes()=1')
      .bind(p.workspaceId, articleId, JSON.stringify(input), t),
  ];
}

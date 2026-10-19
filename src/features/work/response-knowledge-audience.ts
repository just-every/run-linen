import { ApiError } from '../../platform/http';
import type { Role } from '../../platform/types';
import type { WorkContext, WorkRecord } from './core';
import { assertKnowledgeArticleSources } from './knowledge-draft-sources';

/** Ct-approved recipient checks are reads only. They never create an account or grant. */
export async function assertReplyKnowledgeAudience(ctx: WorkContext, work: WorkRecord,
  articles: { id: string; sources: unknown[] }[]) {
  const generated = articles.filter(article => article.sources.length > 0);
  if (!generated.length) return;
  const unavailable = () => new ApiError(404, 'response_article_audience', 'Selected generated knowledge is not currently readable by every named reply recipient');
  if (work.pending_person_id) {
    const pending = await ctx.env.DB.prepare('SELECT state FROM work_pending_people WHERE workspace_id=? AND id=?')
      .bind(ctx.principal.workspaceId, work.pending_person_id).first<{ state: string }>();
    if (pending?.state !== 'bound') throw unavailable();
  }
  for (const userId of new Set([work.requester_id, work.beneficiary_id])) {
    const member = await ctx.env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1')
      .bind(ctx.principal.workspaceId, userId).first<{ roles_json: string }>();
    if (!member) throw unavailable();
    const reader = { env: ctx.env, principal: { userId, workspaceId: ctx.principal.workspaceId, roles: JSON.parse(member.roles_json) as Role[] } };
    try { for (const article of generated) await assertKnowledgeArticleSources(reader, article.id); }
    catch (error) { if (!(error instanceof ApiError) || ![403,404,409].includes(error.status)) throw error; throw unavailable(); }
  }
}

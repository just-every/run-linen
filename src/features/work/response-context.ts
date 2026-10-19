import { ApiError } from '../../platform/http';
import { conversation, permit, type WorkContext } from './core';
import { searchKnowledge } from './knowledge';

export async function responseContext(ctx: WorkContext, workId: string, kind: 'reply' | 'summary', articleIds: unknown) {
  const detail = await conversation(ctx, workId);
  permit(ctx, ['owner', 'operator']);
  if (!Array.isArray(articleIds) || articleIds.length > 5 || articleIds.some(id => typeof id !== 'string') || new Set(articleIds).size !== articleIds.length)
    throw new ApiError(422, 'response_articles', 'Choose up to five distinct current knowledge articles');
  const permitted = (await searchKnowledge(ctx, '')).filter(a => kind === 'summary' || a.scope === 'employees');
  const articles = articleIds.map(id => {
    const article = permitted.find(a => a.id === id);
    if (!article) throw new ApiError(404, 'response_article', 'Selected reviewed article is unavailable, expired or outside this reply audience');
    return article;
  });
  const messages = detail.messages.filter(m => kind === 'summary' || m.visibility === 'public');
  const sources = [
    ...messages.map(m => ({ id: `message:${m.id}`, type: 'message', title: `Ticket message · ${String(m.body).slice(0, 80)}`, body: m.body, visibility: m.visibility, author: m.author_id, at: m.created_at })),
    ...articles.map(a => ({ id: `article:${a.id}`, type: 'article', title: String(a.title), body: String(a.body), revision: a.revision, scope: a.scope, reviewedAt: a.reviewed_at, expiresAt: a.expires_at })),
  ];
  // Fence the entire accessible conversation, including notes excluded from a public reply.
  const fingerprint = JSON.stringify({ work: detail.work, messages: detail.messages, articles });
  return { sources, fingerprint };
}

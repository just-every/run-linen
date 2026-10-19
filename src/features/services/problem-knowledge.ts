import { ApiError, id, now, requiredString } from '../../platform/http';
import type { Env, Principal } from '../../platform/types';
import { validateArticle, newArticleWrites, type ArticleInput } from '../work/article-write';
import { getService, strings, writable, type ServiceRecord } from './store';
import { assertKnowledgeArticleSources } from '../work/knowledge-draft-sources';

/** The article is the sole content source; the problem keeps its reviewed matching contract. */
export async function publishWorkaround(env: Env, p: Principal, r: ServiceRecord, b: Record<string, any>) {
  const ctx = { env, principal: p };
  if (!writable(p, r)) throw new ApiError(403, 'forbidden', 'Scoped problem operator required');
  if (r.revision !== b.revision) throw new ApiError(409, 'revision_conflict', 'Reload the current problem');
  if (r.data.causeState !== 'known-error') throw new ApiError(409, 'known_error_required', 'Review the root cause before publishing a workaround');
  if (r.visibility === 'restricted') throw new ApiError(403, 'privacy', 'Restricted problem content cannot be published to a broader knowledge audience');
  if (b.review !== true) throw new ApiError(422, 'review_required', 'Reviewer confirmation required');
  const symptomTerms = strings(b.symptomTerms, 'symptomTerms').map(s => requiredString(s.trim(), 'symptomTerm', 200));
  const cohorts = b.cohorts?.length ? strings(b.cohorts, 'cohorts') : [];
  const source = requiredString(b.source, 'source'), contraindications = requiredString(b.contraindications, 'contraindications');
  const article: ArticleInput = { title: requiredString(b.title, 'title'),
    body: `${requiredString(b.text, 'text', 10000)}\n\nDo not use when: ${contraindications}\nSource: ${source}`,
    scope: b.scope, expiresAt: b.expiresAt, review: true };
  if (!['employees', 'operators'].includes(article.scope)) throw new ApiError(422, 'scope', 'Choose employees or service operators');
  await validateArticle(ctx, article);
  const articleId = id(), t = now();
  const link = { id: id(), articleId, articleRevision: 1, causeRevision: r.data.causeRevision, symptomTerms, cohorts, reviewedBy: ctx.principal.userId, reviewedAt: t };
  const data = { ...r.data, workarounds: [...(r.data.workarounds || []), link] };
  const result = await env.DB.batch([
    ...newArticleWrites(ctx, articleId, article,
      'EXISTS(SELECT 1 FROM svc_records WHERE workspace_id=? AND id=? AND revision=?)', [p.workspaceId, r.id, r.revision]),
    env.DB.prepare('UPDATE svc_records SET data_json=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=? AND EXISTS(SELECT 1 FROM work_knowledge WHERE workspace_id=? AND id=?)')
      .bind(JSON.stringify(data), t, p.workspaceId, r.id, r.revision, p.workspaceId, articleId),
    env.DB.prepare('INSERT INTO svc_events SELECT ?,?,?,?,?,?,? WHERE changes()=1')
      .bind(id(), p.workspaceId, r.id, ctx.principal.userId, 'workaround-published', JSON.stringify({articleId,articleRevision:1}), t),
  ]);
  if (!result[0].meta.changes) throw new ApiError(409, 'revision_conflict', 'Problem changed during publication');
  return getService(env.DB, ctx.principal, r.id, 'problem');
}

export async function problemWorkarounds(env: Env, p: Principal, r: ServiceRecord) {
  const db = env.DB;
  const out = [];
  for (const link of r.data.workarounds || []) {
    if (!link.articleId) { out.push({ ...link, usable: false, stale: true }); continue; }
    const article = await db.prepare(`SELECT id,title,body,revision,scope,reviewed_at,expires_at FROM work_knowledge
      WHERE workspace_id=? AND id=? AND (scope='employees' OR (scope='operators' AND ?=1))`)
      .bind(p.workspaceId, link.articleId, Number(p.roles.some(role => ['owner','operator','auditor'].includes(role)))).first<any>();
    let usable = link.causeRevision === r.data.causeRevision && !!article && !!article.reviewed_at && article.revision === link.articleRevision && Date.parse(article.expires_at) > Date.now();
    if (usable) {
      try { await assertKnowledgeArticleSources({ env, principal: p }, String(article.id)); }
      catch (error) { if (!(error instanceof ApiError) || error.status !== 404) throw error; usable = false; }
    }
    out.push({ ...link, article: usable ? article : undefined, usable, stale: !usable });
  }
  return out;
}

export async function presentProblem(env: Env, p: Principal, r: ServiceRecord) {
  const db = env.DB;
  let preventionChange: {id:string;title:string;state:string} | null = null;
  if (r.data.preventionChangeId) {
    try {
      const change = await getService(db, p, r.data.preventionChangeId, 'change');
      preventionChange = {id:change.id,title:change.data.title,state:change.data.state};
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
    }
  }
  return {...r,data:{...r.data,workarounds:await problemWorkarounds(env,p,r),preventionChange,
    preventionState:r.data.preventionChangeId ? !preventionChange ? 'not-accessible'
      : preventionChange.state === 'verified' ? 'implemented-effectiveness-pending' : preventionChange.state : 'unverified'}};
}

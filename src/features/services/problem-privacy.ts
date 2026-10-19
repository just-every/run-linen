import type { Principal } from '../../platform/types';
import { now } from '../../platform/http';
import type { RecordRow } from './store';
/** Published problem guidance stays in the native KB, including during identity erasure. */
export async function eraseProblemArticles(db: D1Database, p: Principal, row: RecordRow, subject: string,
  tokens: string[], affectedProblem: boolean, redact: (value: any) => any) {
  if (row.kind !== 'problem') return false;
  let affected = false;
  for (const link of JSON.parse(row.data_json).workarounds || []) {
    if (!link.articleId) continue;
    const article = await db.prepare('SELECT * FROM work_knowledge WHERE workspace_id=? AND id=?')
      .bind(p.workspaceId, link.articleId).first<any>();
    if (!article || !(affectedProblem || article.reviewer_id === subject || tokens.some(t => article.title.includes(t) || article.body.includes(t)))) continue;
    affected = true;
    const versions = await db.prepare('SELECT revision,content_json FROM work_article_versions WHERE workspace_id=? AND article_id=?')
      .bind(p.workspaceId, article.id).all<{revision:number;content_json:string}>();
    await db.batch([
      db.prepare('UPDATE work_knowledge SET title=?,body=?,reviewer_id=NULL,reviewed_at=NULL,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=?')
        .bind(redact(article.title), redact(article.body), now(), p.workspaceId, article.id),
      ...versions.results.map(v => db.prepare('UPDATE work_article_versions SET content_json=? WHERE workspace_id=? AND article_id=? AND revision=?')
        .bind(JSON.stringify(redact(JSON.parse(v.content_json))), p.workspaceId, article.id, v.revision)),
    ]);
  }
  return affected;
}

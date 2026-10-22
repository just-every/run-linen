import { array, columns, contentJson, json, object, type Row } from './types';
import { serviceSubject } from './services';
import type { ContentSubjects } from './subjects';

async function draftAffected(row: Row, subjects: ContentSubjects): Promise<boolean> {
    if (row.state === 'erased' || await subjects.people(row.creator_id, row.generated_by, row.reviewer_id)) return true;
    for (const source of array(json(row.sources_json))) for (const value of array(object(source)?.guards)) {
        const guard = object(value), snapshot = object(json(guard?.projection));
        if (!snapshot) continue;
        if (guard?.table === 'work_records') {
            if (await subjects.people(snapshot.requester, snapshot.beneficiary,
                ...array(snapshot.messages).map(message => object(message)?.author))) return true;
        } else if (guard?.table === 'svc_records') {
            const data = object(json(snapshot.data));
            if (await subjects.people(snapshot.owner, ...array(json(snapshot.participants)), data?.reviewedBy)) return true;
        }
    }
    return false;
}

async function articleAffected(articleId: unknown, subjects: ContentSubjects): Promise<boolean> {
    if (typeof articleId !== 'string') return false;
    const db = subjects.ctx.env.DB, workspaceId = subjects.ctx.principal.workspaceId;
    const drafts = await db.prepare('SELECT state,creator_id,generated_by,reviewer_id,sources_json FROM work_knowledge_drafts WHERE workspace_id=? AND article_id=?')
        .bind(workspaceId, articleId).all<Row>();
    if ((await Promise.all(drafts.results.map(draft => draftAffected(draft, subjects)))).some(Boolean)) return true;
    const problems = await db.prepare(`SELECT kind,owner_id,participants_json,data_json FROM svc_records WHERE workspace_id=? AND kind='problem'
        AND EXISTS(SELECT 1 FROM json_each(data_json,'$.workarounds') WHERE json_extract(value,'$.articleId')=?)`)
        .bind(workspaceId, articleId).all<Row>();
    return (await Promise.all(problems.results.map(problem => serviceSubject(problem, subjects)))).some(Boolean);
}

export async function projectKnowledge(table: string, row: Row, subjects: ContentSubjects): Promise<Row> {
    if (table === 'work_knowledge_drafts' && await draftAffected(row, subjects)) {
        row = columns(row, { title: '[erased]', body: '[erased]', rejection_reason: null });
        const group = object(json(row.group_json));
        const paths = group?.type === 'known-error' || group?.facet === 'serviceId' ? [['cohort']] : [['value'], ['cohort']];
        row = contentJson(row, 'group_json', paths);
        // Preserve typed citation/source links. Retained unknown guard snapshots
        // must still pass the archive scanner; they are never exempted.
        row = contentJson(row, 'sources_json', [['*', 'title'], ['*', 'content']]);
        return row;
    }
    if (table === 'work_knowledge' && await articleAffected(row.id, subjects))
        return columns(row, { title: '[erased]', body: '[erased]' });
    if (table === 'work_article_versions' && await articleAffected(row.article_id, subjects))
        return contentJson(row, 'content_json', [['title'], ['body']]);
    return row;
}

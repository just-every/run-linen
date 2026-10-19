import { ApiError } from '../../platform/http';
import type { WorkContext } from './core';
import { knowledgeDraftActor, recheckDraftSources, sourceCitation, sourceHref, type DraftSource } from './knowledge-draft-sources';

export interface KnowledgeDraftRow {
  id:string; workspace_id:string; semantic_key:string; group_json:string;
  state:'candidate'|'generating'|'draft'|'published'|'rejected'|'erased'; sources_json:string;
  title:string; body:string; citations_json:string; revision:number; creator_id:string;
  generated_by:string|null; generated_at:string|null; model_attempt_id:string|null; model_name:string|null;
  reviewer_id:string|null; reviewed_at:string|null; rejection_reason:string|null; article_id:string|null;
  created_at:string; updated_at:string;
}
export async function draftRow(ctx: WorkContext, key: string) {
  const row = await ctx.env.DB.prepare('SELECT * FROM work_knowledge_drafts WHERE workspace_id=? AND id=?')
    .bind(ctx.principal.workspaceId,key).first<KnowledgeDraftRow>();
  if (!row || row.state === 'erased') throw new ApiError(404,'not_found','Knowledge draft unavailable');
  return row;
}
export function presentDraft(row: KnowledgeDraftRow) {
  const sources: DraftSource[] = JSON.parse(row.sources_json);
  return { id:row.id,state:row.state,revision:row.revision,title:row.title,body:row.body,
    group:JSON.parse(row.group_json),citations:JSON.parse(row.citations_json),
    sources:sources.map(s=>({type:s.type,id:s.id,title:s.title,citation:sourceCitation(s),href:sourceHref(s),revision:s.revision,fingerprint:s.fingerprint,content:s.content})),
    generatedBy:row.generated_by,generatedAt:row.generated_at,modelAttemptId:row.model_attempt_id,modelName:row.model_name,
    reviewerId:row.reviewer_id,reviewedAt:row.reviewed_at,rejectionReason:row.rejection_reason,articleId:row.article_id };
}
export async function getKnowledgeDraft(ctx: WorkContext,key: string) {
  await knowledgeDraftActor(ctx);
  const row=await draftRow(ctx,key);
  await recheckDraftSources(ctx,JSON.parse(row.sources_json));
  return presentDraft(row);
}
export async function listKnowledgeDrafts(ctx: WorkContext) {
  await knowledgeDraftActor(ctx);
  const rows=await ctx.env.DB.prepare("SELECT * FROM work_knowledge_drafts WHERE workspace_id=? AND state<>'erased' ORDER BY updated_at DESC LIMIT 100")
    .bind(ctx.principal.workspaceId).all<KnowledgeDraftRow>();
  const items=[];
  for(const row of rows.results) {
    try { await recheckDraftSources(ctx,JSON.parse(row.sources_json)); items.push(presentDraft(row)); }
    catch(error) { if(!(error instanceof ApiError)||![403,404,409].includes(error.status))throw error; }
  }
  return {items};
}

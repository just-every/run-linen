import { ApiError } from '../../platform/http';
import type { WorkContext } from './core';
import { captureDraftSource, sourceCitation, type DraftSource } from './knowledge-draft-sources';
import { knowledgeSemanticKey, type DraftGroup } from './knowledge-draft-detection';

/** After adoption has remapped source IDs and restored their records AND public messages,
 * refresh exact guards against those destination rows. A portable fingerprint never grants
 * access or restores a model dispatch. The content must still match the archived snapshot. */
export async function prepareKnowledgeDraftRestore(ctx:WorkContext,row:Record<string,unknown>) {
  if(!['candidate','generating','draft','published','rejected','erased'].includes(String(row.state)))
    throw new ApiError(422,'restore_knowledge_draft','Known draft state required');
  let sources:DraftSource[],group:DraftGroup;
  try { sources=JSON.parse(String(row.sources_json));group=JSON.parse(String(row.group_json)); }
  catch { throw new ApiError(422,'restore_knowledge_draft','Valid source snapshots and grouping required'); }
  if(row.state==='erased') {
    row.sources_json='[]';row.body='[erased]';row.title='[erased]';row.citations_json='[]';row.group_json='{}';
    row.creator_id='[erased]';row.generated_by=null;row.reviewer_id=null;row.rejection_reason=null;
    return;
  }
  if(!Array.isArray(sources)||!sources.length||sources.length>100||!['tickets','known-error'].includes(group.type)||
    !['app','serviceId','deviceModel','title','problem'].includes(group.facet)||typeof group.value!=='string'||typeof group.cohort!=='string')
    throw new ApiError(422,'restore_knowledge_draft','Valid source snapshots and grouping required');
  const refreshed:DraftSource[]=[];
  for(const source of sources) {
    if(!['ticket','known-error'].includes(source.type)||typeof source.id!=='string')throw new ApiError(422,'restore_knowledge_draft','Valid source references required');
    const current=await captureDraftSource(ctx,source.type,source.id);
    if(current.content!==source.content||current.title!==source.title)throw new ApiError(409,'restore_knowledge_source_changed','Restored source content differs from the archived draft; do not restore stale derived guidance');
    refreshed.push(current);
  }
  if(group.type==='tickets'&&refreshed.length<3)throw new ApiError(422,'restore_knowledge_draft','Ticket candidates require three sources');
  if(group.type==='known-error'&&(refreshed.length!==1||refreshed[0].type!=='known-error'||group.value!==refreshed[0].id))
    throw new ApiError(422,'restore_knowledge_draft','Known-error group must match its source');
  row.semantic_key=await knowledgeSemanticKey(ctx.principal.workspaceId,group);
  row.sources_json=JSON.stringify(refreshed);
  row.citations_json=JSON.stringify(['draft','published'].includes(String(row.state))?refreshed.map(sourceCitation):[]);
  row.model_attempt_id=null; // The source provider attempt is historical, not a destination dispatch.
  if(row.state==='generating')row.state='candidate';
  if(row.state==='published'&&(!row.article_id||!row.reviewer_id||!Number.isFinite(Date.parse(String(row.reviewed_at)))))
    throw new ApiError(422,'restore_knowledge_draft','Published draft requires its reviewed article');
  if(row.article_id&&!await ctx.env.DB.prepare('SELECT 1 FROM work_knowledge WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,String(row.article_id)).first())
    throw new ApiError(422,'restore_parent','Restore the reviewed article before its draft provenance');
}

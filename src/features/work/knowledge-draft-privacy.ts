import { now } from '../../platform/http';
import type { WorkContext } from './core';
import type { DraftSource } from './knowledge-draft-sources';
import type { KnowledgeDraftRow } from './knowledge-draft-store';

/** Called from the existing authorized erasure pipeline, before source rows are redacted.
 * Entire derived text and snapshots are withdrawn, including historical article revisions.
 * The opaque semantic key survives so detection cannot resurrect an erased candidate. */
export async function eraseKnowledgeDraftPerson(ctx:WorkContext,subject:string,tokens:string[]=[]) {
  const rows=await ctx.env.DB.prepare("SELECT * FROM work_knowledge_drafts WHERE workspace_id=? AND state<>'erased'")
    .bind(ctx.principal.workspaceId).all<KnowledgeDraftRow>();
  let count=0;
  for(const row of rows.results) {
    const sources:DraftSource[]=JSON.parse(row.sources_json);
    const affected=[row.creator_id,row.generated_by,row.reviewer_id].includes(subject)||
      tokens.some(token=>token&&[row.title,row.body,row.sources_json,row.rejection_reason||''].some(value=>value.includes(token)))||
      sources.some(source=>source.guards.some(guard=>{
        const snapshot=JSON.parse(guard.projection);
        if(guard.table==='work_records')return snapshot.requester===subject||snapshot.beneficiary===subject||snapshot.messages.some((m:any)=>m.author===subject);
        const data=JSON.parse(snapshot.data);
        return snapshot.owner===subject||JSON.parse(snapshot.participants).includes(subject)||data.reviewedBy===subject;
      }));
    if(!affected)continue;
    const statements=[ctx.env.DB.prepare("UPDATE work_knowledge_drafts SET state='erased',group_json='{}',sources_json='[]',title='[erased]',body='[erased]',citations_json='[]',creator_id='[erased]',generated_by=NULL,reviewer_id=NULL,rejection_reason=NULL,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=?")
      .bind(now(),ctx.principal.workspaceId,row.id)];
    if(row.article_id)statements.push(
      ctx.env.DB.prepare("UPDATE work_knowledge SET title='[erased]',body='[erased]',reviewer_id=NULL,reviewed_at=NULL,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=?").bind(now(),ctx.principal.workspaceId,row.article_id),
      ctx.env.DB.prepare("UPDATE work_article_versions SET content_json=? WHERE workspace_id=? AND article_id=?")
        .bind(JSON.stringify({title:'[erased]',body:'[erased]',review:false}),ctx.principal.workspaceId,row.article_id),
    );
    await ctx.env.DB.batch(statements);count++;
  }
  return {erasedDrafts:count};
}

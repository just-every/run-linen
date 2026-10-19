import { ApiError, id, now } from '../../platform/http';
import { hashToken } from '../../platform/crypto';
import type { WorkContext } from './core';
import { captureDraftSource, knowledgeDraftActor, knowledgeDraftFence, type DraftSource } from './knowledge-draft-sources';
import { listKnowledgeDrafts, type KnowledgeDraftRow } from './knowledge-draft-store';

export interface DraftGroup { type:'tickets'|'known-error'; facet:string; value:string; cohort:string; }
const normalized=(v:unknown)=>typeof v==='string'?v.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,' ').trim():'';
export function ticketDraftGroup(title:string,context:Record<string,any>):DraftGroup {
  const facet=['app','serviceId','deviceModel'].find(k=>typeof context[k]==='string'&&context[k].trim()) || 'title';
  return {type:'tickets',facet,value:facet==='serviceId'?context[facet]:normalized(facet==='title'?title:context[facet]),
    cohort:normalized(context.cohort || context.location || '')};
}
export const knowledgeSemanticKey=(workspace:string,group:DraftGroup)=>hashToken(workspace+':knowledge-draft-v1:'+JSON.stringify(group));

/** Deterministic recorded-context detection produces candidates only. It never calls a model.
 * Decided groups remain decided even when later resolved tickets join the same group. */
export async function detectKnowledgeDrafts(ctx:WorkContext) {
  await knowledgeDraftActor(ctx);
  const groups=new Map<string,{group:DraftGroup;sources:DraftSource[]}>();
  const tickets=await ctx.env.DB.prepare("SELECT id,title,context_json FROM work_records WHERE workspace_id=? AND state='closed' AND sensitivity='normal' ORDER BY id")
    .bind(ctx.principal.workspaceId).all<{id:string;title:string;context_json:string}>();
  for(const ticket of tickets.results) {
    try {
      const source=await captureDraftSource(ctx,'ticket',ticket.id),group=ticketDraftGroup(ticket.title,JSON.parse(ticket.context_json));
      if(!group.value)continue;
      const key=JSON.stringify(group),existing=groups.get(key)||{group,sources:[]};
      // Bounded evidence packets; the full group key still makes later scans idempotent.
      if(existing.sources.length<30)existing.sources.push(source);
      groups.set(key,existing);
    } catch(error) { if(!(error instanceof ApiError)||![403,404,409].includes(error.status))throw error; }
  }
  const errors=await ctx.env.DB.prepare("SELECT id FROM svc_records WHERE workspace_id=? AND kind='problem' AND visibility IN ('workspace','operators') AND json_extract(data_json,'$.causeState')='known-error' ORDER BY id")
    .bind(ctx.principal.workspaceId).all<{id:string}>();
  for(const error of errors.results) {
    try {
      const source=await captureDraftSource(ctx,'known-error',error.id),group:DraftGroup={type:'known-error',facet:'problem',value:error.id,cohort:''};
      groups.set(JSON.stringify(group),{group,sources:[source]});
    } catch(error) { if(!(error instanceof ApiError)||![403,404,409].includes(error.status))throw error; }
  }
  for(const {group,sources} of groups.values()) {
    if(group.type==='tickets'&&sources.length<3)continue;
    const semanticKey=await knowledgeSemanticKey(ctx.principal.workspaceId,group);
    const prior=await ctx.env.DB.prepare('SELECT * FROM work_knowledge_drafts WHERE workspace_id=? AND (semantic_key=? OR group_json=?) LIMIT 1')
      .bind(ctx.principal.workspaceId,semanticKey,JSON.stringify(group)).first<KnowledgeDraftRow>();
    if(prior&&prior.state!=='candidate')continue;
    if(prior&&prior.sources_json===JSON.stringify(sources))continue;
    const fence=await knowledgeDraftFence(ctx,sources),t=now(),title=group.type==='known-error'?sources[0].title:`Resolved ${group.facet==='title'?sources[0].title:group.value}${group.cohort?' · '+group.cohort:''}`;
    if(prior) await ctx.env.DB.prepare(`UPDATE work_knowledge_drafts SET sources_json=?,title=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=? AND state='candidate' AND ${fence.sql}`)
      .bind(JSON.stringify(sources),title,t,ctx.principal.workspaceId,prior.id,prior.revision,...fence.values).run();
    else await ctx.env.DB.prepare(`INSERT OR IGNORE INTO work_knowledge_drafts(id,workspace_id,semantic_key,group_json,state,sources_json,title,creator_id,created_at,updated_at) SELECT ?,?,?,?,'candidate',?,?,?,?,? WHERE ${fence.sql}`)
      .bind(id(),ctx.principal.workspaceId,semanticKey,JSON.stringify(group),JSON.stringify(sources),title,ctx.principal.userId,t,t,...fence.values).run();
  }
  return listKnowledgeDrafts(ctx);
}

import {decodeHistory} from '../history/registry';
import {projectTaskReadable} from './project-activity';
import { registeredHistory, historyEventStatement, readHistoryEvent } from '../history/event';
import { getWork, type WorkContext } from './core';
import { workPrivateReadable } from './scope';
import { ApiError } from '../../platform/http';

export function assetEvent(ctx: WorkContext, assetId: string, action: string,
  before: Record<string, unknown>, after: Record<string, unknown>, at: string, subjects: string[] = [], eventId?: string) {
  const envelope = registeredHistory(action, { kind: 'asset', id: assetId }, before, after,
    { kind: 'person', id: ctx.principal.userId }, [...new Set(subjects.filter(Boolean))], 'normal', at);
  return historyEventStatement(ctx,{ ...(eventId ? {id:eventId} : {}), action, target:assetId, assetId, envelope, at, conditional:true });
}
export async function assetEvents(ctx: WorkContext, assetId: string) {
  const rows=(await ctx.env.DB.prepare(`SELECT id,actor_id,action,detail_json,created_at FROM audit_events
    WHERE workspace_id=? AND target=? AND action IN ('work.asset_recorded','work.asset_custody_changed',
    'work.asset_linked','work.asset_financials_recorded','work.asset_contract_recorded','work.asset_repair_linked','work.asset_audit_observed')
    ORDER BY created_at,rowid`).bind(ctx.principal.workspaceId,assetId)
    .all<{id:string;actor_id:string;action:string;detail_json:string;created_at:string}>()).results;
  const items=[];
  for(const row of rows){
    const original=decodeHistory(row.detail_json);
    if(['work.asset_linked','work.asset_repair_linked'].includes(row.action)){
      const canonical=original?.action===row.action&&original.record.kind==='asset'&&original.record.id===assetId;
      const values=canonical?original.changes.filter(change=>change.field==='link').flatMap(change=>[change.before,change.after]).filter(value=>value!==null):[];
      const source=(value:unknown):value is {kind:'ticket'|'task';id:string}=>!!value&&typeof value==='object'&&'kind' in value&&['ticket','task'].includes(String(value.kind))&&'id' in value&&typeof value.id==='string'&&!!value.id&&Object.keys(value).every(key=>['kind','id'].includes(key));
      if((!values.length||values.some(value=>!source(value)))&&!ctx.principal.roles.includes('owner'))continue;
      let readable=true;
      for(const value of values.filter(source)){
        if(value.kind==='task'){if(!await projectTaskReadable(ctx,value.id))readable=false;}
        else try{const work=await getWork(ctx,value.id);if(!workPrivateReadable(ctx.principal,work)||'access' in work)readable=false;}
        catch(error){if(error instanceof ApiError&&[403,404].includes(error.status))readable=false;else throw error;}
      }
      if(!readable)continue;
    }
    const projection=await readHistoryEvent(ctx,row.action,row.detail_json,row.actor_id,row.id);
    items.push({ id:row.id, at:row.created_at, kind:'change' as const, action:row.action.replace('work.',''), visibility:'private',
      actor:('actor' in projection ? projection.actor.name ?? projection.actor.id : row.actor_id), actorKind:('actor' in projection ? projection.actor.kind : 'person'),
      changes:projection.changes, ...('source' in projection && projection.source ? {source:projection.source} : {}), ...(projection.redacted ? {redacted:projection.redacted,redactedAt:projection.redactedAt,
        redaction:{reason:'erasure',at:projection.redactedAt,cleared:projection.changes.length===0}} : {}) });
  }
  return items;
}

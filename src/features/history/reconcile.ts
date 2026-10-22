import type { Env } from '../../platform/types';
import { readHistoryEvent } from './archive';
/** Privacy-only maintenance: no provider authority or business values are added. */
export async function reconcilePendingHistory(env:Env) {
  for(const [table,column,store] of [['audit_events','detail_json','audit'],['svc_events','data_json','service']] as const){
    const rows=(await env.DB.prepare(`SELECT id,workspace_id,actor_id,${store==='audit'?'action':'kind'} action,${column} payload FROM ${table} WHERE json_valid(${column}) AND json_extract(${column},'$.pendingErasure')=1 ORDER BY created_at,id LIMIT 100`).all<{id:string;workspace_id:string;actor_id:string;action:string;payload:string}>()).results;
    for(const row of rows)await readHistoryEvent({env,principal:{workspaceId:row.workspace_id}},row.action,row.payload,row.actor_id,row.id,store);
  }
}

import {readHistoryEvent} from '../history/event';
import type { ActivityEntry } from './activity';
import type { WorkContext } from './core';

interface ApprovalEvent {
  id: string;actor_id:string; approval_id: string; actor_name: string; created_at: string; detail_json: string;
}

/** Called only after the timeline's full ticket-scope check. Historical approval
 * values come from the event, never from mutable authority or erased payloads. */
export async function approvalActivity(ctx: WorkContext, workId: string): Promise<ActivityEntry[]> {
  const rows = (await ctx.env.DB.prepare(`SELECT e.id,e.actor_id,e.target approval_id,e.created_at,e.detail_json,
    CASE WHEN EXISTS(SELECT 1 FROM platform_identity_erasures p WHERE p.workspace_id=e.workspace_id AND p.user_id=e.actor_id)
      THEN '[erased]' ELSE COALESCE(u.name,e.actor_id) END actor_name
    FROM work_fulfilment_approvals a JOIN audit_events e ON e.workspace_id=a.workspace_id
      AND e.target=a.id AND e.action='work.fulfilment_approved'
    LEFT JOIN users u ON u.id=e.actor_id
    WHERE a.workspace_id=? AND a.work_id=? ORDER BY e.created_at,e.rowid`)
    .bind(ctx.principal.workspaceId, workId).all<ApprovalEvent>()).results;
  return Promise.all(rows.map(async event => {
    const entry: ActivityEntry = { id: event.id, at: event.created_at, kind: 'change', actor: event.actor_name,
      actorKind: 'person', action: 'fulfilment approved', visibility: 'private', changes: [] };
    const projected=await readHistoryEvent(ctx,'work.fulfilment_approved',event.detail_json,event.actor_id,event.id);
    if('actor' in projected&&projected.actor){entry.actor=projected.actor.name??(projected.actor.id==='[erased]'?'Erased person':projected.actor.id);entry.changes=projected.changes.some(c=>c.field==='approval'&&c.after&&typeof c.after==='object')?projected.changes.filter(c=>c.field==='approval'):projected.changes;}
    else if(!projected.redacted) {
      let d:any;try{d=JSON.parse(event.detail_json);}catch{return entry;}
      if(d && d.workId===workId && typeof d.catalogId==='string'&&typeof d.holderId==='string'&&[d.workRevision,d.fulfilmentRevision,d.catalogRevision].every(v=>Number.isInteger(v)&&v>0))
        entry.changes=[{field:'approval',before:null,after:{approvalId:event.approval_id,catalogId:d.catalogId,workRevision:d.workRevision,fulfilmentRevision:d.fulfilmentRevision,catalogRevision:d.catalogRevision,holderId:d.holderId,...(d.grantId&&d.grantVersion?{grantId:d.grantId,grantVersion:d.grantVersion}:{})}}];
    }
    if(projected.redacted){entry.redacted=projected.redacted;entry.redactedAt=projected.redactedAt;}
    return entry;
  }));
}

import type { WorkContext } from './core';

export interface FollowupLevel {id?:string;target:string;level:number;offset_minutes:number;notify:string|null;label:string}
export interface WaitingRule {remind_business_days:number;resolve_business_days:number}
type VersionRow=FollowupLevel & {kind:string;remind_business_days:number;resolve_business_days:number};
/** Sandbox promotion preserves the existing ticket's rules; future tickets use the new configuration. */
export async function followupConfiguration(ctx:WorkContext,workId:string,current?:{levels:FollowupLevel[];waitingRule:WaitingRule|null}) {
 const db=ctx.env.DB,ws=ctx.principal.workspaceId;
 const rows=(await db.prepare('SELECT * FROM work_followup_versions WHERE workspace_id=? AND work_id=? ORDER BY kind,target,level').bind(ws,workId).all<VersionRow>()).results;
 if(rows.some(row=>row.kind==='snapshot'))return {source:'retained' as const,levels:rows.filter(row=>row.kind==='escalation'),waitingRule:rows.find(row=>row.kind==='waiting')??null};
 if(current)return {source:'current' as const,...current};
 return {source:'current' as const,levels:(await db.prepare('SELECT target,level,offset_minutes,notify,label FROM work_escalation_levels WHERE workspace_id=? ORDER BY target,level').bind(ws).all<FollowupLevel>()).results,waitingRule:await db.prepare('SELECT remind_business_days,resolve_business_days FROM work_waiting_rules WHERE workspace_id=?').bind(ws).first<WaitingRule>()};
}
export function preserveFollowupVersions(db:D1Database,workspaceId:string) {
 const eligible="w.workspace_id=? AND w.state IN ('open','paused') AND NOT EXISTS(SELECT 1 FROM work_followup_versions v WHERE v.workspace_id=w.workspace_id AND v.work_id=w.id AND v.kind='snapshot')";
 return [
  db.prepare(`INSERT INTO work_followup_versions(workspace_id,work_id,kind,target,level,offset_minutes,notify,label) SELECT w.workspace_id,w.id,'escalation',e.target,e.level,e.offset_minutes,e.notify,e.label FROM work_records w JOIN work_escalation_levels e ON e.workspace_id=w.workspace_id WHERE ${eligible}`).bind(workspaceId),
  db.prepare(`INSERT INTO work_followup_versions(workspace_id,work_id,kind,remind_business_days,resolve_business_days) SELECT w.workspace_id,w.id,'waiting',r.remind_business_days,r.resolve_business_days FROM work_records w JOIN work_waiting_rules r ON r.workspace_id=w.workspace_id WHERE ${eligible}`).bind(workspaceId),
  db.prepare(`INSERT INTO work_followup_versions(workspace_id,work_id,kind) SELECT w.workspace_id,w.id,'snapshot' FROM work_records w WHERE ${eligible}`).bind(workspaceId),
 ];
}

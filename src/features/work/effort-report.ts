import { ApiError } from '../../platform/http';
import { permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';

/** Entry-start cohort. All recorded effort stays visible even when its request fails or remains pending. */
export async function effortReport(ctx: WorkContext, from: string, to: string) {
  await currentWorkPrincipal(ctx);
  permit(ctx,['owner','operator','auditor']);
  if(!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(from)>=Date.parse(to))
    throw new ApiError(422,'range','Valid ascending date range required');
  from=new Date(from).toISOString(); to=new Date(to).toISOString();
  const groups=(await ctx.env.DB.prepare(`SELECT e.request_type requestType,e.effort_role role,e.actor_role actorRole,e.source,
    COUNT(*) entries,SUM(e.touches) touches,SUM(e.active_ms)/60000.0 activeMinutes,
    SUM(CASE WHEN e.state='active' THEN 1 ELSE 0 END) unfinishedTimers
    FROM work_time_entries e JOIN work_records w ON w.workspace_id=e.workspace_id AND w.id=e.work_id
    WHERE e.workspace_id=? AND w.sensitivity='normal' AND e.created_at>=? AND e.created_at<?
    GROUP BY e.request_type,e.effort_role,e.actor_role,e.source ORDER BY e.request_type,e.effort_role,e.actor_role,e.source`)
    .bind(ctx.principal.workspaceId,from,to).all()).results;
  const cohort=(await ctx.env.DB.prepare(`SELECT w.id,w.kind,w.state,
    COALESCE((SELECT c.name FROM work_fulfilments f JOIN work_catalog c ON c.workspace_id=f.workspace_id AND c.id=f.catalog_id WHERE f.workspace_id=w.workspace_id AND f.work_id=w.id ORDER BY c.id LIMIT 1),w.kind) requestType,
    EXISTS(SELECT 1 FROM work_obligations o WHERE o.workspace_id=w.workspace_id AND o.work_id=w.id AND o.state='failed') failed,
    (EXISTS(SELECT 1 FROM work_obligations o WHERE o.workspace_id=w.workspace_id AND o.work_id=w.id) AND NOT EXISTS(SELECT 1 FROM work_obligations o WHERE o.workspace_id=w.workspace_id AND o.work_id=w.id AND o.state<>'verified')) verified
    FROM work_records w WHERE w.workspace_id=? AND w.sensitivity='normal' AND ((w.created_at>=? AND w.created_at<?) OR EXISTS(SELECT 1 FROM work_time_entries e WHERE e.workspace_id=w.workspace_id AND e.work_id=w.id AND e.created_at>=? AND e.created_at<?))`)
    .bind(ctx.principal.workspaceId,from,to,from,to).all<{id:string;requestType:string;state:string;failed:number;verified:number}>()).results;
  const byRequestType = [...new Set([...cohort.map(r=>r.requestType),...groups.map(g=>String(g.requestType))])].map(requestType=>{
    const rows=cohort.filter(r=>r.requestType===requestType);
    return {requestType,incoming:rows.length,verified:rows.filter(r=>r.verified).length,failed:rows.filter(r=>r.failed).length,
      pending:rows.filter(r=>!r.verified&&!r.failed).length,closed:rows.filter(r=>r.state==='closed').length};
  });
  return {from,to,asOf:new Date().toISOString(),groups,byRequestType,
    definition:'Normal-sensitivity requests created in the period, plus requests with effort entries started in [from,to). Active minutes are persisted manual declarations or bounded browser activity, attributed to the recorded role. A touch is one entry or resumed measured work session; heartbeats are not additional touches. Entry totals include all recorded activity for that entry through asOf. External wait and machine runtime are excluded. Request type is the first selected catalog service, otherwise request kind; entries retain the type at recording. Failed and pending work are retained; closure is not verification.',
    cost:{laborUsd:null,modelUsd:null,providerUsd:null,perVerifiedOutcomeUsd:null,basis:'Charges and labor rates are not recorded by time tracking; no savings or zero-cost claim is inferred.'}};
}

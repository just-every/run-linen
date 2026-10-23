import { ApiError } from '../../platform/http';
import { permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';
import { departmentReportScope } from './department-report-scope';
import { departmentNotHrSql } from './department-spaces';
import { dto, readable, type RecordRow } from '../services/store';

export const reportSources = {
  tickets: ['id','title','kind','state','priority','location','departmentId','assigneeId','revision','createdAt','updatedAt','closedAt'],
  assets: ['id','serial','state','location','personId','source','revision','observedAt'],
  changes: ['id','title','state','changeType','serviceId','ownerId','revision','createdAt','updatedAt'],
  lifecycle: ['id','workId','personId','kind','effectiveAt','timezone','revision','cancelledAt'],
} as const;
export type ReportSource = keyof typeof reportSources;
export type ReportCell = string | number | null;
export type ReportRow = Record<string, ReportCell>;
export interface ReportDefinition { source: ReportSource; columns: string[]; filters?: Record<string, ReportCell>; groupBy?: string }
export async function reportReader(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner','operator','auditor']);
}
export function reportDefinition(input: unknown): ReportDefinition {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(422,'report_definition','Report definition required');
  const q = input as ReportDefinition, fields = Object.hasOwn(reportSources,q.source) ? reportSources[q.source] as readonly string[] : null;
  if (!fields || !Array.isArray(q.columns) || !q.columns.length || q.columns.length > fields.length || q.columns.some(c=>typeof c!=='string'||!fields.includes(c)) || new Set(q.columns).size!==q.columns.length)
    throw new ApiError(422,'report_columns','Choose a source and distinct supported columns');
  if(q.groupBy!==undefined && (typeof q.groupBy!=='string'||!fields.includes(q.groupBy))) throw new ApiError(422,'report_group','Choose a supported grouping field');
  if(q.filters!==undefined && (!q.filters || typeof q.filters!=='object' || Array.isArray(q.filters) || Object.keys(q.filters).length>fields.length || Object.entries(q.filters).some(([k,v])=>!fields.includes(k) || !(v===null || typeof v==='string'&&v.length<=500 || typeof v==='number'&&Number.isFinite(v)))))
    throw new ApiError(422,'report_filter','Filters must be exact supported field values');
  return {source:q.source,columns:q.columns,filters:q.filters??{},...(q.groupBy?{groupBy:q.groupBy}:{})};
}
/** Report population is separate from capped conversational lists and never projects private context. */
export async function reportRows(ctx: WorkContext, source: ReportSource): Promise<ReportRow[]> {
  await reportReader(ctx);
  const db=ctx.env.DB,w=ctx.principal.workspaceId;
  let rows: ReportRow[];
  if(source==='tickets') {
    const scope=departmentReportScope(ctx);
    const result=await db.prepare(`SELECT w.id,w.title,w.kind,w.state,
      (SELECT json_extract(c.current_json,'$.priority') FROM work_classifications c WHERE c.workspace_id=w.workspace_id AND c.work_id=w.id) priority,
      CASE WHEN json_type(w.context_json,'$.location')='text' THEN json_extract(w.context_json,'$.location') ELSE NULL END location,
      w.department_id departmentId,w.assignee_id assigneeId,w.revision,w.created_at createdAt,MAX(w.updated_at,COALESCE((SELECT MAX(m.created_at) FROM work_messages m WHERE m.workspace_id=w.workspace_id AND m.work_id=w.id AND m.visibility='public'),w.updated_at)) updatedAt,w.closed_at closedAt
      FROM work_records w WHERE w.workspace_id=? AND w.sensitivity='normal' AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=w.workspace_id AND e.person_id IN(w.requester_id,w.beneficiary_id)) AND ${departmentNotHrSql('w')} AND ${scope.sql} ORDER BY w.id LIMIT 10001`)
      .bind(w,...scope.bindings).all<ReportRow>();
    rows=result.results;
  } else if(source==='assets') {
    permit(ctx,['owner','operator']);
    rows=(await db.prepare('SELECT id,serial,state,location,person_id personId,source,revision,observed_at observedAt FROM work_assets WHERE workspace_id=? ORDER BY id LIMIT 10001').bind(w).all<ReportRow>()).results;
  } else if(source==='lifecycle') {
    permit(ctx,['owner']);
    rows=(await db.prepare('SELECT id,work_id workId,person_id personId,kind,effective_at effectiveAt,timezone,revision,cancelled_at cancelledAt FROM work_lifecycle WHERE workspace_id=? ORDER BY id LIMIT 10001').bind(w).all<ReportRow>()).results;
  } else {
    const result=await db.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind='change' ORDER BY id LIMIT 10001").bind(w).all<RecordRow>();
    if(result.results.length>10000) throw new ApiError(422,'report_size','Report source exceeds 10000 rows; narrow the installed population before exporting');
    rows=result.results.map(dto).filter(r=>readable(ctx.principal,r)).map(r=>({id:r.id,title:typeof r.data.title==='string'?r.data.title:null,state:typeof r.data.state==='string'?r.data.state:null,changeType:typeof r.data.changeType==='string'?r.data.changeType:null,serviceId:typeof r.data.serviceId==='string'?r.data.serviceId:null,ownerId:r.ownerId,revision:r.revision,createdAt:r.createdAt,updatedAt:r.updatedAt}));
  }
  if(rows.length>10000) throw new ApiError(422,'report_size','Report source exceeds 10000 rows; no truncated export was produced');
  return rows;
}
export async function buildReport(ctx: WorkContext, input: unknown) {
  const definition=reportDefinition(input);
  const source=await reportRows(ctx,definition.source);
  const matching=source.filter(row=>Object.entries(definition.filters??{}).every(([k,v])=>row[k]===v));
  let columns=definition.columns, rows:ReportRow[];
  if(definition.groupBy) {
    const key=definition.groupBy, groups=new Map<ReportCell,number>();
    for(const row of matching)groups.set(row[key],(groups.get(row[key])??0)+1);
    columns=[key,'count'];rows=[...groups].sort(([a],[b])=>String(a).localeCompare(String(b))).map(([value,count])=>({[key]:value,count}));
  } else rows=matching.map(row=>Object.fromEntries(columns.map(c=>[c,row[c]])));
  return {source:definition.source,columns,rows,total:matching.length,scope:'Current reader source permissions; tickets exclude restricted, HR and retained HR. No private messages, quotes or arbitrary context.',definition};
}

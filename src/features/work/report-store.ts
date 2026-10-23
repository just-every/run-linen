import { ApiError, id, now, requiredString } from '../../platform/http';
import { permit, type WorkContext } from './core';
import { buildReport, reportDefinition, reportReader } from './report-data';

export interface SavedReport {id:string;workspace_id:string;owner_id:string;name:string;definition_json:string;shared_json:string;revision:number;created_at:string}
export const reportDto=(r:SavedReport)=>({id:r.id,name:r.name,ownerId:r.owner_id,definition:JSON.parse(r.definition_json),sharedWith:JSON.parse(r.shared_json),revision:r.revision,createdAt:r.created_at});
export async function reportOwner(ctx:WorkContext) {await reportReader(ctx);permit(ctx,['owner']);}
export function reportAudit(ctx:WorkContext,action:string,target:string,detail:object={}) {return ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),ctx.principal.workspaceId,ctx.principal.userId,action,target,JSON.stringify(detail),now());}
export async function reportWrite(ctx:WorkContext,statements:D1PreparedStatement[]) {
  const guard=id(),p=ctx.principal;
  try {return await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner') THEN 1 ELSE 0 END)`).bind(guard,p.workspaceId,p.userId),
    ...statements,ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard),
  ]);}catch(error){if(/CHECK constraint failed/i.test(String(error)))throw new ApiError(409,'report_authority_changed','Owner authority changed; reload');throw error;}
}
export async function savedReport(ctx:WorkContext,key:string) {
  await reportReader(ctx);
  const row=await ctx.env.DB.prepare('SELECT * FROM work_reports WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,key).first<SavedReport>();
  if(!row || row.owner_id!==ctx.principal.userId && !JSON.parse(row.shared_json).includes(ctx.principal.userId)) throw new ApiError(404,'not_found','Report unavailable');
  return row;
}
export async function listReports(ctx:WorkContext) {
  await reportReader(ctx);
  const rows=(await ctx.env.DB.prepare('SELECT * FROM work_reports WHERE workspace_id=? ORDER BY created_at DESC').bind(ctx.principal.workspaceId).all<SavedReport>()).results;
  return rows.filter(r=>r.owner_id===ctx.principal.userId||JSON.parse(r.shared_json).includes(ctx.principal.userId)).map(reportDto);
}
export async function saveReport(ctx:WorkContext,input:Record<string,unknown>) {
  await reportOwner(ctx);
  const name=requiredString(input.name,'name',120),definition=reportDefinition(input.definition),shared=input.sharedWith??[];
  if(!Array.isArray(shared)||shared.length>100||shared.some(u=>typeof u!=='string')||new Set(shared).size!==shared.length)throw new ApiError(422,'report_sharing','Choose distinct current report readers');
  for(const userId of shared) {
    const member=await ctx.env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(ctx.principal.workspaceId,userId).first<{roles_json:string}>();
    if(!member || !JSON.parse(member.roles_json).some((r:string)=>['owner','operator','auditor'].includes(r)))throw new ApiError(422,'report_sharing','Every recipient needs current report readership');
  }
  await buildReport(ctx,definition);
  const key=id();
  await reportWrite(ctx,[ctx.env.DB.prepare('INSERT INTO work_reports VALUES(?,?,?,?,?,?,1,?)').bind(key,ctx.principal.workspaceId,ctx.principal.userId,name,JSON.stringify(definition),JSON.stringify(shared),now()),reportAudit(ctx,'report.saved',key,{source:definition.source,sharedWith:shared})]);
  return reportDto(await savedReport(ctx,key));
}
export async function runSavedReport(ctx:WorkContext,key:string) {const saved=await savedReport(ctx,key);return {...reportDto(saved),...await buildReport(ctx,JSON.parse(saved.definition_json))};}

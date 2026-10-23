import {assertAdoptionEffectAllowed} from '../adoption/authority';
import {assertPlatformAdmission} from '../../platform/privacy';
import type { Env } from '../../platform/types';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { SendGridSendError, sendSendGrid } from '../execution/mail/sender';
import type { WorkContext } from './core';
import { currentWorkPrincipal } from './identity';
import { buildReport } from './report-data';
import { reportCsv } from './report-files';
import { reportAudit, reportOwner, reportWrite, savedReport } from './report-store';
interface Schedule {id:string;workspace_id:string;report_id:string;owner_id:string;recipient_id:string;frequency:string;next_at:string;active:number;revision:number;consented_at:string}
const dto=(r:Schedule)=>({id:r.id,recipientId:r.recipient_id,frequency:r.frequency,nextAt:r.next_at,active:Boolean(r.active),revision:r.revision,consentedAt:r.consented_at,channel:'email'});
function next(frequency:string) {const date=new Date();date.setUTCDate(date.getUTCDate()+(frequency==='weekly'?7:1));date.setUTCHours(0,0,0,0);return date.toISOString();}
export async function reportRecipients(ctx:WorkContext) {
  await reportOwner(ctx);
  return (await ctx.env.DB.prepare(`SELECT u.id,u.name FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND m.active=1 AND EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value IN ('owner','operator','auditor')) ORDER BY u.name`).bind(ctx.principal.workspaceId).all()).results;
}
export async function listReportSchedules(ctx:WorkContext,key:string) {
  await reportOwner(ctx);await savedReport(ctx,key);
  return {items:(await ctx.env.DB.prepare('SELECT * FROM work_report_schedules WHERE workspace_id=? AND report_id=? AND owner_id=? ORDER BY consented_at DESC').bind(ctx.principal.workspaceId,key,ctx.principal.userId).all<Schedule>()).results.map(dto),deliveries:(await ctx.env.DB.prepare('SELECT d.* FROM work_report_deliveries d JOIN work_report_schedules s ON s.id=d.schedule_id WHERE d.workspace_id=? AND s.report_id=? AND s.owner_id=? ORDER BY d.created_at DESC').bind(ctx.principal.workspaceId,key,ctx.principal.userId).all()).results};
}
async function recipient(ctx:WorkContext,reportId:string,userId:string) {
  const member=await ctx.env.DB.prepare('SELECT u.email,m.roles_json FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND m.user_id=? AND m.active=1').bind(ctx.principal.workspaceId,userId).first<{email:string;roles_json:string}>();
  if(!member || !JSON.parse(member.roles_json).some((r:string)=>['owner','operator','auditor'].includes(r)))throw new ApiError(403,'report_recipient_revoked','Recipient needs current report readership');
  const target:WorkContext={env:ctx.env,principal:{workspaceId:ctx.principal.workspaceId,userId,roles:JSON.parse(member.roles_json)}};
  const report=await savedReport(target,reportId);return {member,target,report};
}
export async function createReportSchedule(ctx:WorkContext,key:string,input:Record<string,unknown>) {
  await reportOwner(ctx);const report=await savedReport(ctx,key);
  if(input.channel==='slack')throw new ApiError(422,'needs_configuration','Slack report delivery requires the unbuilt CHANNEL-001 adapter');
  if(input.channel!=='email'||input.consent!==true||!['weekly','nightly'].includes(String(input.frequency)))throw new ApiError(422,'report_schedule','Email, weekly or nightly frequency and explicit destination consent required');
  const userId=requiredString(input.recipientUserId,'recipientUserId',200);await recipient(ctx,key,userId);
  if(ctx.env.MAIL_PROVIDER!=='sendgrid'||!ctx.env.MAIL_API_KEY||!ctx.env.MAIL_FROM)throw new ApiError(503,'needs_configuration','Scheduled email reports require a configured SendGrid sender');
  const scheduleId=id(),frequency=String(input.frequency);
  await reportWrite(ctx,[ctx.env.DB.prepare('INSERT INTO work_report_schedules VALUES(?,?,?,?,?,?,?,1,1,?)').bind(scheduleId,ctx.principal.workspaceId,report.id,ctx.principal.userId,userId,frequency,next(frequency),now()),reportAudit(ctx,'report.destination_consented',scheduleId,{reportId:key,recipientId:userId,channel:'email',frequency})]);
  return dto((await ctx.env.DB.prepare('SELECT * FROM work_report_schedules WHERE id=?').bind(scheduleId).first<Schedule>())!);
}
export async function setReportSchedule(ctx:WorkContext,key:string,input:Record<string,unknown>) {
  await reportOwner(ctx);const row=await ctx.env.DB.prepare('SELECT * FROM work_report_schedules WHERE workspace_id=? AND id=? AND owner_id=?').bind(ctx.principal.workspaceId,key,ctx.principal.userId).first<Schedule>();
  if(!row)throw new ApiError(404,'not_found','Schedule unavailable');
  if(input.revision!==row.revision||typeof input.active!=='boolean')throw new ApiError(409,'revision_conflict','Current revision and active flag required');
  await reportWrite(ctx,[ctx.env.DB.prepare('UPDATE work_report_schedules SET active=?,revision=revision+1 WHERE id=? AND revision=?').bind(Number(input.active),key,row.revision),reportAudit(ctx,'report.schedule_changed',key,{active:input.active})]);return dto((await ctx.env.DB.prepare('SELECT * FROM work_report_schedules WHERE id=?').bind(key).first<Schedule>())!);
}
function base64(text:string) {const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
export async function runReportSchedule(ctx:WorkContext,key:string) {
  await reportOwner(ctx);
  const row=await ctx.env.DB.prepare('SELECT * FROM work_report_schedules WHERE workspace_id=? AND id=? AND owner_id=? AND active=1').bind(ctx.principal.workspaceId,key,ctx.principal.userId).first<Schedule>();
  if(!row)throw new ApiError(404,'not_found','Active schedule unavailable');
  if(ctx.env.MAIL_PROVIDER!=='sendgrid'||!ctx.env.MAIL_API_KEY||!ctx.env.MAIL_FROM)throw new ApiError(503,'needs_configuration','Scheduled email reports require a configured SendGrid sender');
  if(await ctx.env.DB.prepare("SELECT 1 FROM work_report_deliveries WHERE schedule_id=? AND state IN ('dispatching','unknown')").bind(key).first())throw new ApiError(409,'report_reconcile','Prior mail submission is uncertain; automatic resend is held');
  const target=await recipient(ctx,row.report_id,row.recipient_id),result=await buildReport(target.target,JSON.parse(target.report.definition_json));
  const deliveryId=id();
  try {await reportWrite(ctx,[ctx.env.DB.prepare("INSERT INTO work_report_deliveries VALUES(?,?,?,'dispatching',NULL,?,NULL,?,NULL)").bind(deliveryId,row.workspace_id,row.id,result.rows.length,now()),reportAudit(ctx,'report.dispatch_started',deliveryId,{scheduleId:key,rowCount:result.rows.length})]);}
  catch(error){if(/UNIQUE constraint failed/i.test(String(error)))throw new ApiError(409,'report_reconcile','Another mail submission is in progress');throw error;}
  let state='rejected',providerRef:string|null=null,error:string|null=null;
  // Preflight is separate from the network attempt, so a lost response can never be classified rejected.
  try {
    await reportOwner(ctx);const live=await ctx.env.DB.prepare('SELECT active,revision FROM work_report_schedules WHERE id=?').bind(key).first<{active:number;revision:number}>();
    const fresh=await recipient(ctx,row.report_id,row.recipient_id),view=await buildReport(fresh.target,JSON.parse(fresh.report.definition_json));
    if(!live?.active||live.revision!==row.revision||fresh.member.email!==target.member.email||JSON.stringify(view)!==JSON.stringify(result))throw new ApiError(409,'report_scope_changed','Recipient, scope or report changed before dispatch');
    await currentWorkPrincipal(ctx);
    const owner=await ctx.env.DB.prepare('SELECT email FROM users WHERE id=?').bind(ctx.principal.userId).first<{email:string}>();
    if(!owner)throw new ApiError(409,'report_owner_unavailable','Report schedule owner is unavailable');
    await assertPlatformAdmission(ctx.env.DB,ctx.principal.workspaceId,ctx.principal.userId,owner.email);
    await assertAdoptionEffectAllowed(ctx,{resource:row.id,action:'report.email'});
  }catch(e){await ctx.env.DB.prepare("UPDATE work_report_deliveries SET state='rejected',error='preflight_changed',finished_at=? WHERE id=?").bind(now(),deliveryId).run();throw e;}
  try {
    const response=await sendSendGrid({apiKey:ctx.env.MAIL_API_KEY,message:{from:ctx.env.MAIL_FROM,to:[target.member.email],subject:`Linen report: ${target.report.name}`,text:`${target.report.name}\n${result.rows.length} report rows, computed under your current Linen permissions. The CSV is attached. Provider acceptance is recorded separately from inbox delivery.`,attachments:[{filename:'linen-report.csv',type:'text/csv',content:base64(reportCsv(result.columns,result.rows))}],deliveryId}});
    state='accepted';providerRef=response.providerMessageId;
  }catch(e){state=e instanceof SendGridSendError&&e.outcome!=='ambiguous'?'rejected':'unknown';error=state==='unknown'?'Mail submission uncertain; do not resend without provider reconciliation':'Provider rejected submission';}
  await ctx.env.DB.batch([ctx.env.DB.prepare('UPDATE work_report_deliveries SET state=?,provider_ref=?,error=?,finished_at=? WHERE id=?').bind(state,providerRef,error,now(),deliveryId),ctx.env.DB.prepare('UPDATE work_report_schedules SET next_at=? WHERE id=?').bind(next(row.frequency),key),reportAudit(ctx,`report.${state}`,deliveryId,{scheduleId:key})]);
  return {id:deliveryId,state,providerRef,rowCount:result.rows.length,error};
}
export async function processDueReporting(env:Env) {
  const rows=(await env.DB.prepare('SELECT * FROM work_report_schedules WHERE active=1 AND next_at<=? ORDER BY next_at LIMIT 10').bind(now()).all<Schedule>()).results;
  for(const row of rows)try {await runReportSchedule({env,principal:{workspaceId:row.workspace_id,userId:row.owner_id,roles:['owner']}},row.id);}catch{/* Refusal stays isolated; unknown mail is never automatically resent. */}
}

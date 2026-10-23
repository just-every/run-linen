import { ApiError, now } from '../../platform/http';
import { getWork, type WorkRecord } from '../work/core';
import { currentWorkPrincipal } from '../work/identity';
import { workReadable, workPrivateReadable } from '../work/scope';
import { slaFor } from '../work/sla-policies';
import { assert, membership } from './authority';
import { mandatoryEvents, type NotificationRule, type NotificationTemplate, type RecipientSelector } from './notification-schema';
import type { CoreContext } from './types';

/** A new principal is derived from active membership; no role from retrieved ticket text is used. */
export async function notificationReader(ctx:CoreContext,userId:string) {
  const roles=await membership(ctx,userId);
  assert(!roles.includes('integration'),'notification_human_required',403);
  const reader:CoreContext={env:ctx.env,principal:{workspaceId:ctx.principal.workspaceId,userId,roles:roles as any}};
  await currentWorkPrincipal(reader);
  return reader;
}
export type NotificationWork = WorkRecord & {approvalProjection?:{title:string;requesterName:string}};
export async function readableNotificationWork(ctx:CoreContext,workId:string,approval=false):Promise<NotificationWork> {
  await currentWorkPrincipal(ctx);
  const row=await ctx.env.DB.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,workId).first<WorkRecord>();
  assert(row,'notification_record_missing',404);
  assert(!await ctx.env.DB.prepare('SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id IN(?,?,?)').bind(ctx.principal.workspaceId,ctx.principal.userId,row.requester_id,row.beneficiary_id).first(),'notification_erased',403);
  assert(!await ctx.env.DB.prepare('SELECT 1 FROM platform_identity_erasures WHERE workspace_id=? AND user_id IN(?,?,?)').bind(ctx.principal.workspaceId,ctx.principal.userId,row.requester_id,row.beneficiary_id).first(),'notification_erased',403);
  if(workReadable(ctx.principal,row))return getWork(ctx,workId);
  assert(approval,'notification_record_scope',404);
  // Inherit the existing CATALOG-001 decision projection, without granting ticket or quote access.
  const [{listStageDecisions},{listFulfilmentDecisions}]=await Promise.all([import('../work/approval-views'),import('../work/fulfilment-decisions')]);
  const [stages,managers]=await Promise.all([listStageDecisions(ctx),listFulfilmentDecisions(ctx)]);
  const decision=[...stages.items,...managers.items].find(d=>d.workId===workId&&d.expectedWorkRevision===row.revision);
  assert(decision,'notification_approval_scope',404);
  return {...row,approvalProjection:{title:decision.title,requesterName:decision.requesterName}};
}
export async function ruleMatches(ctx:CoreContext,rule:NotificationRule,work:WorkRecord) {
  const c=JSON.parse(rule.conditions_json),classification=await ctx.env.DB.prepare('SELECT current_json FROM work_classifications WHERE workspace_id=? AND work_id=?').bind(ctx.principal.workspaceId,work.id).first<{current_json:string|null}>();
  const priority=classification?.current_json?JSON.parse(classification.current_json).priority:null;
  return (!c.priority||c.priority===priority)&&(!c.departmentId||c.departmentId===work.department_id)&&(!c.groupId||c.groupId===work.group_id)&&(!c.kind||c.kind===work.kind)&&(!c.state||c.state===work.state);
}
export async function ruleRecipients(ctx:CoreContext,rule:NotificationRule,work:WorkRecord) {
  const recipients=new Set<string>(),w=ctx.principal.workspaceId;
  const group=async(groupId:string|undefined|null,lead:boolean)=>{
    if(!groupId)return;
    const rows=await ctx.env.DB.prepare('SELECT m.user_id FROM work_group_members m JOIN work_groups g ON g.workspace_id=m.workspace_id AND g.id=m.group_id WHERE m.workspace_id=? AND m.group_id=? AND (?=0 OR m.lead=1)').bind(w,groupId,Number(lead)).all<{user_id:string}>();
    rows.results.forEach(r=>recipients.add(r.user_id));
  };
  for(const s of JSON.parse(rule.recipients_json) as RecipientSelector[]) {
    if(s.type==='person')recipients.add(s.value);
    if(s.type==='field') {
      const user=s.value==='requester'?work.requester_id:s.value==='beneficiary'?work.beneficiary_id:s.value==='assignee'?work.assignee_id:null;
      if(user)recipients.add(user);
      if(s.value==='group_lead')await group(work.group_id,true);
    }
    if(s.type==='group'||s.type==='group_lead')await group(s.value,s.type==='group_lead');
    if(s.type==='role') {
      const rows=await ctx.env.DB.prepare('SELECT m.user_id FROM memberships m WHERE m.workspace_id=? AND m.active=1 AND EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value=?) AND NOT EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value=\'integration\')').bind(w,s.value).all<{user_id:string}>();
      rows.results.forEach(r=>recipients.add(r.user_id));
    }
  }
  // Bound work per event, rather than silently dropping a broad audience.
  assert(recipients.size<=500,'notification_recipient_limit',422);
  return recipients;
}
export async function recipientPreference(ctx:CoreContext,rule:NotificationRule) {
  const preference=await ctx.env.DB.prepare('SELECT enabled,language FROM notification_preferences WHERE workspace_id=? AND user_id=? AND event=? AND channel=?').bind(ctx.principal.workspaceId,ctx.principal.userId,rule.event,rule.channel).first<{enabled:number;language:string}>();
  return {enabled:Boolean(rule.mandatory)||mandatoryEvents.includes(rule.event)||preference?.enabled!==0,language:preference?.language??'en-US'};
}
/** Only core fields are projected. Never inspect context_json, catalog snapshots, messages or attachments. */
export async function renderNotification(ctx:CoreContext,template:NotificationTemplate,work:NotificationWork) {
  const content=template.subject+'\n'+template.body,values:Record<string,string>={
    'ticket.number':work.id,'ticket.title':work.approvalProjection?.title??work.title,...(!work.approvalProjection?{'ticket.state':work.state}:{}),
    'ticket.url':work.approvalProjection?'/app#/decisions':`/app#/work/${encodeURIComponent(work.id)}`,
  };
  if(content.includes('requester.first_name')) {
    if(work.approvalProjection){values['requester.first_name']=work.approvalProjection.requesterName.trim().split(/\s+/)[0];}
    else {
    assert(ctx.principal.userId===work.requester_id||workPrivateReadable(ctx.principal,work),'notification_placeholder_scope',403);
    const requester=await ctx.env.DB.prepare('SELECT u.name FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND m.user_id=? AND m.active=1').bind(ctx.principal.workspaceId,work.requester_id).first<{name:string}>();
    assert(requester?.name?.trim(),'notification_placeholder_unavailable',409);
    values['requester.first_name']=requester!.name.trim().split(/\s+/)[0];
    }
  }
  if(content.includes('sla.due_at')) {
    assert(!work.approvalProjection&&workPrivateReadable(ctx.principal,work),'notification_placeholder_scope',403);
    const sla=await slaFor(ctx,work,now());
    assert(sla?.resolution.dueAt,'notification_placeholder_unavailable',409);
    values['sla.due_at']=sla.resolution.dueAt;
  }
  const fill=(text:string)=>text.replace(/\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/g,(_all,key)=>{
    if(!Object.hasOwn(values,key))throw new ApiError(422,'notification_placeholder','Unsupported or unavailable core placeholder');
    return values[key];
  });
  const subject=fill(template.subject),body=fill(template.body);
  assert(!/[\r\n]/.test(subject)&&subject.length<=1000&&body.length<=20000,'notification_render_limit',422);
  return {subject,body};
}

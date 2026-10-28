import { ApiError, id, now, requiredString } from '../../platform/http';
import { currentWorkPrincipal } from '../work/identity';
import type { CoreContext } from './types';
import { validatedNotificationSender } from './notification-branding';
import { channelValue, eventValue, languageValue, latestRuleSql, latestTemplateSql, mandatoryEvents, notificationChannels, notificationEvents, notificationOwner, notificationPlaceholders, refuse, revisionValue, validateTemplate, type NotificationRule, type NotificationTemplate, type RecipientSelector } from './notification-schema';

const ownerSql="EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')";
const audit=(ctx:CoreContext,action:string,target:string,before:unknown,after:unknown,reason:string)=>ctx.env.DB.prepare('INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()>0')
  .bind(id(),ctx.principal.workspaceId,ctx.principal.userId,action,target,JSON.stringify({before,after,reason}),now());
export function templateDto(t:NotificationTemplate) { return {id:t.id,revision:t.revision,name:t.name,language:t.language,subject:t.subject,body:t.body,actorId:t.actor_id,createdAt:t.created_at}; }
export function ruleDto(r:NotificationRule) { return {id:r.id,revision:r.revision,name:r.name,event:r.event,conditions:JSON.parse(r.conditions_json),recipients:JSON.parse(r.recipients_json),templateId:r.template_id,channel:r.channel,connectionId:r.connection_id,connectionRevision:r.connection_revision,mandatory:Boolean(r.mandatory),enabled:Boolean(r.enabled),consentedBy:r.consented_by,actorId:r.actor_id,createdAt:r.created_at}; }
export async function notificationConfig(ctx:CoreContext) {
  await notificationOwner(ctx);
  const [rules,templates]=await Promise.all([
    ctx.env.DB.prepare(latestRuleSql+' ORDER BY r.name').bind(ctx.principal.workspaceId).all<NotificationRule>(),
    ctx.env.DB.prepare(latestTemplateSql+' ORDER BY t.name').bind(ctx.principal.workspaceId).all<NotificationTemplate>(),
  ]);
  return {events:notificationEvents,channels:notificationChannels,mandatoryEvents,placeholders:notificationPlaceholders,rules:rules.results.map(ruleDto),templates:templates.results.map(templateDto)};
}
export async function notificationHistory(ctx:CoreContext) {
  await notificationOwner(ctx);
  const [rules,templates,changes]=await Promise.all([
    ctx.env.DB.prepare('SELECT * FROM notification_rules WHERE workspace_id=? ORDER BY created_at DESC,revision DESC LIMIT 200').bind(ctx.principal.workspaceId).all<NotificationRule>(),
    ctx.env.DB.prepare('SELECT * FROM notification_templates WHERE workspace_id=? ORDER BY created_at DESC,revision DESC LIMIT 200').bind(ctx.principal.workspaceId).all<NotificationTemplate>(),
    ctx.env.DB.prepare("SELECT id,actor_id,action,target,detail_json,created_at FROM audit_events WHERE workspace_id=? AND action IN('notification.template_changed','notification.rule_changed','notification.branding_changed') ORDER BY created_at DESC,rowid DESC LIMIT 200").bind(ctx.principal.workspaceId).all<{id:string;actor_id:string;action:string;target:string;detail_json:string;created_at:string}>(),
  ]);
  return {rules:rules.results.map(ruleDto),templates:templates.results.map(templateDto),changes:changes.results.map(change=>{const detail=JSON.parse(change.detail_json);return {id:change.id,actorId:change.actor_id,action:change.action,target:change.target,before:detail.before,after:detail.after,reason:detail.reason,at:change.created_at};})};
}
export async function saveNotificationTemplate(ctx:CoreContext,b:Record<string,unknown>) {
  await notificationOwner(ctx);
  const templateId=b.id===undefined?id():requiredString(b.id,'id',200),revision=revisionValue(b.revision),reason=requiredString(b.reason,'reason',500),w=ctx.principal.workspaceId;
  const prior=await ctx.env.DB.prepare(latestTemplateSql+' AND t.id=?').bind(w,templateId).first<NotificationTemplate>();
  if ((prior?.revision??0)!==revision) throw new ApiError(409,'notification_revision_conflict','Template changed; reload before saving');
  const after={id:templateId,revision:revision+1,name:requiredString(b.name,'name',120),language:languageValue(b.language),subject:validateTemplate(b.subject,'subject',200),body:validateTemplate(b.body,'body',10000)};
  const [saved]=await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO notification_templates SELECT ?,?,?,?,?,?,?,?,? WHERE COALESCE((SELECT MAX(revision) FROM notification_templates WHERE workspace_id=? AND id=?),0)=? AND ${ownerSql}`)
      .bind(w,after.id,after.revision,after.name,after.language,after.subject,after.body,ctx.principal.userId,now(),w,templateId,revision,w,ctx.principal.userId),
    audit(ctx,'notification.template_changed',templateId,prior?templateDto(prior):null,after,reason),
  ]);
  if(!saved.meta.changes)throw new ApiError(409,'notification_revision_conflict','Template or owner authority changed; reload before saving');
  return after;
}
async function conditions(ctx:CoreContext,value:unknown) {
  if(value===undefined)return {};
  if (!value || typeof value!=='object' || Array.isArray(value)) refuse('notification_conditions','Conditions must be an object');
  const source=value as Record<string,unknown>,result:Record<string,string>={};
  for(const [key,v] of Object.entries(source)) {
    if(!['priority','departmentId','groupId','kind','state'].includes(key))refuse('notification_condition','Only core ticket conditions are supported');
    const s=requiredString(v,key,200);result[key]=s;
    if(key==='priority'&&!['P1','P2','P3','P4'].includes(s))refuse('notification_priority','Choose priority P1 to P4');
    if(key==='kind'&&!['request','service_request','incident','question'].includes(s))refuse('notification_kind','Choose a supported ticket kind');
    if(key==='state'&&!['open','paused','closed','cancelled'].includes(s))refuse('notification_state','Choose a supported ticket state');
    if(key==='departmentId'&&!await ctx.env.DB.prepare('SELECT 1 FROM work_departments WHERE workspace_id=? AND id=? AND active=1').bind(ctx.principal.workspaceId,s).first())refuse('notification_department','Choose a current workspace department');
    if(key==='groupId'&&!await ctx.env.DB.prepare('SELECT 1 FROM work_groups WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,s).first())refuse('notification_group','Choose a workspace group');
  }
  return result;
}
async function selectors(ctx:CoreContext,value:unknown):Promise<RecipientSelector[]> {
  if(!Array.isArray(value)||!value.length||value.length>20)refuse('notification_recipients','Choose 1 to 20 recipient selectors');
  const result:RecipientSelector[]=[];
  for(const raw of value) {
    if(!raw||typeof raw!=='object'||!['role','group','group_lead','field','person'].includes(raw.type))refuse('notification_recipient','Choose roles, groups, group leads, record fields or named people');
    const s:RecipientSelector={type:raw.type,value:requiredString(raw.value,'recipient',200)};
    if(s.type==='role'&&!['owner','operator','hr','employee','approver','auditor'].includes(s.value))refuse('notification_role','Choose a human workspace role');
    if(s.type==='field'&&!['requester','beneficiary','assignee','group_lead'].includes(s.value))refuse('notification_field','Only requester, beneficiary, assignee and group lead fields are supported');
    if(['group','group_lead'].includes(s.type)&&!await ctx.env.DB.prepare('SELECT 1 FROM work_groups WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,s.value).first())refuse('notification_group','Choose a workspace group');
    if(s.type==='person'&&!await ctx.env.DB.prepare("SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1 AND NOT EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value='integration')").bind(ctx.principal.workspaceId,s.value).first())refuse('notification_person','Choose an active human workspace member');
    if(!result.some(r=>r.type===s.type&&r.value===s.value))result.push(s);
  }
  return result;
}
export async function saveNotificationRule(ctx:CoreContext,b:Record<string,unknown>) {
  await notificationOwner(ctx);
  const ruleId=b.id===undefined?id():requiredString(b.id,'id',200),revision=revisionValue(b.revision),reason=requiredString(b.reason,'reason',500),w=ctx.principal.workspaceId;
  const prior=await ctx.env.DB.prepare(latestRuleSql+' AND r.id=?').bind(w,ruleId).first<NotificationRule>();
  if((prior?.revision??0)!==revision)throw new ApiError(409,'notification_revision_conflict','Rule changed; reload before saving');
  const event=eventValue(b.event),channel=channelValue(b.channel),templateId=requiredString(b.templateId,'templateId',200);
  if(typeof b.enabled!=='boolean'||typeof b.mandatory!=='boolean')refuse('notification_flags','Choose enabled and mandatory explicitly');
  if(mandatoryEvents.includes(event)&&!b.mandatory)refuse('notification_mandatory','Approval, waiting-on-you, security and leaver notices must be mandatory');
  if(b.enabled&&b.consent!==true)refuse('notification_consent','Explicit owner consent is required to enable this notification');
  if(!await ctx.env.DB.prepare(latestTemplateSql+' AND t.id=?').bind(w,templateId).first())refuse('notification_template','Choose an existing workspace template');
  const connectionId=channel==='email'?requiredString(b.connectionId,'connectionId',200):null;
  const connection=connectionId?await ctx.env.DB.prepare("SELECT revision FROM connections WHERE workspace_id=? AND id=? AND provider='sendgrid' AND status='active' AND secret_ciphertext IS NOT NULL").bind(w,connectionId).first<{revision:number}>():null;
  if(connectionId&&!connection)refuse('notification_connection','Choose a current configured SendGrid connection');
  if(connectionId)await validatedNotificationSender(ctx,connectionId,connection!.revision);
  const after={id:ruleId,revision:revision+1,name:requiredString(b.name,'name',120),event,conditions:await conditions(ctx,b.conditions),recipients:await selectors(ctx,b.recipients),templateId,channel,connectionId,connectionRevision:connection?.revision??null,mandatory:b.mandatory,enabled:b.enabled,consentedBy:b.enabled?ctx.principal.userId:null};
  const [saved]=await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO notification_rules SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE COALESCE((SELECT MAX(revision) FROM notification_rules WHERE workspace_id=? AND id=?),0)=? AND ${ownerSql}`)
      .bind(w,after.id,after.revision,after.name,after.event,JSON.stringify(after.conditions),JSON.stringify(after.recipients),templateId,channel,connectionId,after.connectionRevision,Number(after.mandatory),Number(after.enabled),after.consentedBy,ctx.principal.userId,now(),w,ruleId,revision,w,ctx.principal.userId),
    audit(ctx,'notification.rule_changed',ruleId,prior?ruleDto(prior):null,after,reason),
  ]);
  if(!saved.meta.changes)throw new ApiError(409,'notification_revision_conflict','Rule or owner authority changed; reload before saving');
  return after;
}
export async function notificationPreferences(ctx:CoreContext) {
  await currentWorkPrincipal(ctx);
  const items=(await ctx.env.DB.prepare('SELECT event,channel,enabled,language FROM notification_preferences WHERE workspace_id=? AND user_id=? ORDER BY event,channel').bind(ctx.principal.workspaceId,ctx.principal.userId).all<{event:string;channel:string;enabled:number;language:string}>()).results;
  return {events:notificationEvents,channels:notificationChannels,mandatoryEvents,language:items[0]?.language??'en-US',items:items.map(p=>({...p,enabled:Boolean(p.enabled)}))};
}
export async function saveNotificationPreference(ctx:CoreContext,b:Record<string,unknown>) {
  await currentWorkPrincipal(ctx);
  const event=eventValue(b.event),channel=channelValue(b.channel),language=languageValue(b.language);
  if(typeof b.enabled!=='boolean')refuse('notification_preference','Choose whether this event is enabled');
  if(!b.enabled&&(mandatoryEvents.includes(event)||await ctx.env.DB.prepare(latestRuleSql+' AND r.event=? AND r.channel=? AND r.enabled=1 AND r.mandatory=1').bind(ctx.principal.workspaceId,event,channel).first()))refuse('notification_mandatory','Mandatory notifications cannot be turned off');
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO notification_preferences VALUES(?,?,?,?,?,?,?) ON CONFLICT(workspace_id,user_id,event,channel) DO UPDATE SET enabled=excluded.enabled,language=excluded.language,updated_at=excluded.updated_at').bind(ctx.principal.workspaceId,ctx.principal.userId,event,channel,Number(b.enabled),language,now()),
    audit(ctx,'notification.preference_changed',ctx.principal.userId,null,{event,channel,enabled:b.enabled,language},'Member changed their own notification preference'),
  ]);
  return notificationPreferences(ctx);
}
export { emitNotificationEvent, notificationInbox, notificationRuleMessage, testNotificationRule, previewNotificationTemplate } from './notification-dispatch';

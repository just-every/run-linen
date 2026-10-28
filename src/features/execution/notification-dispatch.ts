import { ApiError, id, now, requiredString } from '../../platform/http';
import { currentWorkPrincipal } from '../work/identity';
import { assertAdoptionEffectAllowed } from '../adoption/authority';
import { assert } from './authority';
import { eventValue, latestRuleSql, latestTemplateSql, notificationOwner, type NotificationDelivery, type NotificationEvent, type NotificationRule, type NotificationTemplate } from './notification-schema';
import { notificationReader, readableNotificationWork, recipientPreference, renderNotification, ruleMatches, ruleRecipients } from './notification-render';
import type { CoreContext } from './types';
import { brandedNotification, validatedNotificationSender } from './notification-branding';

async function consentOwner(ctx:CoreContext,rule:NotificationRule) {
  assert(rule.enabled&&rule.consented_by,'notification_consent_required',403);
  const owner=await notificationReader(ctx,rule.consented_by);
  await notificationOwner(owner);
  return owner;
}
async function deliveryAllowed(ctx:CoreContext,rule:NotificationRule,workId:string,recipientId:string,isTest=false) {
  const owner=await consentOwner(ctx,rule),work=await readableNotificationWork(owner,workId);
  assert(await ruleMatches(owner,rule,work),'notification_condition_changed',403);
  const reader=await notificationReader(ctx,recipientId);
  const readable=await readableNotificationWork(reader,workId,rule.event==='approval.requested');
  if(isTest)assert(recipientId===rule.consented_by,'notification_test_owner_changed',403);
  else assert((await ruleRecipients(owner,rule,work)).has(recipientId),'notification_recipient_changed',403);
  const preference=await recipientPreference(reader,rule);
  assert(isTest||preference.enabled,'notification_unsubscribed',403);
  const settings=await ctx.env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id=?').bind(ctx.principal.workspaceId).first<{settings_json:string}>();
  assert(!JSON.parse(settings?.settings_json??'{}').executionHeld,'execution_held',403);
  await assertAdoptionEffectAllowed(owner,{resource:workId,action:'notification.send'});
  if(rule.channel==='email')assert(await ctx.env.DB.prepare("SELECT 1 FROM connections WHERE workspace_id=? AND id=? AND revision=? AND status='active' AND provider='sendgrid' AND secret_ciphertext IS NOT NULL").bind(ctx.principal.workspaceId,rule.connection_id,rule.connection_revision).first(),'connection_changed',403);
  if(rule.channel==='email')await validatedNotificationSender(ctx,rule.connection_id!,rule.connection_revision??undefined);
  return {owner,reader,work:readable,language:preference.language};
}
async function enqueueRule(ctx:CoreContext,rule:NotificationRule,input:{workId:string;sourceId:string;isTest?:boolean;testRecipient?:string}) {
  const owner=await consentOwner(ctx,rule),work=await readableNotificationWork(owner,input.workId);
  if(!await ruleMatches(owner,rule,work))return [];
  const recipients=input.isTest?new Set([input.testRecipient!]):await ruleRecipients(owner,rule,work),results=[];
  for(const recipientId of recipients) {
    try {
      const permission=await deliveryAllowed(ctx,rule,input.workId,recipientId,input.isTest);
      const template=await ctx.env.DB.prepare(latestTemplateSql+' AND t.id=?').bind(ctx.principal.workspaceId,rule.template_id).first<NotificationTemplate>();
      assert(template,'notification_template_missing',409);
      assert(input.isTest||template.language===permission.language,'notification_language_unavailable',409);
      await renderNotification(permission.reader,template,permission.work);
      const deliveryId=id(),t=now(),w=ctx.principal.workspaceId;
      const insert=ctx.env.DB.prepare(`INSERT OR IGNORE INTO notification_deliveries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(deliveryId,w,input.workId,work.revision,rule.id,rule.revision,template.id,template.revision,recipientId,rule.event,rule.channel,input.sourceId,Number(Boolean(input.isTest)),rule.channel==='portal'?'available':'queued',t);
      const statements=[insert];
      if(rule.channel==='email')statements.push(ctx.env.DB.prepare("INSERT OR IGNORE INTO execution_outbox SELECT id,workspace_id,work_id,'',recipient_id,?,?,'queued',NULL,'notification-rule:'||id,?,? FROM notification_deliveries WHERE id=? AND workspace_id=?").bind(rule.connection_id,rule.consented_by,t,t,deliveryId,w));
      const [saved]=await ctx.env.DB.batch(statements);
      if(saved.meta.changes)results.push({id:deliveryId,recipientId,state:rule.channel==='portal'?'available':'queued'});
    } catch(error) {
      // A recipient without current rights receives nothing; operational failures must remain visible.
      if(!(error instanceof ApiError))throw error;
      results.push({recipientId,state:'blocked',reason:error.code});
    }
  }
  return results;
}
/** Internal event port: call only after a real public work or approval mutation has committed. No HTTP event fabrication door. */
export async function emitNotificationEvent(ctx:CoreContext,input:{workId:string;event:NotificationEvent;sourceId:string}) {
  await currentWorkPrincipal(ctx);
  await readableNotificationWork(ctx,input.workId);
  const event=eventValue(input.event),sourceId=requiredString(input.sourceId,'sourceId',200);
  const rules=(await ctx.env.DB.prepare(latestRuleSql+' AND r.enabled=1 AND r.event=? ORDER BY r.id').bind(ctx.principal.workspaceId,event).all<NotificationRule>()).results;
  const deliveries=[];
  for(const rule of rules) {
    try { deliveries.push(...await enqueueRule(ctx,rule,{workId:input.workId,sourceId})); }
    catch(error) { if(!(error instanceof ApiError))throw error; deliveries.push({ruleId:rule.id,state:'blocked',reason:error.code}); }
  }
  return {deliveries};
}
/** Re-evaluated immediately before each actual email effect and on every portal inbox read. */
export async function notificationRuleMessage(ctx:CoreContext,outboxId:string) {
  const delivery=await ctx.env.DB.prepare('SELECT * FROM notification_deliveries WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,outboxId).first<NotificationDelivery>();
  if(!delivery)return null;
  const rule=await ctx.env.DB.prepare(latestRuleSql+' AND r.id=?').bind(ctx.principal.workspaceId,delivery.rule_id).first<NotificationRule>();
  assert(rule&&rule.revision===delivery.rule_revision&&rule.channel===delivery.channel,'notification_rule_changed',403);
  const permission=await deliveryAllowed(ctx,rule,delivery.work_id,delivery.recipient_id,Boolean(delivery.is_test));
  assert(permission.work.revision===delivery.work_revision,'notification_record_changed',403);
  const template=await ctx.env.DB.prepare('SELECT * FROM notification_templates WHERE workspace_id=? AND id=? AND revision=?').bind(ctx.principal.workspaceId,delivery.template_id,delivery.template_revision).first<NotificationTemplate>();
  assert(template,'notification_template_missing',403);
  assert(delivery.is_test||template.language===permission.language,'notification_language_unavailable',403);
  return {...await brandedNotification(ctx,await renderNotification(permission.reader,template,permission.work),rule.connection_id),connectionRevision:rule.connection_revision};
}
export async function previewNotificationTemplate(ctx:CoreContext,templateId:string,b:Record<string,unknown>) {
  await notificationOwner(ctx);
  const work=await readableNotificationWork(ctx,requiredString(b.workId,'workId',200)),template=await ctx.env.DB.prepare(latestTemplateSql+' AND t.id=?').bind(ctx.principal.workspaceId,templateId).first<NotificationTemplate>();
  assert(template,'notification_template_missing',404);
  return brandedNotification(ctx,await renderNotification(ctx,template,work),null);
}
export async function testNotificationRule(ctx:CoreContext,ruleId:string,b:Record<string,unknown>) {
  await notificationOwner(ctx);
  assert(b.consent===true,'notification_test_consent',422);
  const reason=requiredString(b.reason,'reason',500),key=requiredString(b.idempotencyKey,'idempotencyKey',160),workId=requiredString(b.workId,'workId',200);
  const rule=await ctx.env.DB.prepare(latestRuleSql+' AND r.id=?').bind(ctx.principal.workspaceId,ruleId).first<NotificationRule>();
  assert(rule,'notification_rule_missing',404);
  assert(rule.consented_by===ctx.principal.userId,'notification_test_owner_changed',403);
  const sourceId='test:'+key;
  const prior=await ctx.env.DB.prepare('SELECT work_id FROM notification_deliveries WHERE workspace_id=? AND rule_id=? AND source_id=? AND is_test=1').bind(ctx.principal.workspaceId,ruleId,sourceId).first<{work_id:string}>();
  assert(!prior||prior.work_id===workId,'idempotency_conflict',409);
  const deliveries=await enqueueRule(ctx,rule,{workId,sourceId,isTest:true,testRecipient:ctx.principal.userId});
  await ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),ctx.principal.workspaceId,ctx.principal.userId,'notification.test_requested',ruleId,JSON.stringify({workId,revision:rule.revision,channel:rule.channel,reason}),now()).run();
  return {deliveries};
}
export async function notificationInbox(ctx:CoreContext) {
  await currentWorkPrincipal(ctx);
  const rows=(await ctx.env.DB.prepare("SELECT * FROM notification_deliveries WHERE workspace_id=? AND recipient_id=? AND channel='portal' AND state='available' ORDER BY created_at DESC LIMIT 100").bind(ctx.principal.workspaceId,ctx.principal.userId).all<NotificationDelivery>()).results,items=[];
  for(const row of rows) {
    try {
      const rendered=await notificationRuleMessage(ctx,row.id);
      if(rendered)items.push({id:row.id,workId:row.work_id,event:row.event,url:row.event==='approval.requested'?'/app#/decisions':`/app#/work/${encodeURIComponent(row.work_id)}`,subject:rendered.subject,body:rendered.body,state:row.state,createdAt:row.created_at});
    } catch(error) { if(!(error instanceof ApiError))throw error; }
  }
  return {items};
}

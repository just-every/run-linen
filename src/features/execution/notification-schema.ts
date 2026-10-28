import { ApiError, requiredString } from '../../platform/http';
import { currentWorkPrincipal } from '../work/identity';
import type { CoreContext } from './types';

export const notificationEvents = ['ticket.received','ticket.public_update','ticket.resolved','ticket.closed','ticket.waiting_on_you','ticket.assigned','ticket.requester_reply','ticket.sla_due','approval.requested','security.task','leaver.task'] as const;
export const notificationChannels = ['portal','email'] as const;
export const mandatoryEvents = ['ticket.waiting_on_you','approval.requested','security.task','leaver.task'];
export const notificationPlaceholders = ['ticket.number','ticket.title','ticket.state','ticket.url','requester.first_name','sla.due_at'] as const;
export type NotificationEvent = typeof notificationEvents[number];
export interface RecipientSelector { type:'role'|'group'|'group_lead'|'field'|'person'; value:string }
export interface NotificationRule {
  workspace_id:string; id:string; revision:number; name:string; event:NotificationEvent;
  conditions_json:string; recipients_json:string; template_id:string; channel:'portal'|'email';
  connection_id:string|null; connection_revision:number|null; mandatory:number; enabled:number;
  consented_by:string|null; actor_id:string; created_at:string;
}
export interface NotificationTemplate { workspace_id:string;id:string;revision:number;name:string;language:string;subject:string;body:string;actor_id:string;created_at:string }
export interface NotificationDelivery { id:string;workspace_id:string;work_id:string;work_revision:number;rule_id:string;rule_revision:number;template_id:string;template_revision:number;recipient_id:string;event:NotificationEvent;channel:string;source_id:string;is_test:number;state:string;created_at:string }
export function refuse(code:string, message:string):never { throw new ApiError(422,code,message); }
export async function notificationOwner(ctx:CoreContext) {
  await currentWorkPrincipal(ctx);
  if (!ctx.principal.roles.includes('owner')) throw new ApiError(403,'owner_required','Only the workspace owner configures notification delivery');
}
export function eventValue(value:unknown):NotificationEvent {
  if (!notificationEvents.includes(value as NotificationEvent)) refuse('notification_event','Choose a supported notification event');
  return value as NotificationEvent;
}
export function channelValue(value:unknown):'portal'|'email' {
  if (!notificationChannels.includes(value as any)) refuse('notification_channel','Only portal and configured email delivery are available');
  return value as 'portal'|'email';
}
export function languageValue(value:unknown) {
  // L10N-001 translations remain a separate obligation; never silently use another language.
  const language = value === undefined ? 'en-US' : requiredString(value,'language',40);
  try { if (Intl.getCanonicalLocales(language)[0] !== language) refuse('notification_language','Use a canonical language tag'); }
  catch { refuse('notification_language','Use a canonical language tag'); }
  return language;
}
export function validateTemplate(value:unknown, field:string, max:number) {
  const text=requiredString(value,field,max);
  if (field==='subject' && /[\r\n]/.test(text)) refuse('notification_subject','Subject must be one line');
  const unmatched=text.replace(/\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/g,(_all,key)=>{
    if (!notificationPlaceholders.includes(key)) refuse('notification_placeholder','Only listed core ticket placeholders are permitted');
    return '';
  });
  if (/[{}]/.test(unmatched)) refuse('notification_placeholder','Use a listed placeholder enclosed in double braces');
  return text;
}
export function revisionValue(value:unknown) {
  if (!Number.isInteger(value) || (value as number)<0) refuse('notification_revision','Send the revision you read, or zero for a new item');
  return value as number;
}
export const latestRuleSql = 'SELECT r.* FROM notification_rules r WHERE r.workspace_id=? AND r.revision=(SELECT MAX(n.revision) FROM notification_rules n WHERE n.workspace_id=r.workspace_id AND n.id=r.id)';
export const latestTemplateSql = 'SELECT t.* FROM notification_templates t WHERE t.workspace_id=? AND t.revision=(SELECT MAX(n.revision) FROM notification_templates n WHERE n.workspace_id=t.workspace_id AND n.id=t.id)';

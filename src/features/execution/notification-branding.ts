import { ApiError, id, now, requiredString } from '../../platform/http';
import { assert } from './authority';
import { notificationOwner, refuse, revisionValue } from './notification-schema';
import type { CoreContext } from './types';

interface Branding { workspace_id:string;revision:number;logo_url:string|null;primary_color:string;text_color:string;sender_connection_id:string|null;sender_connection_revision:number|null;sender_domain:string|null;actor_id:string;created_at:string }
export async function validatedNotificationSender(ctx:CoreContext,connectionId:string,expectedRevision?:number) {
  const row=await ctx.env.DB.prepare("SELECT c.revision,c.config_json,v.evidence_json FROM connections c JOIN connection_validations v ON v.workspace_id=c.workspace_id AND v.connection_id=c.id AND v.connection_revision=c.revision AND v.state='active' WHERE c.workspace_id=? AND c.id=? AND c.provider='sendgrid' AND c.status='active' AND c.secret_ciphertext IS NOT NULL").bind(ctx.principal.workspaceId,connectionId).first<{revision:number;config_json:string;evidence_json:string}>();
  assert(row&&(expectedRevision===undefined||row.revision===expectedRevision),'notification_verified_sender_required',403);
  const config=JSON.parse(row.config_json),evidence=JSON.parse(row.evidence_json),match=String(config.from??'').trim().match(/^(?:(.*?)\s*<([^<>]+)>|([^<>]+))$/),email=(match?.[2]??match?.[3]??'').trim();
  assert(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)&&evidence.protocol==='sendgrid-read-only-v1'&&evidence.configuredFrom===config.from&&evidence.verifiedSenderEmail===email&&evidence.mailSendScope===true,'notification_verified_sender_required',403);
  return {revision:row.revision,domain:email.split('@')[1].toLowerCase()};
}
export const brandingDto=(b:Branding)=>({revision:b.revision,logoUrl:b.logo_url,primaryColor:b.primary_color,textColor:b.text_color,senderConnectionId:b.sender_connection_id,senderConnectionRevision:b.sender_connection_revision,senderDomain:b.sender_domain,actorId:b.actor_id,createdAt:b.created_at});
export async function currentNotificationBranding(ctx:CoreContext) { return ctx.env.DB.prepare('SELECT * FROM notification_branding WHERE workspace_id=? ORDER BY revision DESC LIMIT 1').bind(ctx.principal.workspaceId).first<Branding>(); }
export async function notificationBranding(ctx:CoreContext) { await notificationOwner(ctx); const b=await currentNotificationBranding(ctx);return {branding:b?brandingDto(b):null}; }
export async function saveNotificationBranding(ctx:CoreContext,b:Record<string,unknown>) {
  await notificationOwner(ctx);
  assert(b.consent===true,'notification_branding_consent',422);
  const revision=revisionValue(b.revision),prior=await currentNotificationBranding(ctx),reason=requiredString(b.reason,'reason',500);
  if((prior?.revision??0)!==revision)throw new ApiError(409,'notification_revision_conflict','Branding changed; reload before saving');
  const color=(v:unknown)=>{if(typeof v!=='string'||!/^#[a-fA-F0-9]{6}$/.test(v))refuse('notification_color','Use a six-digit hex color');return v.toLowerCase();};
  const primaryColor=color(b.primaryColor),textColor=color(b.textColor),logoUrl=b.logoUrl===null||b.logoUrl===undefined?null:requiredString(b.logoUrl,'logoUrl',2000);
  if(logoUrl) {let url:URL;try{url=new URL(logoUrl);}catch{refuse('notification_logo','Use an HTTPS logo URL');}if(url.protocol!=='https:'||url.username||url.password)refuse('notification_logo','Use an HTTPS logo URL without credentials');}
  const senderConnectionId=b.senderConnectionId===null||b.senderConnectionId===undefined?null:requiredString(b.senderConnectionId,'senderConnectionId',200),sender=senderConnectionId?await validatedNotificationSender(ctx,senderConnectionId):null;
  const after={revision:revision+1,logoUrl,primaryColor,textColor,senderConnectionId,senderConnectionRevision:sender?.revision??null,senderDomain:sender?.domain??null},w=ctx.principal.workspaceId;
  const [saved]=await ctx.env.DB.batch([
    ctx.env.DB.prepare("INSERT INTO notification_branding SELECT ?,?,?,?,?,?,?,?,?,? WHERE COALESCE((SELECT MAX(revision) FROM notification_branding WHERE workspace_id=?),0)=? AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')").bind(w,after.revision,logoUrl,primaryColor,textColor,senderConnectionId,after.senderConnectionRevision,after.senderDomain,ctx.principal.userId,now(),w,revision,w,ctx.principal.userId),
    ctx.env.DB.prepare('INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()>0').bind(id(),w,ctx.principal.userId,'notification.branding_changed',w,JSON.stringify({before:prior?brandingDto(prior):null,after,reason}),now()),
  ]);
  if(!saved.meta.changes)throw new ApiError(409,'notification_revision_conflict','Branding or owner authority changed; reload before saving');
  return {branding:after};
}
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function brandedNotification(ctx:CoreContext,input:{subject:string;body:string},connectionId:string|null) {
  const b=await currentNotificationBranding(ctx);
  if(!b)return {...input,html:null,senderDomain:null};
  if(connectionId&&b.sender_connection_id) {
    assert(connectionId===b.sender_connection_id,'notification_branding_sender_changed',403);
    await validatedNotificationSender(ctx,connectionId,b.sender_connection_revision??undefined);
  }
  return {...input,senderDomain:b.sender_domain,html:`<!doctype html><html><body><main style="border-top:6px solid ${b.primary_color};color:${b.text_color};padding:24px;font-family:Arial,sans-serif">${b.logo_url?`<img src="${escape(b.logo_url)}" alt="" style="max-height:64px;max-width:240px">`:''}<h1>${escape(input.subject)}</h1><div style="white-space:pre-wrap">${escape(input.body)}</div></main></body></html>`};
}

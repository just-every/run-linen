import { ApiError, id, now, requiredString } from '../../platform/http';
import { hashToken } from '../../platform/crypto';
import { connection } from '../execution/connectors';
import { assertAdoptionEffectAllowed } from '../adoption/authority';
import { sendSendGrid, SendGridSendError } from '../execution/mail/sender';
import { currentWorkPrincipal } from './identity';
import { permit, type WorkContext } from './core';
import { collaborationOwner, collaborationAudit, collaborationBatch, consent } from './collaboration';

interface Side {id:string;workspace_id:string;work_id:string;connection_id:string;connection_revision:number;vendor_email:string;actor_id:string;closed_at:string|null}
function email(value: unknown) {
  const address=requiredString(value,'vendorEmail',254).trim().toLowerCase();
  if(!/^[^\s@<>\r\n\0]+@[^\s@<>\r\n\0]+\.[^\s@<>\r\n\0]+$/.test(address))throw new ApiError(422,'vendor_email','A single vendor email address is required');
  return address;
}
async function sideFor(ctx: WorkContext, workId: string, sideId: string) {
  const side=await ctx.env.DB.prepare('SELECT * FROM work_side_conversations WHERE workspace_id=? AND work_id=? AND id=?')
    .bind(ctx.principal.workspaceId,workId,sideId).first<Side>();
  if(!side)throw new ApiError(404,'not_found','Side conversation unavailable');
  return side;
}
/** The creator's continuing ownership, the exact connection version, holds and ticket scope gate each effect. */
async function mailGate(ctx: WorkContext, side: Side) {
  await collaborationOwner(ctx,side.work_id);
  if(side.closed_at)throw new ApiError(409,'side_closed','Side conversation is closed');
  const owner=await ctx.env.DB.prepare("SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner'")
    .bind(ctx.principal.workspaceId,side.actor_id).first();
  if(!owner)throw new ApiError(403,'consent_withdrawn','The consenting owner is no longer active');
  const settings=await ctx.env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id=?').bind(ctx.principal.workspaceId).first<{settings_json:string}>();
  if(JSON.parse(settings?.settings_json||'{}').executionHeld)throw new ApiError(409,'execution_held','Mail is held');
  await assertAdoptionEffectAllowed(ctx,{resource:side.work_id,action:'notification.send'});
  return connection(ctx,side.connection_id,'sendgrid',true,side.connection_revision);
}
export async function sendSideMail(ctx: WorkContext, workId: string, input: Record<string,unknown>, sideId?: string) {
  const work=await collaborationOwner(ctx,workId),reason=consent(input),body=requiredString(input.body,'body',50000),key=requiredString(input.sourceMessageId,'sourceMessageId',180);
  const w=ctx.principal.workspaceId,db=ctx.env.DB,at=now();
  // The caller provides a stable id on creation, so a lost response cannot open and send twice.
  const conversationId=sideId||requiredString(input.conversationId,'conversationId',180);
  let side=await db.prepare('SELECT * FROM work_side_conversations WHERE workspace_id=? AND id=?').bind(w,conversationId).first<Side>();
  if(side&&side.work_id!==workId)throw new ApiError(409,'idempotency_conflict','Conversation identity already used');
  const connectionId=sideId?side?.connection_id:requiredString(input.connectionId,'connectionId');
  const vendorEmail=sideId?side?.vendor_email:email(input.vendorEmail);
  if(side && (side.connection_id!==connectionId||side.vendor_email!==vendorEmail))throw new ApiError(409,'idempotency_conflict','Conversation recipient or connection changed');
  if(!side) {
    if(sideId)throw new ApiError(404,'not_found','Side conversation unavailable');
    const configured=await db.prepare("SELECT revision FROM connections WHERE workspace_id=? AND id=? AND provider='sendgrid' AND status='active'").bind(w,connectionId).first<{revision:number}>();
    if(!configured)throw new ApiError(503,'needs_configuration','An active SendGrid connection is required');
    side={id:conversationId,workspace_id:w,work_id:workId,connection_id:connectionId!,connection_revision:configured.revision,vendor_email:vendorEmail!,actor_id:ctx.principal.userId,closed_at:null};
    await mailGate(ctx,side);
    await collaborationBatch(ctx,work,[db.prepare('INSERT INTO work_side_conversations VALUES(?,?,?,?,?,?,?,?,NULL)').bind(side.id,w,workId,side.connection_id,side.connection_revision,side.vendor_email,side.actor_id,at),
      collaborationAudit(ctx,workId,'email_opened',{conversationId:side.id,reason})]);
  }
  const existing=await db.prepare('SELECT d.*,m.body FROM work_side_deliveries d JOIN work_messages m ON m.workspace_id=d.workspace_id AND m.id=d.message_id WHERE d.workspace_id=? AND d.conversation_id=? AND d.request_key=?')
    .bind(w,side.id,key).first<any>();
  if(existing) {
    if(existing.body!==`Email prepared for ${side.vendor_email}:\n${body}`)throw new ApiError(409,'idempotency_conflict','Mail identity already used for different content');
    // An interrupted send stays unknown/sending; it is never automatically resubmitted.
    return {id:existing.id,conversationId:side.id,state:existing.state,error:existing.error};
  }
  const config=await mailGate(ctx,side),deliveryId=id(),messageId=id();
  const sender=email(String(config.config.from||'').match(/<([^<>]+)>/)?.[1]||config.config.from);
  const mailMessageId=`<linen-${deliveryId}@${sender.split('@')[1]}>`;
  await collaborationBatch(ctx,work,[db.prepare("INSERT INTO work_messages VALUES(?,?,?,?,'private',?,?,?)").bind(messageId,w,workId,ctx.principal.userId,`Email prepared for ${side.vendor_email}:\n${body}`,`side-out:${deliveryId}`,at),
    db.prepare("INSERT INTO work_side_deliveries VALUES(?,?,?,?,?,?,?,'prepared',NULL,NULL,?)").bind(deliveryId,w,workId,side.id,messageId,key,mailMessageId,at),
    collaborationAudit(ctx,workId,'email_consented',{conversationId:side.id,deliveryId,reason})]);
  let claimed=false;
  try {
    const current=await sideFor(ctx,workId,side.id),c=await mailGate(ctx,current);
    // Claim durably before network IO; no provider idempotency is assumed.
    const claim=await db.prepare("UPDATE work_side_deliveries SET state='sending' WHERE workspace_id=? AND id=? AND state='prepared' AND EXISTS(SELECT 1 FROM work_side_conversations s WHERE s.workspace_id=? AND s.id=? AND s.closed_at IS NULL) AND EXISTS(SELECT 1 FROM connections c WHERE c.workspace_id=? AND c.id=? AND c.revision=? AND c.status='active') AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner') AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner') AND EXISTS(SELECT 1 FROM work_records r WHERE r.workspace_id=? AND r.id=? AND r.revision=? AND r.sensitivity='normal' AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=r.workspace_id AND e.person_id IN(r.requester_id,r.beneficiary_id)))")
      .bind(w,deliveryId,w,side.id,w,side.connection_id,side.connection_revision,w,ctx.principal.userId,w,side.actor_id,w,workId,work.revision).run();
    if(!claim.meta.changes)throw new ApiError(409,'collaboration_changed','Mail authority changed');
    claimed=true;
    const sent=await sendSendGrid({apiKey:c.secret.apiKey,message:{from:c.config.from,to:[side.vendor_email],replyTo:sender,
      subject:'Linen private side conversation',text:body,headers:{'Message-ID':mailMessageId},deliveryId}});
    await db.prepare("UPDATE work_side_deliveries SET state='accepted',provider_ref=? WHERE workspace_id=? AND id=? AND state='sending'").bind(sent.providerMessageId,w,deliveryId).run();
    return {id:deliveryId,conversationId:side.id,state:'accepted',mailMessageId};
  } catch(error) {
    const state=error instanceof SendGridSendError?(error.outcome==='ambiguous'?'unknown':'failed'):claimed?'unknown':'failed';
    const code=error instanceof ApiError?error.code:error instanceof SendGridSendError?`mail_${error.outcome}`:'mail_unavailable';
    await db.prepare('UPDATE work_side_deliveries SET state=?,error=? WHERE workspace_id=? AND id=?').bind(state,code,w,deliveryId).run();
    return {id:deliveryId,conversationId:side.id,state,error:code};
  }
}
export async function closeSideMail(ctx: WorkContext,workId:string,sideId:string,input:Record<string,unknown>) {
  const work=await collaborationOwner(ctx,workId),reason=consent(input); await sideFor(ctx,workId,sideId);
  await collaborationBatch(ctx,work,[ctx.env.DB.prepare('UPDATE work_side_conversations SET closed_at=? WHERE workspace_id=? AND work_id=? AND id=? AND closed_at IS NULL').bind(now(),ctx.principal.workspaceId,workId,sideId),
    collaborationAudit(ctx,workId,'email_closed',{conversationId:sideId,reason})]);
  return {state:'closed'};
}
/** Authenticated receiving adapters supply the envelope. Vendor addresses never become Linen principals. */
export async function receiveSideMail(ctx:WorkContext,input:Record<string,unknown>) {
  await currentWorkPrincipal(ctx);permit(ctx,['owner','integration']);
  const w=ctx.principal.workspaceId,db=ctx.env.DB,connectionId=requiredString(input.connectionId,'connectionId'),sourceId=requiredString(input.sourceMessageId,'sourceMessageId'),
    sender=email(input.sender),body=requiredString(input.text,'text',50000),inReplyTo=requiredString(input.inReplyTo,'inReplyTo');
  const matched=await db.prepare('SELECT conversation_id FROM work_side_deliveries WHERE workspace_id=? AND mail_message_id=?').bind(w,inReplyTo).first<{conversation_id:string}>();
  const conversationId=typeof input.sideConversationId==='string'?input.sideConversationId:matched?.conversation_id||'';
  const fingerprint=await hashToken(JSON.stringify({conversationId,sender,body,inReplyTo}));
  const prior=await db.prepare('SELECT fingerprint,message_id FROM work_side_receipts WHERE workspace_id=? AND connection_id=? AND source_id=?').bind(w,connectionId,sourceId).first<{fingerprint:string;message_id:string}>();
  if(prior) {
    if(prior.fingerprint!==fingerprint)throw new ApiError(409,'idempotency_conflict','Provider message identity already used');
    return {state:'accepted',messageId:prior.message_id};
  }
  const side=await db.prepare('SELECT * FROM work_side_conversations WHERE workspace_id=? AND id=? AND connection_id=? AND closed_at IS NULL').bind(w,conversationId,connectionId).first<Side>();
  const reject=()=>({state:'quarantined',error:'No current consenting conversation matches the authenticated envelope'});
  if(!side||side.vendor_email!==sender)return reject();
  const member=await db.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(w,side.actor_id).first<{roles_json:string}>();
  if(!member)return reject();
  const actor:WorkContext={...ctx,principal:{workspaceId:w,userId:side.actor_id,roles:JSON.parse(member.roles_json)}};
  try { await mailGate(actor,side); } catch(error) { if(error instanceof ApiError)return reject();throw error; }
  const delivery=await db.prepare("SELECT 1 FROM work_side_deliveries WHERE workspace_id=? AND conversation_id=? AND mail_message_id=? AND state='accepted'").bind(w,side.id,inReplyTo).first();
  if(!delivery)return reject();
  const work=await collaborationOwner(actor,side.work_id),messageId=id(),at=now(),guard=id();
  await collaborationBatch(actor,work,[db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM work_side_conversations s JOIN connections c ON c.workspace_id=s.workspace_id AND c.id=s.connection_id AND c.revision=s.connection_revision AND c.status='active' WHERE s.workspace_id=? AND s.id=? AND s.closed_at IS NULL) AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value IN ('owner','integration')) THEN 1 ELSE 0 END)`).bind(guard,w,side.id,w,ctx.principal.userId),
    db.prepare("INSERT INTO work_messages VALUES(?,?,?,?,'private',?,?,?)").bind(messageId,w,side.work_id,side.actor_id,`Email from ${sender}:\n${body}`,`side-in:${connectionId}:${sourceId}`,at),
    db.prepare('INSERT INTO work_side_receipts VALUES(?,?,?,?,?,?,?,?)').bind(w,side.work_id,side.id,connectionId,sourceId,messageId,fingerprint,at),
    collaborationAudit(ctx,side.work_id,'email_received',{conversationId:side.id,messageId}),db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard)]);
  return {state:'accepted',messageId};
}

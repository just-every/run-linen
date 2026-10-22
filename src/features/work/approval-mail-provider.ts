import { ApiError, id, now } from '../../platform/http';
import type { Env } from '../../platform/types';
import { currentWorkPrincipal } from './identity';
import { permit, type WorkContext } from './core';
import { parseMime } from '../../modules/mail/src/inbound/mime.mjs';
import { receiveApprovalReply } from './approval-mail';

export interface ApprovalMailConfig {
  workspace_id: string; revision: number; actor_id: string; enabled: number; sending_connection_id: string;
  recipient: string; topic_arn: string; signing_cert_url: string; public_key: string; consent_at: string;
}
export const approvalMailConfig = (ctx: WorkContext) => ctx.env.DB.prepare('SELECT * FROM work_approval_mail_config WHERE workspace_id=?')
  .bind(ctx.principal.workspaceId).first<ApprovalMailConfig>();

/** No inherited mail default authorizes sending actionable approval packets or entrusting an inbound source. */
export async function configureApprovalMail(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx); permit(ctx, ['owner']);
  const prior = await approvalMailConfig(ctx), revision = Number(input.revision);
  if (!Number.isInteger(revision) || revision !== (prior?.revision ?? 0)) throw new ApiError(409, 'revision_conflict', 'Review the current approval mail configuration');
  if (input.enabled !== true) {
    if (prior) await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE work_approval_mail_config SET enabled=0,revision=revision+1 WHERE workspace_id=? AND revision=?').bind(ctx.principal.workspaceId, revision),
      ctx.env.DB.prepare("UPDATE work_approval_tokens SET state='expired' WHERE workspace_id=? AND state='issued'").bind(ctx.principal.workspaceId),
      ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),ctx.principal.workspaceId,ctx.principal.userId,'work.approval_mail_disabled',ctx.principal.workspaceId,'{}',now()),
    ]);
    return { enabled: false, revision: prior ? revision + 1 : 0 };
  }
  if (input.consent !== true) throw new ApiError(422, 'approval_mail_consent', 'Explicit consent to send approval packets and trust the selected SES SNS topic is required');
  const topic = typeof input.topicArn === 'string' ? /^arn:aws:sns:([a-z]{2}-[a-z]+-\d):\d{12}:[A-Za-z0-9_-]{1,256}$/.exec(input.topicArn) : null;
  const cert = typeof input.signingCertUrl === 'string' ? input.signingCertUrl : '';
  const key = typeof input.publicKey === 'string' ? input.publicKey.trim() : '';
  const recipient = typeof input.recipient === 'string' ? input.recipient.trim().toLowerCase() : '';
  if (!topic || !new RegExp(`^https://sns\\.${topic[1]}\\.amazonaws\\.com/SimpleNotificationService-[a-f0-9]{32}\\.pem$`).test(cert) || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient))
    throw new ApiError(422,'approval_mail_configuration','An exact SES SNS topic, its signing certificate URL and receiving mailbox are required');
  try { await crypto.subtle.importKey('spki', Uint8Array.from(atob(key),c=>c.charCodeAt(0)), {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['verify']); }
  catch { throw new ApiError(422,'approval_mail_configuration','Pin the SNS signing certificate public key as base64 RSA SPKI'); }
  if (!await ctx.env.DB.prepare("SELECT 1 FROM connections WHERE workspace_id=? AND id=? AND provider='sendgrid' AND status='active'").bind(ctx.principal.workspaceId,input.sendingConnectionId).first())
    throw new ApiError(422,'approval_mail_configuration','Select an active SendGrid sending connection');
  const t=now(),w=ctx.principal.workspaceId;
  const result=await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO work_approval_mail_config VALUES(?,?,?,1,?,?,?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET revision=excluded.revision,actor_id=excluded.actor_id,enabled=1,sending_connection_id=excluded.sending_connection_id,recipient=excluded.recipient,topic_arn=excluded.topic_arn,signing_cert_url=excluded.signing_cert_url,public_key=excluded.public_key,consent_at=excluded.consent_at WHERE work_approval_mail_config.revision=?`)
      .bind(w,revision+1,ctx.principal.userId,input.sendingConnectionId,recipient,input.topicArn,cert,key,t,revision),
    ctx.env.DB.prepare("UPDATE work_approval_tokens SET state='expired' WHERE workspace_id=? AND state='issued'").bind(w),
    ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),w,ctx.principal.userId,'work.approval_mail_consented',w,JSON.stringify({revision:revision+1,provider:'ses-sns',sendingConnectionId:input.sendingConnectionId}),t),
  ]);
  if (!result[0].meta.changes) throw new ApiError(409,'revision_conflict','Approval mail configuration changed');
  return {enabled:true,revision:revision+1};
}

async function boundedBody(request: Request) {
  if (Number(request.headers.get('content-length')??0)>512*1024 || !request.body) throw new ApiError(413,'approval_mail_size','Approval message exceeds the supported size');
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  for (;;) { const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>512*1024){await reader.cancel();throw new ApiError(413,'approval_mail_size','Approval message exceeds the supported size');}chunks.push(r.value); }
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}

/** SNS v2 canonical signature, exact topic and manually pinned certificate key. No user-supplied fetch URL is followed.
 * AWS sources: sns/latest/dg/http-notification-json.html; ses/latest/dg/receiving-email-notifications-contents.html.
 * SES SNS action must include original MIME plus authoritative SPF/DKIM/DMARC receipt verdicts; no JSON-claim API. */
export async function handleApprovalMail(env: Env, workspaceId: string, request: Request) {
  const config=await env.DB.prepare('SELECT * FROM work_approval_mail_config WHERE workspace_id=? AND enabled=1').bind(workspaceId).first<ApprovalMailConfig>();
  if (!config) throw new ApiError(503,'approval_mail_disabled','Approval email is not enabled');
  let envelope:any;
  try { envelope=JSON.parse(await boundedBody(request)); } catch(error) { if(error instanceof ApiError)throw error;throw new ApiError(422,'approval_mail_envelope','A signed SES SNS notification is required'); }
  const confirmation=envelope.Type==='SubscriptionConfirmation';
  const fields=confirmation?['Message','MessageId','SubscribeURL','Timestamp','Token','TopicArn','Type']:['Message','MessageId',...(envelope.Subject===undefined?[]:['Subject']),'Timestamp','TopicArn','Type'];
  if ((!confirmation && envelope.Type!=='Notification') || envelope.SignatureVersion!=='2' || envelope.TopicArn!==config.topic_arn || envelope.SigningCertURL!==config.signing_cert_url || fields.some(k=>typeof envelope[k]!=='string') || !/^[\w-]{1,200}$/.test(envelope.MessageId) || !Number.isFinite(Date.parse(envelope.Timestamp)) || Math.abs(Date.now()-Date.parse(envelope.Timestamp))>300000)
    throw new ApiError(403,'approval_mail_envelope','The configured fresh SES SNS notification is required');
  let verified=false;
  try {
    const key=await crypto.subtle.importKey('spki',Uint8Array.from(atob(config.public_key),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,Uint8Array.from(atob(envelope.Signature),c=>c.charCodeAt(0)),new TextEncoder().encode(fields.map(k=>`${k}\n${envelope[k]}\n`).join('')));
  }catch{}
  if(!verified)throw new ApiError(403,'approval_mail_signature','The SES SNS signature could not be verified');
  if(confirmation){
    let url:URL;try{url=new URL(envelope.SubscribeURL);}catch{throw new ApiError(422,'approval_mail_subscription','Invalid subscription confirmation');}
    const region=config.topic_arn.split(':')[3];
    if(url.origin!==`https://sns.${region}.amazonaws.com` || url.pathname!=='/' || url.username || url.password || url.hash || url.searchParams.get('Action')!=='ConfirmSubscription' || url.searchParams.get('TopicArn')!==config.topic_arn || url.searchParams.get('Token')!==envelope.Token || [...url.searchParams.keys()].some(k=>!['Action','TopicArn','Token'].includes(k)) || [...url.searchParams.keys()].length!==3)
      throw new ApiError(422,'approval_mail_subscription','Confirmation must be for the configured SNS topic');
    await env.DB.prepare('INSERT INTO work_approval_mail_subscriptions VALUES(?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET config_revision=excluded.config_revision,confirmation_url=excluded.confirmation_url,expires_at=excluded.expires_at')
      .bind(workspaceId,config.revision,url.href,new Date(Date.now()+300000).toISOString()).run();
    return {state:'owner_subscription_confirmation_required'};
  }
  let mail:any;try{mail=JSON.parse(envelope.Message);}catch{throw new ApiError(422,'approval_mail_envelope','Invalid SES receipt');}
  if(mail.mail?.headersTruncated || mail.notificationType!=='Received' || mail.receipt?.action?.type!=='SNS' || mail.receipt.action.topicArn!==config.topic_arn || typeof mail.content!=='string' || !mail.mail?.messageId || !mail.receipt?.recipients?.includes(config.recipient))
    throw new ApiError(422,'approval_mail_envelope','The signed SES receipt must include the original message and configured recipient');
  const member=await env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(workspaceId,config.actor_id).first<{roles_json:string}>();
  if(!member || !JSON.parse(member.roles_json).includes('owner'))throw new ApiError(403,'approval_mail_consent_lost','The consenting owner is no longer active');
  const ctx:WorkContext={env,principal:{workspaceId,userId:config.actor_id,roles:JSON.parse(member.roles_json)}};
  const message=await parseMime(new TextEncoder().encode(mail.content),{maxRawBytes:256*1024,maxBodyBytes:64*1024,maxAttachments:1,maxAttachmentBytes:1,maxTotalAttachmentBytes:1});
  const from=message.from;
  if(typeof from!=='string' || message.attachments.length)throw new ApiError(422,'approval_mail_envelope','A single sender and plain reply without attachments are required');
  const domain=from.split('@')[1]?.toLowerCase(),source=typeof mail.mail.source==='string'?mail.mail.source.split('@')[1]?.toLowerCase():null;
  // SES's dkimVerdict is aggregate. Ambiguous mixed signing domains cannot establish aligned DKIM for this sender.
  const signingDomains=(mail.mail.headers??[]).filter((h:any)=>h.name?.toLowerCase()==='dkim-signature').map((h:any)=>/(?:^|;)\s*d=([^;\s]+)/i.exec(h.value)?.[1]?.toLowerCase());
  const aligned=Boolean(domain && source===domain && signingDomains.length && signingDomains.every((d:string)=>d===domain));
  return receiveApprovalReply(ctx,{connectionId:config.sending_connection_id,sourceMessageId:mail.mail.messageId,from,subject:message.subject??'',text:message.text??'',
    authentication:{spf:mail.receipt.spfVerdict?.status==='PASS'?'pass':'fail',dkim:mail.receipt.dkimVerdict?.status==='PASS'?'pass':'fail',dmarc:mail.receipt.dmarcVerdict?.status==='PASS'?'pass':'fail',aligned},configRevision:config.revision});
}

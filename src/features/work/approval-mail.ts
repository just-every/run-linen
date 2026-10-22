import { ApiError, id, now } from '../../platform/http';
import { hashToken } from '../../platform/crypto';
import { approvalMailConfig } from './approval-mail-provider';
import { providerFetch } from '../execution/transport';
import { assertAdoptionEffectAllowed } from '../adoption/authority';
import { connection } from '../execution/connectors';
import { sendSendGrid, SendGridSendError } from '../execution/mail/sender';
import { permit, type WorkContext, type WorkRecord } from './core';
import { currentWorkPrincipal } from './identity';
import { chainStatus, prepareStageDecision, managerRejected } from './approval-chain';
import { managerHolder, managerStageAuthority, prepareFulfilmentApproval } from './fulfilment-authority';
import { personForMember } from './person-binding';

/**
 * CATALOG-002: an approver may decide by replying "approve" or "reject" to the approval email. A reply counts only from
 * the approver's own address, authenticated (SPF, DKIM and DMARC pass and aligned with that address), carrying the
 * approval's single-use token, and only for the request revision the email was sent for. The receiving adapter supplies
 * the authentication verdicts; Linen refuses anything it cannot attribute. The email names the item and the people, never
 * a quote, purpose or conversation, and carries no link that decides.
 */
const TOKEN_LIFETIME_MS = 14 * 86_400_000;
const randomToken = () => { const b = crypto.getRandomValues(new Uint8Array(24)); return btoa(String.fromCharCode(...b)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); };
const mailAddress = (value: string) => (/<([^<>]+)>/.exec(value)?.[1] ?? value).trim().toLowerCase();

interface Pending { work: WorkRecord; catalog: any; f: any; approverId: string; stageKey: string; stageName: string }
/** Every approver who may decide something now: the manager while undecided, then the open stage's undecided approvers. */
async function pendingDecisions(ctx: WorkContext) {
  const db = ctx.env.DB, w = ctx.principal.workspaceId, out: Pending[] = [];
  const rows = (await db.prepare(`SELECT f.*,c.id c_id FROM work_fulfilments f JOIN work_catalog c ON c.workspace_id=f.workspace_id AND c.id=f.catalog_id JOIN work_records r ON r.workspace_id=f.workspace_id AND r.id=f.work_id
    WHERE f.workspace_id=? AND (c.requires_manager=1 OR EXISTS(SELECT 1 FROM work_approval_stages s WHERE s.workspace_id=f.workspace_id AND s.fulfilment_id=f.id)) AND r.state NOT IN ('closed','cancelled') AND (f.expires_at IS NULL OR f.expires_at>?) ORDER BY f.work_id LIMIT 200`).bind(w, now()).all<any>()).results;
  for (const f of rows) {
    const work = await db.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=?').bind(w, f.work_id).first<WorkRecord>();
    const catalog = await db.prepare('SELECT * FROM work_catalog WHERE workspace_id=? AND id=?').bind(w, f.catalog_id).first<any>();
    if (!work || !catalog) continue;
    if(await managerRejected(ctx,work,catalog,f))continue;
    const manager = await managerStageAuthority(ctx, work, catalog, f);
    if (catalog.requires_manager && !manager.allowed) { if (manager.holderId && manager.holderId !== f.beneficiary_id) out.push({ work, catalog, f, approverId: manager.holderId, stageKey: 'manager', stageName: 'Manager approval' }); continue; }

    const chain = await chainStatus(ctx, work, catalog, f, true);
    if (chain.pending) for (const a of chain.pending.approvers) if (!chain.pending.decisions.some(d => d.approverId === a)) out.push({ work, catalog, f, approverId: a, stageKey: chain.pending.key, stageName: chain.pending.name });
  }
  return out;
}

/** Scheduler tick: send each pending approver one approval email for the current revision, once. */
export async function sendApprovalMail(ctx: WorkContext, at: string) {
  const db = ctx.env.DB, w = ctx.principal.workspaceId, results: Record<string, unknown>[] = [];
  const settings = JSON.parse((await db.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id=?').bind(w).first<{ settings_json: string }>())?.settings_json || '{}');
  const config = await approvalMailConfig(ctx);
  if (!config?.enabled || settings.executionHeld) return results;
  const consent = await db.prepare("SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner'").bind(w,config.actor_id).first();
  if (!consent) return results;
  const mail = await db.prepare("SELECT 1 FROM connections WHERE workspace_id=? AND id=? AND provider='sendgrid' AND status='active'").bind(w, config.sending_connection_id).first();
  if (!mail) return results;
  for (const p of await pendingDecisions(ctx)) {
    const user = await db.prepare('SELECT email,name FROM users WHERE id=?').bind(p.approverId).first<{ email: string; name: string }>();
    if (!user?.email) continue;
    if (await db.prepare("SELECT 1 FROM work_approval_tokens WHERE workspace_id=? AND fulfilment_id=? AND stage_key=? AND approver_id=? AND work_revision=? AND fulfilment_revision=? AND catalog_revision=? AND state='issued'")
      .bind(w, p.f.id, p.stageKey, p.approverId, p.work.revision, p.f.revision, p.catalog.revision).first()) continue;
    const token = randomToken(), tokenId = id();
    const issued=await db.prepare('INSERT OR IGNORE INTO work_approval_tokens(id,workspace_id,work_id,fulfilment_id,stage_key,approver_id,token_hash,work_revision,fulfilment_revision,catalog_revision,sent_to,expires_at,created_at,config_revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(tokenId, w, p.work.id, p.f.id, p.stageKey, p.approverId, await hashToken(token), p.work.revision, p.f.revision, p.catalog.revision, user.email.trim().toLowerCase(), new Date(Date.parse(at) + TOKEN_LIFETIME_MS).toISOString(), at, config.revision).run();
    if(!issued.meta.changes)continue;
    try {
      const c = await connection(ctx, config.sending_connection_id, 'sendgrid');
      if (!c.config.from || !c.secret.apiKey) throw new ApiError(503, 'needs_configuration', 'Mail connection required');
      const names = new Map((await db.prepare('SELECT id,name FROM users WHERE id IN (?,?)').bind(p.work.requester_id, p.f.beneficiary_id).all<{ id: string; name: string }>()).results.map(u => [u.id, u.name]));
      await assertAdoptionEffectAllowed(ctx,{resource:p.work.id,action:'notification.send'});
      const current=await approvalMailConfig(ctx);
      if (!current?.enabled || current.revision!==config.revision) throw new ApiError(409,'approval_mail_changed','Approval mail consent changed');
      if(!await pendingStillCurrent(ctx,p))throw new ApiError(409,'approval_changed','The current approval holder or request changed');
      const sent = await sendSendGrid({ apiKey: c.secret.apiKey, fetch: ((input,init)=>providerFetch(ctx,config.sending_connection_id,'notification',input,init)) as typeof fetch, message: { from: c.config.from, to: [user.email], replyTo: config.recipient,
        subject: `Approval needed: ${p.catalog.name} for ${names.get(p.f.beneficiary_id) ?? 'a colleague'} [approval:${token}]`,
        text: `${names.get(p.work.requester_id) ?? 'A colleague'} asked for ${p.catalog.name} for ${names.get(p.f.beneficiary_id) ?? 'a colleague'}. This is the ${p.stageName} decision.\n\nReply with "approve" or "reject" on the first line; anything after it is recorded as your comment. Only a reply from this address counts, and only while the request is unchanged. You can also decide in Linen.`,
        deliveryId: tokenId } });
      await db.prepare('UPDATE work_approval_tokens SET provider_ref=? WHERE id=?').bind(sent.providerMessageId, tokenId).run();
      results.push({ id: p.f.id, stage: p.stageKey, state: 'approval_mail_sent', approver: p.approverId });
    } catch (error) {
      // A refused send leaves no usable token; an ambiguous one keeps it, since the mail may have been delivered.
      if (!(error instanceof SendGridSendError) || error.outcome !== 'ambiguous') await db.prepare('DELETE FROM work_approval_tokens WHERE id=?').bind(tokenId).run();
      results.push({ id: p.f.id, stage: p.stageKey, state: 'approval_mail_failed', error: error instanceof ApiError ? error.code : 'mail_unavailable' });
    }
  }
  return results;
}

export interface ApprovalReply { connectionId: string; sourceMessageId: string; from: string; subject: string; text: string; authentication: { spf?: string; dkim?: string; dmarc?: string; aligned?: boolean }; configRevision: number }
/** What the reply says: the first word of its first unquoted line, and everything above the quoted history as the comment. */
export function parseReply(text: string) {
  const lines: string[] = [];
  for (const line of text.replace(/\r/g, '').split('\n')) { if (/^\s*>/.test(line) || /^On .+ wrote:\s*$/i.test(line) || /^-{2,}\s*(Original Message|Forwarded)/i.test(line) || /^From:\s/i.test(line)) break; lines.push(line); }
  const comment = lines.join('\n').trim(), first = /^\s*(approve|reject)(?:\s|[.!,:;]|$)/i.exec(comment)?.[1]?.toLowerCase();
  const decision = first === 'approve' || first === 'approved' ? 'approved' : first === 'reject' || first === 'rejected' ? 'rejected' : null;
  return { decision, comment: comment.slice(0, 2000) };
}

export async function receiveApprovalReply(ctx: WorkContext, input: ApprovalReply) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'integration']);
  const db = ctx.env.DB, w = ctx.principal.workspaceId;
  if (!input.sourceMessageId || !input.from || typeof input.subject !== 'string' || typeof input.text !== 'string') throw new ApiError(422, 'mail_invalid', 'Sender, provider message identity, subject and text required');
  if (!await db.prepare('SELECT 1 FROM connections WHERE workspace_id=? AND id=?').bind(w, input.connectionId).first()) throw new ApiError(503, 'mail_configuration', 'Configured authenticated receiving adapter required');
  const seen = await db.prepare('SELECT outcome FROM work_approval_mail WHERE workspace_id=? AND connection_id=? AND source_message_id=?').bind(w, input.connectionId, input.sourceMessageId).first<{ outcome: string }>();
  if (seen) return { state: 'replayed', outcome: seen.outcome };
  const refuse = async (status: number, code: string, message: string, burn?: string): Promise<never> => {
    await db.batch([db.prepare('INSERT OR IGNORE INTO work_approval_mail VALUES(?,?,?,?,?)').bind(w, input.connectionId, input.sourceMessageId, code, now()),
      ...(burn ? [db.prepare("UPDATE work_approval_tokens SET state='expired' WHERE workspace_id=? AND id=? AND state='issued'").bind(w, burn)] : []),
      db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(), w, ctx.principal.userId, 'work.approval_mail_refused', input.sourceMessageId, JSON.stringify({ code }), now())]);
    throw new ApiError(status, code, message);
  };
  const raw = /\[approval:([A-Za-z0-9_-]{20,})\]/.exec(input.subject)?.[1];
  if (!raw) return refuse(422, 'approval_token_missing', 'The reply carries no approval token');
  const token = await db.prepare('SELECT * FROM work_approval_tokens WHERE workspace_id=? AND token_hash=?').bind(w, await hashToken(raw)).first<any>();
  if (!token) return refuse(404, 'approval_token_unknown', 'Unknown approval token');
  if (token.config_revision!==input.configRevision) return refuse(409,'approval_mail_changed','Approval mail consent changed; use the current approval email');
  if (token.state !== 'issued') return refuse(409, 'approval_token_used', 'This approval token was already used or has expired');
  if (token.expires_at <= now()) return refuse(409, 'approval_token_expired', 'This approval token has expired', token.id);
  const approver = await db.prepare('SELECT u.email,m.roles_json FROM users u JOIN memberships m ON m.user_id=u.id AND m.workspace_id=? AND m.active=1 WHERE u.id=?').bind(w, token.approver_id).first<{ email: string; roles_json: string }>();
  // A forwarded reply keeps its token valid for the real approver: it is refused, not consumed.
  if (!approver || mailAddress(input.from) !== approver.email.trim().toLowerCase() || mailAddress(input.from) !== token.sent_to) return refuse(403, 'approval_sender_mismatch', 'Only the approver\'s own address can decide by email');
  const a = input.authentication ?? {};
  if (a.spf !== 'pass' || a.dkim !== 'pass' || a.dmarc !== 'pass' || a.aligned !== true) return refuse(403, 'approval_mail_unauthenticated', 'The reply is not authenticated and aligned with the approver\'s address');
  const work = await db.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=?').bind(w, token.work_id).first<WorkRecord>();
  const f = await db.prepare('SELECT * FROM work_fulfilments WHERE workspace_id=? AND id=?').bind(w, token.fulfilment_id).first<any>();
  const catalog = f && await db.prepare('SELECT * FROM work_catalog WHERE workspace_id=? AND id=?').bind(w, f.catalog_id).first<any>();
  if (!work || !f || !catalog || work.revision !== token.work_revision || f.revision !== token.fulfilment_revision || catalog.revision !== token.catalog_revision)
    return refuse(409, 'approval_revision_changed', 'The request changed after this email was sent; decide on the current request', token.id);
  if (/^(?:(?:re|aw):\s*)*(?:fw|fwd):/i.test(input.subject) || /(?:begin forwarded message|[-]{2,}\s*forwarded message)/i.test(input.text)) return refuse(403,'approval_forwarded','Forwarded approvals are refused; reply directly to the current approval email');
  const reply = parseReply(input.text);
  if (!reply.decision) return refuse(422, 'approval_reply_unclear', 'Start the reply with "approve" or "reject"');
  const actor: WorkContext = { env: ctx.env, principal: { workspaceId: w, userId: token.approver_id, roles: JSON.parse(approver.roles_json) } };
  const key = `mail:${input.connectionId}:${input.sourceMessageId}`;
  let statements: D1PreparedStatement[], decisionId: string;
  if (token.stage_key === 'manager' && reply.decision === 'approved') {
    const person = await personForMember(actor, f.beneficiary_id), holder = await managerHolder(actor, f);
    if (!person) return refuse(409, 'approval_revision_changed', 'The person\'s reviewed record is unavailable', token.id);
    const prepared = await prepareFulfilmentApproval(actor, work.id, { catalogId: catalog.id, expectedWorkRevision: work.revision, expectedFulfilmentRevision: f.revision, expectedCatalogRevision: catalog.revision,
      expectedPersonId: person.id, expectedPersonRevision: person.revision, expectedBindingId: person.binding_id, expectedHolderId: holder as string, idempotencyKey: key, comment: reply.comment }, 'email');
    statements = prepared.statements; decisionId = prepared.approvalId;
  } else {
    const prepared = await prepareStageDecision(actor, work.id, { catalogId: catalog.id, stageKey: token.stage_key, decision: reply.decision, comment: reply.comment, expectedWorkRevision: work.revision, expectedFulfilmentRevision: f.revision, expectedCatalogRevision: catalog.revision, idempotencyKey: key }, 'email');
    statements = prepared.statements; decisionId = prepared.decisionId;
  }
  const guard = id();
  try {
    await db.batch([db.prepare("INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM work_approval_tokens WHERE workspace_id=? AND id=? AND state='issued' AND config_revision=?) AND EXISTS(SELECT 1 FROM work_approval_mail_config WHERE workspace_id=? AND revision=? AND enabled=1) AND EXISTS(SELECT 1 FROM users u JOIN memberships m ON m.user_id=u.id AND m.workspace_id=? AND m.active=1 WHERE u.id=? AND lower(trim(u.email))=?) THEN 1 ELSE 0 END)").bind(guard, w, token.id, input.configRevision, w, input.configRevision,w,token.approver_id,token.sent_to),
      ...statements, db.prepare("UPDATE work_approval_tokens SET state='used',used_at=? WHERE workspace_id=? AND id=? AND state='issued'").bind(now(), w, token.id),
      db.prepare('INSERT OR IGNORE INTO work_approval_mail VALUES(?,?,?,?,?)').bind(w, input.connectionId, input.sourceMessageId, 'recorded', now()), db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard)]);
  } catch (error) {
    if (/CHECK constraint failed/.test(String(error))) return refuse(409, 'approval_token_used', 'This approval token was already used, or the request changed');
    throw error;
  }
  return { state: 'recorded', decision: reply.decision, stage: token.stage_key, decisionId, channel: 'email' };
}

/** Re-read the packet's exact scope and current holder immediately before sending it. */
async function pendingStillCurrent(ctx:WorkContext,p:Pending){
 const db=ctx.env.DB,w=ctx.principal.workspaceId;
 const work=await db.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=?').bind(w,p.work.id).first<WorkRecord>();
 const f=await db.prepare('SELECT * FROM work_fulfilments WHERE workspace_id=? AND id=?').bind(w,p.f.id).first<any>();
 const catalog=await db.prepare('SELECT * FROM work_catalog WHERE workspace_id=? AND id=?').bind(w,p.catalog.id).first<any>();
 if(!work||!f||!catalog||work.revision!==p.work.revision||f.revision!==p.f.revision||catalog.revision!==p.catalog.revision||['closed','cancelled'].includes(work.state)||(f.expires_at&&f.expires_at<=now())||await managerRejected(ctx,work,catalog,f))return false;
 const manager=await managerStageAuthority(ctx,work,catalog,f);
 if(p.stageKey==='manager')return !manager.allowed&&manager.holderId===p.approverId;
 const chain=await chainStatus(ctx,work,catalog,f,manager.allowed);
 return chain.pending?.key===p.stageKey&&chain.pending.approvers.includes(p.approverId)&&!chain.pending.decisions.some(d=>d.approverId===p.approverId);
}

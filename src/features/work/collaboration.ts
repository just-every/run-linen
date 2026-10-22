import { ApiError, id, now, requiredString } from '../../platform/http';
import type { Principal } from '../../platform/types';
import { currentWorkPrincipal } from './identity';
import { getWork, permit, type WorkContext, type WorkRecord } from './core';
import { workReadable } from './scope';

/** Collaboration never grants ticket readership. New sharing is an explicit owner decision. */
export async function collaborationOwner(ctx: WorkContext, workId: string) {
  await currentWorkPrincipal(ctx); permit(ctx, ['owner']);
  const work = await getWork(ctx, workId);
  if (work.sensitivity !== 'normal') throw new ApiError(403, 'collaboration_sensitive', 'New collaboration is available only on normal tickets');
  if (await ctx.env.DB.prepare('SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id IN (?,?)')
    .bind(ctx.principal.workspaceId, work.requester_id, work.beneficiary_id).first())
    throw new ApiError(409, 'erased', 'Erased tickets cannot start collaboration');
  return work;
}
export function consent(input: Record<string, unknown>) {
  if (input.consent !== true) throw new ApiError(422, 'collaboration_consent', 'Confirm the selected recipient and exact content');
  return requiredString(input.reason, 'reason', 1000);
}
export function collaborationAudit(ctx: WorkContext, workId: string, action: string, detail: object) {
  return ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
    .bind(id(), ctx.principal.workspaceId, ctx.principal.userId, `work.collaboration.${action}`, workId, JSON.stringify(detail), now());
}
/** Commit-time membership, classification, revision and erasure fence, shared by all new mutations. */
export function collaborationFence(ctx: WorkContext, work: WorkRecord, guard: string) {
  return ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN
    EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')
    AND EXISTS(SELECT 1 FROM work_records w WHERE w.workspace_id=? AND w.id=? AND w.revision=? AND w.sensitivity='normal'
      AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=w.workspace_id AND e.person_id IN(w.requester_id,w.beneficiary_id)))
    THEN 1 ELSE 0 END)`).bind(guard,ctx.principal.workspaceId,ctx.principal.userId,ctx.principal.workspaceId,work.id,work.revision);
}
export async function collaborationBatch(ctx: WorkContext, work: WorkRecord, statements: D1PreparedStatement[]) {
  const guard=id();
  try { await ctx.env.DB.batch([collaborationFence(ctx,work,guard),...statements,ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard)]); }
  catch(error) { if(/CHECK constraint failed/i.test(String(error))) throw new ApiError(409,'collaboration_changed','Ticket or collaboration authority changed; reload'); throw error; }
}
export async function collaborationReader(ctx: WorkContext, workId: string, userId: string, privateNote: boolean) {
  const member=await ctx.env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1')
    .bind(ctx.principal.workspaceId,userId).first<{roles_json:string}>();
  const work=await getWork(ctx,workId);
  const roles: Principal['roles']=member?JSON.parse(member.roles_json):[];
  if(!member || !workReadable({...ctx.principal,userId,roles},work) || (privateNote && !roles.some(r=>['owner','operator'].includes(r))) ||
    await ctx.env.DB.prepare('SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id=?').bind(ctx.principal.workspaceId,userId).first())
    throw new ApiError(422,'collaboration_reader','Choose an active colleague who already has the required ticket access');
  return member;
}
export async function collaborationState(ctx: WorkContext, workId: string) {
  const work=await collaborationOwner(ctx,workId),w=ctx.principal.workspaceId,db=ctx.env.DB;
  const members=(await db.prepare('SELECT m.user_id id,u.name,m.roles_json FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND m.active=1 AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=m.workspace_id AND e.person_id=m.user_id)').bind(w).all<{id:string;name:string;roles_json:string}>()).results;
  const readers=members.filter(m=>workReadable({...ctx.principal,userId:m.id,roles:JSON.parse(m.roles_json)},work));
  return { readers:readers.map(m=>({id:m.id,name:m.name,privateNote:JSON.parse(m.roles_json).some((r:string)=>['owner','operator'].includes(r))})),
    watchers:(await db.prepare('SELECT w.user_id,u.name FROM work_watchers w JOIN users u ON u.id=w.user_id WHERE w.workspace_id=? AND w.work_id=?').bind(w,workId).all()).results,
    sides:(await db.prepare(`SELECT s.id,s.vendor_email,s.closed_at,s.created_at,c.name connection_name,
      CASE WHEN c.revision=s.connection_revision THEN json_extract(c.config_json,'$.from') ELSE NULL END sender
      FROM work_side_conversations s LEFT JOIN connections c ON c.workspace_id=s.workspace_id AND c.id=s.connection_id
      WHERE s.workspace_id=? AND s.work_id=? ORDER BY s.created_at`).bind(w,workId).all()).results,
    deliveries:(await db.prepare('SELECT id,conversation_id,state,error,created_at FROM work_side_deliveries WHERE workspace_id=? AND work_id=? ORDER BY created_at').bind(w,workId).all()).results };
}
export async function saveWatcher(ctx: WorkContext, workId: string, input: Record<string,unknown>) {
  const work=await collaborationOwner(ctx,workId),userId=requiredString(input.userId,'userId'),reason=consent(input);
  const member=await collaborationReader(ctx,workId,userId,false),w=ctx.principal.workspaceId;
  const guard=id();
  await collaborationBatch(ctx,work,[ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1 AND roles_json=? AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=memberships.workspace_id AND e.person_id=memberships.user_id)) THEN 1 ELSE 0 END)`).bind(guard,w,userId,member.roles_json),
    input.remove===true?ctx.env.DB.prepare('DELETE FROM work_watchers WHERE workspace_id=? AND work_id=? AND user_id=?').bind(w,workId,userId):
      ctx.env.DB.prepare('INSERT OR IGNORE INTO work_watchers VALUES(?,?,?,?,?)').bind(w,workId,userId,ctx.principal.userId,now()),
    collaborationAudit(ctx,workId,input.remove===true?'watch_removed':'watch_added',{recipientId:userId,reason}),ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard)]);
  return {state:input.remove===true?'removed':'watching'};
}
export async function mentionNote(ctx: WorkContext, workId: string, input: Record<string,unknown>) {
  const work=await collaborationOwner(ctx,workId),reason=consent(input),body=requiredString(input.body,'body',50000),key=requiredString(input.sourceMessageId,'sourceMessageId');
  if(!Array.isArray(input.mentions)||input.mentions.length<1||input.mentions.length>20||input.mentions.some(x=>typeof x!=='string')) throw new ApiError(422,'mentions','Choose one to twenty colleagues');
  const mentions=[...new Set(input.mentions as string[])].sort(),w=ctx.principal.workspaceId,db=ctx.env.DB;
  const members=await Promise.all(mentions.map(userId=>collaborationReader(ctx,workId,userId,true)));
  const source=`mention:${key}`,prior=await db.prepare('SELECT id,body,author_id FROM work_messages WHERE workspace_id=? AND work_id=? AND source_key=?').bind(w,workId,source).first<{id:string;body:string;author_id:string}>();
  if(prior) {
    const recipients=(await db.prepare("SELECT recipient_id FROM work_collaboration_notices WHERE workspace_id=? AND message_id=? AND kind='mention' ORDER BY recipient_id").bind(w,prior.id).all<{recipient_id:string}>()).results.map(x=>x.recipient_id);
    if(prior.body!==body||prior.author_id!==ctx.principal.userId||JSON.stringify(recipients)!==JSON.stringify(mentions)) throw new ApiError(409,'idempotency_conflict','Note identity already used');
    return prior;
  }
  const messageId=id(),at=now(),guards=mentions.map(()=>id());
  await collaborationBatch(ctx,work,[...mentions.map((userId,i)=>db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1 AND roles_json=? AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=memberships.workspace_id AND e.person_id=memberships.user_id)) THEN 1 ELSE 0 END)`).bind(guards[i],w,userId,members[i].roles_json)),
    db.prepare("INSERT INTO work_messages VALUES(?,?,?,?,'private',?,?,?)").bind(messageId,w,workId,ctx.principal.userId,body,source,at),
    ...mentions.map(userId=>db.prepare("INSERT INTO work_collaboration_notices VALUES(?,?,?,?,?,'mention',?,NULL)").bind(id(),w,workId,messageId,userId,at)),
    collaborationAudit(ctx,workId,'mentioned',{messageId,recipientIds:mentions,reason}),...guards.map(g=>db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(g))]);
  return {id:messageId,visibility:'private',body};
}
/** No body or title is carried in notifications. Re-evaluate current rights at every inbox read. */
export async function collaborationInbox(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  const w=ctx.principal.workspaceId,items=[];
  const rows=(await ctx.env.DB.prepare('SELECT id,work_id,message_id,kind,created_at,read_at FROM work_collaboration_notices WHERE workspace_id=? AND recipient_id=? ORDER BY created_at DESC LIMIT 100').bind(w,ctx.principal.userId).all<{id:string;work_id:string;message_id:string;kind:string;created_at:string;read_at:string|null}>()).results;
  for(const row of rows) {
    const work=await ctx.env.DB.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=?').bind(w,row.work_id).first<WorkRecord>();
    if(!work||!workReadable(ctx.principal,work)||(row.kind==='mention'&&!ctx.principal.roles.some(r=>['owner','operator'].includes(r))))continue;
    if(row.kind==='watch'&&!await ctx.env.DB.prepare('SELECT 1 FROM work_watchers WHERE workspace_id=? AND work_id=? AND user_id=?').bind(w,row.work_id,ctx.principal.userId).first())continue;
    items.push(row);
  }
  return {items};
}

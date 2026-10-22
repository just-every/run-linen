import type { WorkContext } from './core';
/** Clear new personal metadata as well as the private work_messages cleared by the existing erasure path. */
export async function eraseCollaborationPerson(ctx:WorkContext,personId:string) {
  const db=ctx.env.DB,w=ctx.principal.workspaceId;
  const affected="SELECT id FROM work_records WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?)";
  const sides=`SELECT id FROM work_side_conversations WHERE workspace_id=? AND (actor_id=? OR work_id IN (${affected}))`;
  await db.batch([
    db.prepare(`DELETE FROM work_side_receipts WHERE workspace_id=? AND conversation_id IN (${sides})`).bind(w,w,personId,w,personId,personId),
    db.prepare(`UPDATE work_side_deliveries SET state=CASE WHEN state IN ('sending','unknown') THEN 'unknown' ELSE 'failed' END,provider_ref=NULL,error='erased',request_key=id,mail_message_id=id WHERE workspace_id=? AND conversation_id IN (${sides})`).bind(w,w,personId,w,personId,personId),
    db.prepare(`UPDATE work_messages SET body='[erased]' WHERE workspace_id=? AND id IN (SELECT message_id FROM work_side_deliveries WHERE workspace_id=? AND conversation_id IN (${sides}))`).bind(w,w,w,personId,w,personId,personId),
    db.prepare(`UPDATE work_side_conversations SET vendor_email='[erased]',closed_at=COALESCE(closed_at,?),actor_id='[erased]' WHERE workspace_id=? AND (actor_id=? OR work_id IN (${affected}))`).bind(new Date().toISOString(),w,personId,w,personId,personId),
    db.prepare(`DELETE FROM work_watchers WHERE workspace_id=? AND (user_id=? OR actor_id=? OR work_id IN (${affected}))`).bind(w,personId,personId,w,personId,personId),
    db.prepare(`DELETE FROM work_collaboration_notices WHERE workspace_id=? AND (recipient_id=? OR work_id IN (${affected}) OR message_id IN(SELECT id FROM work_messages WHERE workspace_id=? AND author_id=?))`).bind(w,personId,w,personId,personId,w,personId),
    // Consent reasons and selected colleague ids are untyped; retain audit identities only.
    db.prepare("UPDATE audit_events SET detail_json='{}' WHERE workspace_id=? AND action LIKE 'work.collaboration.%'").bind(w),
  ]);
}

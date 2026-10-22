import { eraseLifecycleTaskStatements, lifecycleReminderWork } from './lifecycle-task-privacy';
import { eraseCollaborationPerson } from './collaboration-privacy';
import { eraseApplicationSnapshots } from './application-privacy';
import { privacyPeople, privacyBindingFence, type PrivacyPerson } from './person-privacy';
import { eraseKnowledgeDraftPerson } from './knowledge-draft-privacy';
import { hashToken } from "../../platform/crypto";
import { ApiError, id, now } from "../../platform/http";
import { currentWorkPrincipal } from "./identity";
import { permit, type WorkContext } from "./core";
/** Erase the current reviewed pair only; corrections do not join people's histories. */
export async function erasePerson(ctx: WorkContext, input: {personId:string;revision:number;reason:string}) {
  await currentWorkPrincipal(ctx);
  permit(ctx,['owner','hr']);
  const people=await privacyPeople(ctx,input.personId),aliases=new Set([input.personId]);
  const db=ctx.env.DB,w=ctx.principal.workspaceId;
  for(const person of people) {
    aliases.add(person.id);
    if(person.member_id && person.binding_id)aliases.add(person.member_id);
  }
  if(!ctx.principal.roles.includes('owner'))for(const value of aliases) {
    if(await db.prepare("SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND r.value='owner'").bind(w,value).first())
      throw new ApiError(403,'owner_erasure','Owner identity erasure requires current owner');
  }
  // Check the caller's revision before cleaning any linked record.
  const result=await eraseSinglePerson(ctx,input,people,[...aliases]);
  const failed=new Set(result.unresolvedBlobKeys);
  for(const value of aliases) {
    if(value===input.personId)continue;
    const person=await db.prepare('SELECT revision FROM work_people WHERE workspace_id=? AND id=?').bind(w,value).first<{revision:number}>();
    const member=await db.prepare('SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=?').bind(w,value).first();
    if(!person&&!member)continue; // Adoption handles already-removed platform identities.
    const linked=await eraseSinglePerson(ctx,{...input,personId:value,revision:person?.revision||0});
    for(const key of linked.unresolvedBlobKeys)failed.add(key);
  }
  return {...result,unresolvedBlobKeys:[...failed],state:failed.size?'content_erased_blob_cleanup_pending':'erased'};
}

/** Removes personal content and bytes while retaining anonymized work, operation and audit identities. */
async function eraseSinglePerson(
  ctx: WorkContext,
  input: { personId: string; revision: number; reason: string },
  people: PrivacyPerson[] = [],
  aliases: string[] = [],
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "hr"]);
  if (!input.reason?.trim())
    throw new ApiError(422, "erasure_reason", "Erasure reason required");
  const person = await ctx.env.DB.prepare(
    "SELECT source,source_id,revision FROM work_people WHERE workspace_id=? AND id=?",
  )
    .bind(ctx.principal.workspaceId, input.personId)
    .first<{ source: string; source_id: string; revision: number }>();
  const member = person
    ? null
    : await ctx.env.DB.prepare(
        "SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=?",
      )
        .bind(ctx.principal.workspaceId, input.personId)
        .first<{ roles_json: string }>();
  if (person && person.revision !== input.revision)
    throw new ApiError(409, "revision_conflict", "Person changed");
  const historicalHash = !person && !member ? await hashToken(input.personId) : null;
  const historical = historicalHash ? await ctx.env.DB.prepare(
    "SELECT 1 FROM adoption_tombstones WHERE workspace_id=? AND identity_hash=?")
    .bind(ctx.principal.workspaceId,historicalHash).first() : null;
  if (!person && !member && !historical)
    throw new ApiError(
      404,
      "identity_missing",
      "Workspace identity or scoped historical erasure tombstone required",
    );
  if (
    member &&
    JSON.parse(member.roles_json).includes("owner") &&
    !ctx.principal.roles.includes("owner")
  )
    throw new ApiError(
      403,
      "owner_erasure",
      "Owner identity erasure requires current owner",
    );
  if (historical) {
    if(input.revision !== 0) throw new ApiError(409,"revision_conflict","Historical identity requires revision zero");
    const unresolved = await ctx.env.DB.prepare(`SELECT 1 FROM execution_operations o
      JOIN execution_plans p ON p.workspace_id=o.workspace_id AND p.id=o.plan_id
      WHERE o.workspace_id=? AND o.state IN ('running','unknown','submitted','cancel_requested','effect_verified')
      AND (json_extract(o.step_json,'$.localBeneficiaryId')=? OR json_extract(o.step_json,'$.beneficiaryId')=? OR
        (p.context_type='work' AND p.work_id IN (SELECT id FROM work_records WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?)))) LIMIT 1`)
      .bind(ctx.principal.workspaceId,input.personId,input.personId,ctx.principal.workspaceId,input.personId,input.personId).first();
    if(unresolved) throw new ApiError(409,"erasure_pending_remote_reconciliation","Reconcile unresolved effects before historical erasure");
  }
  const attachments = (
    await ctx.env.DB.prepare(
      `SELECT a.blob_key FROM work_attachments a JOIN work_records w ON w.id=a.work_id AND w.workspace_id=a.workspace_id WHERE w.workspace_id=? AND (w.requester_id=? OR w.beneficiary_id=? OR w.id IN (${lifecycleReminderWork}))`,
    )
      .bind(ctx.principal.workspaceId, input.personId, input.personId, ctx.principal.workspaceId, ctx.principal.workspaceId, input.personId)
      .all<{ blob_key: string }>()
  ).results;
  const pendingIdentity=await ctx.env.DB.prepare('SELECT email FROM work_pending_people WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,input.personId).first<{email:string}>();
  const pendingEmailHash=pendingIdentity?await hashToken(pendingIdentity.email):null;
  const w = ctx.principal.workspaceId,
    p = input.personId,
    t = now();
  const guard = id(), bindingGuard = id();
  let changed;
  try { changed = await ctx.env.DB.batch([
    privacyBindingFence(ctx, people, bindingGuard, aliases),
    person
      ? ctx.env.DB.prepare(
          "UPDATE work_people SET name=?,attributes_json='{}',manager_id=NULL,active=0,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=?",
        ).bind("[erased]", w, p, input.revision)
      : historical ? ctx.env.DB.prepare(
          "INSERT OR REPLACE INTO work_erasure SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM adoption_tombstones WHERE workspace_id=? AND identity_hash=?)")
          .bind(w,p,t,w,historicalHash)
        : ctx.env.DB.prepare(
          "UPDATE memberships SET active=0 WHERE workspace_id=? AND user_id=?",
        ).bind(w, p),
    ctx.env.DB.prepare(
      "INSERT INTO work_erasure_guards VALUES(?,changes())",
    ).bind(guard),
    ...(pendingIdentity?[
      ctx.env.DB.prepare('INSERT OR IGNORE INTO adoption_tombstones VALUES(?,?,?)').bind(w,pendingEmailHash,t),
      ctx.env.DB.prepare("UPDATE work_pending_people SET email=?,start_date='',team='[erased]',state='withdrawn',withdrawn_at=? WHERE workspace_id=? AND id=?").bind(`erased-${p}@invalid.local`,t,w,p),
      ctx.env.DB.prepare("UPDATE work_pending_services SET purpose='[erased]',reason='Identity erased',state=CASE WHEN state='held' THEN 'cancelled' ELSE state END WHERE workspace_id=? AND person_id=?").bind(w,p),
    ]:[]),
    ...eraseLifecycleTaskStatements(ctx, p),
    // New task audit payloads are untyped for erasure: keep the approved full-clearing fallback.
    // Do not reconstruct any removed value from the task or a later event.
    ctx.env.DB.prepare("UPDATE audit_events SET detail_json='{}' WHERE workspace_id=? AND action IN ('work.project_task_created','work.project_task_updated','work.project_task_linked')").bind(w),
    ctx.env.DB.prepare('DELETE FROM work_department_members WHERE workspace_id=? AND user_id IN (SELECT value FROM json_each(?))').bind(w,JSON.stringify([p,...aliases])),
    ctx.env.DB.prepare('UPDATE work_department_members SET updated_by=NULL WHERE workspace_id=? AND updated_by IN (SELECT value FROM json_each(?))').bind(w,JSON.stringify([p,...aliases])),
    ctx.env.DB.prepare("UPDATE audit_events SET detail_json='{}' WHERE workspace_id=? AND action IN ('work.department_handed_off','work.department_member_set') AND (actor_id=? OR json_extract(detail_json,'$.userId')=? OR target IN(SELECT id FROM work_records WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?)))").bind(w,p,p,w,p,p),
    // Tombstone every current identity in this same transaction. A reviewer may
    // unbind an erased record, but cannot rebind either side during cleanup.
    ...[...new Set([p,...aliases,...people.map(p=>`${p.source}:${p.source_id}`)])].map(value =>
      ctx.env.DB.prepare("INSERT OR IGNORE INTO work_erasure VALUES(?,?,?)").bind(w,value,t)),
    ctx.env.DB.prepare("INSERT OR IGNORE INTO work_erasure VALUES(?,?,?)").bind(
      w,
      person ? `${person.source}:${person.source_id}` : `member:${p}`,
      t,
    ),
    ctx.env.DB.prepare(
      "UPDATE work_messages SET body='[erased]' WHERE workspace_id=? AND (author_id=? OR work_id IN (SELECT id FROM work_records WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?)))",
    ).bind(w, p, w, p, p),
    ctx.env.DB.prepare("UPDATE work_recurring_plans SET title='[erased]',body='[erased]',tasks_json='[]',enabled=0,revision=revision+1 WHERE workspace_id=? AND (creator_id=? OR owner_id=? OR EXISTS(SELECT 1 FROM json_each(tasks_json) WHERE json_extract(value,'$.ownerId')=?))").bind(w,p,p,p),
    ctx.env.DB.prepare("UPDATE work_recurring_tasks SET title='[erased]',owner_id=CASE WHEN owner_id=? THEN '[erased]' ELSE owner_id END,completed_by=CASE WHEN completed_by=? THEN '[erased]' ELSE completed_by END,revision=revision+1 WHERE workspace_id=? AND (owner_id=? OR completed_by=? OR work_id IN (SELECT id FROM work_records WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?)))").bind(p,p,w,p,p,w,p,p),
    ctx.env.DB.prepare("UPDATE work_obligations SET completed_by=CASE WHEN completed_by=? THEN '[erased]' ELSE completed_by END,waived_by=CASE WHEN waived_by=? THEN '[erased]' ELSE waived_by END WHERE workspace_id=? AND (completed_by=? OR waived_by=?)").bind(p,p,w,p,p),
    ctx.env.DB.prepare("UPDATE audit_events SET detail_json='{}' WHERE workspace_id=? AND action='work.obligation_waived' AND (actor_id=? OR target IN (SELECT o.id FROM work_obligations o JOIN work_records r ON r.workspace_id=o.workspace_id AND r.id=o.work_id WHERE o.workspace_id=? AND (r.requester_id=? OR r.beneficiary_id=?)))").bind(w,p,w,p,p),
    ctx.env.DB.prepare("UPDATE work_knowledge_suggestions SET asker_id='[erased]',articles_json='[]' WHERE workspace_id=? AND asker_id=?").bind(w,p),
    ctx.env.DB.prepare("UPDATE work_time_entries SET note='[erased]',state='completed',last_seen_at=NULL,sequence=sequence+1 WHERE workspace_id=? AND (actor_id=? OR work_id IN (SELECT id FROM work_records WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?)))").bind(w,p,w,p,p),
    ctx.env.DB.prepare(
      "UPDATE work_records SET title='[erased]',context_json='{}',revision=revision+1 WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?)",
    ).bind(w, p, p),
    ctx.env.DB.prepare("UPDATE work_classifications SET current_json=NULL,proposal_json=NULL,reason=NULL,error=NULL,state='erased',proposal_token=NULL,proposal_until=NULL,revision=revision+1 WHERE workspace_id=? AND work_id IN (SELECT id FROM work_records WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?))").bind(w,w,p,p),
    ctx.env.DB.prepare("UPDATE audit_events SET detail_json='{}' WHERE workspace_id=? AND action IN ('work.classification_proposed','work.classification_overridden') AND target IN (SELECT id FROM work_records WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?))").bind(w,w,p,p),
    ctx.env.DB.prepare("UPDATE work_fulfilments SET purpose='[erased]',catalog_snapshot_json=NULL WHERE workspace_id=? AND work_id IN (SELECT id FROM work_records WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?))").bind(w,w,p,p),
    ctx.env.DB.prepare("UPDATE work_fulfilments SET purpose='[erased]',catalog_snapshot_json=NULL WHERE workspace_id=? AND json_extract(catalog_snapshot_json,'$.submittedBy')=?").bind(w,p),
    ctx.env.DB.prepare("UPDATE work_fulfilment_approvals SET comment=NULL WHERE workspace_id=? AND holder_id=?").bind(w,p),
    ctx.env.DB.prepare("UPDATE work_approval_decisions SET comment=NULL WHERE workspace_id=? AND (approver_id=? OR work_id IN (SELECT id FROM work_records WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?)))").bind(w,p,w,p,p),
    ctx.env.DB.prepare("UPDATE work_approval_tokens SET token_hash=id,state='expired',sent_to='' WHERE workspace_id=? AND (approver_id=? OR work_id IN (SELECT id FROM work_records WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?)))").bind(w,p,w,p,p),
    ctx.env.DB.prepare("UPDATE work_fulfilment_approvals SET comment=NULL,purpose='[erased]' WHERE workspace_id=? AND work_id IN (SELECT id FROM work_records WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?))").bind(w,w,p,p),
    ctx.env.DB.prepare("UPDATE work_fulfilment_amendments SET request_json='{}',prior_json='{}',result_json='{}',reason='Identity erased',state='erased' WHERE workspace_id=? AND work_id IN (SELECT id FROM work_records WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?))").bind(w,w,p,p),
    ctx.env.DB.prepare(
      "DELETE FROM work_attachments WHERE workspace_id=? AND work_id IN (SELECT id FROM work_records WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?))",
    ).bind(w, w, p, p),
    ctx.env.DB.prepare(
      "UPDATE work_intake_events SET result_json=NULL,error='Identity erased',sender=NULL,state='erased',lease_token=NULL,lease_until=NULL WHERE workspace_id=? AND (sender=? OR work_id IN (SELECT id FROM work_records WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?)))",
    ).bind(w, p, w, p, p),
    ctx.env.DB.prepare(
      "DELETE FROM work_sender_identities WHERE workspace_id=? AND user_id=?",
    ).bind(w, p),
    ctx.env.DB.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)").bind(
      id(),
      w,
      ctx.principal.userId,
      "work.person_erased",
      p,
      JSON.stringify({ reason: input.reason, contentRemoved: true }),
      t,
    ),
    ...attachments.map((a) =>
      ctx.env.DB.prepare(
        "INSERT OR IGNORE INTO work_blob_erasure VALUES(?,?,?,NULL,NULL)",
      ).bind(w, a.blob_key, t),
    ),
    ctx.env.DB.prepare("DELETE FROM work_erasure_guards WHERE id=?").bind(
      guard,
    ),
    ctx.env.DB.prepare("DELETE FROM work_fulfilment_link_guards WHERE id=?").bind(bindingGuard),
  ]); } catch(error) {
    if(/CHECK constraint failed/i.test(String(error)))
      throw new ApiError(409, "revision_conflict", "Person or reviewed binding changed; reload before erasure");
    throw error;
  }
  if (!changed[1].meta.changes)
    throw new ApiError(409, "revision_conflict", "Person changed");
  await eraseKnowledgeDraftPerson(ctx, p);
  await eraseApplicationSnapshots(ctx,p);
  await eraseCollaborationPerson(ctx,p);
  const failed = await processBlobErasure(ctx);
  return {
    personId: p,
    state: failed.length ? "content_erased_blob_cleanup_pending" : "erased",
    unresolvedBlobKeys: failed,
    retained:
      "Anonymized work, operation, source replay tombstones and audit identities",
  };
}

export async function processBlobErasure(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "hr"]);
  const rows = (
    await ctx.env.DB.prepare(
      "SELECT blob_key FROM work_blob_erasure WHERE workspace_id=? AND deleted_at IS NULL LIMIT 100",
    )
      .bind(ctx.principal.workspaceId)
      .all<{ blob_key: string }>()
  ).results;
  const failed: string[] = [];
  for (const row of rows) {
    try {
      await ctx.env.ATTACHMENTS.delete(row.blob_key);
      await ctx.env.DB.prepare(
        "UPDATE work_blob_erasure SET deleted_at=?,last_error=NULL WHERE workspace_id=? AND blob_key=?",
      )
        .bind(now(), ctx.principal.workspaceId, row.blob_key)
        .run();
    } catch (error) {
      failed.push(row.blob_key);
      await ctx.env.DB.prepare(
        "UPDATE work_blob_erasure SET last_error=? WHERE workspace_id=? AND blob_key=?",
      )
        .bind(
          error instanceof Error ? error.message : "R2 deletion unavailable",
          ctx.principal.workspaceId,
          row.blob_key,
        )
        .run();
    }
  }
  return failed;
}

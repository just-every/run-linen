import { workReadable } from './scope';
import { preparePendingRequest, pendingRequestSnapshot } from './pending-services';
import { progressFor, requestProgress } from "./progress";
import { hashToken } from "../../platform/crypto";
import { cancelWorkExecution } from "./execution";
import { shiftCommitmentForPause } from "./calendar";
import { slaPauseStatements, validWaitingOn } from "./sla-policies";
import { closeResolution, pauseStatus } from "./desk-fields";
import { participantView } from "./relationships";
import { sharedListClause, sharedReplyAllowed, sharedView } from "./sharing";
import { currentWorkPrincipal } from "./identity";
import { groupMember } from "./desk-groups";
import type { Env, Principal } from "../../platform/types";
import { ApiError, id, now } from "../../platform/http";
export interface WorkContext {
  env: Env;
  principal: Principal;
}
export interface WorkRecord {
  id: string;
  workspace_id: string;
  requester_id: string;
  beneficiary_id: string;
  kind: string;
  title: string;
  state: string;
  sensitivity: string;
  assignee_id: string | null;
  revision: number;
  context_json: string;
  created_at: string;
  paused_ms: number;
  paused_at: string | null;
  response_at?: string | null;
  closed_at?: string | null;
  pending_person_id?: string | null;
  group_id?: string | null;
}
/** DESK-001: a queue filter within the reader's own scope. A group filter lists that group's tickets; `restricted: false`
 * leaves restricted ones out; the rest narrow by state, owner, priority and type, and sort the result. */
export interface WorkFilter {
  groupId?: string; restricted?: false; state?: "open" | "closed"; assignee?: "me" | "none"; priority?: string; kind?: string;
  sort?: "updated" | "created" | "oldest" | "priority";
}
const priorityOf = "(SELECT json_extract(c.current_json,'$.priority') FROM work_classifications c WHERE c.workspace_id=work_records.workspace_id AND c.work_id=work_records.id)";
const workOrder = { updated: "updated_at DESC", created: "created_at DESC,rowid DESC", oldest: "created_at ASC,rowid ASC", priority: `COALESCE(${priorityOf},'P9') ASC,updated_at DESC` };
function narrow(filter: WorkFilter, userId: string): [string, unknown[]] {
  const parts: [string, unknown[]][] = [
    [filter.groupId ? "AND group_id=?" : "", filter.groupId ? [filter.groupId] : []],
    [filter.restricted === false ? "AND sensitivity<>'restricted'" : "", []],
    [filter.state === "open" ? "AND state NOT IN ('closed','cancelled')" : filter.state === "closed" ? "AND state IN ('closed','cancelled')" : "", []],
    [filter.assignee === "me" ? "AND assignee_id=?" : filter.assignee === "none" ? "AND assignee_id IS NULL" : "", filter.assignee === "me" ? [userId] : []],
    [filter.priority ? `AND ${priorityOf}=?` : "", filter.priority ? [filter.priority] : []],
    [filter.kind ? "AND kind=?" : "", filter.kind ? [filter.kind] : []],
  ];
  return [parts.map(([sql]) => sql).join(" "), parts.flatMap(([, binds]) => binds)];
}
export function operator(p: Principal) {
  return p.roles.some((r) => ["owner", "operator"].includes(r));
}
export function permit(ctx: WorkContext, roles: string[]) {
  if (!ctx.principal.roles.some((r) => roles.includes(r)))
    throw new ApiError(
      403,
      "forbidden",
      "Current role does not permit this action",
    );
}
export async function getWork(ctx: WorkContext, id: string) {
  await currentWorkPrincipal(ctx);

  const p = ctx.principal;
  const row = await ctx.env.DB.prepare(
    "SELECT * FROM work_records WHERE workspace_id=? AND id=?",
  )
    .bind(p.workspaceId, id)
    .first<WorkRecord>();
  if (!row || !workReadable(p,row))
    throw new ApiError(404, "not_found", "Work not found");
  if (
    operator(p) &&
    row.requester_id !== p.userId &&
    row.beneficiary_id !== p.userId
  )
    await ctx.env.DB.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)")
      .bind(
        crypto.randomUUID(),
        p.workspaceId,
        p.userId,
        "work.privileged_read",
        row.id,
        "{}",
        now(),
      )
      .run();
  return row;
}
export async function listWork(ctx: WorkContext, filter: WorkFilter = {}) {
  await currentWorkPrincipal(ctx);

  const p = ctx.principal;
  const [narrowed, narrowBinds] = narrow(filter, p.userId);
  const rows = (
    await ctx.env.DB.prepare(
      `SELECT work_records.*,(SELECT g.name FROM work_groups g WHERE g.workspace_id=work_records.workspace_id AND g.id=work_records.group_id) group_name,
        ${priorityOf} priority,COALESCE((SELECT p.name FROM work_people p WHERE p.workspace_id=work_records.workspace_id AND p.id=work_records.pending_person_id),(SELECT u.name FROM users u WHERE u.id=work_records.beneficiary_id)) beneficiary_name FROM work_records WHERE workspace_id=? AND ((sensitivity='hr' AND ?=1) OR (sensitivity<>'hr' AND (?=1 OR (sensitivity='normal' AND ?=1) OR requester_id=? OR beneficiary_id=? OR (sensitivity='normal' AND EXISTS(SELECT 1 FROM work_participants wp WHERE wp.workspace_id=work_records.workspace_id AND wp.work_id=work_records.id AND wp.user_id=?)) OR (sensitivity='normal' AND ${sharedListClause})))) ${narrowed} ORDER BY ${workOrder[filter.sort ?? "updated"]} LIMIT 200`,
    )
      .bind(
        p.workspaceId,
        Number(p.roles.includes("hr") || p.roles.includes("owner")),
        Number(p.roles.includes("owner")),
        Number(operator(p)),
        p.userId,
        p.userId,
        p.userId,
        p.userId,
        ...narrowBinds,
      )
      .all()
  ).results;
  // Each row carries the same progress projection its conversation shows, so the queue and the open
  // request read one state. Only rows with a responsibility or an unfinished assessment need reading.
  const db = ctx.env.DB, ids = JSON.stringify(rows.map((row: any) => row.id));
  const flagged = new Set((await db.prepare(`SELECT r.id FROM work_records r WHERE r.workspace_id=? AND r.id IN (SELECT value FROM json_each(?))
    AND (EXISTS(SELECT 1 FROM work_obligations o WHERE o.workspace_id=r.workspace_id AND o.work_id=r.id)
      OR COALESCE((SELECT i.state<>'interpreted' OR COALESCE(i.result_json,'') LIKE '%necessary_question%' FROM work_intake_events i
        WHERE i.workspace_id=r.workspace_id AND i.work_id=r.id AND i.connection_id='' ORDER BY i.created_at DESC,i.rowid DESC LIMIT 1),0))`)
    .bind(p.workspaceId, ids).all<{ id: string }>()).results.map(row => row.id));
  // The catalogue services recorded on each request (name and kind), for the spaces that list them.
  const services = (await db.prepare(`SELECT f.work_id,c.name,c.kind FROM work_fulfilments f JOIN work_catalog c ON c.workspace_id=f.workspace_id AND c.id=f.catalog_id
    WHERE f.workspace_id=? AND f.work_id IN (SELECT value FROM json_each(?))
    UNION ALL SELECT h.work_id,c.name,c.kind FROM work_pending_services h JOIN work_catalog c ON c.workspace_id=h.workspace_id AND c.id=h.catalog_id WHERE h.workspace_id=? AND h.work_id IN (SELECT value FROM json_each(?)) AND h.state='held' ORDER BY c.name`)
    .bind(p.workspaceId, ids,p.workspaceId,ids).all<{ work_id: string; name: string; kind: string }>()).results;
  const seesAttention = operator(p) || p.roles.includes('hr');
  return Promise.all(rows.map(async (row: any) => {
    const progress = flagged.has(row.id) ? await progressFor(ctx, row) : [];
    const item = { ...row, progress, services: services.filter(s => s.work_id === row.id).map(({ name, kind }) => ({ name, kind })) };
    // Ordinary conversation listings do not expose the operator attention packet, the group or the priority.
    if (!seesAttention) { const { group_id, group_name, priority, ...own } = item; return own; }
    return { ...item, attention: progress.filter(entry =>
      entry.needsAction &&
      (entry.ownerId === p.userId || (entry.ownerLabel === 'Service team (recorded owner unavailable)' && operator(p)) || (!entry.ownerId && (
        (entry.ownerLabel === 'Workspace owner' && p.roles.includes('owner')) ||
        (entry.ownerLabel === 'Service team — assignment needed' && operator(p))
      )))) };
  }));
}
export async function createWork(
  ctx: WorkContext,
  input: {
    title: string;
    body: string;
    deduplicationKey: string;
    kind?: string;
    beneficiaryId?: string;
    pendingPersonId?: string;
    catalogIds?: string[];
    sensitivity?: string;
    context?: unknown;
  },
  internal?: { admittedLifecycleBeneficiary: string; statements: (workId: string) => D1PreparedStatement[] },
) {
  await currentWorkPrincipal(ctx);

  const p = ctx.principal;
  if(input.beneficiaryId && await ctx.env.DB.prepare("SELECT 1 FROM work_pending_people WHERE workspace_id=? AND id=?").bind(p.workspaceId,input.beneficiaryId).first())
    throw new ApiError(422,'pending_person_required','Use pendingPersonId and selected services for a pending person');
  const pending=await preparePendingRequest(ctx,input);
  const beneficiaryId=pending?.person.id || input.beneficiaryId || p.userId;
  const context=pending?{...(input.context && typeof input.context==='object' && !Array.isArray(input.context)?input.context:{}),requestedFor:pending.person.name,team:pending.person.team,neededBy:pending.person.start_date}:input.context || {};
  if (
    await ctx.env.DB.prepare(
      "SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id IN (?,?)",
    )
      .bind(p.workspaceId, p.userId, input.beneficiaryId || p.userId)
      .first()
  )
    throw new ApiError(
      409,
      "erased",
      "Erased identity cannot be replayed into work",
    );
  if (input.beneficiaryId && input.beneficiaryId !== p.userId &&
      internal?.admittedLifecycleBeneficiary !== input.beneficiaryId)
    permit(ctx, ["owner", "operator", "hr"]);
  if (
    input.sensitivity &&
    !["normal", "hr", "restricted"].includes(input.sensitivity)
  )
    throw new ApiError(422, "sensitivity", "Unknown sensitivity");
  if (input.sensitivity === "hr") permit(ctx, ["owner", "hr", "integration"]);
  if (!input.title.trim() || !input.body.trim() || !input.deduplicationKey)
    throw new ApiError(
      422,
      "invalid_input",
      "Title, body and stable deduplication key required",
    );
  if (!["request", "service_request", "incident", "question"].includes(input.kind || "request"))
    throw new ApiError(422, "invalid_kind", "Service request, incident or question required");
  // Canonicalize nested context so JSON object ordering is not material; array order is.
  const canonical = (value: any): any => Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
      : value;
  const requestHash = await hashToken(JSON.stringify(canonical({
    workspaceId: p.workspaceId, requesterId: p.userId,
    beneficiaryId, ...(pending?{pendingPersonId:input.pendingPersonId,catalogIds:input.catalogIds}:{}), kind: input.kind || "request",
    title: input.title, body: input.body, sensitivity: input.sensitivity || "normal",
    context:pending?input.context||{}:context,
  })));
  const workId = id(),
    t = now();
  const guard = id();
  try { await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      "INSERT OR IGNORE INTO work_records(id,workspace_id,requester_id,beneficiary_id,kind,title,sensitivity,created_at,updated_at,context_json,dedup_key,request_hash,pending_person_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      workId,
      p.workspaceId,
      p.userId,
      beneficiaryId,
      input.kind || "request",
      input.title,
      input.sensitivity || "normal",
      t,
      t,
      JSON.stringify(context),
      input.deduplicationKey,
      requestHash,
      input.pendingPersonId || null,
    ),
    // The conflict check is in the same transaction as every intake side effect.
    ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN
      EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND requester_id=? AND dedup_key=? AND request_hash=?)
      THEN 1 ELSE 0 END)`).bind(guard, p.workspaceId, p.userId, input.deduplicationKey, requestHash),
    ctx.env.DB.prepare(
      `INSERT OR IGNORE INTO work_messages SELECT ?,workspace_id,id,?,'public',?,?,? FROM work_records WHERE workspace_id=? AND requester_id=? AND dedup_key=?`,
    ).bind(
      id(),
      p.userId,
      input.body,
      "initial",
      t,
      p.workspaceId,
      p.userId,
      input.deduplicationKey,
    ),
    ctx.env.DB.prepare(
      `INSERT OR IGNORE INTO work_intake_events(id,workspace_id,work_id,connection_id,source_message_id,sender,state,created_at) SELECT ?,workspace_id,id,'','initial:'||id,?,'pending',? FROM work_records WHERE workspace_id=? AND requester_id=? AND dedup_key=? AND pending_person_id IS NULL`,
    ).bind(id(), p.userId, t, p.workspaceId, p.userId, input.deduplicationKey),
    ...(internal?.statements(workId) ?? []),
    ...(pending?.statements(workId) ?? []),
    ctx.env.DB.prepare("DELETE FROM work_fulfilment_link_guards WHERE id=?").bind(guard),
  ]); } catch (error) {
    if (String(error).includes("CHECK constraint failed"))
      throw new ApiError(409, "idempotency_conflict", "Deduplication key already belongs to different material work; legacy requests without an original fingerprint cannot be replayed");
    throw error;
  }
  const row = await ctx.env.DB.prepare(
    "SELECT id FROM work_records WHERE workspace_id=? AND requester_id=? AND dedup_key=?",
  )
    .bind(p.workspaceId, p.userId, input.deduplicationKey)
    .first<{ id: string }>();
  return getWork(ctx, row!.id);
}
/** The person a request's own words name, recorded once as a fact of the request. It is never an identity or authority. */
export async function recordRequestedFor(ctx: WorkContext, workId: string, name: string) {
  await getWork(ctx, workId);
  const context = "CASE WHEN json_valid(context_json) AND json_type(context_json)='object' THEN context_json ELSE '{}' END";
  await ctx.env.DB.prepare(`UPDATE work_records SET context_json=json_set(${context},'$.requestedFor',?),updated_at=?
    WHERE workspace_id=? AND id=? AND json_extract(${context},'$.requestedFor') IS NULL`)
    .bind(name, now(), ctx.principal.workspaceId, workId).run();
}
export async function appendMessage(
  ctx: WorkContext,
  input: {
    workId: string;
    body: string;
    visibility: "public" | "private";
    sourceMessageId: string;
  },
) {
  await currentWorkPrincipal(ctx);

  // CHANNEL-009: a colleague the request is shared with adds public replies only; the reply is conversation, not new intake.
  let work: WorkRecord;
  try { work = await getWork(ctx, input.workId); } catch (error) {
    if (input.visibility !== "public" || !await sharedReplyAllowed(ctx, input.workId)) throw error;
    return appendSharedReply(ctx, input);
  }
  if (
    input.visibility === "private" &&
    !operator(ctx.principal) &&
    !(work.sensitivity === "hr" && ctx.principal.roles.includes("hr"))
  )
    throw new ApiError(
      403,
      "private_note",
      "Private notes require service operator",
    );
  const previous = await ctx.env.DB.prepare(
    "SELECT visibility,body FROM work_messages WHERE workspace_id=? AND work_id=? AND source_key=?",
  )
    .bind(ctx.principal.workspaceId, input.workId, input.sourceMessageId)
    .first<{ visibility: string; body: string }>();
  if (
    previous &&
    (previous.visibility !== input.visibility || previous.body !== input.body)
  )
    throw new ApiError(
      409,
      "idempotency_conflict",
      "Message identity already used",
    );
  if (!input.body.trim() || !input.sourceMessageId)
    throw new ApiError(
      422,
      "invalid_message",
      "Body and sourceMessageId required",
    );
  const statements = [
    ctx.env.DB.prepare(
      "INSERT OR IGNORE INTO work_messages VALUES(?,?,?,?,?,?,?,?)",
    ).bind(
      id(),
      ctx.principal.workspaceId,
      input.workId,
      ctx.principal.userId,
      input.visibility,
      input.body,
      input.sourceMessageId,
      now(),
    ),
  ];
  if (
    input.visibility === "public" &&
    !input.sourceMessageId.startsWith("interpretation:") &&
    !input.sourceMessageId.startsWith("transition:")
  )
    statements.push(
      ctx.env.DB.prepare(
        "INSERT OR IGNORE INTO work_intake_events(id,workspace_id,work_id,connection_id,source_message_id,sender,state,created_at) VALUES(?,?,?,'',?,?,'pending',?)",
      ).bind(
        id(),
        ctx.principal.workspaceId,
        input.workId,
        `${input.workId}:${input.sourceMessageId}`,
        ctx.principal.userId,
        now(),
      ),
    );
  if (
    input.visibility === "public" &&
    operator(ctx.principal) &&
    !input.sourceMessageId.startsWith("transition:")
  )
    statements.push(
      ctx.env.DB.prepare(
        "UPDATE work_records SET response_at=COALESCE(response_at,?),updated_at=? WHERE workspace_id=? AND id=?",
      ).bind(now(), now(), ctx.principal.workspaceId, input.workId),
    );
  await ctx.env.DB.batch(statements);
  return ctx.env.DB.prepare(
    "SELECT * FROM work_messages WHERE workspace_id=? AND work_id=? AND source_key=?",
  )
    .bind(ctx.principal.workspaceId, input.workId, input.sourceMessageId)
    .first();
}
async function appendSharedReply(ctx: WorkContext, input: { workId: string; body: string; sourceMessageId: string }) {
  const w = ctx.principal.workspaceId, db = ctx.env.DB, at = now();
  const previous = await db.prepare("SELECT author_id,visibility,body FROM work_messages WHERE workspace_id=? AND work_id=? AND source_key=?")
    .bind(w, input.workId, input.sourceMessageId).first<{ author_id: string; visibility: string; body: string }>();
  if (previous && (previous.author_id !== ctx.principal.userId || previous.visibility !== "public" || previous.body !== input.body))
    throw new ApiError(409, "idempotency_conflict", "Message identity already used");
  if (!input.body.trim()) throw new ApiError(422, "invalid_message", "Body and sourceMessageId required");
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO work_messages VALUES(?,?,?,?,'public',?,?,?)").bind(id(), w, input.workId, ctx.principal.userId, input.body, input.sourceMessageId, at),
    db.prepare("UPDATE work_records SET updated_at=? WHERE workspace_id=? AND id=? AND changes()>0").bind(at, w, input.workId),
  ]);
  return db.prepare("SELECT * FROM work_messages WHERE workspace_id=? AND work_id=? AND source_key=?").bind(w, input.workId, input.sourceMessageId).first();
}
export async function conversation(ctx: WorkContext, workId: string) {
  await currentWorkPrincipal(ctx);

  // DESK-006: a merged duplicate's requester follows the surviving ticket's public conversation only.
  let work: WorkRecord;
  try { work = await getWork(ctx, workId); } catch (error) {
    // CHANNEL-009: a shared colleague or the beneficiary's manager gets the public thread only.
    const shared = await participantView(ctx, workId) ?? await sharedView(ctx, workId);
    if (!shared) throw error;
    return shared;
  }
  const privateAllowed =
    operator(ctx.principal) ||
    (work.sensitivity === "hr" && ctx.principal.roles.includes("hr"));
  const attachments = await ctx.env.DB.prepare(
    "SELECT id,name,content_type,size,sha256,visibility,created_at FROM work_attachments WHERE workspace_id=? AND work_id=? AND (visibility='public' OR ?=1)",
  )
    .bind(ctx.principal.workspaceId, workId, Number(privateAllowed))
    .all();
  const messages = await ctx.env.DB.prepare(
    "SELECT * FROM work_messages WHERE workspace_id=? AND work_id=? AND (visibility='public' OR ?=1) ORDER BY created_at,id",
  )
    .bind(ctx.principal.workspaceId, workId, Number(privateAllowed))
    .all();
  const names = await ctx.env.DB.prepare(`SELECT
    (SELECT name FROM users WHERE id=?) requester_name,
    (SELECT name FROM users WHERE id=?) assignee_name`)
    .bind(work.requester_id, work.assignee_id).first();
  return { work: { ...work, ...names }, ...await pendingRequestSnapshot(ctx,work), messages: messages.results, attachments: attachments.results, progress: await requestProgress(ctx, workId) };
}
// The public line each conversation command records, in words people read.
const transitionLabels: Record<string, string> = { reopen: "Reopened", cancel: "Cancelled", close: "Closed", pause: "Paused", resume: "Resumed", assign: "Assigned" };
export async function transitionWork(
  ctx: WorkContext,
  workId: string,
  revision: number,
  command: string,
  reason: string,
  assigneeId?: string,
  waitingOn?: unknown,
  desk: { resolutionCode?: unknown; statusId?: unknown } = {},
) {
  await currentWorkPrincipal(ctx);

  const work = await getWork(ctx, workId);
  // DESK-010: a named status is a pause that waits on whom the status names.
  const { statusId, waiting } = await pauseStatus(ctx, work, command, desk.statusId, validWaitingOn(command, waitingOn));
  if (desk.resolutionCode !== undefined && command !== "close")
    throw new ApiError(422, "resolution_code", "Only a close records a resolution code");
  if (!reason?.trim())
    throw new ApiError(422, "reason_required", "Explain this transition");
  const state = (
    {
      reopen: "open",
      pause: "paused",
      resume: "open",
      close: "closed",
      cancel: "cancelled",
      assign: work.state,
    } as Record<string, string>
  )[command];
  if (!state)
    throw new ApiError(422, "invalid_command", "Unknown work command");
  if (!["reopen", "cancel"].includes(command))
    permit(ctx, ["owner", "operator", "hr"]);
  if (command === "assign") {
    const member = await ctx.env.DB.prepare(
      "SELECT user_id FROM memberships WHERE workspace_id=? AND user_id=? AND active=1 AND (roles_json LIKE '%operator%' OR roles_json LIKE '%owner%')",
    )
      .bind(ctx.principal.workspaceId, assigneeId || "")
      .first();
    if (!member)
      throw new ApiError(
        422,
        "assignee_unavailable",
        "Assignee must be an active service operator",
      );
    // DESK-001: a ticket's owner is a member of its accountable group.
    if (work.group_id && !await groupMember(ctx, work.group_id, assigneeId!))
      throw new ApiError(422, "owner_not_in_group", "The ticket's owner must be an agent in its group");
  }
  if(work.pending_person_id && ['reopen','resume'].includes(command) && await ctx.env.DB.prepare("SELECT 1 FROM work_pending_people WHERE workspace_id=? AND id=? AND state='withdrawn'").bind(ctx.principal.workspaceId,work.pending_person_id).first())
    throw new ApiError(409,'pending_person_withdrawn','Withdrawn pending people cannot resume requests');
  const t = now();
  // DESK-010: the close notes are this close's reason; an incident also needs a resolution code.
  const resolution = command === "close" ? await closeResolution(ctx, work, desk.resolutionCode, reason, t) : null;
  const result = await ctx.env.DB.prepare(
    `UPDATE work_records SET state=?,revision=revision+1,updated_at=?,closed_at=?,paused_at=?,paused_ms=paused_ms+?,assignee_id=COALESCE(?,assignee_id) WHERE workspace_id=? AND id=? AND revision=?`,
  )
    .bind(
      state,
      t,
      state === "closed" ? t : null,
      state === "paused" ? t : null,
      work.paused_at
        ? Math.max(0, Date.parse(t) - Date.parse(work.paused_at))
        : 0,
      assigneeId || null,
      ctx.principal.workspaceId,
      workId,
      revision,
    )
    .run();
  if (!result.meta.changes)
    throw new ApiError(
      409,
      "revision_conflict",
      "Work changed; refresh before deciding",
    );
  if (resolution) await resolution.run();
  if (work.paused_at)
    await shiftCommitmentForPause(ctx, workId, work.paused_at, t);
  if (work.paused_at || command === "pause")
    await ctx.env.DB.batch(slaPauseStatements(ctx, workId, command, waiting, t, statusId));
  let pendingCancellation = 0;
  if (command === "cancel") {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(`INSERT INTO audit_events SELECT ?||':'||catalog_id,workspace_id,?,'work.pending_service_cancelled',work_id,json_object('catalogId',catalog_id,'personId',person_id),? FROM work_pending_services WHERE workspace_id=? AND work_id=? AND state='held'`).bind(id(),ctx.principal.userId,now(),ctx.principal.workspaceId,workId),
      ctx.env.DB.prepare("UPDATE work_pending_services SET state='cancelled',reason='Request cancelled' WHERE workspace_id=? AND work_id=? AND state='held'").bind(ctx.principal.workspaceId,workId),
      ctx.env.DB.prepare(
        "UPDATE work_obligations SET state=CASE WHEN operation_id IS NULL THEN 'cancelled' ELSE 'unknown' END,last_error='Cancellation requested; reconcile every applied or uncertain effect',revision=revision+1 WHERE workspace_id=? AND work_id=? AND kind IN ('access.grant','device.deliver','identity.create') AND state<>'verified'",
      ).bind(ctx.principal.workspaceId, workId),
      ctx.env.DB.prepare(
        "UPDATE work_catalog_reservations SET released_at=? WHERE workspace_id=? AND work_id=?",
      ).bind(now(), ctx.principal.workspaceId, workId),
    ]);
    pendingCancellation = (await cancelWorkExecution(ctx, workId, reason)).length;
  }
  await appendMessage(ctx, {
    workId,
    body: `${transitionLabels[command]}: ${reason}${pendingCancellation ? `; ${pendingCancellation} execution cancellation(s) pending reconciliation` : ""}`,
    visibility: "public",
    sourceMessageId: `transition:${revision + 1}`,
  });
  return getWork(ctx, workId);
}

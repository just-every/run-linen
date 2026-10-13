import { requestProgress } from "./progress";
import { hashToken } from "../../platform/crypto";
import { cancelWorkExecution } from "./execution";
import { shiftCommitmentForPause } from "./calendar";
import { currentWorkPrincipal } from "./identity";
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
  if (
    !row ||
    !(row.sensitivity === "hr"
      ? p.roles.includes("hr") ||
        p.roles.includes("owner") ||
        (p.roles.includes("integration") && row.requester_id === p.userId)
      : (row.sensitivity === "normal" && operator(p)) ||
        p.roles.includes("owner") ||
        row.requester_id === p.userId ||
        row.beneficiary_id === p.userId)
  )
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
export async function listWork(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);

  const p = ctx.principal;
  const rows = (
    await ctx.env.DB.prepare(
      `SELECT * FROM work_records WHERE workspace_id=? AND ((sensitivity='hr' AND ?=1) OR (sensitivity<>'hr' AND (?=1 OR (sensitivity='normal' AND ?=1) OR requester_id=? OR beneficiary_id=?))) ORDER BY updated_at DESC LIMIT 200`,
    )
      .bind(
        p.workspaceId,
        Number(p.roles.includes("hr") || p.roles.includes("owner")),
        Number(p.roles.includes("owner")),
        Number(operator(p)),
        p.userId,
        p.userId,
      )
      .all()
  ).results;
  // Ordinary conversation listings do not expose the operator attention packet.
  if (!operator(p) && !p.roles.includes('hr')) return rows;
  const due = now();
  const owned = await ctx.env.DB.prepare(`SELECT DISTINCT o.work_id FROM work_obligations o
    LEFT JOIN memberships m ON m.workspace_id=o.workspace_id AND m.user_id=o.owner_id AND m.active=1
    WHERE o.workspace_id=? AND (o.owner_id=? OR m.user_id IS NULL)
    AND o.state NOT IN ('verified','cancelled')
    AND (o.kind<>'access.revoke' OR o.due_at<=? OR o.state<>'pending')`)
    .bind(p.workspaceId,p.userId,due).all<{work_id:string}>();
  const intake = await ctx.env.DB.prepare(`SELECT DISTINCT i.work_id FROM work_intake_events i
    JOIN work_records r ON r.workspace_id=i.workspace_id AND r.id=i.work_id
    WHERE i.workspace_id=? AND i.connection_id='' AND
      ((i.state IN ('needs_configuration','budget_held') AND ?=1) OR
       ((i.state='failed' OR (i.state='interpreting' AND i.lease_until<?)) AND (r.assignee_id=? OR r.assignee_id IS NULL)))`)
    .bind(p.workspaceId,Number(p.roles.includes('owner')),due,p.userId).all<{work_id:string}>();
  const candidates = new Set([...owned.results,...intake.results].map(row=>row.work_id));
  return Promise.all(rows.map(async (row: any) => ({
    ...row,
    attention: (candidates.has(row.id) ? await requestProgress(ctx, row.id) : []).filter(item =>
      item.needsAction &&
      (item.ownerId === p.userId || (item.ownerLabel === 'Service team (recorded owner unavailable)' && operator(p)) || (!item.ownerId && (
        (item.ownerLabel === 'Workspace owner' && p.roles.includes('owner')) ||
        (item.ownerLabel === 'Service team — assignment needed' && operator(p))
      )))),
  })));

}
export async function createWork(
  ctx: WorkContext,
  input: {
    title: string;
    body: string;
    deduplicationKey: string;
    kind?: string;
    beneficiaryId?: string;
    sensitivity?: string;
    context?: unknown;
  },
  internal?: { admittedLifecycleBeneficiary: string; statements: (workId: string) => D1PreparedStatement[] },
) {
  await currentWorkPrincipal(ctx);

  const p = ctx.principal;
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
  if (!["request", "incident"].includes(input.kind || "request"))
    throw new ApiError(422, "invalid_kind", "Request or incident required");
  // Canonicalize nested context so JSON object ordering is not material; array order is.
  const canonical = (value: any): any => Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
      : value;
  const requestHash = await hashToken(JSON.stringify(canonical({
    workspaceId: p.workspaceId, requesterId: p.userId,
    beneficiaryId: input.beneficiaryId || p.userId, kind: input.kind || "request",
    title: input.title, body: input.body, sensitivity: input.sensitivity || "normal",
    context: input.context || {},
  })));
  const workId = id(),
    t = now();
  const guard = id();
  try { await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      "INSERT OR IGNORE INTO work_records(id,workspace_id,requester_id,beneficiary_id,kind,title,sensitivity,created_at,updated_at,context_json,dedup_key,request_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      workId,
      p.workspaceId,
      p.userId,
      input.beneficiaryId || p.userId,
      input.kind || "request",
      input.title,
      input.sensitivity || "normal",
      t,
      t,
      JSON.stringify(input.context || {}),
      input.deduplicationKey,
      requestHash,
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
      `INSERT OR IGNORE INTO work_intake_events(id,workspace_id,work_id,connection_id,source_message_id,sender,state,created_at) SELECT ?,workspace_id,id,'','initial:'||id,?,'pending',? FROM work_records WHERE workspace_id=? AND requester_id=? AND dedup_key=?`,
    ).bind(id(), p.userId, t, p.workspaceId, p.userId, input.deduplicationKey),
    ...(internal?.statements(workId) ?? []),
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

  const work = await getWork(ctx, input.workId);
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
export async function conversation(ctx: WorkContext, workId: string) {
  await currentWorkPrincipal(ctx);

  const work = await getWork(ctx, workId);
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
  return { work, messages: messages.results, attachments: attachments.results, progress: await requestProgress(ctx, workId) };
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
) {
  await currentWorkPrincipal(ctx);

  const work = await getWork(ctx, workId);
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
  }
  const t = now();
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
  if (work.paused_at)
    await shiftCommitmentForPause(ctx, workId, work.paused_at, t);
  let pendingCancellation = 0;
  if (command === "cancel") {
    await ctx.env.DB.batch([
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

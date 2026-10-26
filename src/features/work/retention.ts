/**
 * RETENTION-001: owner-set retention for closed tickets and their attachments.
 * No policy row means keep forever ("No retention set"); there is no hidden default.
 * Age counts from closed_at: a ticket is due when closed strictly more than N×24 h ago (UTC instants).
 */
import { ApiError, id, now } from '../../platform/http';
import type { Env } from '../../platform/types';
import { identityHash } from '../adoption/core';
import { permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';

const DAY_MS = 86400000;
export const retentionKinds = { closedTicketDays: 'closed tickets', attachmentDays: 'attachments of closed tickets' } as const;
type Days = number | null;
interface Policy { closedTicketDays: Days; attachmentDays: Days; revision: number }
/** Obligation states the lifecycle still acts on; a ticket holding one is never deleted. */
const OPEN_OBLIGATIONS = "('pending','blocked','executing','unknown')";
/** Service record states after which a link no longer holds the ticket. */
const CLOSED_SERVICE_STATES = ['verified', 'failed', 'compensated', 'cancelled', 'closed', 'resolved'];
/** Rows that are the ticket's own content. Effect, execution, fulfilment, lifecycle, time and audit records keep the opaque id. */
const TICKET_CONTENT = ['work_followup_versions', 'work_approval_tokens', 'work_approval_decisions', 'work_approval_stages', 'work_side_receipts', 'work_side_deliveries', 'work_mail_deliveries', 'work_walkups', 'work_calls', 'work_handoffs', 'work_side_conversations', 'work_collaboration_notices', 'work_watchers', 'work_messages', 'work_attachments', 'work_intake_events', 'work_classifications', 'work_knowledge_suggestions', 'work_commitments', 'work_obligations'];

function days(value: unknown, field: string): Days {
  if (value === null || value === undefined || value === '' || value === 'keep') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 3650) throw new ApiError(400, 'invalid_retention', `${field} must be whole days from 1 to 3650, or keep`);
  return n;
}
async function policy(env: Env, workspaceId: string): Promise<Policy> {
  const row = await env.DB.prepare('SELECT * FROM work_retention WHERE workspace_id=?').bind(workspaceId)
    .first<{ closed_ticket_days: Days; attachment_days: Days; revision: number }>();
  return { closedTicketDays: row?.closed_ticket_days ?? null, attachmentDays: row?.attachment_days ?? null, revision: row?.revision ?? 0 };
}
const cutoff = (n: number, at: number) => new Date(at - n * DAY_MS).toISOString();

/** Why a due ticket is held back, or null when it may be deleted. */
async function skipReason(env: Env, workspaceId: string, workId: string) {
  if (await env.DB.prepare(`SELECT 1 FROM work_obligations WHERE workspace_id=? AND work_id=? AND state IN ${OPEN_OBLIGATIONS}`).bind(workspaceId, workId).first()) return 'open_obligation';
  if (await env.DB.prepare('SELECT 1 FROM work_asset_repairs WHERE workspace_id=? AND work_id=?').bind(workspaceId, workId).first()) return 'linked_asset_repair';
  const linked = (await env.DB.prepare('SELECT data_json FROM svc_records WHERE workspace_id=? AND instr(data_json,?)>0').bind(workspaceId, workId).all<{ data_json: string }>()).results;
  if (linked.some(r => { const d = JSON.parse(r.data_json); return (d.links || []).some((l: { employeeIncidentId?: string }) => l.employeeIncidentId === workId) && !CLOSED_SERVICE_STATES.includes(d.state); })) return 'linked_open_service_record';
  return null;
}
async function dueTickets(env: Env, workspaceId: string, n: number, at: number, limit = 1000) {
  return (await env.DB.prepare("SELECT id,closed_at FROM work_records WHERE workspace_id=? AND state='closed' AND closed_at IS NOT NULL AND closed_at<? ORDER BY closed_at LIMIT ?")
    .bind(workspaceId, cutoff(n, at), limit).all<{ id: string; closed_at: string }>()).results;
}
async function dueAttachments(env: Env, workspaceId: string, n: number, at: number, limit = 1000) {
  return (await env.DB.prepare("SELECT a.id,a.work_id,a.blob_key,a.size,w.closed_at FROM work_attachments a JOIN work_records w ON w.workspace_id=a.workspace_id AND w.id=a.work_id WHERE a.workspace_id=? AND w.state='closed' AND w.closed_at IS NOT NULL AND w.closed_at<? ORDER BY w.closed_at LIMIT ?")
    .bind(workspaceId, cutoff(n, at), limit).all<{ id: string; work_id: string; blob_key: string; size: number; closed_at: string }>()).results;
}

/** What the next run would delete under a policy: tickets, attachments (including those inside deleted tickets) and held-back tickets. */
async function preview(env: Env, workspaceId: string, p: Pick<Policy, 'closedTicketDays' | 'attachmentDays'>, at = Date.now()) {
  const tickets = p.closedTicketDays ? await dueTickets(env, workspaceId, p.closedTicketDays, at) : [];
  const deleted = new Set<string>(), skipped: Record<string, number> = {};
  for (const t of tickets) { const reason = await skipReason(env, workspaceId, t.id); if (reason) skipped[reason] = (skipped[reason] || 0) + 1; else deleted.add(t.id); }
  const attachmentRows = new Set<string>();
  if (deleted.size) for (const r of (await env.DB.prepare('SELECT id,work_id FROM work_attachments WHERE workspace_id=?').bind(workspaceId).all<{ id: string; work_id: string }>()).results) if (deleted.has(r.work_id)) attachmentRows.add(r.id);
  if (p.attachmentDays) for (const a of await dueAttachments(env, workspaceId, p.attachmentDays, at)) attachmentRows.add(a.id);
  return { tickets: deleted.size, attachments: attachmentRows.size, skipped };
}

export async function readRetention(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'auditor']);
  const p = await policy(ctx.env, ctx.principal.workspaceId);
  return { ...p, state: p.revision ? 'configured' : 'unconfigured', unit: 'whole days after the ticket closed; empty means keep', kinds: retentionKinds };
}
export async function previewRetention(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const next = { closedTicketDays: days(input.closedTicketDays, 'closedTicketDays'), attachmentDays: days(input.attachmentDays, 'attachmentDays') };
  return { ...next, ...await preview(ctx.env, ctx.principal.workspaceId, next) };
}
/** Setting or shortening either period needs the owner to confirm the exact counts the next run would delete. */
export async function setRetention(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const w = ctx.principal.workspaceId, current = await policy(ctx.env, w);
  if (Number(input.revision) !== current.revision) throw new ApiError(409, 'retention_revision_conflict', 'Retention changed; reload before saving');
  const next = { closedTicketDays: days(input.closedTicketDays, 'closedTicketDays'), attachmentDays: days(input.attachmentDays, 'attachmentDays') };
  const tightens = (k: keyof typeof next) => next[k] !== null && (current[k] === null || next[k]! < current[k]!);
  const counts = await preview(ctx.env, w, next);
  if (tightens('closedTicketDays') || tightens('attachmentDays')) {
    const c = input.confirmDeletions as { tickets?: unknown; attachments?: unknown } | undefined;
    if (!c || c.tickets !== counts.tickets || c.attachments !== counts.attachments)
      throw new ApiError(409, 'retention_confirmation_required', `The next run would delete ${counts.tickets} closed ticket${counts.tickets === 1 ? '' : 's'} and ${counts.attachments} attachment${counts.attachments === 1 ? '' : 's'}. Confirm these counts to save.`);
  }
  const t = now(), revision = current.revision + 1;
  const write = current.revision
    ? ctx.env.DB.prepare('UPDATE work_retention SET closed_ticket_days=?,attachment_days=?,revision=?,updated_by=?,updated_at=? WHERE workspace_id=? AND revision=?').bind(next.closedTicketDays, next.attachmentDays, revision, ctx.principal.userId, t, w, current.revision)
    : ctx.env.DB.prepare('INSERT INTO work_retention VALUES(?,?,?,?,?,?)').bind(w, next.closedTicketDays, next.attachmentDays, revision, ctx.principal.userId, t);
  const [result] = await ctx.env.DB.batch([write, ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(), w, ctx.principal.userId, 'work.retention.set', w, JSON.stringify({ ...next, revision, confirmed: counts }), t)]);
  if (!result.meta.changes) throw new ApiError(409, 'retention_revision_conflict', 'Retention changed; reload before saving');
  return { ...next, revision, confirmed: counts };
}
export async function retentionReceipts(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'auditor']);
  const w = ctx.principal.workspaceId;
  return {
    receipts: (await ctx.env.DB.prepare('SELECT id,kind,record_hash,ticket_hash,closed_at,deleted_at,policy_revision,policy_days,attachments,bytes FROM work_retention_receipts WHERE workspace_id=? ORDER BY deleted_at DESC LIMIT 500').bind(w).all()).results,
    skipped: (await ctx.env.DB.prepare('SELECT ticket_hash,reason,checked_at FROM work_retention_skips WHERE workspace_id=? ORDER BY checked_at DESC LIMIT 500').bind(w).all()).results,
  };
}

/** Deletes due records in one batch each with its receipt; bytes go to the durable deletion queue the adoption lane drains. */
export async function processDueRetention(env: Env, at = Date.now()) {
  let tickets = 0, attachments = 0, skipped = 0;
  const policies = (await env.DB.prepare('SELECT workspace_id FROM work_retention WHERE closed_ticket_days IS NOT NULL OR attachment_days IS NOT NULL').all<{ workspace_id: string }>()).results;
  for (const { workspace_id: w } of policies) {
    const p = await policy(env, w), t = now();
    const deletion = (key: string) => env.DB.prepare("INSERT OR IGNORE INTO adoption_deletions VALUES(?,?,?,'pending',0,?)").bind(id(), w, key, t);
    const audit = (action: string, target: string, detail: unknown) => env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(), w, 'retention-policy', action, target, JSON.stringify(detail), t);
    if (p.closedTicketDays) for (const ticket of await dueTickets(env, w, p.closedTicketDays, at, 25)) {
      const hash = await identityHash(ticket.id), reason = await skipReason(env, w, ticket.id);
      if (reason) { await env.DB.prepare('INSERT INTO work_retention_skips VALUES(?,?,?,?) ON CONFLICT(workspace_id,ticket_hash) DO UPDATE SET reason=excluded.reason,checked_at=excluded.checked_at').bind(w, hash, reason, t).run(); skipped++; continue; }
      const files = (await env.DB.prepare('SELECT blob_key,size FROM work_attachments WHERE workspace_id=? AND work_id=?').bind(w, ticket.id).all<{ blob_key: string; size: number }>()).results;
      const bytes = files.reduce((n, f) => n + f.size, 0);
      await env.DB.batch([
        ...files.map(f => deletion(f.blob_key)),
        ...TICKET_CONTENT.map(table => env.DB.prepare(`DELETE FROM ${table} WHERE workspace_id=? AND work_id=?`).bind(w, ticket.id)),
        env.DB.prepare("DELETE FROM work_records WHERE workspace_id=? AND id=? AND state='closed' AND closed_at=?").bind(w, ticket.id, ticket.closed_at),
        // An older archive restore skips rows naming a tombstoned id, so retention is not undone by replay.
        env.DB.prepare('INSERT OR IGNORE INTO adoption_tombstones VALUES(?,?,?)').bind(w, hash, t),
        env.DB.prepare('DELETE FROM work_retention_skips WHERE workspace_id=? AND ticket_hash=?').bind(w, hash),
        env.DB.prepare('INSERT INTO work_retention_receipts VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id(), w, 'ticket', hash, hash, ticket.closed_at, t, p.revision, p.closedTicketDays, files.length, bytes),
        audit('work.retention.delete', hash, { kind: 'ticket', closedAt: ticket.closed_at, attachments: files.length, policyRevision: p.revision }),
      ]);
      tickets++; attachments += files.length;
    }
    if (p.attachmentDays) for (const a of await dueAttachments(env, w, p.attachmentDays, at, 100)) {
      const hash = await identityHash(a.id), ticketHash = await identityHash(a.work_id);
      await env.DB.batch([
        deletion(a.blob_key),
        env.DB.prepare('DELETE FROM work_attachments WHERE workspace_id=? AND id=?').bind(w, a.id),
        env.DB.prepare('INSERT OR IGNORE INTO adoption_tombstones VALUES(?,?,?)').bind(w, hash, t),
        env.DB.prepare('INSERT INTO work_retention_receipts VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id(), w, 'attachment', hash, ticketHash, a.closed_at, t, p.revision, p.attachmentDays, 1, a.size),
        audit('work.retention.delete', hash, { kind: 'attachment', closedAt: a.closed_at, policyRevision: p.revision }),
      ]);
      attachments++;
    }
  }
  return { tickets, attachments, skipped };
}

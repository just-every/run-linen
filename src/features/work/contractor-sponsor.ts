import {obligationHistory} from './work-history';
/**
 * LIFE-006: the sponsor of a contractor or temp end date is reminded 72 hours
 * before the end instant and alone may re-attest to a later end date. Without
 * re-attestation the existing expiry duties remove access at the end instant.
 * When the sponsor is no longer an active member, the reminder and the choice
 * (reassign or re-attest) move to a workspace owner.
 */
import { ApiError, now } from "../../platform/http";
import { currentWorkPrincipal } from "./identity";
import { createWork, type WorkContext } from "./core";
import { effectiveInstant } from "./lifecycle";

export const SPONSOR_REMINDER_MS = 72 * 3600 * 1000;

interface SponsoredRow { id: string; work_id: string; person_id: string; sponsor_id: string; sponsor_work_id: string | null; timezone: string; name: string; expires_at: string; duties: number; }

async function activeMember(ctx: WorkContext, userId: string) {
  return ctx.env.DB.prepare("SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1").bind(ctx.principal.workspaceId, userId).first<{ roles_json: string }>();
}
const isOwner = (m: { roles_json: string } | null) => Boolean(m && (JSON.parse(m.roles_json) as string[]).includes("owner"));

/** The sponsor while active; otherwise the accountable owner when they hold the owner role, else the first active owner. */
async function responsible(ctx: WorkContext, row: SponsoredRow) {
  if (await activeMember(ctx, row.sponsor_id)) return { userId: row.sponsor_id, sponsorLeft: false };
  const accountable = await ctx.env.DB.prepare("SELECT owner_id FROM work_obligations WHERE workspace_id=? AND lifecycle_id=? AND is_expiry=1 LIMIT 1").bind(ctx.principal.workspaceId, row.id).first<{ owner_id: string }>();
  if (accountable && isOwner(await activeMember(ctx, accountable.owner_id))) return { userId: accountable.owner_id, sponsorLeft: true };
  const owners = (await ctx.env.DB.prepare("SELECT user_id,roles_json FROM memberships WHERE workspace_id=? AND active=1 ORDER BY user_id").bind(ctx.principal.workspaceId).all<{ user_id: string; roles_json: string }>()).results;
  const owner = owners.find(isOwner);
  return owner ? { userId: owner.user_id, sponsorLeft: true } : null;
}

/** The admitted sponsor must be a current active member other than the contractor. */
export async function assertSponsor(ctx: WorkContext, sponsorId: unknown, personId: string) {
  if (typeof sponsorId !== "string" || !sponsorId)
    throw new ApiError(422, "sponsor_required", "A contractor or temporary end date needs a sponsor");
  const member = await ctx.env.DB.prepare("SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1").bind(ctx.principal.workspaceId, sponsorId).first();
  const self = await ctx.env.DB.prepare("SELECT 1 FROM work_people WHERE workspace_id=? AND id=? AND member_id=?").bind(ctx.principal.workspaceId, personId, sponsorId).first();
  if (!member || self || sponsorId === personId)
    throw new ApiError(422, "sponsor_invalid", "The sponsor must be a current active member other than the contractor");
  return sponsorId;
}

// An end date stays open to reminders and re-attestation only while none of its expiry duties has started.
const sponsored = (where: string, having = "1=1") => `SELECT l.id,l.work_id,l.person_id,l.sponsor_id,l.sponsor_work_id,l.timezone,p.name,MIN(o.due_at) expires_at,COUNT(*) duties
  FROM work_lifecycle l JOIN work_people p ON p.workspace_id=l.workspace_id AND p.id=l.person_id
  JOIN work_obligations o ON o.workspace_id=l.workspace_id AND o.lifecycle_id=l.id AND o.is_expiry=1
  WHERE l.workspace_id=? AND l.sponsor_id IS NOT NULL AND l.cancelled_at IS NULL AND ${where} GROUP BY l.id
  HAVING SUM(o.state<>'pending' OR o.operation_id IS NOT NULL)=0 AND ${having}`;

/** Raise one reminder request for whoever is responsible once the end instant is within 72 hours. */
export async function remindSponsors(ctx: WorkContext, at: string) {
  const window = (await ctx.env.DB.prepare(sponsored("1=1", "MIN(o.due_at)>? AND MIN(o.due_at)<=?"))
    .bind(ctx.principal.workspaceId, at, new Date(Date.parse(at) + SPONSOR_REMINDER_MS).toISOString()).all<SponsoredRow>()).results;
  const results = [];
  for (const row of window) {
    const to = await responsible(ctx, row);
    if (!to) { results.push({ id: row.id, state: "sponsor_reminder_failed", error: "no_active_owner" }); continue; }
    const prior = row.sponsor_work_id ? await ctx.env.DB.prepare("SELECT beneficiary_id FROM work_records WHERE workspace_id=? AND id=?").bind(ctx.principal.workspaceId, row.sponsor_work_id).first<{ beneficiary_id: string }>() : null;
    if (prior?.beneficiary_id === to.userId) continue;
    try {
      const work = await createWork(ctx, {
        title: to.sponsorLeft ? `Sponsor left; owner to reassign or re-attest ${row.name}'s access before ${row.expires_at}` : `Re-attest ${row.name}'s access before ${row.expires_at}`,
        body: `${row.name}'s access ends at ${row.expires_at} (${row.timezone}). ${to.sponsorLeft ? "The sponsor is no longer an active member: reassign a sponsor or re-attest" : "As sponsor, re-attest"} with a later end date to keep it; otherwise access is removed and verified at the end instant.`,
        deduplicationKey: `sponsor:${row.id}:${row.expires_at}:${to.userId}`, beneficiaryId: to.userId,
        context: { sponsorReminder: { lifecycleId: row.id, person: row.name, expiresAt: row.expires_at, sponsorLeft: to.sponsorLeft } },
      }, { admittedLifecycleBeneficiary: to.userId, statements: () => [] });
      await ctx.env.DB.prepare("UPDATE work_lifecycle SET sponsor_reminded_at=?,sponsor_work_id=? WHERE workspace_id=? AND id=?")
        .bind(at, work.id, ctx.principal.workspaceId, row.id).run();
      results.push({ id: row.id, state: to.sponsorLeft ? "owner_reminded" : "sponsor_reminded", workId: work.id });
    } catch (error) {
      results.push({ id: row.id, state: "sponsor_reminder_failed", error: error instanceof ApiError ? error.code : "error" });
    }
  }
  return results;
}

/** End dates the current member sponsors and may still re-attest. */
export async function sponsoredAccess(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  const rows = (await ctx.env.DB.prepare(sponsored("1=1")).bind(ctx.principal.workspaceId).all<SponsoredRow>()).results;
  const mine = [];
  for (const r of rows) {
    const to = await responsible(ctx, r);
    if (to?.userId === ctx.principal.userId || (to?.sponsorLeft && ctx.principal.roles.includes("owner")))
      mine.push({ lifecycleId: r.id, person: r.name, expiresAt: r.expires_at, timezone: r.timezone, sponsorLeft: Boolean(to?.sponsorLeft) });
  }
  return mine;
}

/** Only the current sponsor moves the end to a later instant, before the expiry duties start. */
export async function reattestAccess(ctx: WorkContext, lifecycleId: string, expiresAt: string) {
  await currentWorkPrincipal(ctx);
  const row = await ctx.env.DB.prepare(sponsored("l.id=?")).bind(ctx.principal.workspaceId, lifecycleId).first<SponsoredRow>();
  if (!row || !await mayDecide(ctx, row))
    throw new ApiError(404, "not_found", "No end date you sponsor can be re-attested here");
  const next = effectiveInstant(expiresAt, row.timezone);
  if (next <= row.expires_at || next <= now())
    throw new ApiError(422, "reattest_later", "Re-attestation needs a later end date than the current one");
  const t = now();
  const duties=(await ctx.env.DB.prepare('SELECT * FROM work_obligations WHERE workspace_id=? AND lifecycle_id=? AND is_expiry=1').bind(ctx.principal.workspaceId,lifecycleId).all<any>()).results;
  const [moved] = await ctx.env.DB.batch([
    ctx.env.DB.prepare("UPDATE work_obligations SET due_at=?,revision=revision+1 WHERE workspace_id=? AND lifecycle_id=? AND is_expiry=1 AND state='pending' AND operation_id IS NULL AND due_at=? AND (SELECT COUNT(*) FROM work_obligations x WHERE x.workspace_id=? AND x.lifecycle_id=? AND x.is_expiry=1 AND (x.state<>'pending' OR x.operation_id IS NOT NULL))=0")
      .bind(next, ctx.principal.workspaceId, lifecycleId, row.expires_at, ctx.principal.workspaceId, lifecycleId),
    ctx.env.DB.prepare('INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN changes()=? THEN 1 ELSE 0 END)').bind(lifecycleId+':reattest',row.duties),
    ...duties.map(o=>obligationHistory(ctx,o,'work.obligation_changed',{dueAt:o.due_at,revision:o.revision},{dueAt:next,revision:o.revision+1},t,false)),
    ctx.env.DB.prepare("UPDATE work_lifecycle SET sponsor_reminded_at=NULL,sponsor_work_id=NULL,revision=revision+1 WHERE workspace_id=? AND id=?").bind(ctx.principal.workspaceId, lifecycleId),
    ctx.env.DB.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(), ctx.principal.workspaceId, ctx.principal.userId,
      "lifecycle.sponsor_reattested", lifecycleId, JSON.stringify({ from: row.expires_at, to: next }), t),
    ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(lifecycleId+':reattest'),
  ]).catch(error=>{if(/CHECK constraint failed/.test(String(error)))throw new ApiError(409,'expiry_started','Expiry has already started; reconcile it before any new access');throw error;});
  if (moved.meta.changes !== row.duties) throw new ApiError(409, "expiry_started", "Expiry has already started; reconcile it before any new access");
  return { lifecycleId, expiresAt: next, previousExpiresAt: row.expires_at };
}

/** The active sponsor decides; once the sponsor has left, an owner does. */
async function mayDecide(ctx: WorkContext, row: SponsoredRow) {
  if (row.sponsor_id === ctx.principal.userId) return Boolean(await activeMember(ctx, row.sponsor_id));
  return ctx.principal.roles.includes("owner") && !await activeMember(ctx, row.sponsor_id);
}

/** An owner names a new sponsor, who is reminded afresh before the end instant. */
export async function reassignSponsor(ctx: WorkContext, lifecycleId: string, sponsorId: string) {
  await currentWorkPrincipal(ctx);
  if (!ctx.principal.roles.includes("owner")) throw new ApiError(403, "forbidden", "Only an owner reassigns a sponsor");
  const row = await ctx.env.DB.prepare(sponsored("l.id=?")).bind(ctx.principal.workspaceId, lifecycleId).first<SponsoredRow>();
  if (!row) throw new ApiError(404, "not_found", "No pending end date to reassign");
  await assertSponsor(ctx, sponsorId, row.person_id);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare("UPDATE work_lifecycle SET sponsor_id=?,sponsor_reminded_at=NULL,sponsor_work_id=NULL,revision=revision+1 WHERE workspace_id=? AND id=?").bind(sponsorId, ctx.principal.workspaceId, lifecycleId),
    ctx.env.DB.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(), ctx.principal.workspaceId, ctx.principal.userId,
      "lifecycle.sponsor_reassigned", lifecycleId, JSON.stringify({ from: row.sponsor_id, to: sponsorId }), now()),
  ]);
  return { lifecycleId, sponsorId, expiresAt: row.expires_at };
}

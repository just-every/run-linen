import { ApiError, id, now, requiredString } from '../../platform/http';
import { createWork, getWork, permit, transitionWork, appendMessage, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';
import { memberByContact, normalizeBadge } from './contact-points';

interface Walkup { id: string; work_id: string; person_id: string; site: string; state: string; actor_id: string; taken_by: string | null; outcome: string | null; created_at: string; started_at: string | null; finished_at: string | null }
const staff = async (ctx: WorkContext) => { await currentWorkPrincipal(ctx); permit(ctx, ['owner', 'operator']); };

/** Identifies who is at the desk: a mapped badge, or a name that matches exactly one active member. Never a guess. */
async function visitor(ctx: WorkContext, input: Record<string, unknown>) {
  const w = ctx.principal.workspaceId, db = ctx.env.DB;
  if (typeof input.badge === 'string' && input.badge.trim()) {
    const mapped = await memberByContact(ctx, 'badge', normalizeBadge(input.badge));
    if (!mapped) throw new ApiError(404, 'badge_unknown', 'No active member is mapped to this badge');
    return mapped.user_id;
  }
  const name = requiredString(input.name, 'name', 200).trim().toLowerCase();
  const matches = (await db.prepare(`SELECT m.user_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND m.active=1 AND lower(u.name)=?
    AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=m.workspace_id AND e.person_id=m.user_id)`).bind(w, name).all<{ user_id: string }>()).results;
  if (matches.length === 0) throw new ApiError(404, 'person_unknown', 'No active member has this name');
  if (matches.length > 1) throw new ApiError(409, 'person_ambiguous', 'Several members share this name; scan a badge instead');
  return matches[0].user_id;
}
export async function checkIn(ctx: WorkContext, input: Record<string, unknown>) {
  await staff(ctx);
  const w = ctx.principal.workspaceId, db = ctx.env.DB, site = requiredString(input.site, 'site', 120).trim();
  const key = requiredString(input.idempotencyKey, 'idempotencyKey', 120);
  const prior = await db.prepare('SELECT * FROM work_walkups WHERE workspace_id=? AND id=?').bind(w, key).first<Walkup>();
  if (prior) return prior;
  const personId = await visitor(ctx, input);
  const open = await db.prepare("SELECT id FROM work_walkups WHERE workspace_id=? AND person_id=? AND state IN ('waiting','serving')").bind(w, personId).first();
  if (open) throw new ApiError(409, 'already_waiting', 'This person is already in the walk-up queue');
  const work = await createWork(ctx, { title: `Walk-up visit: ${site}`, body: `Checked in at the ${site} walk-up desk.`, deduplicationKey: `walkup:${key}`, beneficiaryId: personId });
  await db.batch([
    db.prepare("INSERT INTO work_walkups VALUES(?,?,?,?,?,'waiting',?,NULL,NULL,?,NULL,NULL)").bind(key, w, work.id, personId, site, ctx.principal.userId, now()),
    db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(), w, ctx.principal.userId, 'work.walkup.checked_in', work.id, JSON.stringify({ walkupId: key, site }), now()),
  ]);
  return db.prepare('SELECT * FROM work_walkups WHERE workspace_id=? AND id=?').bind(w, key).first<Walkup>();
}
async function visit(ctx: WorkContext, walkupId: string) {
  const row = await ctx.env.DB.prepare('SELECT * FROM work_walkups WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, walkupId).first<Walkup>();
  if (!row) throw new ApiError(404, 'not_found', 'Visit not found');
  return row;
}
export async function startVisit(ctx: WorkContext, walkupId: string) {
  await staff(ctx);
  const row = await visit(ctx, walkupId), w = ctx.principal.workspaceId;
  if (row.state === 'serving' && row.taken_by === ctx.principal.userId) return row;
  const result = await ctx.env.DB.prepare("UPDATE work_walkups SET state='serving',taken_by=?,started_at=? WHERE workspace_id=? AND id=? AND state='waiting'").bind(ctx.principal.userId, now(), w, walkupId).run();
  if (!result.meta.changes) throw new ApiError(409, 'visit_changed', 'This visit is no longer waiting');
  return visit(ctx, walkupId);
}
export async function finishVisit(ctx: WorkContext, walkupId: string, input: Record<string, unknown>) {
  await staff(ctx);
  const row = await visit(ctx, walkupId), w = ctx.principal.workspaceId, left = input.left === true;
  if (row.state === 'resolved' || row.state === 'left') return row;
  if (!left && row.state !== 'serving') throw new ApiError(409, 'visit_not_started', 'Start the visit before resolving it');
  if (!left && row.taken_by !== ctx.principal.userId) throw new ApiError(403, 'visit_taken', 'Another agent is serving this visit');
  const outcome = requiredString(input.outcome, 'outcome', 2000).trim();
  const claim = await ctx.env.DB.prepare("UPDATE work_walkups SET state=?,outcome=?,finished_at=? WHERE workspace_id=? AND id=? AND state IN ('waiting','serving')").bind(left ? 'left' : 'resolved', outcome, now(), w, walkupId).run();
  if (!claim.meta.changes) throw new ApiError(409, 'visit_changed', 'This visit changed; reload');
  await appendMessage(ctx, { workId: row.work_id, body: left ? `Left before being served: ${outcome}` : `Resolved at the desk: ${outcome}`, visibility: 'public', sourceMessageId: `walkup:${walkupId}:${left ? 'left' : 'resolved'}` });
  const work = await getWork(ctx, row.work_id);
  await transitionWork(ctx, row.work_id, work.revision, left ? 'cancel' : 'close', outcome);
  return visit(ctx, walkupId);
}
/** The desk's queue: who waits and for how long, who is being served, and the last resolved visits. */
export async function walkupQueue(ctx: WorkContext) {
  await staff(ctx);
  const w = ctx.principal.workspaceId;
  const rows = (await ctx.env.DB.prepare(`SELECT v.id,v.work_id,v.site,v.state,v.outcome,v.created_at,v.started_at,v.finished_at,u.name person,t.name taken_by FROM work_walkups v
    JOIN users u ON u.id=v.person_id LEFT JOIN users t ON t.id=v.taken_by WHERE v.workspace_id=? AND (v.state IN ('waiting','serving') OR v.finished_at>?)
    ORDER BY CASE v.state WHEN 'serving' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END,v.created_at LIMIT 100`).bind(w, new Date(Date.now() - 86_400_000).toISOString()).all()).results;
  return { items: rows };
}

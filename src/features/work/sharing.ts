import { departmentNotHrSql, departmentWorkBatch } from './department-spaces';
import type { Context, Hono } from "hono";
import type { AppEnv } from "../../platform/types";
import { ApiError, id, jsonBody, now } from "../../platform/http";
import { currentWorkPrincipal } from "./identity";
import { getWork, operator, type WorkContext, type WorkRecord } from "./core";

/** CHANNEL-009: request sharing and manager visibility. A share lets a named colleague read and reply to a normal
 * request's public thread; a manager reads, without replying, the public thread of requests for their direct and
 * indirect reports, following each person's current HR-fact manager at read time. Private notes, attachments and
 * HR or restricted requests are never shown through either door. */
const MAX_DEPTH = 20;
const activeShare = "EXISTS(SELECT 1 FROM work_shares s WHERE s.workspace_id=w.workspace_id AND s.work_id=w.id AND s.user_id=? AND s.revoked_at IS NULL)";
// Members whose current person record reports to the manager, directly or through the chain of current managers.
const reports = `WITH RECURSIVE reports(member_id,depth) AS (
    SELECT member_id,1 FROM work_people WHERE workspace_id=? AND manager_id=? AND active=1 AND merged_into IS NULL AND member_id IS NOT NULL AND binding_id IS NOT NULL
    UNION SELECT p.member_id,r.depth+1 FROM work_people p JOIN reports r ON p.manager_id=r.member_id
    WHERE p.workspace_id=? AND p.active=1 AND p.merged_into IS NULL AND p.member_id IS NOT NULL AND p.binding_id IS NOT NULL AND r.depth<${MAX_DEPTH})`;
const teamWork = `${reports} SELECT w.id,w.title,w.state,w.kind,w.created_at,w.updated_at,w.closed_at,w.revision,w.beneficiary_id,
    (SELECT name FROM work_people WHERE workspace_id=w.workspace_id AND member_id=w.beneficiary_id AND active=1) beneficiary_name
  FROM work_records w WHERE w.workspace_id=? AND w.sensitivity='normal' AND ${departmentNotHrSql('w')} AND w.beneficiary_id<>? AND w.beneficiary_id IN (SELECT member_id FROM reports)`;

function sharer(ctx: WorkContext, work: WorkRecord) {
  const me = ctx.principal.userId;
  if (work.requester_id !== me && work.beneficiary_id !== me) throw new ApiError(403, "share_forbidden", "Only the requester or the person it is for can share this request");
  if (work.sensitivity !== "normal" || work.department_kind==='hr') throw new ApiError(422, "share_sensitivity", "HR and restricted requests are never shared");
}

export async function shareWork(ctx: WorkContext, workId: string, input: Record<string, unknown>) {
  const work = await getWork(ctx, workId);
  sharer(ctx, work);
  const w = ctx.principal.workspaceId, email = typeof input.email === "string" ? input.email.trim() : "";
  // Named by work email, so sharing needs no member directory.
  const member = email && await ctx.env.DB.prepare("SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND m.active=1 AND lower(u.email)=lower(?)")
    .bind(w, email).first<{ id: string }>();
  if (!member) throw new ApiError(422, "share_target", "Share with the work email of a current member of this workspace");
  const userId = member.id;
  if ([work.requester_id, work.beneficiary_id].includes(userId)) throw new ApiError(422, "share_target", "This person already sees the request");
  const at = now(), shareId = id();
  await departmentWorkBatch(ctx,work,[
    ctx.env.DB.prepare("INSERT OR IGNORE INTO work_shares(id,workspace_id,work_id,user_id,shared_by,shared_at) VALUES(?,?,?,?,?,?)").bind(shareId, w, workId, userId, ctx.principal.userId, at),
    ctx.env.DB.prepare("INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()>0").bind(id(), w, ctx.principal.userId, "work.shared", workId, JSON.stringify({ userId, shareId }), at),
  ]);
  return listShares(ctx, workId);
}

export async function revokeShare(ctx: WorkContext, workId: string, userId: string) {
  const work = await getWork(ctx, workId), me = ctx.principal.userId, w = ctx.principal.workspaceId;
  if (work.requester_id !== me && work.beneficiary_id !== me && !operator(ctx.principal))
    throw new ApiError(403, "share_forbidden", "Only the requester, the person it is for or the service team can revoke a share");
  const at = now();
  const [revoked] = await ctx.env.DB.batch([
    ctx.env.DB.prepare("UPDATE work_shares SET revoked_by=?,revoked_at=? WHERE workspace_id=? AND work_id=? AND user_id=? AND revoked_at IS NULL").bind(me, at, w, workId, userId),
    ctx.env.DB.prepare("INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()>0").bind(id(), w, me, "work.share_revoked", workId, JSON.stringify({ userId }), at),
  ]);
  if (!revoked.meta.changes) throw new ApiError(404, "not_found", "No current share with this person");
  return listShares(ctx, workId);
}

/** Current and revoked shares, for the people who already read the whole request. */
export async function listShares(ctx: WorkContext, workId: string) {
  await getWork(ctx, workId);
  const rows = await ctx.env.DB.prepare(`SELECT s.user_id,u.name,s.shared_by,s.shared_at,s.revoked_by,s.revoked_at FROM work_shares s LEFT JOIN users u ON u.id=s.user_id
    WHERE s.workspace_id=? AND s.work_id=? ORDER BY s.shared_at,s.rowid`).bind(ctx.principal.workspaceId, workId).all();
  return { workId, items: rows.results };
}

/** The public-only view a shared colleague (who may reply) or a manager of the beneficiary (read-only) gets. */
export async function sharedView(ctx: WorkContext, workId: string) {
  const w = ctx.principal.workspaceId, me = ctx.principal.userId;
  const shared = await ctx.env.DB.prepare(`SELECT w.id,w.title,w.state,w.kind,w.created_at,w.updated_at,w.closed_at,w.revision FROM work_records w WHERE w.workspace_id=? AND w.id=? AND w.sensitivity='normal' AND ${departmentNotHrSql('w')} AND ${activeShare}`)
    .bind(w, workId, me).first<any>();
  const team = shared ? null : await ctx.env.DB.prepare(`${teamWork} AND w.id=?`).bind(w, me, w, w, me, workId).first<any>();
  const work = shared ? { ...shared, access: "shared", canReply: true } : team ? { ...team, access: "team", canReply: false } : null;
  if (!work) return null;
  // Who asked and who it is for, by name, as the requester sees them.
  const names = await ctx.env.DB.prepare(`SELECT w.requester_id,w.beneficiary_id,(SELECT name FROM users WHERE id=w.requester_id) requester_name,
    (SELECT name FROM users WHERE id=w.beneficiary_id) beneficiary_name FROM work_records w WHERE w.workspace_id=? AND w.id=?`).bind(w, workId).first();
  Object.assign(work, names);
  const messages = await ctx.env.DB.prepare("SELECT id,work_id,author_id,visibility,body,source_key,created_at FROM work_messages WHERE workspace_id=? AND work_id=? AND visibility='public' ORDER BY created_at,id").bind(w, workId).all();
  return { work: { ...work, participant: true }, messages: messages.results, attachments: [], progress: [] };
}

/** True when the reader holds a current share of this normal request: they may add public replies only. */
export async function sharedReplyAllowed(ctx: WorkContext, workId: string) {
  return Boolean(await ctx.env.DB.prepare(`SELECT 1 FROM work_records w WHERE w.workspace_id=? AND w.id=? AND w.sensitivity='normal' AND ${departmentNotHrSql('w')} AND ${activeShare}`)
    .bind(ctx.principal.workspaceId, workId, ctx.principal.userId).first());
}

export const sharedListClause = `${departmentNotHrSql('work_records')} AND EXISTS(SELECT 1 FROM work_shares s WHERE s.workspace_id=work_records.workspace_id AND s.work_id=work_records.id AND s.user_id=? AND s.revoked_at IS NULL)`;

export async function teamRequests(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  const w = ctx.principal.workspaceId, me = ctx.principal.userId;
  const rows = await ctx.env.DB.prepare(`${teamWork} ORDER BY w.updated_at DESC LIMIT 200`).bind(w, me, w, w, me).all();
  return { items: rows.results };
}

export function registerSharingRoutes(app: Hono<AppEnv>) {
  const ctx = (c: Context<AppEnv>): WorkContext => ({ env: c.env, principal: c.get("principal") });
  app.get("/team-requests", async (c) => c.json(await teamRequests(ctx(c))));
  app.get("/work/:id/shares", async (c) => c.json(await listShares(ctx(c), c.req.param("id"))));
  app.post("/work/:id/shares", async (c) => c.json(await shareWork(ctx(c), c.req.param("id"), await jsonBody(c)), 201));
  app.post("/work/:id/shares/:userId/revoke", async (c) => c.json(await revokeShare(ctx(c), c.req.param("id"), c.req.param("userId"))));
}

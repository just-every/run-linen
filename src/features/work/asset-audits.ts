import { assetEvent } from './asset-history';
import type { Hono } from "hono";
import type { AppEnv } from "../../platform/types";
import { ApiError, id, jsonBody, now, requiredString } from "../../platform/http";
import { currentWorkPrincipal } from "./identity";
import { permit, type WorkContext } from "./core";

/** ASSET-010: physical audits by location. Starting an audit snapshots the devices expected on the shelf there;
 * scans reconcile against that snapshot; completion opens one follow-up per expected device not scanned. */
export const shelfStates = ["stock", "reserved", "returned", "retired"] as const;
interface Expected { assetId: string; serial: string; assetTag: string | null; state: string }
interface Audit {
  id: string; location: string; state: string; expected_json: string; started_by: string; started_at: string;
  completed_by: string | null; completed_at: string | null; revision: number;
}
const locationKey = (location: string) => location.trim().replace(/\s+/g, " ").toLowerCase();
const label = (e: Expected) => e.assetTag ? `${e.assetTag} (${e.serial})` : e.serial;
const auditor = (ctx: WorkContext) => permit(ctx, ["owner", "operator"]);

export async function startAssetAudit(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  auditor(ctx);
  const location = requiredString(input.location, "location", 200), key = locationKey(location), w = ctx.principal.workspaceId;
  const devices = (await ctx.env.DB.prepare(
    `SELECT id,serial,asset_tag,state,location FROM work_assets WHERE workspace_id=? AND state IN (${shelfStates.map(() => "?").join(",")}) ORDER BY COALESCE(asset_tag,serial)`,
  ).bind(w, ...shelfStates).all<{ id: string; serial: string; asset_tag: string | null; state: string; location: string | null }>()).results
    .filter((a) => a.location && locationKey(a.location) === key);
  if (!devices.length) throw new ApiError(422, "audit_empty", "No device is recorded on the shelf at this location");
  const expected: Expected[] = devices.map((a) => ({ assetId: a.id, serial: a.serial, assetTag: a.asset_tag, state: a.state }));
  const auditId = id(), at = now();
  const saved = await ctx.env.DB.batch([
    ctx.env.DB.prepare("INSERT OR IGNORE INTO work_asset_audits(id,workspace_id,location,location_key,expected_json,started_by,started_at) VALUES(?,?,?,?,?,?,?)")
      .bind(auditId, w, location, key, JSON.stringify(expected), ctx.principal.userId, at),
    ctx.env.DB.prepare("INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()>0")
      .bind(id(), w, ctx.principal.userId, "work.asset_audit_started", auditId, JSON.stringify({ location, expected: expected.length }), at),
  ]);
  if (!saved[0].meta.changes) throw new ApiError(409, "audit_open", "An audit of this location is already open");
  return readAssetAudit(ctx, auditId);
}

async function loadAudit(ctx: WorkContext, auditId: string) {
  await currentWorkPrincipal(ctx);
  auditor(ctx);
  const audit = await ctx.env.DB.prepare("SELECT * FROM work_asset_audits WHERE workspace_id=? AND id=?")
    .bind(ctx.principal.workspaceId, auditId).first<Audit>();
  if (!audit) throw new ApiError(404, "not_found", "Audit not found");
  return audit;
}

/** A scan code matches an asset tag or serial, ignoring case and surrounding space. A repeat scan is recorded once. */
export async function scanAssetAudit(ctx: WorkContext, auditId: string, input: Record<string, unknown>) {
  const audit = await loadAudit(ctx, auditId), w = ctx.principal.workspaceId;
  if (audit.state !== "open") throw new ApiError(409, "audit_completed", "This audit is complete; start a new audit to scan again");
  const code = requiredString(input.code, "code", 200).toUpperCase();
  const expected = (JSON.parse(audit.expected_json) as Expected[])
    .find((e) => e.serial.toUpperCase() === code || e.assetTag?.toUpperCase() === code);
  const known = expected ? null : await ctx.env.DB.prepare(
    "SELECT id,location,state FROM work_assets WHERE workspace_id=? AND (UPPER(asset_tag)=? OR UPPER(serial)=?) LIMIT 1",
  ).bind(w, code, code).first<{ id: string; location: string | null; state: string }>();
  const outcome = expected ? "found" : known ? "elsewhere" : "unknown";
  const saved = await ctx.env.DB.prepare(
    "INSERT OR IGNORE INTO work_asset_audit_scans(id,workspace_id,audit_id,code,asset_id,outcome,scanned_by,scanned_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM work_asset_audits WHERE workspace_id=? AND id=? AND state='open')",
  ).bind(id(), w, auditId, code, expected?.assetId ?? known?.id ?? null, outcome, ctx.principal.userId, now(), w, auditId).run();
  if (!saved.meta.changes && !(await ctx.env.DB.prepare("SELECT 1 FROM work_asset_audit_scans WHERE workspace_id=? AND audit_id=? AND code=?").bind(w, auditId, code).first()))
    throw new ApiError(409, "audit_completed", "This audit is complete; start a new audit to scan again");
  return { code, outcome, repeat: !saved.meta.changes, ...(known ? { recordedLocation: known.location, recordedState: known.state } : {}), audit: await readAssetAudit(ctx, auditId) };
}

/** Completion is atomic: the audit closes, found devices are marked observed, and each expected device
 * without a scan opens a follow-up request assigned to the completing auditor and linked to the device. */
export async function completeAssetAudit(ctx: WorkContext, auditId: string, input: Record<string, unknown>) {
  const audit = await loadAudit(ctx, auditId), w = ctx.principal.workspaceId, db = ctx.env.DB;
  if (audit.state !== "open") throw new ApiError(409, "audit_completed", "This audit is already complete");
  if (input.revision !== audit.revision) throw new ApiError(409, "revision_conflict", "Audit changed; reload before completing");
  const report = await readAssetAudit(ctx, auditId), at = now(), completion = id(), me = ctx.principal.userId;
  const completed = "EXISTS(SELECT 1 FROM work_asset_audits WHERE workspace_id=? AND id=? AND completion_id=?)";
  const missing = report.missing.map((e) => ({ ...e, workId: id() }));
  const observed = await Promise.all(report.found.map(async e=>({assetId:e.assetId,
    prior:await db.prepare('SELECT observed_at,person_id FROM work_assets WHERE workspace_id=? AND id=?')
      .bind(w,e.assetId).first<{observed_at:string|null;person_id:string|null}>()})));
  const result = await db.batch([
    db.prepare("UPDATE work_asset_audits SET state='completed',completed_by=?,completed_at=?,completion_id=?,revision=revision+1 WHERE workspace_id=? AND id=? AND state='open' AND revision=? AND (SELECT COUNT(*) FROM work_asset_audit_scans WHERE workspace_id=? AND audit_id=?)=?")
      .bind(me, at, completion, w, auditId, audit.revision, w, auditId, report.scans.length),
    ...observed.flatMap(({assetId,prior}) => [
      // A concurrent newer observation is not overwritten or given an invented previous value.
      db.prepare(`UPDATE work_assets SET observed_at=? WHERE workspace_id=? AND id=? AND observed_at IS ? AND ${completed}`)
        .bind(at,w,assetId,prior?.observed_at ?? null,w,auditId,completion),
      assetEvent(ctx,assetId,'work.asset_audit_observed',{observedAt:prior?.observed_at ?? null},
        {observedAt:at,auditId},at,prior?.person_id ? [prior.person_id] : []),
    ]),
    ...missing.flatMap((e) => [
      db.prepare(`INSERT INTO work_records(id,workspace_id,requester_id,beneficiary_id,kind,title,sensitivity,assignee_id,created_at,updated_at,context_json,dedup_key) SELECT ?,?,?,?,'request',?,'normal',?,?,?,?,? WHERE ${completed}`)
        .bind(e.workId, w, me, me, `Find missing device ${label(e)}`, me, at, at, JSON.stringify({ assetAuditId: auditId, assetId: e.assetId, location: audit.location }), `asset-audit:${auditId}:${e.assetId}`, w, auditId, completion),
      db.prepare(`INSERT INTO work_messages(id,workspace_id,work_id,author_id,visibility,body,source_key,created_at) SELECT ?,?,?,?,'public',?,'initial',? WHERE ${completed}`)
        .bind(id(), w, e.workId, me, `The physical audit of ${audit.location} completed ${at} expected ${label(e)} (recorded ${e.state}) on the shelf, but it was not scanned. Find the device, or record where it is or that it is missing with evidence on the device.`, at, w, auditId, completion),
      db.prepare(`INSERT INTO work_links(id,workspace_id,work_id,kind,target_id,created_by,created_at) SELECT ?,?,?,'asset',?,?,? WHERE ${completed}`)
        .bind(id(), w, e.workId, e.assetId, me, at, w, auditId, completion),
      assetEvent(ctx,e.assetId,'work.asset_linked',{}, {link:{kind:'ticket',id:e.workId}},at),
      db.prepare(`INSERT INTO work_asset_audit_followups(workspace_id,audit_id,asset_id,work_id) SELECT ?,?,?,? WHERE ${completed}`)
        .bind(w, auditId, e.assetId, e.workId, w, auditId, completion),
    ]),
    db.prepare(`INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE ${completed}`)
      .bind(id(), w, me, "work.asset_audit_completed", auditId, JSON.stringify({ location: audit.location, expected: report.expected.length, found: report.found.length, missing: missing.map((e) => e.assetId) }), at, w, auditId, completion),
  ]);
  if (!result[0].meta.changes) throw new ApiError(409, "revision_conflict", "Audit changed; reload before completing");
  return readAssetAudit(ctx, auditId);
}

export async function readAssetAudit(ctx: WorkContext, auditId: string) {
  const audit = await loadAudit(ctx, auditId), w = ctx.principal.workspaceId;
  const [scans, followups] = await Promise.all([
    ctx.env.DB.prepare("SELECT code,asset_id,outcome,scanned_by,scanned_at FROM work_asset_audit_scans WHERE workspace_id=? AND audit_id=? ORDER BY scanned_at,rowid").bind(w, auditId).all<{ code: string; asset_id: string | null; outcome: string }>(),
    ctx.env.DB.prepare("SELECT asset_id,work_id FROM work_asset_audit_followups WHERE workspace_id=? AND audit_id=?").bind(w, auditId).all<{ asset_id: string; work_id: string }>(),
  ]);
  const expected = JSON.parse(audit.expected_json) as Expected[], scanned = new Set(scans.results.map((s) => s.asset_id));
  const followup = new Map(followups.results.map((f) => [f.asset_id, f.work_id]));
  const { expected_json, ...record } = audit;
  return {
    ...record,
    expected,
    found: expected.filter((e) => scanned.has(e.assetId)),
    missing: expected.filter((e) => !scanned.has(e.assetId)).map((e) => ({ ...e, followUpWorkId: followup.get(e.assetId) ?? null })),
    unexpected: scans.results.filter((s) => s.outcome !== "found"),
    scans: scans.results,
  };
}

export async function listAssetAudits(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  auditor(ctx);
  const rows = (await ctx.env.DB.prepare("SELECT id FROM work_asset_audits WHERE workspace_id=? ORDER BY started_at DESC LIMIT 20")
    .bind(ctx.principal.workspaceId).all<{ id: string }>()).results;
  return { items: await Promise.all(rows.map((r) => readAssetAudit(ctx, r.id))) };
}

export function registerAssetAuditRoutes(app: Hono<AppEnv>) {
  app.get("/asset-audits", async (c) => c.json(await listAssetAudits({ env: c.env, principal: c.get("principal") })));
  app.post("/asset-audits", async (c) => c.json(await startAssetAudit({ env: c.env, principal: c.get("principal") }, await jsonBody(c)), 201));
  app.get("/asset-audits/:id", async (c) => c.json(await readAssetAudit({ env: c.env, principal: c.get("principal") }, c.req.param("id"))));
  app.post("/asset-audits/:id/scans", async (c) => c.json(await scanAssetAudit({ env: c.env, principal: c.get("principal") }, c.req.param("id"), await jsonBody(c))));
  app.post("/asset-audits/:id/complete", async (c) => c.json(await completeAssetAudit({ env: c.env, principal: c.get("principal") }, c.req.param("id"), await jsonBody(c))));
}

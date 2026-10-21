import { Buffer } from 'node:buffer';
import type { Context, Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, id, now } from '../../platform/http';
import { canonicalJson, sha256 } from '../../modules/import-kit/src/d1/index';
import { importBody } from './body';
import { readCsv } from './csv';
import { owner, type AdoptionContext } from './core';

/**
 * MIGRATE-004: a Snipe-IT asset export (Custom Asset Report or asset list CSV)
 * becomes Linen serialized devices. The owner reviews a dry run that changes
 * nothing, decides every serial conflict, then applies exactly that review in
 * one atomic write. Each device is recorded the way "Record a device" records an
 * observed device; Snipe-IT custody is never imported as Linen custody.
 */
// One review stays well inside D1's 2 MB limit for each bound JSON payload below.
const FORMAT = 'linen-snipeit-assets-csv-v1', MAX_BYTES = 2 * 1024 * 1024, MAX_ROWS = 1000;
const MAPPED = new Set(['Asset Tag', 'Serial', 'Location', 'Status']);
const OMISSIONS = [
  { reason: 'Each device is recorded as observed stock with a "record" custody event, as Record a device does. Snipe-IT check-outs, assignees and checkout dates are not imported as custody; assign devices in Linen with a receipt.' },
  { reason: 'The export file is not retained. Models, categories, purchase, supplier, warranty, notes and custom fields stay in Snipe-IT.' },
];

const requireInput: (ok: unknown, message: string) => asserts ok = (ok, message) => { if (!ok) throw new ApiError(422, 'snipeit_input', message); };
/** Serials compare after trimming surrounding whitespace, ignoring ASCII letter case (SQLite lower()). */
const serialKey = (serial: string) => serial.replace(/[A-Z]/g, c => c.toLowerCase());
const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

interface Row { row: number; assetTag: string; serial: string; key: string; location: string | null; status: string | null }
interface Conflict { serial: string; key: string; assetTags: string[]; linenAssetIds: string[]; resolution: string | null }

function readExport(file: unknown) {
  requireInput(file && typeof file === 'object' && !Array.isArray(file), 'Supply the Snipe-IT CSV export as file: {name, base64}');
  const { name, base64 } = file as { name?: unknown; base64?: unknown };
  requireInput(typeof name === 'string' && /^[\w .-]{1,120}$/.test(name), 'A simple export filename is required');
  requireInput(typeof base64 === 'string', 'Exact export bytes are required');
  const bytes = Buffer.from(base64, 'base64');
  requireInput(bytes.toString('base64') === base64, 'Canonical base64 required');
  requireInput(bytes.length > 0 && bytes.length <= MAX_BYTES, 'Supply one Snipe-IT CSV export of at most 2 MiB');
  let text = '';
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); }
  catch { requireInput(false, 'The export must be UTF-8 text'); }
  const records = readCsv(text, ['Asset Tag', 'Serial'], requireInput);
  requireInput(records.length > 0 && records.length <= MAX_ROWS, 'Supply 1–1,000 asset rows per reviewed import');
  const rows: Row[] = [], rejected: { row: number; assetTag: string; reason: string }[] = [], tags = new Set<string>();
  records.forEach((record, index) => {
    const row = index + 1, assetTag = record['Asset Tag'].trim(), serial = record.Serial.trim();
    const location = record.Location?.trim() || null, status = record.Status?.trim() || null;
    requireInput(assetTag && assetTag.length <= 200, `Row ${row} needs its Snipe-IT asset tag`);
    requireInput(!tags.has(assetTag.toLowerCase()), `Asset tag ${assetTag} appears twice; Snipe-IT asset tags are unique`);
    tags.add(assetTag.toLowerCase());
    requireInput((location?.length ?? 0) <= 200 && (status?.length ?? 0) <= 200, `Row ${row} has a location or status longer than 200 characters`);
    if (!serial) rejected.push({ row, assetTag, reason: 'No serial: Linen records serialized devices only' });
    else if (!/^[\x20-\x7E]{1,200}$/.test(serial)) rejected.push({ row, assetTag, reason: 'Serials are imported only as 1–200 printable ASCII characters' });
    else rows.push({ row, assetTag, serial, key: serialKey(serial), location, status });
  });
  const omissions = [...OMISSIONS, ...Object.keys(records[0]).filter(field => !MAPPED.has(field)).map(field => ({ field, reason: 'Not imported' }))];
  return { name, hash: sha256(bytes), rows, rejected, omissions };
}

function readResolutions(value: unknown) {
  const resolutions = new Map<string, string>();
  if (value === undefined) return resolutions;
  requireInput(value && typeof value === 'object' && !Array.isArray(value), 'resolutions must map each conflicting serial to an asset tag or "skip"');
  for (const [serial, choice] of Object.entries(value)) {
    requireInput(typeof choice === 'string' && choice.trim() && choice.length <= 200 && serial.trim(), 'Each resolution names an asset tag or "skip"');
    const key = serialKey(serial.trim());
    requireInput(!resolutions.has(key), `Serial ${serial.trim()} has two resolutions`);
    resolutions.set(key, choice.trim());
  }
  return resolutions;
}

/** Read-only review: the same computation backs the dry run and the apply. */
async function review(ctx: AdoptionContext, body: Record<string, unknown>) {
  await owner(ctx);
  const file = readExport(body.file), resolutions = readResolutions(body.resolutions), groups = new Map<string, Row[]>();
  for (const row of file.rows) groups.set(row.key, [...(groups.get(row.key) ?? []), row]);
  const existing = (await ctx.env.DB.prepare('SELECT id,lower(serial) AS key FROM work_assets WHERE workspace_id=? AND lower(serial) IN (SELECT value FROM json_each(?)) ORDER BY id')
    .bind(ctx.principal.workspaceId, JSON.stringify([...groups.keys()])).all<{ id: string; key: string }>()).results;
  const conflicts: Conflict[] = [], ready: Row[] = [];
  for (const [key, group] of groups) {
    const linenAssetIds = existing.filter(asset => asset.key === key).map(asset => asset.id);
    if (group.length === 1 && !linenAssetIds.length) { ready.push(group[0]); continue; }
    const choice = resolutions.get(key), kept = choice === undefined || choice === 'skip' ? undefined : group.find(row => sameTag(row.assetTag, choice));
    if (choice !== undefined && choice !== 'skip') {
      requireInput(kept, `Resolve serial ${group[0].serial} with one of its asset tags (${group.map(row => row.assetTag).join(', ')}) or "skip"`);
      requireInput(!linenAssetIds.length, `Serial ${group[0].serial} already belongs to a Linen device; "skip" keeps Linen's device and custody history`);
    }
    if (kept) ready.push(kept);
    conflicts.push({ serial: group[0].serial, key, assetTags: group.map(row => row.assetTag), linenAssetIds, resolution: kept ? kept.assetTag : choice ?? null });
  }
  for (const [key] of resolutions) requireInput(conflicts.some(conflict => conflict.key === key), `Serial ${key} has no conflict to resolve`);
  ready.sort((a, b) => a.row - b.row);
  const summary = { ready: ready.map(({ row, assetTag, serial, location, status }) => ({ row, assetTag, serial, location, status })), conflicts: conflicts.map(({ key, ...conflict }) => conflict), rejected: file.rejected, omissions: file.omissions };
  const fingerprint = sha256(canonicalJson({ format: FORMAT, file: { name: file.name, sha256: file.hash }, ...summary }));
  const counts = { rows: file.rows.length + file.rejected.length, ready: ready.length, conflicts: conflicts.length, unresolved: conflicts.filter(conflict => !conflict.resolution).length, rejected: file.rejected.length };
  return { file, ready, report: { fingerprint, counts, conflicts: summary.conflicts, rejected: file.rejected, omissions: file.omissions } };
}

async function apply(ctx: AdoptionContext, body: Record<string, unknown>) {
  const { file, ready, report } = await review(ctx, body);
  if (body.reviewedFingerprint !== report.fingerprint) throw new ApiError(409, 'snipeit_review_changed', 'The export, its resolutions or Linen devices changed since your review; run the dry run again');
  if (report.counts.unresolved) throw new ApiError(409, 'snipeit_conflicts_unresolved', 'Resolve every serial conflict in the dry run before applying');
  requireInput(body.acceptOmissions === true, 'Review and explicitly accept the listed omissions');
  requireInput(ready.length > 0, 'Nothing to import after the resolved conflicts');
  const db = ctx.env.DB, w = ctx.principal.workspaceId, actor = ctx.principal.userId, at = now();
  const items = ready.map(row => ({
    id: id(), eventId: id(), key: row.key, serial: row.serial, assetTag: row.assetTag, location: row.location,
    source: `Snipe-IT export ${file.name} · asset tag ${row.assetTag}`,
    evidence: `Recorded from Snipe-IT export ${file.name} (SHA-256 ${file.hash}) row ${row.row}, asset tag ${row.assetTag}${row.status ? `, Snipe-IT status "${row.status}"` : ''}. Snipe-IT custody is not imported.`,
  }));
  const assetJson = JSON.stringify(items.map(({ evidence, ...asset }) => asset)), custodyJson = JSON.stringify(items.map(({ id: assetId, eventId, evidence }) => ({ id: assetId, eventId, evidence })));
  const currentOwner = `EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) role WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND role.value='owner')`;
  let created: number;
  try {
    // One transaction: a serial that appeared since review (any letter case) nulls the
    // serial and fails the whole write; a lost owner role writes nothing at all.
    const [assets] = await db.batch([
      db.prepare(`INSERT INTO work_assets(id,workspace_id,serial,state,location,source,observed_at,latest_event_id,asset_tag)
        SELECT json_extract(e.value,'$.id'),?,CASE WHEN EXISTS(SELECT 1 FROM work_assets a WHERE a.workspace_id=? AND lower(a.serial)=json_extract(e.value,'$.key')) THEN NULL ELSE json_extract(e.value,'$.serial') END,
          'stock',json_extract(e.value,'$.location'),json_extract(e.value,'$.source'),?,json_extract(e.value,'$.eventId'),json_extract(e.value,'$.assetTag')
        FROM json_each(?) e WHERE ${currentOwner}`).bind(w, w, at, assetJson, w, actor),
      db.prepare(`INSERT INTO work_custody(id,workspace_id,asset_id,actor_id,kind,person_id,evidence,created_at)
        SELECT json_extract(e.value,'$.eventId'),?,json_extract(e.value,'$.id'),?,'record',NULL,json_extract(e.value,'$.evidence'),?
        FROM json_each(?) e WHERE ${currentOwner}`).bind(w, actor, at, custodyJson, w, actor),
      db.prepare(`INSERT INTO audit_events SELECT ?,?,?,'adoption.snipeit.import',?,?,? WHERE ${currentOwner}`)
        .bind(id(), w, actor, file.hash, JSON.stringify({ file: file.name, created: items.length, conflicts: report.counts.conflicts, rejected: report.counts.rejected }), at, w, actor),
    ]);
    created = assets.meta.changes;
  } catch (error) {
    if (/NOT NULL constraint failed: work_assets\.serial|UNIQUE constraint failed: work_assets/.test(String(error)))
      throw new ApiError(409, 'snipeit_review_changed', 'A serial in this review now belongs to a Linen device; run the dry run again');
    throw error;
  }
  if (created !== items.length) throw new ApiError(403, 'owner_required', 'Only a current owner can import devices');
  return { created, conflicts: report.counts.conflicts, rejected: report.counts.rejected, assets: items.map(({ id: assetId, serial, assetTag }) => ({ id: assetId, serial, assetTag })) };
}

export function registerSnipeitImportRoutes(app: Hono<AppEnv>) {
  const ctx = (c: Context<AppEnv>): AdoptionContext => ({ env: c.env, principal: c.get('principal') });
  app.post('/adoption/snipeit-imports/dry-run', async c => { c.header('Cache-Control', 'private, no-store'); return c.json((await review(ctx(c), await importBody(c.req.raw))).report); });
  app.post('/adoption/snipeit-imports', async c => { c.header('Cache-Control', 'private, no-store'); return c.json(await apply(ctx(c), await importBody(c.req.raw)), 201); });
}

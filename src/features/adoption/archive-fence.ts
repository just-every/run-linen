import { ApiError, id } from '../../platform/http';
import type { AdoptionContext } from './core';

type AdoptionMarker = { identity_hash: string; created_at: string };
type WorkMarker = { person_id: string; created_at: string };
export type HistoryMarker = { digest: string; created_at: string };
export interface ArchivePrivacyState {
  rows: [AdoptionMarker[], WorkMarker[], HistoryMarker[]];
  json: string;
}

const markers = [
  ['adoption_tombstones', 'identity_hash'],
  ['work_erasure', 'person_id'],
  ['history_identity_tombstones', 'digest'],
] as const;
const markerSelect = (table: string, key: string) =>
  `SELECT ${key},created_at FROM ${table} WHERE workspace_id=? ORDER BY ${key}`;
const markerJson = markers.map(([table, key]) =>
  `json((SELECT json_group_array(json_object('${key}',${key},'created_at',created_at)) FROM (${markerSelect(table, key)})))`);
const currentSnapshotSql = `json_array(${markerJson.join(',')})`;

/** These ordered rows are exactly archivePrivacyRevision's HMAC input. A D1
 * batch captures one committed privacy state across all three inventories. */
export async function captureArchivePrivacyState(ctx: AdoptionContext): Promise<ArchivePrivacyState> {
  const results = await ctx.env.DB.batch<AdoptionMarker | WorkMarker | HistoryMarker>(
    markers.map(([table, key]) => ctx.env.DB.prepare(markerSelect(table, key)).bind(ctx.principal.workspaceId)));
  const rows: ArchivePrivacyState['rows'] = [
    results[0].results as AdoptionMarker[], results[1].results as WorkMarker[], results[2].results as HistoryMarker[],
  ];
  return { rows, json: JSON.stringify(rows) };
}

interface Fence { runId: string; snapshot: () => string }
const fences = new WeakMap<AdoptionContext['env'], Fence>();

/** Give each apply request its own env object; contexts cloned by a domain
 * retain that object and therefore the same request-local privacy fence. */
export async function withArchiveFence<T>(
  ctx: AdoptionContext, runId: string, snapshotGetter: () => string, action: () => Promise<T>,
): Promise<T> {
  const previous = fences.get(ctx.env);
  fences.set(ctx.env, { runId, snapshot: snapshotGetter });
  try { return await action(); }
  finally {
    if (previous) fences.set(ctx.env, previous);
    else fences.delete(ctx.env);
  }
}

/** The CHECK guard and domain writes commit or roll back together. Comparing
 * complete ordered arrays catches additions, removals and changed timestamps. */
export async function archiveMutationBatch<T = unknown>(
  ctx: AdoptionContext, statements: D1PreparedStatement[],
): Promise<D1Result<T>[]> {
  const fence = fences.get(ctx.env), db = ctx.env.DB;
  if (!fence) return db.batch<T>(statements);
  const guard = id(), w = ctx.principal.workspaceId;
  const acquire = db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN
    ${currentSnapshotSql}=?
    AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r
      WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')
    AND EXISTS(SELECT 1 FROM adoption_imports WHERE workspace_id=? AND id=?
      AND state<>'erased' AND input_erased_at IS NULL)
    THEN 1 ELSE 0 END)`)
    .bind(guard, w, w, w, fence.snapshot(), w, ctx.principal.userId, w, fence.runId);
  try {
    const results = await db.batch<T>([
      acquire, ...statements,
      db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard),
    ]);
    return results.slice(1, -1);
  } catch (error) {
    if (/CHECK constraint failed/i.test(String(error)))
      throw new ApiError(409, 'erasure_changed_since_review', 'Privacy or restore authority changed since review');
    throw error;
  }
}

export async function archiveMutationRun<T = Record<string, unknown>>(
  ctx: AdoptionContext, statement: D1PreparedStatement,
): Promise<D1Result<T>> {
  if (!fences.has(ctx.env)) return statement.run<T>();
  return (await archiveMutationBatch<T>(ctx, [statement]))[0];
}

/** Advance only after this request's guarded INSERT OR IGNORE succeeds. Never
 * recapture the database: doing so could accept another request's erasure. */
export function advanceHistoryTombstone(snapshot: ArchivePrivacyState, row: HistoryMarker): ArchivePrivacyState {
  if (snapshot.rows[2].some(existing => existing.digest === row.digest)) return snapshot;
  const history = [...snapshot.rows[2], { digest: row.digest, created_at: row.created_at }]
    .sort((a, b) => a.digest < b.digest ? -1 : a.digest > b.digest ? 1 : 0);
  const rows: ArchivePrivacyState['rows'] = [snapshot.rows[0], snapshot.rows[1], history];
  return { rows, json: JSON.stringify(rows) };
}

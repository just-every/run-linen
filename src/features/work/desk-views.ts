import { ApiError, id, now, requiredString } from '../../platform/http';
import { currentWorkPrincipal } from './identity';
import { listWork, permit, type WorkContext, type WorkFilter } from './core';

/** DESK-001: saved and shared queue views. An agent saves filters (state, owner, priority, type, group) and a sort under
 * a name, private to them or shared with every agent in the workspace. Running a view never widens what its reader
 * may read: it narrows the reader's own queue. Only the view's creator or the workspace owner removes it. */
interface ViewRow { id: string; owner_id: string; name: string; filters_json: string; sort: string; shared: number; created_at: string; updated_at: string }
const choices = {
  state: ['open', 'closed'], assignee: ['me', 'none'], priority: ['P1', 'P2', 'P3', 'P4'],
  kind: ['incident', 'service_request', 'question', 'request'], sort: ['updated', 'created', 'oldest', 'priority'],
} as const;

function viewFilters(value: unknown) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(422, 'view_filters', 'Filters must be an object');
  const out: Record<string, string> = {};
  for (const [key, chosen] of Object.entries(value)) {
    if (chosen === null || chosen === '' || chosen === 'any') continue;
    if (key === 'groupId' && typeof chosen === 'string') { out.groupId = chosen; continue; }
    const allowed = (choices as Record<string, readonly string[]>)[key];
    if (key === 'sort' || !allowed || !allowed.includes(chosen as string)) throw new ApiError(422, 'view_filters', `Unknown filter ${key}=${String(chosen)}`);
    out[key] = chosen as string;
  }
  return out;
}

const shape = (row: ViewRow, me: string) => ({
  id: row.id, name: row.name, filters: JSON.parse(row.filters_json), sort: row.sort, shared: Boolean(row.shared),
  mine: row.owner_id === me, ownerId: row.owner_id, createdAt: row.created_at, updatedAt: row.updated_at,
});

async function agent(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'operator', 'hr']);
}

export async function listViews(ctx: WorkContext) {
  await agent(ctx);
  const rows = (await ctx.env.DB.prepare('SELECT * FROM work_views WHERE workspace_id=? AND (owner_id=? OR shared=1) ORDER BY name,created_at')
    .bind(ctx.principal.workspaceId, ctx.principal.userId).all<ViewRow>()).results;
  return { items: rows.map((r) => shape(r, ctx.principal.userId)) };
}

async function readView(ctx: WorkContext, viewId: string) {
  const row = await ctx.env.DB.prepare('SELECT * FROM work_views WHERE workspace_id=? AND id=? AND (owner_id=? OR shared=1)')
    .bind(ctx.principal.workspaceId, viewId, ctx.principal.userId).first<ViewRow>();
  if (!row) throw new ApiError(404, 'view_not_found', 'Saved view not found');
  return row;
}

export async function saveView(ctx: WorkContext, body: Record<string, unknown>) {
  await agent(ctx);
  const name = requiredString(body.name, 'name', 120), filters = viewFilters(body.filters);
  const sort = body.sort === undefined ? 'updated' : String(body.sort);
  if (!choices.sort.includes(sort as never)) throw new ApiError(422, 'view_sort', 'Sort by updated, created, oldest or priority');
  if (filters.groupId && !await ctx.env.DB.prepare('SELECT 1 FROM work_groups WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, filters.groupId).first())
    throw new ApiError(422, 'view_filters', 'Unknown agent group');
  const viewId = id(), t = now();
  try {
    await ctx.env.DB.prepare('INSERT INTO work_views VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(viewId, ctx.principal.workspaceId, ctx.principal.userId, name, JSON.stringify(filters), sort, Number(body.shared === true), t, t).run();
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new ApiError(409, 'view_exists', 'You already have a view with this name');
    throw error;
  }
  return shape(await readView(ctx, viewId), ctx.principal.userId);
}

export async function removeView(ctx: WorkContext, viewId: string) {
  await agent(ctx);
  const row = await readView(ctx, viewId);
  if (row.owner_id !== ctx.principal.userId && !ctx.principal.roles.includes('owner'))
    throw new ApiError(403, 'view_forbidden', 'Only the agent who saved this view or the workspace owner removes it');
  await ctx.env.DB.prepare('DELETE FROM work_views WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, viewId).run();
  return listViews(ctx);
}

/** The view's tickets, read with the reader's own scope. */
export async function runView(ctx: WorkContext, viewId: string) {
  await agent(ctx);
  const row = await readView(ctx, viewId);
  return { view: shape(row, ctx.principal.userId), items: await listWork(ctx, { ...JSON.parse(row.filters_json), sort: row.sort } as WorkFilter) };
}

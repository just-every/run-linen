import { ApiError } from '../../platform/http';
import type { WorkContext } from './core';

/** CATALOG-003: an item's team task plan. Tasks are ordered by `after` (earlier task keys, or `automated` for the
 * item's own connector step); tasks that share no ordering run in parallel. Due offsets are elapsed hours from the
 * moment the request is recorded. A plan is configuration: it grants no authority and carries no personal data. */
export type CatalogTask = { key: string; title: string; groupId: string; after: string[]; dueHours: number };
export const AUTOMATED_STEP = 'automated';
const invalid = (message: string): never => { throw new ApiError(422, 'catalog_tasks_invalid', message); };
const keys = ['key', 'title', 'groupId', 'after', 'dueHours'];

/** Structural validation, shared with archive restore (where the groups of another workspace need not exist). */
export function checkTaskPlan(value: unknown): CatalogTask[] {
  if (!Array.isArray(value) || value.length > 20) return invalid('A task plan is a list of at most 20 tasks');
  const seen = new Set<string>(), tasks: CatalogTask[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid('Each task must be an object');
    for (const key of Object.keys(raw)) if (!keys.includes(key)) return invalid(`Task contains an unknown property: ${key}`);
    const task = raw as Record<string, unknown>;
    if (typeof task.key !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(task.key) || task.key === AUTOMATED_STEP || seen.has(task.key))
      return invalid('Each task needs its own short key of lowercase letters, digits and hyphens');
    if (typeof task.title !== 'string' || !task.title.trim() || task.title.length > 200) return invalid('Each task needs a title of at most 200 characters');
    if (typeof task.groupId !== 'string' || !task.groupId) return invalid('Each task names the team (agent group) that does it');
    if (!Number.isInteger(task.dueHours) || (task.dueHours as number) < 1 || (task.dueHours as number) > 8760) return invalid('Due offsets are whole elapsed hours from 1 to 8760');
    const after = task.after === undefined ? [] : task.after;
    if (!Array.isArray(after) || after.length > 20 || new Set(after).size !== after.length || after.some(k => typeof k !== 'string' || (k !== AUTOMATED_STEP && !seen.has(k))))
      return invalid('A task can only follow the automated step or tasks listed before it');
    seen.add(task.key);
    tasks.push({ key: task.key, title: task.title.trim(), groupId: task.groupId, after: after as string[], dueHours: task.dueHours as number });
  }
  return tasks;
}

export async function normalizeTaskPlan(ctx: WorkContext, value: unknown): Promise<CatalogTask[]> {
  const tasks = checkTaskPlan(value);
  const groups = new Set((await ctx.env.DB.prepare('SELECT id FROM work_groups WHERE workspace_id=?').bind(ctx.principal.workspaceId).all<{ id: string }>()).results.map(g => g.id));
  if (tasks.some(t => !groups.has(t.groupId))) return invalid('Every task must name an existing agent group');
  return tasks;
}

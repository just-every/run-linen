import type { Context, Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, jsonBody, requiredString } from '../../platform/http';
import { currentWorkPrincipal } from './identity';
import { getWork, permit, transitionWork, type WorkContext } from './core';
import { deskSettings, readWorkDesk, saveCustomField, saveCustomStatus, saveResolutionCodes, setWorkField } from './desk-fields';

/** DESK-010 (bulk door shared with DESK-001): one command applied to each chosen ticket at its current revision,
 * through the same transition rules, so each ticket is changed or refused on its own. */
async function bulkCommand(ctx: WorkContext, b: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'operator', 'hr']);
  const ids = Array.isArray(b.workIds) ? [...new Set(b.workIds)] : [];
  if (!ids.length || ids.length > 100 || !ids.every((v) => typeof v === 'string' && v))
    throw new ApiError(422, 'bulk_work', 'Choose 1 to 100 tickets');
  const command = requiredString(b.command, 'command'), reason = requiredString(b.reason, 'reason', 2000);
  const items = [];
  for (const workId of ids as string[]) {
    try {
      const work = await getWork(ctx, workId);
      const changed = await transitionWork(ctx, workId, work.revision, command, reason,
        typeof b.assigneeId === 'string' ? b.assigneeId : undefined, b.waitingOn, { resolutionCode: b.resolutionCode, statusId: b.statusId });
      items.push({ workId, ok: true, state: changed.state, revision: changed.revision });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      items.push({ workId, ok: false, error: { code: error.code, message: error.message } });
    }
  }
  return { command, changed: items.filter((i) => i.ok).length, refused: items.filter((i) => !i.ok).length, items };
}

export function registerDeskFieldRoutes(app: Hono<AppEnv>) {
  const ctx = (c: Context<AppEnv>) => ({ env: c.env, principal: c.get('principal') });
  app.get('/desk-settings', async c => c.json(await deskSettings(ctx(c))));
  app.post('/desk-fields', async c => c.json(await saveCustomField(ctx(c), await jsonBody(c)), 201));
  app.post('/desk-statuses', async c => c.json(await saveCustomStatus(ctx(c), await jsonBody(c)), 201));
  app.post('/resolution-codes', async c => c.json(await saveResolutionCodes(ctx(c), await jsonBody(c))));
  app.post('/work/bulk-commands', async c => c.json(await bulkCommand(ctx(c), await jsonBody(c))));
  app.get('/work/:id/desk', async c => c.json(await readWorkDesk(ctx(c), c.req.param('id'))));
  app.post('/work/:id/fields', async c => c.json(await setWorkField(ctx(c), c.req.param('id'), await jsonBody(c))));
}

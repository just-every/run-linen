import type { Context, Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { listScenarios, runScenario, saveScenario, scenarioRuns } from './desk-scenarios';
import { listRecordTemplates, readRecordTemplate, saveRecordTemplate } from './desk-templates';

/** DESK-015: agent scenarios (saved, offered within scope, run on a ticket, run history) and ticket record templates. */
export function registerDeskScenarioRoutes(app: Hono<AppEnv>) {
  const ctx = (c: Context<AppEnv>) => ({ env: c.env, principal: c.get('principal') });
  app.get('/work-scenarios', async c => c.json(await listScenarios(ctx(c))));
  app.post('/work-scenarios', async c => c.json(await saveScenario(ctx(c), await jsonBody(c)), 201));
  app.post('/work/:id/scenario-runs', async c => c.json(await runScenario(ctx(c), c.req.param('id'), await jsonBody(c))));
  app.get('/work/:id/scenario-runs', async c => c.json(await scenarioRuns(ctx(c), c.req.param('id'))));
  app.get('/work-templates', async c => c.json(await listRecordTemplates(ctx(c))));
  app.post('/work-templates', async c => c.json(await saveRecordTemplate(ctx(c), await jsonBody(c)), 201));
  app.get('/work-templates/:id', async c => c.json(await readRecordTemplate(ctx(c), c.req.param('id'))));
}

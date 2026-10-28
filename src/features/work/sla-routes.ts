import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { listSlaPolicies, readWorkSla, saveRequesterGroup, saveSlaPolicy } from './sla-policies';
import { listEscalationLevels, readFollowups, saveEscalationLevel, saveWaitingRule } from './escalations';
/** DESK-004: the owner orders SLA policies and requester groups; agents and auditors read each ticket's targets. */
export function registerSlaRoutes(app: Hono<AppEnv>) {
  app.post('/requester-groups', async c => c.json(await saveRequesterGroup({ env: c.env, principal: c.get('principal') }, await jsonBody(c)), 201));
  app.get('/sla-policies', async c => c.json({ items: await listSlaPolicies({ env: c.env, principal: c.get('principal') }) }));
  app.post('/sla-policies', async c => c.json(await saveSlaPolicy({ env: c.env, principal: c.get('principal') }, await jsonBody(c)), 201));
  // DESK-005 and DESK-021: escalation levels, the awaiting-requester rule and each ticket's persisted escalations and reminders.
  app.get('/escalation-rules', async c => c.json(await listEscalationLevels({ env: c.env, principal: c.get('principal') })));
  app.post('/escalation-levels', async c => c.json(await saveEscalationLevel({ env: c.env, principal: c.get('principal') }, await jsonBody(c))));
  app.post('/waiting-rule', async c => c.json(await saveWaitingRule({ env: c.env, principal: c.get('principal') }, await jsonBody(c))));
  app.get('/work/:id/followups', async c => c.json(await readFollowups({ env: c.env, principal: c.get('principal') }, c.req.param('id'))));
  app.get('/work/:id/sla', async c => c.json(await readWorkSla({ env: c.env, principal: c.get('principal') }, c.req.param('id'))));
}

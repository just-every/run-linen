import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import type { WorkContext } from './core';
import { listContactPoints, mapContactPoint } from './contact-points';
import { checkIn, finishVisit, startVisit, walkupQueue } from './walkup';
import { dismissCall, heldCalls, receiveCall } from './phone';
import { pollPhoneLines } from './phone-poll';

export function registerWalkupRoutes(app: Hono<AppEnv>) {
  const ctx = (c: any): WorkContext => ({ env: c.env, principal: c.get('principal') });
  app.get('/contact-points', async c => c.json(await listContactPoints(ctx(c))));
  app.post('/contact-points', async c => c.json(await mapContactPoint(ctx(c), await jsonBody(c))));
  app.get('/walkups', async c => c.json(await walkupQueue(ctx(c))));
  app.post('/walkups', async c => c.json(await checkIn(ctx(c), await jsonBody(c)), 201));
  app.post('/walkups/:id/start', async c => c.json(await startVisit(ctx(c), c.req.param('id'))));
  app.post('/walkups/:id/finish', async c => c.json(await finishVisit(ctx(c), c.req.param('id'), await jsonBody(c))));
  app.post('/calls/events', async c => c.json(await receiveCall(ctx(c), await jsonBody(c)), 201));
  app.post('/calls/poll', async c => c.json(await pollPhoneLines(ctx(c))));
  app.get('/calls/held', async c => c.json(await heldCalls(ctx(c))));
  app.post('/calls/:connectionId/:callId/dismiss', async c => c.json(await dismissCall(ctx(c), c.req.param('connectionId'), c.req.param('callId'))));
}

import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { collaborationState, collaborationInbox, mentionNote, saveWatcher } from './collaboration';
import { sendSideMail, closeSideMail } from './side-mail';
export function registerCollaborationRoutes(app:Hono<AppEnv>) {
  app.get('/collaboration/inbox',async c=>c.json(await collaborationInbox({env:c.env,principal:c.get('principal')})));
  app.get('/work/:id/collaboration',async c=>c.json(await collaborationState({env:c.env,principal:c.get('principal')},c.req.param('id'))));
  app.post('/work/:id/mentions',async c=>c.json(await mentionNote({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c)),201));
  app.post('/work/:id/watchers',async c=>c.json(await saveWatcher({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c))));
  app.post('/work/:id/side-conversations',async c=>c.json(await sendSideMail({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c)),201));
  app.post('/work/:id/side-conversations/:sideId/messages',async c=>c.json(await sendSideMail({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c),c.req.param('sideId')),201));
  app.post('/work/:id/side-conversations/:sideId/close',async c=>c.json(await closeSideMail({env:c.env,principal:c.get('principal')},c.req.param('id'),c.req.param('sideId'),await jsonBody(c))));
}

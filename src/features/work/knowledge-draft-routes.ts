import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { detectKnowledgeDrafts, listKnowledgeDrafts, getKnowledgeDraft, generateKnowledgeDraft, publishKnowledgeDraft, rejectKnowledgeDraft } from './knowledge-drafts';
export function registerKnowledgeDraftRoutes(app:Hono<AppEnv>) {
  app.get('/knowledge-drafts',async c=>c.json(await listKnowledgeDrafts({env:c.env,principal:c.get('principal')})));
  app.post('/knowledge-drafts/detect',async c=>c.json(await detectKnowledgeDrafts({env:c.env,principal:c.get('principal')})));
  app.get('/knowledge-drafts/:id',async c=>c.json(await getKnowledgeDraft({env:c.env,principal:c.get('principal')},c.req.param('id'))));
  app.post('/knowledge-drafts/:id/generate',async c=>c.json(await generateKnowledgeDraft({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c))));
  app.post('/knowledge-drafts/:id/publish',async c=>c.json(await publishKnowledgeDraft({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c))));
  app.post('/knowledge-drafts/:id/reject',async c=>c.json(await rejectKnowledgeDraft({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c))));
}

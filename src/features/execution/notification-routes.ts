import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { notificationConfig, notificationHistory, notificationInbox, notificationPreferences, previewNotificationTemplate, saveNotificationPreference, saveNotificationRule, saveNotificationTemplate, testNotificationRule } from './notification-rules';
import { notificationBranding, saveNotificationBranding } from './notification-branding';

export function registerNotificationRoutes(app:Hono<AppEnv>) {
  app.get('/notification-config',async c=>c.json(await notificationConfig({env:c.env,principal:c.get('principal')})));
  app.get('/notification-history',async c=>c.json(await notificationHistory({env:c.env,principal:c.get('principal')})));
  app.post('/notification-templates',async c=>c.json(await saveNotificationTemplate({env:c.env,principal:c.get('principal')},await jsonBody(c)),201));
  app.post('/notification-rules',async c=>c.json(await saveNotificationRule({env:c.env,principal:c.get('principal')},await jsonBody(c)),201));
  app.post('/notification-templates/:id/preview',async c=>c.json(await previewNotificationTemplate({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c))));
  app.post('/notification-rules/:id/test',async c=>c.json(await testNotificationRule({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c))));
  app.get('/notification-preferences',async c=>c.json(await notificationPreferences({env:c.env,principal:c.get('principal')})));
  app.post('/notification-preferences',async c=>c.json(await saveNotificationPreference({env:c.env,principal:c.get('principal')},await jsonBody(c))));
  app.get('/notification-inbox',async c=>c.json(await notificationInbox({env:c.env,principal:c.get('principal')})));
  app.get('/notification-branding',async c=>c.json(await notificationBranding({env:c.env,principal:c.get('principal')})));
  app.post('/notification-branding',async c=>c.json(await saveNotificationBranding({env:c.env,principal:c.get('principal')},await jsonBody(c))));
}

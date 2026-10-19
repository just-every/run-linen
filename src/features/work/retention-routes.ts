import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import { previewRetention, readRetention, retentionReceipts, setRetention } from './retention';
/** RETENTION-001: the owner sets ticket/attachment retention after previewing what it deletes; owner and auditor read receipts. */
export function registerRetentionRoutes(app: Hono<AppEnv>) {
  app.get('/work/retention', async c => c.json(await readRetention({ env: c.env, principal: c.get('principal') })));
  app.post('/work/retention/preview', async c => c.json(await previewRetention({ env: c.env, principal: c.get('principal') }, await jsonBody(c))));
  app.put('/work/retention', async c => c.json(await setRetention({ env: c.env, principal: c.get('principal') }, await jsonBody(c))));
  app.get('/work/retention/receipts', async c => c.json(await retentionReceipts({ env: c.env, principal: c.get('principal') })));
}

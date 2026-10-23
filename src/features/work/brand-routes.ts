import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody } from '../../platform/http';
import type { WorkContext } from './core';
import { readBrand, saveBrand } from './brand';
import { myDevices } from './my-devices';

export function registerBrandRoutes(app: Hono<AppEnv>) {
  const ctx = (c: any): WorkContext => ({ env: c.env, principal: c.get('principal') });
  app.get('/branding', async c => c.json(await readBrand(ctx(c))));
  app.post('/branding', async c => c.json(await saveBrand(ctx(c), await jsonBody(c))));
  app.get('/my/devices', async c => c.json(await myDevices(ctx(c))));
}

import { Hono } from 'hono';
import { authenticated } from '../../src/platform/auth';
import { ApiError } from '../../src/platform/http';
import { platformApp } from '../../src/platform/routes';
import type { AppEnv } from '../../src/platform/types';
import { registerConnectionRoutes } from '../../src/features/connections';
import { registerExecutionRoutes } from '../../src/features/execution';
import { registerWorkRoutes } from '../../src/features/work';

// This live acceptance worker uses native session and CSRF authentication.
// It has no fixture provider, effect shortcut, or synthetic auth middleware.
const app = new Hono<AppEnv>();
app.onError((error, c) => c.json(
  { error: { code: error instanceof ApiError ? error.code : 'internal_error' } },
  (error instanceof ApiError ? error.status : 500) as 400,
));
app.route('/api/v1', platformApp());
const api = new Hono<AppEnv>();
api.use('*', authenticated);
registerWorkRoutes(api);
registerExecutionRoutes(api);
registerConnectionRoutes(api);
app.route('/api/v1', api);
export default app;

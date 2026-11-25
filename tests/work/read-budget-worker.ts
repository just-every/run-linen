import { Hono } from 'hono';
import { platformApp } from '../../src/platform/routes';
import { ApiError } from '../../src/platform/http';
import { respondAndBump } from '../../src/platform/list-clock';
import { processScheduledWork } from '../../src/scheduler';
import { registerWorkRoutes } from '../../src/features/work';
import type { AppEnv, Env } from '../../src/platform/types';

// The real routes and scheduler on a real D1; the only addition is a tally of the rows D1 reports per request.
const app = new Hono<AppEnv>();
app.onError((error, c) => c.json({ error: error instanceof ApiError ? error.code : error.message },
  (error instanceof ApiError ? error.status : 500) as 400));
const api = platformApp();
registerWorkRoutes(api);
app.route('/api/v1', api);

type Tally = { read: number; written: number };
function metered(env: Env, tally: Tally): Env {
  const add = (meta: any) => { tally.read += meta?.rows_read ?? 0; tally.written += meta?.rows_written ?? 0; };
  const raw = new WeakMap<object, D1PreparedStatement>();
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const proxy: D1PreparedStatement = new Proxy(statement, { get(target, key) {
      if (key === 'bind') return (...values: unknown[]) => wrap(target.bind(...values));
      if (key === 'all' || key === 'run') return async () => { const result = await (target as any)[key](); add(result.meta); return result; };
      if (key === 'first') return async (column?: string) => { const result = await target.all(); add(result.meta); const row: any = result.results[0] ?? null; return column ? row?.[column] : row; };
      const value = (target as any)[key];
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    raw.set(proxy, statement);
    return proxy;
  };
  const DB = new Proxy(env.DB, { get(target, key) {
    if (key === 'prepare') return (sql: string) => wrap(target.prepare(sql));
    if (key === 'batch') return async (list: D1PreparedStatement[]) => { const results = await target.batch(list.map(s => raw.get(s) ?? s)); results.forEach(r => add(r.meta)); return results; };
    const value = (target as any)[key];
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return { ...env, DB } as Env;
}

export default {
  async fetch(request: Request, bindings: Env, execution: ExecutionContext) {
    const tally: Tally = { read: 0, written: 0 };
    const env = { ...metered(bindings, tally), AUTH_ORIGIN: new URL(request.url).origin, AUTH_LOCAL: 'true',
      SESSION_SECRET: 'synthetic-read-budget-session-secret' };
    const response = await respondAndBump(request, env, async () => new URL(request.url).pathname === '/tick'
      ? (await processScheduledWork(env), Response.json({ ticked: true }))
      : app.fetch(request, env, execution));
    const headers = new Headers(response.headers);
    headers.set('x-d1-rows-read', String(tally.read));
    headers.set('x-d1-rows-written', String(tally.written));
    return new Response(response.body, { status: response.status, headers });
  },
};

import { eraseServicePerson } from '../../src/features/services/privacy';
import { registerServiceRoutes } from "../../src/features/services";
import { createGrant } from "../../src/features/execution/grants";
import { Hono } from "hono";
import {
  registerWorkRoutes,
  restoreAdoptionRecord,
  businessDue,
  workIntakePort,
} from "../../src/features/work";
import type { AppEnv } from "../../src/platform/types";
import { ApiError } from "../../src/platform/http";
const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
  c.set("principal", {
    userId: c.req.header("x-user") || "owner",
    workspaceId: c.req.header("x-workspace") || "a",
    roles: JSON.parse(c.req.header("x-roles") || '["owner"]'),
  });
  await next();
});
app.onError((e, c) =>
  c.json({ error: e.message }, e instanceof ApiError ? (e.status as 400) : 500),
);
registerWorkRoutes(app);
registerServiceRoutes(app);
app.post('/test/erase-service-person',async c=>c.json(await eraseServicePerson({env:c.env,principal:c.get('principal')},await c.req.json())));
app.post("/test/grant", async (c) =>
  c.json(
    await createGrant(
      { env: c.env, principal: c.get("principal") },
      await c.req.json(),
    ),
  ),
);
app.post("/test/restore", async (c) =>
  c.json(
    await restoreAdoptionRecord(
      { env: c.env, principal: c.get("principal") },
      await c.req.json(),
    ),
  ),
);
app.post("/test/calendar", async (c) => {
  const b = await c.req.json();
  return c.json({ due: businessDue(b.start, b.minutes, b.calendar) });
});
app.post("/test/intake-port", async (c) => {
  const b = await c.req.json();
  const ctx = { env: c.env, principal: c.get("principal") };
  const events = await workIntakePort.list(ctx, b.workId);
  const event = events[0];
  if (!event) return c.json({ count: 0 });
  const claimed = await workIntakePort.claim(ctx, event.id);
  const concurrent = await workIntakePort.claim(ctx, event.id);
  await workIntakePort.finish(ctx, event.id, {
    state: "interpreted",
    result: { fixture: true },
  });
  return c.json({
    count: events.length,
    claimed: !!claimed,
    concurrent: !!concurrent,
  });
});
export default app;

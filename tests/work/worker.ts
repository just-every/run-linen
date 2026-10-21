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
// Test-only scheduling seam: change real D1 state after route evaluation, before its batch commits.
for(const seam of ['/work/:id/fulfilment','/catalog-bundles/:id/request'])app.use(seam,async(c,next)=>{
  const kind=c.req.header('x-catalog-race'), target=c.req.header('x-catalog-target');
  if(!kind || !target)return next();
  const db=c.env.DB,w=c.get('principal').workspaceId;
  let changed=false;
  c.env={...c.env,DB:new Proxy(db,{get(targetDb,key){
    if(key==='batch')return async(statements:D1PreparedStatement[])=>{
      if(!changed){changed=true;
        if(kind==='person')await db.prepare("UPDATE work_people SET attributes_json='{}',revision=revision+1 WHERE workspace_id=? AND id=?").bind(w,target).run();
        else if(kind==='catalog')await db.prepare('UPDATE work_catalog SET revision=revision+1 WHERE workspace_id=? AND id=?').bind(w,target).run();
        else if(kind==='member')await db.prepare('UPDATE memberships SET active=0 WHERE workspace_id=? AND user_id=?').bind(w,target).run();
      }
      return db.batch(statements);
    };
    const value=Reflect.get(targetDb,key);return typeof value==='function'?value.bind(targetDb):value;
  }})};
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

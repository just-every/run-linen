import { registerWorkRoutes } from '../../src/features/work';
import { registerConnectionRoutes } from '../../src/features/connections';
import { providerFetch } from "../../src/features/execution/transport";
import { Hono } from "hono";
import {
  registerExecutionRoutes,
  handleNotificationWebhook,
  standingIntakeExecution,
  restoreExecutionRecord,
  eraseExecutionPerson,
} from "../../src/features/execution/index";
import { encryptSecret } from "../../src/platform/crypto";
import { ApiError } from "../../src/platform/http";
import type { AppEnv } from "../../src/platform/types";
const realFetch = globalThis.fetch;
let fixtureDB: D1Database | undefined,
  oauthRevoke: string | null = null,
  oauthCountdown = 0;
let present = false,
  writes = 0,
  lost = false,
  invalidProbe = false,
  identity: any = null,
  mailWrites = 0,
  mailLost = false,
  notificationPackets: unknown[] = [],
  memberId = "person",
  probeMutation = "";
// Provider fixtures are exclusively in the test worker, never application modules.
globalThis.fetch = async (input: any, init: any = {}) => {
  const u = new URL(String(input));
  if (u.hostname === "login.microsoftonline.com") {
    if (oauthRevoke && --oauthCountdown === 0) {
      await fixtureDB!
        .prepare(
          "INSERT OR IGNORE INTO execution_grant_revocations VALUES(?,?,?,?,?)",
        )
        .bind("w", oauthRevoke, 1, "issuer", new Date().toISOString())
        .run();
      oauthRevoke = null;
    }
    return Response.json({ access_token: "test-token" });
  }
  if (u.hostname === "api.sendgrid.com") {
    if (!init.method || init.method === 'GET') {
      if(u.pathname==='/v3/scopes')return Response.json({scopes:['mail.send']});
      if(u.pathname==='/v3/user/username')return Response.json({user_id:1,username:'synthetic-linen-20000'});
      if(u.pathname==='/v3/verified_senders')return Response.json({results:[{id:1,from_email:'linen@example.test',verified:true}]});
      return new Response(null,{status:404});
    }
    mailWrites++;
    notificationPackets.push(JSON.parse(String(init.body)));
    if (mailLost) {
      mailLost = false;
      throw new Error("mail receipt lost");
    }
    return new Response(null, {
      status: 202,
      headers: { "x-message-id": "fixture-mail-" + mailWrites },
    });
  }
  if (u.hostname === "graph.microsoft.com") {
    if (u.pathname.includes("/users") && !u.pathname.includes("/license")) {
      if (u.pathname === "/v1.0/users/provider-employee")
        return Response.json({ id: "provider-employee" });
      if (init.method === "POST" && u.pathname.endsWith("/users")) {
        writes++;
        identity = JSON.parse(init.body);
        if (lost) {
          lost = false;
          throw new Error("identity receipt lost");
        }
        return Response.json({ id: "new-user" });
      }
      if (init.method === "PATCH") {
        writes++;
        identity.accountEnabled = false;
        return new Response(null, { status: 204 });
      }
      if (
        init.method === "POST" &&
        u.pathname.endsWith("/revokeSignInSessions")
      ) {
        writes++;
        identity.signInSessionsValidFromDateTime = new Date().toISOString();
        return Response.json({ value: true });
      }
      return identity
        ? Response.json({ id: "new-user", ...identity })
        : new Response(null, { status: 404 });
    }
    if (init.method === "POST" || init.method === "DELETE") {
      writes++;
      present = init.method === "POST";
      if (lost) {
        lost = false;
        throw new Error("response lost after effect");
      }
      return new Response(null, { status: 204 });
    }
    return present
      ? Response.json({ id: memberId })
      : new Response(null, { status: 404 });
  }
  if (u.hostname === "probe.example.test")
    return Response.json({
      nonce: invalidProbe ? "replayed" : u.searchParams.get("nonce"),
      target:
        probeMutation === "target" ? "wrong" : u.searchParams.get("target"),
      beneficiaryId: u.searchParams.get("beneficiary"),
      verifierVersion: 1,
      actionVersion: 1,
      observedAt: new Date(
        Date.now() - (probeMutation === "stale" ? 3600000 : 0),
      ).toISOString(),
      expectedOutcome: u.searchParams.get("desired"),
      negativeControl: probeMutation !== "negative",
      usableWorkflow: true,
      cohort: [
        probeMutation === "cohort"
          ? "wrong"
          : u.searchParams.get("beneficiary"),
      ],
    });
  return realFetch(input, init);
};
const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
  fixtureDB = c.env.DB;
  const user = c.req.header("Test-User") || "actor";
  c.set("principal", {
    userId: user,
    workspaceId: c.req.header("Test-Workspace") || "w",
    roles:
      user === "issuer"
        ? ["owner"]
        : user === "employee"
          ? ["employee"]
          : user === "automation"
            ? ["integration"]
            : ["operator"],
  });
  await next();
});
app.post("/fixture", async (c) => {
  const b: any = await c.req.json();
  if (b.reset) {
    present = false;
    writes = 0;
  }
  if (b.memberId) memberId = b.memberId;
  if (b.oauthRevoke) {
    oauthRevoke = b.oauthRevoke;
    oauthCountdown = 2;
  }
  if (b.lost) lost = true;
  if (b.identityReset) identity = null;
  if (b.identityCollision)
    identity = {
      userPrincipalName: "new@example.test",
      onPremisesExtensionAttributes: { extensionAttribute15: "another-owner" },
    };
  if (b.mailLost) mailLost = true;
  invalidProbe = !!b.invalidProbe;
  probeMutation = b.probeMutation || "";
  return c.json({ present, writes, mailWrites, ...(b.notificationPackets?{notificationPackets}: {}) });
});
app.post("/fixture/secret", async (c) =>
  c.json({
    secret: await encryptSecret(
      c.env.ENCRYPTION_KEY,
      JSON.stringify(await c.req.json()),
    ),
  }),
);
app.post("/fixture/webhook/:id", async (c) =>
  c.json(await handleNotificationWebhook(c.env, c.req.param("id"), c.req.raw)),
);
app.post("/fixture/resolve", async (c) =>
  c.json(
    await standingIntakeExecution.resolve(
      { env: c.env, principal: c.get("principal") },
      await c.req.json(),
    ),
  ),
);
app.post("/fixture/restore", async (c) =>
  c.json(
    await restoreExecutionRecord(
      { env: c.env, principal: c.get("principal") },
      await c.req.json(),
    ),
  ),
);
app.post("/fixture/erase", async (c) => {
  const b: any = await c.req.json();
  await eraseExecutionPerson(
    { env: c.env, principal: c.get("principal") },
    b.identity,
  );
  return c.json({ erased: true });
});
app.post("/fixture/native-fetch", async (c) => {
  const b: any = await c.req.json();
  const r = await providerFetch(
    { env: c.env, principal: c.get("principal") },
    "graph",
    "effect",
    b.url,
    {
      method: "POST",
      redirect: "manual",
      headers: { Authorization: "fixture-secret" },
    },
  );
  return c.json({ status: r.status });
});
registerExecutionRoutes(app);
registerConnectionRoutes(app);
registerWorkRoutes(app);
app.onError((e, c) =>
  c.json(
    {
      error: {
        code: e instanceof ApiError ? e.code : "internal",
        message: e.message,
      },
    },
    (e instanceof ApiError ? e.status : 500) as any,
  ),
);
export default app;

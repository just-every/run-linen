import { registerWorkRoutes } from '../../src/features/work';
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
let oktaMember = false, oktaApp = false, oktaStatus = 'ACTIVE', oktaWrites = 0, oktaLogs: any[] = [], oktaWrongLog = false;

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
  memberId = "person",
  probeMutation = "";
// Provider fixtures are exclusively in the test worker, never application modules.
globalThis.fetch = async (input: any, init: any = {}) => {
  const u = new URL(String(input));
  if (u.hostname === 'synthetic-linen-1.okta.com') {
    const method = init.method || 'GET';
    if (method !== 'GET') {
      oktaWrites++;
      if (u.pathname.includes('/groups/') && u.pathname.includes('/users/')) oktaMember = method === 'PUT';
      if (u.pathname.includes('/apps/')) oktaApp = method === 'PUT';
      if (u.pathname.endsWith('/suspend')) oktaStatus = 'SUSPENDED';
      if (u.pathname.endsWith('/unsuspend')) oktaStatus = 'ACTIVE';
      if (u.pathname.endsWith('/deactivate')) oktaStatus = 'DEPROVISIONED';
      if (u.pathname.endsWith('/sessions')) oktaLogs.push({eventType:'user.session.clear', outcome:{result:'SUCCESS'}, published:new Date().toISOString(),target:[{id:'synthetic-linen-2'}],debugContext:{debugData:{requestId:'synthetic-linen-3'}}});
      return new Response(null,{status:204,headers:{'x-okta-request-id':'synthetic-linen-3'}});
    }
    if (u.pathname.endsWith('/logs')) return Response.json(oktaLogs.map(event => oktaWrongLog ? {...event,debugContext:{debugData:{requestId:'synthetic-linen-4'}}} : event), {headers:u.searchParams.has('until')?{}:{link:`<${u.href}>; rel="next"`}});
    if (u.pathname.endsWith('/groups') && u.pathname.includes('/users/')) return Response.json(oktaMember ? [{id:'synthetic-linen-5'}] : []);
    if (u.pathname.includes('/apps/')) return oktaApp ? Response.json({id:'synthetic-linen-5'}) : new Response(null,{status:404});
    return Response.json({id:'synthetic-linen-2', status:oktaStatus});
  }
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
    mailWrites++;
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
            : user === "approver"
              ? ["approver"]
              : user === "auditor"
                ? ["auditor"]
                : ["operator"],
  });
  await next();
});
app.post("/fixture", async (c) => {
  const b: any = await c.req.json();
  if (b.oktaWrongLog !== undefined) oktaWrongLog = b.oktaWrongLog;
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
  return c.json({ present, writes, mailWrites, oktaWrites });
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

import { Hono } from "hono";
import type { AppEnv } from "../../src/platform/types";
import { ApiError } from "../../src/platform/http";
import { encryptSecret } from "../../src/platform/crypto";
import { registerWorkRoutes, recordFulfilmentExecution, executionPort, processDueWork } from "../../src/features/work";
import { registerExecutionRoutes } from "../../src/features/execution";
import { runOperation, verifyOutcome } from "../../src/features/execution/engine";
import { standingIntakeExecution } from "../../src/features/execution/intake";

// Provider boundary fixtures only; unexpected network calls fail closed.
const presence = new Set<string>();
let writes = 0;
const lostResponses = new Set<string>();
const deniedWrites = new Set<string>();
globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = new URL(String(input));
  if (url.hostname === "login.microsoftonline.com") return Response.json({ access_token: "fixture" });
  if (url.hostname === "graph.microsoft.com") {
    if (url.pathname.startsWith("/v1.0/users/"))
      return Response.json({ id: url.pathname.split("/").at(-1) });
    const target = url.pathname.split("/")[3];
    if (init.method === "POST") { if (deniedWrites.has(target)) return new Response(null, { status: 403 }); presence.add(target); writes++; if (lostResponses.delete(target)) throw new Error("Fixture lost provider response after effect"); return new Response(null, { status: 204 }); }
    if (init.method === "DELETE") { if (deniedWrites.has(target)) return new Response(null, { status: 403 }); presence.delete(target); writes++; return new Response(null, { status: 204 }); }
    return presence.has(target) ? Response.json({ id: "provider-employee-distinct" }) : new Response(null, { status: 404 });
  }
  if (url.hostname === "workflow.example.test") return Response.json({
    nonce: url.searchParams.get("nonce"), target: url.searchParams.get("target"),
    beneficiaryId: url.searchParams.get("beneficiary"), expectedOutcome: url.searchParams.get("desired"),
    verifierVersion: 1, actionVersion: 1, observedAt: new Date().toISOString(),
    negativeControl: true, usableWorkflow: true, cohort: [url.searchParams.get("beneficiary")],
  });
  throw new Error(`Unexpected external request: ${url.origin}`);
};
const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
  const userId = c.req.header("x-user") || "owner";
  const row = await c.env.DB.prepare("SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=?")
    .bind(c.req.header("x-workspace") || "w", userId).first<{ roles_json: string }>();
  c.set("principal", { userId, workspaceId: c.req.header("x-workspace") || "w", roles: JSON.parse(row?.roles_json || "[]") });
  await next();
});
app.onError((error, c) => c.json({ error: error.message, code: error instanceof ApiError ? error.code : "internal" },
  error instanceof ApiError ? error.status as 400 : 500));
registerWorkRoutes(app);
registerExecutionRoutes(app);
app.post("/test/link", async c => c.json(await recordFulfilmentExecution({ env: c.env, principal: c.get("principal") }, await c.req.json())));
app.post("/test/inspect", async c => c.json(await executionPort.inspect({ env: c.env, principal: c.get("principal") }, (await c.req.json()).operationId)));
app.post("/test/due", async c => c.json(await processDueWork({ env: c.env, principal: c.get("principal") }, executionPort, (await c.req.json()).at)));
app.post("/test/standing", async c => c.json(await standingIntakeExecution.resolve({ env: c.env, principal: c.get("principal") }, await c.req.json())));
app.post("/test/run", async c => c.json(await runOperation({ env: c.env, principal: c.get("principal") }, (await c.req.json()).operationId)));
app.post("/test/verify", async c => c.json(await verifyOutcome({ env: c.env, principal: c.get("principal") }, await c.req.json())));
app.post("/test/connections", async c => {
  for (const [key, provider, config, secret] of [
    ["graph", "microsoft-graph", { tenantId: "fixture-tenant" }, { clientId: "fixture", clientSecret: "fixture" }],
    ["probe", "workflow-probe", { url: "https://workflow.example.test/probe", allowedHosts: ["workflow.example.test"] }, { token: "fixture" }],
  ] as const) await c.env.DB.prepare("INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)")
    .bind(key, "w", provider, key, JSON.stringify(config), await encryptSecret(c.env.ENCRYPTION_KEY, JSON.stringify(secret)), "active", new Date().toISOString(), new Date().toISOString()).run();
  return c.json({ configured: true });
});
app.post("/test/deny-write", async c => { deniedWrites.add((await c.req.json()).target); return c.json({ configured: true }); });
app.post("/test/lose-response", async c => { lostResponses.add((await c.req.json()).target); return c.json({ configured: true }); });
app.get("/test/writes", c => c.json({ writes }));
export default app;

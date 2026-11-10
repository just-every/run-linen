import { Hono } from "hono";
import type { AppEnv } from "../../src/platform/types";
import { ApiError } from "../../src/platform/http";
import { encryptSecret } from "../../src/platform/crypto";
import { registerWorkRoutes, recordFulfilmentExecution, executionPort, processDueWork } from "../../src/features/work";
import { registerExecutionRoutes } from "../../src/features/execution";
import { processWorkIntake } from "../../src/features/intelligence/intake";
import { proposeIntake } from "../../src/features/intelligence/models";
import { runOperation, verifyOutcome } from "../../src/features/execution/engine";
import { standingIntakeExecution } from "../../src/features/execution/intake";

// Provider boundary fixtures only; unexpected network calls fail closed.
const presence = new Set<string>();
let writes = 0;
const lostResponses = new Set<string>();
const deniedWrites = new Set<string>();
// Provider usage by purpose: [input tokens, output tokens]; omitUsage makes the provider return none.
const modelUsage: Record<string, [number, number]> = { ticket_classification: [120, 70], ticket_reply: [150, 100], ticket_summary: [200, 60], employee_intake: [90, 40], natural_language_intake: [80, 30] };
let omitUsage = false, modelCalls = 0;
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
  if (url.hostname === "api.openai.com") {
    // Paid model edge for REPORT-004: priced calls, calls whose usage the provider omits, and the purpose of each call
    // recorded in the request id so the test can match actual request-bound attempts to the report.
    const packet = JSON.parse(JSON.parse(String(init.body)).input);
    const priced = modelUsage[packet.purpose];
    if (!priced) throw new Error(`Unexpected model request in fulfilment test: ${packet.purpose}`);
    let value: unknown;
    if (packet.purpose === "ticket_classification")
      value = { type: "service_request", category: "hardware", subcategory: "laptop", impact: "low", urgency: "medium", reason: "An individual asks for project tool access." };
    else if (packet.purpose === "ticket_reply" || packet.purpose === "ticket_summary") {
      const sources = JSON.parse(packet.request.slice(packet.request.indexOf("\n") + 1));
      value = { text: "Access is being arranged; the request stays open until it is verified.", citations: sources.map((s: { id: string }) => s.id) };
    } else if (packet.purpose === "employee_intake")
      value = { kind: "necessary_question", summary: "", catalogId: "", serviceId: "", purpose: "", expiresAt: null, question: "Which application is affected?", requestedFor: "", evidenceIds: [] };
    else value = { kind: "necessary_question", summary: "", steps: [], question: "Which system is affected?", evidenceIds: [] };
    const omitted = omitUsage || (packet.purpose === "ticket_classification" && packet.request.includes("unpriced"));
    return Response.json({ status: "completed", ...(omitted ? {} : { usage: { input_tokens: priced[0], output_tokens: priced[1], total_tokens: priced[0] + priced[1] } }),
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] },
      { headers: { "x-request-id": `fixture-${packet.purpose}-${++modelCalls}` } });
  }
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
// Real native intelligence handlers for the two model doors REPORT-004 attributes (employee intake and an unrelated call).
app.post("/work/:id/interpret", async c => c.json(await processWorkIntake({ env: c.env, principal: c.get("principal") }, c.req.param("id"))));
app.post("/intelligence/intake", async c => c.json(await proposeIntake({ env: c.env, principal: c.get("principal") }, await c.req.json())));
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
app.post("/test/model-connection", async c => {
  const t = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO connections VALUES('model','w','openai','Model fixture',?,?,'active',1,?,?)")
      .bind(JSON.stringify({ model: "fixture-model", inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0, outputUsdPerMillion: 2, maxOutputTokens: 1000, maxAttemptUsd: 1 }), await encryptSecret(c.env.ENCRYPTION_KEY, JSON.stringify({ apiKey: "synthetic-report-model-key" })), t, t),
    c.env.DB.prepare("INSERT INTO workspace_settings(workspace_id,settings_json) VALUES('w','{}') ON CONFLICT(workspace_id) DO NOTHING"),
    c.env.DB.prepare("UPDATE workspace_settings SET settings_json=json_set(settings_json,'$.defaultModelConnectionId','model') WHERE workspace_id='w'"),
    c.env.DB.prepare("INSERT INTO intelligence_budgets(workspace_id,limit_usd) VALUES('w',10) ON CONFLICT(workspace_id) DO UPDATE SET limit_usd=10"),
  ]);
  return c.json({ configured: true });
});
app.post("/test/model-usage", async c => { omitUsage = !!(await c.req.json()).omit; return c.json({ omit: omitUsage }); });
app.post("/test/deny-write", async c => { deniedWrites.add((await c.req.json()).target); return c.json({ configured: true }); });
app.post("/test/lose-response", async c => { lostResponses.add((await c.req.json()).target); return c.json({ configured: true }); });
app.get("/test/writes", c => c.json({ writes }));
export default app;

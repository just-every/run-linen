import { unsentReplyJourney } from './response-journey.mjs';
import { problemDetectionJourney } from './problem-detection-journey.mjs';
import { dependencyJourney } from './dependency-journey.mjs';
import { recurrenceJourney } from './recurrence-journey.mjs';
import { assetFinancialJourney } from './asset-financial-journey.mjs';
import { problemJourney } from "./problem-journey.mjs";
import { classificationJourney } from "./classification-journey.mjs";
import { timeJourney } from './time-journey.mjs';
import { nativeCreate, dstJourney, incidentNativeDetails, namedApproverJourney } from "./native-regressions.mjs";
import { custodyJourney } from "./custody-journey.mjs";
import { fulfilmentDecisionJourney } from "./fulfilment-decision-journey.mjs";
import { captureJourney, lifecycleVariants } from "./viewport-evidence.mjs";
import { finishFirstRun } from './connected-helpers.mjs';
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.LINEN_TEST_URL;
if (!base) throw Error("Use node tests/ui/run.mjs to start an isolated worker");
const out = process.env.LINEN_TEST_OUTPUT || "test-results/ui";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--use-mock-keychain", "--password-store=basic"] });
const context = await browser.newContext({
  timezoneId: "UTC",
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const checks = [];
try {
  await page.goto(base + '/app');
  await page.getByLabel("Work email").waitFor();
  if (await page.getByLabel("Your name").count()) {
    await page.getByLabel("Your name").fill("UI Test Owner");
    await page.getByLabel("Workspace name").fill("Isolated browser acceptance");
    await page.getByLabel("Work email").fill("ui-owner@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("Browser-proof-2026");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await page.getByRole('heading', {name:'Requests', exact: true}).waitFor();
    await finishFirstRun(page, base);
  } else {
    await page.getByLabel("Work email").fill("ui-owner@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("Browser-proof-2026");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await page
    .getByRole("heading", { name: "Requests", exact: true })
    .waitFor();
  const api = async (path, body, method = body ? "POST" : "GET") =>
    page.evaluate(
      async ({ path, body, method }) => {
        const s = await (await fetch("/api/v1/session")).json();
        const r = await fetch("/api/v1" + path, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Linen-CSRF": s.csrfToken,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const d = await r.json();
        if (!r.ok) throw Error(path + " " + JSON.stringify(d));
        return d;
      },
      { path, body, method },
    );
  const session = await api("/session");
  const uid = session.principal.userId;
  await captureJourney(page, { path: out + "/01-empty-work.png", fullPage: true });
  await page
    .getByLabel("What would make work easier?")
    .fill(
      "Please give me temporary access to the design workspace until Friday.",
    );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.waitForURL(/#\/work\//);
  const workId = page.url().split("/").at(-1);
  await page.getByText("Keep the conversation going").waitFor();
  await page.getByLabel("Message visibility").selectOption("private");
  await page
    .getByLabel("A private note for the service team")
    .fill("Private review: confirm the beneficiary before granting access.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .locator(".message-body")
    .getByText(
      "Private review: confirm the beneficiary before granting access.",
      { exact: true },
    )
    .waitFor();
  await page.reload();
  await page
    .locator(".message-body")
    .getByText(
      "Private review: confirm the beneficiary before granting access.",
      { exact: true },
    )
    .waitFor();
  checks.push("Natural request and private note persist through reload");
  await page
    .getByText("Reading the remaining responsibilities…", { exact: true })
    .waitFor({ state: "hidden" });
  await captureJourney(page, { path: out + "/02-conversation.png", fullPage: true });
  const catalog = await api("/catalog", {
    name: "Design workspace access",
    kind: "access",
    target: "design-workspace",
    ownerId: uid,
    requiresManager: false,
  });
  await page.reload();
  await page.getByText("Or choose a known service", { exact: true }).click();
  await page.getByLabel(/^Service/).selectOption(catalog.id);
  await page
    .getByLabel(/What do you need it for/)
    .fill("A time-limited design review");
  await page
    .getByLabel("Needed until")
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await page
    .locator("details")
    .filter({
      has: page.getByText("Or choose a known service", { exact: true }),
    })
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page
    .getByText("What’s ready, and what remains", { exact: true })
    .waitFor();
  const obligations = (await api("/work/" + workId + "/obligations")).items;
  assert.ok(
    obligations.some(
      (o) => o.kind.includes("revoke") || o.kind.includes("expiry"),
    ),
  );
  checks.push(
    "Temporary access creates a separately persisted expiry obligation",
  );
  await page.goto(base + "/app#/connections");
  await page
    .getByRole("heading", { name: "Connections & setup", exact: true })
    .waitFor();
  await captureJourney(page, { path: out + "/03-setup.png", fullPage: true });
  const service = await api("/services", {
    name: "Research workspace",
    description: "Test-only shared workspace",
    businessImpact: "Design review",
    source: "browser-test",
    observedAt: new Date().toISOString(),
    visibility: "workspace",
    participants: [],
  });
  const decision = await api("/decisions", {
    title: "Choose the workspace renewal",
    contextId: service.id,
    holderId: uid,
    holderRoles: ["owner"],
    options: [
      {
        id: "retain",
        label: "Retain current capacity",
        consequences: "No extra seats",
      },
      {
        id: "expand",
        label: "Add five seats",
        consequences: "Five additional paid seats",
      },
    ],
    recommendation: "retain",
    quote: "Test supplier quote 500 USD",
    quoteSource: "test fixture",
    terms: "One month",
    cohorts: [uid],
    impact: "Seat capacity",
    reversibility: "Cancel next month",
    deadline: new Date(Date.now() + 86400000).toISOString(),
    uncertainty: "Demand may change",
  });
  await page.goto(base + "/app#/decisions/" + decision.id);
  await page
    .getByRole("heading", { name: "Choose the workspace renewal" })
    .waitFor();
  await captureJourney(page, { path: out + "/04-decision.png", fullPage: true });
  checks.push("Material decision displays actual persisted options and quote");
  await page.getByRole("radio").first().check();
  await page
    .getByLabel("Reason for your decision")
    .fill("Capacity remains sufficient.");
  await page.getByRole("button", { name: "Record my choice" }).click();
  await page
    .getByText("This decision is recorded.", { exact: false })
    .waitFor();
  assert.equal((await api("/decisions/" + decision.id)).data.state, "chosen");
  checks.push("Material choice persists without minting execution authority");
  await page.getByText("Amend the decision packet", { exact: true }).click();
  await page.getByLabel("Updated impact").fill("Revised capacity exposure");
  await page
    .locator("details")
    .filter({
      has: page.getByText("Amend the decision packet", { exact: true }),
    })
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.getByRole("button", { name: "Defer", exact: true }).click();
  await page
    .getByLabel("When should this return?")
    .fill(new Date(Date.now() + 3600000).toISOString().slice(0, 16));
  await page
    .getByLabel("Reason and ongoing exposure")
    .fill("Waiting for the current quote. Capacity exposure remains.");
  await page.getByRole("button", { name: "Record deferral" }).click();
  await page.getByText("deferred", { exact: true }).first().waitFor();
  assert.equal((await api("/decisions/" + decision.id)).data.state, "deferred");
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await page
    .getByLabel("Reason for your decision")
    .fill("The increased cost is not justified.");
  await page.getByRole("button", { name: "Record rejection" }).click();
  await page
    .getByText("This decision is recorded.", { exact: false })
    .waitFor();
  assert.equal((await api("/decisions/" + decision.id)).data.state, "rejected");
  checks.push(
    "Amendment reopens authority and deferral/rejection persist explicitly",
  );
  const person = await api("/people", {
    source: "browser-test",
    sourceId: "employee-one",
    name: "Test colleague",
    effectiveAt: new Date().toISOString(),
    observedAt: new Date().toISOString(),
  });
  const nativeJoinId = await nativeCreate(page, base, 'lifecycle', 'Record an authoritative HR change', {
    'Person': person.id, 'What is changing?': 'join',
    'Effective date and time': new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    'Employment timezone': 'UTC', 'Authoritative HR source': 'browser-test',
    'HR source revision': Date.now(), 'Accountable owner': uid, 'Access to add': 'design-workspace',
  });
  const lifecycle = { lifecycleId: nativeJoinId };
  assert.equal((await api('/lifecycle/' + nativeJoinId)).lifecycle.kind, 'join');
  await page.goto(base + "/app#/lifecycle/" + lifecycle.lifecycleId);
  await page.getByText("Change the effective date", { exact: true }).waitFor();
  await captureJourney(page, { path: out + "/05-lifecycle.png", fullPage: true });
  checks.push("HR lifecycle retains real missing prerequisite duties");
  await page.getByText("Change the effective date", { exact: true }).click();
  await page
    .getByLabel("New effective date and time")
    .fill(new Date(Date.now() + 172800000).toISOString().slice(0, 16));
  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/amend') && r.request().method() === 'POST' && r.status() === 200),
    page.waitForResponse(r => r.url().endsWith('/lifecycle/' + lifecycle.lifecycleId) && r.request().method() === 'GET' && r.status() === 200),
    page.locator("details").filter({ has: page.getByText("Change the effective date", { exact: true }) })
      .getByRole("button", { name: "Save", exact: true }).click(),
  ]);
  await page.getByText("Change the effective date", { exact: true }).waitFor();
  await page.getByText("Cancel this lifecycle change", { exact: true }).click();
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/amend") &&
        r.request().method() === "POST" &&
        r.request().postDataJSON().cancel === true &&
        r.status() === 200,
    ),
    page.getByRole("button", { name: "Record cancellation" }).click(),
  ]);
  assert.ok(
    (await api("/lifecycle/" + lifecycle.lifecycleId)).lifecycle.cancelled_at,
  );
  checks.push("HR date correction and cancellation preserve durable duties");
  await dstJourney(browser, context, base, person.id, uid, out);
  checks.push("Native New York leave rejects fold and gap without a request and displays the chosen valid offset");
  await lifecycleVariants(page, api, person.id, uid, out);
  checks.push("Distinct move and urgent-leave forms persist obligations through reload at desktop and mobile widths");
  await custodyJourney(page, api, person.id, uid, out);
  for (const width of [1440,390]) await classificationJourney({page,api,base,out,width});
  checks.push("Native device creation, assignment, receipt and return verify physical duty without certifying pending security work");
  const incidentId = await nativeCreate(page, base, 'incidents', 'Add incident', {
    'What is happening?': 'Shared workspace access interruption', 'Affected service': service.id,
    'Impact on people’s work': 'Colleagues cannot complete design review', 'Affected groups': 'London design team\nSydney finance team',
  });
  const incident = await api('/incidents/' + incidentId);
  await page.goto(base + "/app#/incidents/" + incident.id);
  await page
    .getByRole("heading", { name: "Shared workspace access interruption" })
    .waitFor();
  assert.equal(
    await page
      .getByText("No fresh independently admitted recovery evidence", {
        exact: true,
      })
      .count(),
    2,
  );
  await captureJourney(page, { path: out + "/06-incidents.png", fullPage: true });
  checks.push("Shared incident keeps each unobserved cohort unknown");
  await incidentNativeDetails(page, api, base, incident.id, uid, out);
  checks.push("Native rival diagnostics and notification check persist and preserve missing-provider uncertainty");
  await namedApproverJourney(browser, page, api, base, service.id, out);
  checks.push("Distinct named approver choice mints zero grants and material amendment invalidates the decision");
  const graph = await api("/connections", {
      name: "Test directory without credential",
      provider: "microsoft-graph",
      config: {},
    }),
    probe = await api("/connections", {
      name: "Test verifier without credential",
      provider: "workflow-probe",
      config: {},
    });
  const observations = [{ id: 'use-workspace', description: 'Independent usage observation', step: { action: 'group.add', actionVersion: 1, target: 'design-workspace', beneficiaryId: uid, connectionId: graph.id, verifierConnectionId: probe.id, cohort: [uid] } }];
  const commitmentId = await nativeCreate(page, base, 'commitments', 'Establish a service commitment', {
    'What should people always be able to do?': 'Colleagues can use the research workspace',
    'Actual beneficiary identities': uid, 'Independent observation definitions': JSON.stringify(observations),
    'Evidence freshness in seconds': 300, 'Observation interval in seconds': 3600,
    'Effective from': new Date(Date.now() - 60000).toISOString().slice(0, 16),
  });
  const commitment = await api('/commitments/' + commitmentId);
  await page.reload();
  assert.equal((await api('/commitments/' + commitmentId)).id, commitmentId);
  await page.goto(base + "/app#/commitments/" + commitment.id);
  await page
    .getByRole("heading", { name: "Colleagues can use the research workspace" })
    .waitFor();
  await page.getByText("Observe this commitment now", { exact: true }).click();
  await page.getByRole("button", { name: "Run scoped observations" }).click();
  await page.getByText("uncertain", { exact: true }).first().waitFor();
  assert.equal(
    (await api("/commitments/" + commitment.id + "/coverage")).coverage[0]
      .state,
    "uncertain",
  );
  await captureJourney(page, { path: out + "/07-continuing.png", fullPage: true });
  checks.push("Real missing verifier remains uncertain after observation");
  const model = await api("/connections", {
    name: "Test reasoning without credential",
    provider: "openai",
    config: {},
  });
  const research = await api("/research", {
    commitmentId: commitment.id,
    connectionId: model.id,
    question:
      "Why does the independently observed workflow remain unavailable?",
  });
  await page.goto(base + "/app#/research/" + research.id);
  await page.getByText("Continue the research", { exact: true }).click();
  await page.getByRole("button", { name: "Run one bounded round" }).click();
  await page.getByRole("alert").first().waitFor();
  await captureJourney(page, {
    path: out + "/10-unfamiliar-repair.png",
    fullPage: true,
  });
  checks.push(
    "Unfamiliar-repair attempt exposes missing model configuration and invents no probes",
  );
  await page.goto(base + "/app#/connections");
  await page
    .getByRole("heading", { name: "Test directory without credential" })
    .waitFor();
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .first()
    .click();
  await page.getByRole("alert").first().waitFor();
  assert.equal(
    (await api("/connections")).find((c) => c.id === graph.id).status,
    "unverified",
  );
  checks.push(
    "Read-only validation rejects missing credential without activating connection",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/app#/work/" + workId);
  await page.getByText("Keep the conversation going").waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "mobile must not overflow",
  );
  await page
    .getByText("Reading the remaining responsibilities…", { exact: true })
    .waitFor({ state: "hidden" });
  await captureJourney(page, { path: out + "/08-mobile.png", fullPage: true });
  await page.keyboard.press("Tab");
  assert.notEqual(
    await page.evaluate(() => document.activeElement?.tagName),
    "BODY",
  );
  checks.push("Mobile width and keyboard focus");
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "320px viewport must not overflow",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await context.setOffline(true);
  await page
    .getByLabel("Keep the conversation going")
    .fill("Still not working while offline");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .getByText("Linen could not reach the service.", { exact: false })
    .waitFor();
  assert.equal(
    await page.getByLabel("Keep the conversation going").inputValue(),
    "Still not working while offline",
  );
  await context.setOffline(false);
  checks.push("Offline submit preserves unsent message");
  await page
    .getByLabel("Keep the conversation going")
    .fill("The design workspace is still unavailable.");
  const replySaved = page.waitForResponse(r => r.url().endsWith(`/work/${workId}/messages`)
    && r.request().method() === "POST");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  assert.equal((await replySaved).status(), 201);
  // Start the next user action from persisted readback. A concurrent reply
  // refresh must not detach the correction form while this test opens it.
  await page.reload();
  await page
    .getByText("The design workspace is still unavailable.", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Still not working?", exact: true })
    .click();
  await page
    .getByLabel("What is happening?")
    .fill("Independent usage still fails.");
  await page.getByRole("button", { name: "Save to this conversation" }).click();
  await page
    .getByText("What is happening?", { exact: true })
    .waitFor({ state: "hidden" });
  assert.equal((await api("/work/" + workId)).work.state, "open");
  checks.push("Still-broken correction persists without claiming recovery");
  await fulfilmentDecisionJourney(page, api, base, uid);
  checks.push('Existing catalogue decision UI reaches the current holder and records approval without granting provider rights');
  const employee = await api("/members", {
    name: "Browser employee",
    email: "employee-" + Date.now() + "@example.test",
    password: "Browser-proof-2026",
    roles: ["employee"],
  });
  const employeeWork = await api("/work", {
    title: "Employee accessible request",
    body: "A test request for a named beneficiary",
    beneficiaryId: employee.id,
    deduplicationKey: crypto.randomUUID(),
  });
  await api("/work/" + employeeWork.id + "/messages", {
    body: "Confidential operator assessment",
    visibility: "private",
    sourceMessageId: crypto.randomUUID(),
  });
  const employeeInfo = (await api("/members")).find(
    (m) => m.id === employee.id,
  );
  const privateFile = await page.evaluate(
    async ({ workId }) => {
      const s = await (await fetch("/api/v1/session")).json();
      const r = await fetch("/api/v1/work/" + workId + "/attachments", {
        method: "POST",
        headers: {
          "X-Linen-CSRF": s.csrfToken,
          "X-Filename": "private-note.txt",
          "X-Visibility": "private",
          "Content-Type": "text/plain",
        },
        body: "Private original bytes",
      });
      return r.json();
    },
    { workId: employeeWork.id },
  );
  const other = await browser.newContext({
    timezoneId: "UTC",
    viewport: { width: 390, height: 844 },
  });
  try {
    const ep = await other.newPage();
    ep.on("pageerror", (error) => errors.push(String(error)));
    await ep.goto(base + '/app');
    await ep.getByLabel("Work email").fill(employeeInfo.email);
    await ep.getByLabel("Password", { exact: true }).fill("Browser-proof-2026");
    await ep.getByRole("button", { name: "Sign in", exact: true }).click();
    await ep
      .getByRole("heading", { name: "Requests", exact: true })
      .waitFor();
    const progressWork = await ep.evaluate(async () => {
      const session = await (await fetch('/api/v1/session')).json();
      const created = await (await fetch('/api/v1/work', {method:'POST',headers:{'Content-Type':'application/json','X-Linen-CSRF':session.csrfToken},body:JSON.stringify({title:'Synthetic progress check',body:'Synthetic progress check',deduplicationKey:crypto.randomUUID()})})).json();
      await fetch('/api/v1/work/'+created.id+'/interpret',{method:'POST',headers:{'X-Linen-CSRF':session.csrfToken}});
      return created;
    });
    await ep.goto(base + '/app#/work/' + progressWork.id);
    await ep.getByText('Your message is saved, but automatic assessment is unavailable.', {exact:true}).waitFor();
    assert.ok(await ep.getByLabel('Request progress').getByText('Next owner: Workspace owner').count());
    assert.equal(await ep.getByRole('button',{name:/^Needs you/}).count(),0);
    await captureJourney(ep, {path:out+'/employee-request-progress.png',fullPage:true});
    checks.push('Employee sees retained configuration hold and next owner without operator responsibilities');
    await page.goto(base + '/app#/work');
    await page.getByRole('button', {name:/^Needs you/}).click();
    await page.getByRole('row').filter({has:page.getByText('Synthetic progress check',{exact:true})}).click();
    await page.getByLabel('Request progress').getByText('Next owner: Workspace owner',{exact:true}).waitFor();
    await captureJourney(page, {path:out+'/owner-request-progress.png',fullPage:true});
    checks.push('Owner reaches the persisted employee hold from accountable responsibilities and sees its next owner in the same conversation');
    // A delayed old conversation response must not replace the newly selected one.
    await ep.route('**/api/v1/work/'+progressWork.id, async route => {
      const response = await route.fetch();
      await new Promise(resolve => setTimeout(resolve, 700));
      try { await route.fulfill({response}); } catch { /* Aborted old request. */ }
    });
    await ep.goto(base + '/app#/work');
    await ep.getByRole('heading',{name:'Requests', exact: true}).waitFor();
    await ep.goto(base + '/app#/work/' + progressWork.id);
    await ep.waitForTimeout(100);
    await ep.goto(base + "/app#/work/" + employeeWork.id);
    await ep.getByRole('heading',{name:'Employee accessible request',exact:true}).waitFor();
    await ep.waitForTimeout(900);
    assert.equal(await ep.getByRole('heading',{name:'Synthetic progress check',exact:true}).count(),0);
    await ep.unroute('**/api/v1/work/'+progressWork.id);
    checks.push('Delayed old conversation response cannot replace the newly selected request');

    await ep.getByText("Keep the conversation going").waitFor();
    assert.equal(
      await ep
        .getByText("Confidential operator assessment", { exact: true })
        .count(),
      0,
    );
    assert.equal(await ep.getByLabel("Message visibility").count(), 0);
    const status = await ep.evaluate(
      async (id) => (await fetch("/api/v1/attachments/" + id)).status,
      privateFile.id,
    );
    assert.ok([403, 404].includes(status));
    await ep.goto(base + "/app#/lifecycle");
    await ep.getByRole("alert").first().waitFor();
    await ep.screenshot({ path: out + "/09-denied.png", fullPage: true });
    checks.push(
      "Employee cannot read private note, private attachment or HR lifecycle",
    );
    await other.clearCookies();
    await ep.reload();
    await ep.getByRole("button", { name: "Sign in", exact: true }).waitFor();
    checks.push("Expired session returns to sign in");
  } finally {
    await other.close();
  }
  await dependencyJourney({page,api,base,out});
  await problemDetectionJourney({page,api,base,out});
  await recurrenceJourney({page,api,base,out});
  await assetFinancialJourney({page,api,base,out});
  await timeJourney({page,base,api,workId,out});
  checks.push("DESK-012 manual and measured active effort reaches the role-scoped report at desktop and mobile widths");
  await problemJourney({page,api,base,out});
  checks.push("PROB-001 reviewed expiring workaround published from three incidents and offered on a matching request");
  for (const width of [1440, 390]) await unsentReplyJourney({ page, api, base, out, width });
  checks.push("DESK-008 unsent reply drafts survive reload and post only on explicit Send");
  assert.deepEqual(errors, []);
  await writeFile(
    out + "/results.json",
    JSON.stringify({ checks, pageErrors: errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, pageErrors: errors }));
} catch (error) {
  await page
    .screenshot({ path: out + "/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}

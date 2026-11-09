import {offlineReplyJourney} from '../tests/ui/offline-reply-journey.mjs';
import {deskQueueJourney,deskScenarioJourney,mcpCommentJourney} from '../tests/ui/desk-console-journeys.mjs';
import { pendingPersonJourney } from '../tests/ui/pending-person-journey.mjs';
import { catalogTaskJourney } from '../tests/ui/catalog-task-journey.mjs';
import { sandboxJourney, sandboxBoundaryJourney } from '../tests/ui/sandbox-journey.mjs';
import { lifecycleTemplateJourney } from '../tests/ui/lifecycle-template-journey.mjs';
import { lightweightImportJourney } from '../tests/ui/lightweight-import-journey.mjs';
import { applicationJourney, catalogFormJourney, catalogAudienceJourney } from '../tests/ui/application-journey.mjs';
import { catalogQuoteJourney } from '../tests/ui/catalog-quote-journey.mjs';
import { calendarJourney } from '../tests/ui/calendar-journey.mjs';
import { searchJourney } from '../tests/ui/search-journey.mjs';
import { unsentReplyJourney } from '../tests/ui/response-journey.mjs';
import { problemDetectionJourney } from '../tests/ui/problem-detection-journey.mjs';
import { dependencyJourney } from '../tests/ui/dependency-journey.mjs';
import { recurrenceJourney } from '../tests/ui/recurrence-journey.mjs';
import { assetFinancialJourney } from '../tests/ui/asset-financial-journey.mjs';
import { assetAuditJourney, stockJourney } from '../tests/ui/asset-audit-journey.mjs';
import { sharingJourney } from '../tests/ui/sharing-journey.mjs';
import { deskFieldJourney } from '../tests/ui/desk-field-journey.mjs';
import { problemJourney } from "../tests/ui/problem-journey.mjs";
import { classificationJourney } from "../tests/ui/classification-journey.mjs";
import { timeJourney } from '../tests/ui/time-journey.mjs';
import { nativeCreate, dstJourney, incidentNativeDetails, namedApproverJourney } from "../tests/ui/native-regressions.mjs";
import { custodyJourney } from "../tests/ui/custody-journey.mjs";
import { fulfilmentDecisionJourney } from "../tests/ui/fulfilment-decision-journey.mjs";
import { captureJourney, lifecycleVariants } from "../tests/ui/viewport-evidence.mjs";
import { finishFirstRun } from '../tests/ui/connected-helpers.mjs';
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.LINEN_TEST_URL;
if (!base) throw Error("Use node tests/ui/run.mjs to start an isolated worker");
const out = process.env.LINEN_TEST_OUTPUT || "test-results/ui";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ ...(process.env.LINEN_CHROMIUM_EXECUTABLE ? {executablePath:process.env.LINEN_CHROMIUM_EXECUTABLE} : {}),  headless: true, args: ['--no-sandbox', "--use-mock-keychain", "--password-store=basic"] });
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
  let boundary;
  for(const width of [1440,390])boundary=await sandboxJourney({page,api,base,out,width});
  await sandboxBoundaryJourney({page,api,base,out,...boundary});
  assert.deepEqual(errors,[]);
  await writeFile(out+'/sandbox-results.json',JSON.stringify({widths:[1440,390],complete:true,pageErrors:errors},null,2));
} catch(error) {
  await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});
  throw error;
} finally {await browser.close();}

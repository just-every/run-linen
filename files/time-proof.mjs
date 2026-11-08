import {deskQueueJourney,deskScenarioJourney,mcpCommentJourney} from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/desk-console-journeys.mjs';
import { pendingPersonJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/pending-person-journey.mjs';
import { catalogTaskJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/catalog-task-journey.mjs';
import { sandboxJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/sandbox-journey.mjs';
import { lifecycleTemplateJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/lifecycle-template-journey.mjs';
import { lightweightImportJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/lightweight-import-journey.mjs';
import { applicationJourney, catalogFormJourney, catalogAudienceJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/application-journey.mjs';
import { catalogQuoteJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/catalog-quote-journey.mjs';
import { calendarJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/calendar-journey.mjs';
import { searchJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/search-journey.mjs';
import { unsentReplyJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/response-journey.mjs';
import { problemDetectionJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/problem-detection-journey.mjs';
import { dependencyJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/dependency-journey.mjs';
import { recurrenceJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/recurrence-journey.mjs';
import { assetFinancialJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/asset-financial-journey.mjs';
import { assetAuditJourney, stockJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/asset-audit-journey.mjs';
import { sharingJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/sharing-journey.mjs';
import { deskFieldJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/desk-field-journey.mjs';
import { problemJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/problem-journey.mjs';
import { classificationJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/classification-journey.mjs';
import { timeJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/time-journey.mjs';
import { nativeCreate, dstJourney, incidentNativeDetails, namedApproverJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/native-regressions.mjs';
import { custodyJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/custody-journey.mjs';
import { fulfilmentDecisionJourney } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/fulfilment-decision-journey.mjs';
import { captureJourney, lifecycleVariants } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/viewport-evidence.mjs';
import { finishFirstRun } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/tests/ui/connected-helpers.mjs';
import { chromium } from 'file:///home/agent/rer-consolidation/work/sx-linen-c-f9/run-linen/node_modules/playwright/index.mjs';
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
  const session = await api("/session");
  const uid = session.principal.userId;
  const work = await api('/work', {title:'Synthetic linen effort proof',body:'Synthetic linen effort proof',deduplicationKey:'synthetic-linen-605'});
  const result = await timeJourney({page,base,api,workId:work.id,out});
  const screenAudit = await page.getByRole('region',{name:'Next automation proposal'}).evaluate(element => ({
    fonts: [...element.querySelectorAll('p,h3,th,td')].map(e=>({tag:e.tagName,size:getComputedStyle(e).fontSize})),
    iconOnly: [...element.querySelectorAll('button,a')].filter(e=>!e.textContent.trim()).map(e=>({label:e.getAttribute('aria-label'),title:e.getAttribute('title')})),
  }));
  assert.deepEqual(errors,[]);
  await writeFile(out+'/time-proof-receipt.json',JSON.stringify({schema:1,journey:'tests/ui/time-journey.mjs#timeJourney',assertionWidth:1440,captureWidths:[1440,390],passed:true,pageErrors:errors,screenAudit},null,2)+'\n');
  console.log('PASS focused timeJourney: native pending report explanation and inert proposal disclosure');
} catch(error) {
  await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});
  throw error;
} finally { await context.close(); await browser.close(); }

import { chromium } from '/workspace/run-linen/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';
import { problemDetectionJourney } from '/workspace/run-linen/tests/ui/problem-detection-journey.mjs';
import { finishFirstRun, apiFor } from '/workspace/run-linen/tests/ui/connected-helpers.mjs';
const base = process.env.LINEN_TEST_URL;
const out = process.env.LINEN_TEST_OUTPUT;
await mkdir(out, {recursive:true});
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
try {
  const context = await browser.newContext({timezoneId:'UTC',viewport:{width:1440,height:1000}});
  const page = await context.newPage();
  await page.goto(base+'/app');
  await page.getByLabel('Your name').fill('Fleet proof owner');
  await page.getByLabel('Workspace name').fill('Native recurrence proof');
  await page.getByLabel('Work email').fill('fleet@runeditrun.com');
  await page.getByLabel('Password',{exact:true}).fill(crypto.randomUUID());
  await page.getByRole('button',{name:'Create workspace'}).click();
  await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
  await finishFirstRun(page,base);
  await problemDetectionJourney({page,api:apiFor(page),base,out});
} finally {
  await browser.close();
}

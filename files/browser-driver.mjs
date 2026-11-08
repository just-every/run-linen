import assert from 'node:assert/strict';
import { chromium } from '/home/agent/rer-consolidation/work/sx-linen-c-f10/run-linen/node_modules/playwright/index.mjs';
import { apiFor, finishFirstRun } from '/home/agent/rer-consolidation/work/sx-linen-c-f10/run-linen/tests/ui/connected-helpers.mjs';
import { sharingJourney } from '/home/agent/rer-consolidation/work/sx-linen-c-f10/run-linen/tests/ui/sharing-journey.mjs';
const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT,errors=[];
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'/app');
  await page.getByLabel('Your name').fill('Morgan Hayes');
  await page.getByLabel('Workspace name').fill('Synthetic Linen service desk');
  await page.getByLabel('Work email').fill('synthetic-linen-14102'+'@'+'example.test');
  await page.getByLabel('Password',{exact:true}).fill('synthetic-linen-14103-password');
  await page.getByRole('button',{name:'Create workspace'}).click();
  await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
  await finishFirstRun(page,base);
  await sharingJourney({browser,context,page,api:apiFor(page),base,out,errors});
  assert.deepEqual(errors,[]);
} finally {await browser.close();}

import assert from 'node:assert/strict';
import {chromium} from '/workspace/run-linen/node_modules/playwright/index.mjs';
import {apiFor,finishFirstRun,requestWork} from '/workspace/run-linen/tests/ui/connected-helpers.mjs';
import {monitoringJourney} from '/workspace/run-linen/tests/ui/service-notice-journey.mjs';
import {mailboxJourney} from '/workspace/run-linen/tests/ui/mailbox-journey.mjs';
import {offlineReplyJourney} from '/workspace/run-linen/tests/ui/offline-reply-journey.mjs';
const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),errors=[];
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base+'/app');
 await page.getByLabel('Your name').fill('Morgan Hayes');
 await page.getByLabel('Workspace name').fill('Transition journey desk');
 await page.getByLabel('Work email').fill('notice-owner@example.test');
 await page.getByLabel('Password',{exact:true}).fill('synthetic-Connected-browser-2026');
 await page.getByRole('button',{name:'Create workspace'}).click();
 await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
 await finishFirstRun(page,base);
 const env={browser,context,page,api:apiFor(page),base,out,errors};
 await monitoringJourney(env);
 await mailboxJourney(env);
 await requestWork(page,base,'The design workspace is unavailable.');
 await page.getByLabel('Keep the conversation going').waitFor();
 await page.getByText('Reading the remaining responsibilities…',{exact:true}).waitFor({state:'hidden'});
 await offlineReplyJourney(env);
 console.log('PASS offlineReplyJourney: visible failed-submit feedback and intact unsent draft');
 assert.deepEqual(errors,[]);
} finally {await browser.close();}

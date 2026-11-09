import { chromium } from '/workspace/run-linen/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {apiFor,finishFirstRun,createConnection} from '/workspace/run-linen/tests/ui/connected-helpers.mjs';
import {responseJourney,unsentReplyJourney} from '/workspace/run-linen/tests/ui/response-journey.mjs';
import {applicationJourney} from '/workspace/run-linen/tests/ui/application-journey.mjs';
import {lifecycleTemplateJourney} from '/workspace/run-linen/tests/ui/lifecycle-template-journey.mjs';
const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
const context=await browser.newContext({timezoneId:'UTC',viewport:{width:1440,height:1000}});
const page=await context.newPage();page.setDefaultTimeout(15000);
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try {
 await page.goto(base+'/app');
 await page.getByLabel('Your name').fill('Synthetic Linen owner');
 await page.getByLabel('Workspace name').fill('Synthetic Linen tooltip check');
 await page.getByLabel('Work email').fill('synthetic-linen-owner@example.test');
 await page.getByLabel('Password',{exact:true}).fill('synthetic-Connected-browser-2026');
 await page.getByRole('button',{name:'Create workspace'}).click();
 await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
 await finishFirstRun(page,base);
 const api=apiFor(page),env={browser,context,page,api,base,out,width:1440};
 if (process.env.LINEN_PROBE_ONLY !== '1') {
   await unsentReplyJourney(env);
   await applicationJourney(env);
   await lifecycleTemplateJourney(env);
 }
 const employee=await api('/members',{name:'Synthetic Linen requester',email:'synthetic-linen-requester@example.test',password:'synthetic-Connected-browser-2026',roles:['employee'],isPerson:true});
 const model=await createConnection(page,api,base,'openai','Fixture reasoning',{model:'fixture-model',apiKey:'test-only-model',inputUsdPerMillion:1,cachedInputUsdPerMillion:1,outputUsdPerMillion:1,maxOutputTokens:1000,maxAttemptUsd:1,limitUsd:10});
 await page.locator('.connection-record').filter({has:page.getByRole('heading',{name:'Fixture reasoning',exact:true})}).getByRole('button',{name:'Use for service reasoning'}).click();
 await page.getByText('Default reasoning connection',{exact:true}).waitFor();
 await responseJourney({...env,employee});
 console.log('PASS unchanged responseJourney at 1440');
 if(process.env.LINEN_PROBE_PHONE === '1') await responseJourney({...env,employee,width:390});
 if (process.env.LINEN_PROBE_ONLY !== '1') {
   // Test the same native tooltip with the actual reduced-motion preference.
   await page.emulateMedia({reducedMotion:'reduce'});
   const profile=page.getByRole('button',{name:'Your workspace and account',exact:true});
   await profile.focus();
   const reduced=await profile.evaluate(e=>({duration:getComputedStyle(e,'::after').transitionDuration,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches}));
   console.log('REDUCED_MOTION',JSON.stringify(reduced));
   assert.equal(reduced.duration,'0s');
   for (const width of [1440,390]) {
     await page.setViewportSize({width,height:width===1440?1000:844});
     await page.keyboard.press('Tab');await profile.focus();
     await page.screenshot({path:`${out}/tooltip-${width}.png`,fullPage:true});
   }
 }
 assert.deepEqual(errors,[]);
} catch(error) {
 const profile=page.getByRole('button',{name:'Your workspace and account',exact:true});
 const state=await profile.evaluate(e=>({duration:getComputedStyle(e,'::after').transitionDuration,delay:getComputedStyle(e,'::after').transitionDelay,opacity:getComputedStyle(e,'::after').opacity,focused:e===document.activeElement,focusVisible:e.matches(':focus-visible'),hover:e.matches(':hover'),reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,active:document.activeElement?.outerHTML})).catch(()=>null);
 console.log('TOOLTIP_DIAGNOSTIC',JSON.stringify(state));
 await writeFile(out+'/failure.txt',String(error)+'\n'+JSON.stringify(state,null,2));
 throw error;
} finally {await browser.close();}

import {chromium} from './repo/node_modules/playwright/index.mjs';
import {dependencyJourney} from './repo/tests/ui/dependency-journey.mjs';
import {apiFor,finishFirstRun} from './repo/tests/ui/connected-helpers.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
assert.ok(base&&out);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
try {
 const context=await browser.newContext({timezoneId:'UTC',viewport:{width:1440,height:1000}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base+'/app');await page.getByLabel('Work email').waitFor();
 await page.getByLabel('Your name').fill('UI Test Owner');
 await page.getByLabel('Workspace name').fill('Isolated dependency proof');
 await page.getByLabel('Work email').fill(['ui-owner','example.test'].join('@'));
 await page.getByLabel('Password',{exact:true}).fill('Browser-proof-2026');
 await page.getByRole('button',{name:'Create workspace'}).click();
 await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
 await finishFirstRun(page,base);
 await dependencyJourney({page,api:apiFor(page),base,out});
 assert.deepEqual(errors,[]);
 await writeFile(out+'/results.json',JSON.stringify({journey:'dependencyJourney',assertionWidth:1440,captureWidths:[1440,390],pageErrors:errors,source:'tests/ui/dependency-journey.mjs; also called unconditionally by tests/ui/browser.mjs'},null,2)+'\n');
} finally {await browser.close();}

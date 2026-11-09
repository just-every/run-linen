import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {apiFor,finishFirstRun} from '../tests/ui/connected-helpers.mjs';
import {recurrenceJourney} from '../tests/ui/recurrence-journey.mjs';
const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'});
  const page=await context.newPage();
  await page.goto(base+'/app');
  await page.getByLabel('Your name').fill('Synthetic Linen Owner');
  await page.getByLabel('Workspace name').fill('Synthetic Linen');
  await page.getByLabel('Work email').fill('synthetic-linen-33@example.test');
  await page.getByLabel('Password',{exact:true}).fill('synthetic-linen-3300');
  await page.getByRole('button',{name:'Create workspace',exact:true}).click();
  await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
  await finishFirstRun(page,base);
  await recurrenceJourney({page,api:apiFor(page),base,out});
  await context.close();
} finally {await browser.close();}

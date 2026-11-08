import { chromium } from '/workspace/run-linen/node_modules/playwright/index.mjs';
import { catalogQuoteJourney } from '/workspace/run-linen/tests/ui/catalog-quote-journey.mjs';
import { finishFirstRun, apiFor } from '/workspace/run-linen/tests/ui/connected-helpers.mjs';
const base=process.env.LINEN_TEST_URL, out=process.env.LINEN_TEST_OUTPUT;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'});
 const page=await context.newPage();
 await page.goto(base+'/app');
 await page.getByLabel('Your name').fill('Synthetic Linen Owner');
 await page.getByLabel('Workspace name').fill('Synthetic Linen Quote Proof');
 await page.getByLabel('Work email').fill(['synthetic-linen-1','example.test'].join(String.fromCharCode(64)));
 await page.getByLabel('Password',{exact:true}).fill('synthetic-linen-browser-2026');
 await page.getByRole('button',{name:'Create workspace'}).click();
 await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
 await finishFirstRun(page,base);
 await catalogQuoteJourney({browser,page,api:apiFor(page),base,out});
 console.log('PASS focused catalogQuoteJourney; screenshots at 1440 and 390');
} finally {await browser.close();}

import assert from 'node:assert/strict';
const root=process.cwd();
const {chromium}=await import(root+'/node_modules/playwright/index.mjs');
const {sandboxJourney}=await import(root+'/tests/ui/sandbox-journey.mjs');
const {finishFirstRun,apiFor}=await import(root+'/tests/ui/connected-helpers.mjs');
const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
try {
 const context=await browser.newContext({timezoneId:'UTC',viewport:{width:1440,height:1000}});
 const page=await context.newPage();
 page.on('response',r=>{if(r.status()>=500)console.error('SERVER_RESPONSE',r.request().method(),new URL(r.url()).pathname,r.status());});
 await page.goto(base+'/app');
 await page.getByLabel('Your name').fill('UI Test Owner');
 await page.getByLabel('Workspace name').fill('Isolated sandbox acceptance');
 await page.getByLabel('Work email').fill('ui-owner@example.test');
 await page.getByLabel('Password',{exact:true}).fill('Browser-proof-2026');
 await page.getByRole('button',{name:'Create workspace'}).click();
 await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
 await finishFirstRun(page,base);
 const api=apiFor(page);
 for(let i=0;i<Number(process.env.SANDBOX_REPEATS||1);i++) {
  await sandboxJourney({page,api,base,out,width:1440});
  console.log('SANDBOX_PASS',i+1);
 }
} finally {await browser.close();}

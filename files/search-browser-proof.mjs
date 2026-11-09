import {chromium} from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/node_modules/playwright/index.mjs';
import {finishFirstRun,apiFor,signIn} from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/ui/connected-helpers.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  await page.goto(base+'/app');
  await page.getByLabel('Your name').fill('Search proof owner');
  await page.getByLabel('Workspace name').fill('Search proof');
  await page.getByLabel('Work email').fill('synthetic-linen-1@example.test');
  await page.getByLabel('Password',{exact:true}).fill('synthetic-linen-password-1');
  await page.getByRole('button',{name:'Create workspace',exact:true}).click();
  await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
  await finishFirstRun(page,base);
  const api=apiFor(page);
  const unrelated=await api('/work',{title:'synthetic-linen-9707 laptop slow',body:'Linen: We will reply by 3:20 PM.',deduplicationKey:crypto.randomUUID()});
  const exact=await api('/work',{title:'synthetic-linen-20',body:'The requested numbered record',deduplicationKey:crypto.randomUUID()});
  await api('/members',{name:'Search proof operator',email:'synthetic-linen-2@example.test',password:'synthetic-linen-password-2',roles:['operator']});
  const operatorContext=await browser.newContext({viewport:{width:1440,height:1000}}),operatorPage=await operatorContext.newPage();
  await signIn(operatorPage,base,'synthetic-linen-2@example.test','synthetic-linen-password-2');
  await operatorPage.locator('.top-search').getByRole('searchbox').fill('synthetic-linen-20');
  await operatorPage.locator('.top-search').getByRole('searchbox').press('Enter');
  await operatorPage.getByRole('heading',{name:'Workspace search',exact:true}).waitFor();
  await operatorPage.getByRole('link',{name:exact.title,exact:true}).waitFor();
  const result=await apiFor(operatorPage)('/search?q=synthetic-linen-20&type=ticket');
  assert.deepEqual(result.items.map(row=>row.id),[exact.id]);
  assert.equal(await operatorPage.getByRole('link',{name:unrelated.title,exact:true}).count(),0);
  for(const width of [1440,390]) {
    await operatorPage.setViewportSize({width,height:width===1440?1000:844});
    await operatorPage.screenshot({path:out+`/search-${width}.png`,fullPage:true});
  }
  await writeFile(out+'/browser-receipt.json',JSON.stringify({base:'isolated loopback runtime',browser:'/usr/bin/chromium',assertionWidth:1440,screenshotWidths:[1440,390],query:'synthetic-linen-20',total:result.total,matchedIds:result.items.map(row=>row.id),excludedId:unrelated.id,passed:true},null,2)+'\n');
  console.log('PASS native operator search: exact identifier retained; unrelated deadline ticket excluded; screenshots 1440 and 390');
} finally {await browser.close();}

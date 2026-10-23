import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {apiFor,action,finishFirstRun} from './connected-helpers.mjs';
const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
if(!base)throw Error('Use tests/ui/run.mjs tests/ui/billing-browser.mjs');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base+'/app');await page.getByLabel('Your name').fill('Avery Morgan');await page.getByLabel('Workspace name').fill('Northstar Studio');await page.getByLabel('Work email').fill('avery@northstar.example');await page.getByLabel('Password',{exact:true}).fill('synthetic-linen-1');await page.getByRole('button',{name:'Create workspace'}).click();await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();await finishFirstRun(page,base);
 const api=apiFor(page);
 await api('/members',{name:'Morgan Facilities',email:'facilities@northstar.example',password:'synthetic-linen-2',roles:['operator']});
 await api('/members',{name:'Jordan Employee',email:'employee@northstar.example',password:'synthetic-linen-3',roles:['employee']});
 await api('/members',{name:'Sam Approver',email:'approver@northstar.example',password:'synthetic-linen-4',roles:['approver']});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/app#/billing');await page.getByRole('heading',{name:'Pricing & budgets',exact:true}).waitFor();
  await action(page,'Agent seat pricing',{name:'Northstar service plan',agentSeatCents:2500},'/billing/plan','Save seat pricing');
  await action(page,'Monthly reasoning budget',{limitUsd:50},'/intelligence/budget','Save monthly budget');
  const form=page.getByRole('region',{name:'Invoice preview'}).locator('form');
  for(const [name,value]of Object.entries({street:'100 Main Street',city:'Austin',state:'TX',postalCode:'78701',rate:'8.25',taxable:'80',jurisdiction:'Austin, Texas',basis:'Owner-entered Texas data processing determination: 20 percent exemption and applicable local sales tax.'}))await form.locator(`[name="${name}"]`).fill(value);
  await form.getByLabel('Sales tax applies',{exact:true}).check();
  const received=page.waitForResponse(r=>r.url().endsWith('/billing/invoice-preview')&&r.request().method()==='POST');await form.getByRole('button',{name:'Preview invoice',exact:true}).click();assert.equal((await received).status(),200);
  const estimate=page.getByRole('region',{name:'Invoice estimate'});await estimate.getByText('$53.30',{exact:true}).waitFor();assert.match(await estimate.innerText(),/Agent seats\s+2/);assert.match(await estimate.innerText(),/Free requesters and approvers\s+2/);
  const profile=page.getByRole('button',{name:'Your workspace and account'});await profile.focus();
  assert.equal(await profile.getAttribute('data-tip'),'Your account');assert.equal(await profile.evaluate(e=>getComputedStyle(e,'::after').opacity),'1');
  await page.locator('h1').focus();await profile.hover();await page.waitForTimeout(420);assert.equal(await profile.evaluate(e=>getComputedStyle(e,'::after').opacity),'1');
  await page.screenshot({path:`${out}/billing-invoice-${width}.png`,fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  await page.reload();await page.getByRole('heading',{name:'Pricing & budgets',exact:true}).waitFor();assert.equal((await api('/billing/plan')).agent_seat_cents,2500);assert.equal((await api('/intelligence/budget')).limit_usd,50);
 }
 assert.deepEqual(errors,[]);console.log('PASS monthly budget and Texas seat invoice native UI 1440/390; free requester/approver seats, persistence and icon tooltips');
}finally{await browser.close()}

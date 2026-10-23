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
  const profile=page.getByRole('button',{name:'Your workspace and account'});await page.keyboard.press('Tab');await profile.focus();
  assert.equal(await profile.evaluate(e=>e.matches(':focus-visible')),true);
  assert.equal(await profile.getAttribute('data-tip'),'Your account');assert.equal(await profile.evaluate(e=>getComputedStyle(e,'::after').opacity),'1');
  await profile.evaluate(e=>e.blur());await page.evaluate(()=>window.scrollTo(0,0));await page.mouse.move(0,0);await profile.hover();assert.equal(await profile.evaluate(e=>getComputedStyle(e,'::after').transitionDelay),'0.3s');await page.waitForTimeout(420);assert.equal(await profile.evaluate(e=>getComputedStyle(e,'::after').opacity),'1');assert.notEqual(await profile.evaluate(e=>getComputedStyle(e,'::after').color),await profile.evaluate(e=>getComputedStyle(e,'::after').backgroundColor));
  await page.screenshot({path:`${out}/billing-invoice-${width}.png`,fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  await page.reload();await page.getByRole('heading',{name:'Pricing & budgets',exact:true}).waitFor();assert.equal((await api('/billing/plan')).agent_seat_cents,2500);assert.equal((await api('/intelligence/budget')).limit_usd,50);
 }
 const custom=await api('/members',{name:'Riley Facilities',email:'synthetic-linen-12070@example.test',password:'synthetic-linen-12071',roles:['employee']});
 const department=await api('/departments',{name:'Facilities',kind:'facilities'}),grants=[];
 for(const name of ['Facilities agent','Facilities responder']) {
  const role=await api('/department-roles',{name,departmentId:department.id,permissions:['ticket.read']});
  grants.push(await api(`/department-roles/${role.id}/members`,{roleRevision:role.revision,userId:custom.id,active:true,revision:0}));
 }
 const captureSeats=async(seats,freeMembers,state)=>{
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1000});await page.goto(base+'/app#/billing');
   const form=page.getByRole('region',{name:'Invoice preview'}).locator('form');
   for(const [name,value] of Object.entries({street:'100 Main Street',city:'Austin',state:'TX',postalCode:'78701'}))await form.locator(`[name="${name}"]`).fill(value);
   const received=page.waitForResponse(r=>r.url().endsWith('/billing/invoice-preview')&&r.request().method()==='POST');
   await form.getByRole('button',{name:'Preview invoice',exact:true}).click();assert.equal((await received).status(),200);
   const estimate=page.getByRole('region',{name:'Invoice estimate'});await estimate.waitFor();
   assert.match(await estimate.innerText(),new RegExp(`Agent seats\\s+${seats}`));assert.match(await estimate.innerText(),new RegExp(`Free requesters and approvers\\s+${freeMembers}`));
   await estimate.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`${out}/ROLE-001-billing-${state}-${width}.png`});
  }
 };
 const invoice=()=>api('/billing/invoice-preview',{address:{street:'100 Main Street',city:'Austin',state:'TX',postalCode:'78701',country:'US'},tax:{applicable:false,rateBps:0,taxableBps:0,jurisdiction:'Owner determination',basis:'No tax in this preview'}});
 let preview=await invoice();assert.equal(preview.seats,3,'Multiple current department roles count one agent seat');assert.equal(preview.freeMembers,2,'Unassigned requester and approver remain free');
 await captureSeats(3,2,'assigned');
 for(const [index,role] of grants.entries()) {
  await api(`/department-roles/${role.id}/members`,{roleRevision:role.revision,userId:custom.id,active:false,revision:role.members.find(m=>m.userId===custom.id).revision});
  preview=await invoice();assert.equal(preview.seats,index===0?3:2,'Only withdrawal of the final live grant releases the custom agent seat');
 }
 assert.equal(preview.freeMembers,3,'The former custom agent returns to free requester membership');
 await captureSeats(2,3,'withdrawn');
 assert.deepEqual(errors,[]);console.log('PASS monthly budget and Texas seat invoice native UI 1440/390; free requester and approver seats, persistence and icon tooltips');
}finally{await browser.close()}

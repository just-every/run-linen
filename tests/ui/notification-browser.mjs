import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {apiFor,action,finishFirstRun,signIn} from './connected-helpers.mjs';
const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT,password='synthetic-linen-1';
if(!base)throw Error('Use tests/ui/run.mjs tests/ui/notification-browser.mjs');
await mkdir(out,{recursive:true});
let debugPage;
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 debugPage=page;page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base+'/app');await page.getByLabel('Your name').fill('Avery Morgan');await page.getByLabel('Workspace name').fill('Northstar Studio');await page.getByLabel('Work email').fill('avery@northstar.example');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Create workspace'}).click();await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();await finishFirstRun(page,base);
 const api=apiFor(page);const employee=await api('/members',{name:'Jordan Employee',email:'jordan@northstar.example',password,roles:['employee']});
 const employeeContext=await browser.newContext(),ep=await employeeContext.newPage();await signIn(ep,base,'jordan@northstar.example',password);const employeeApi=apiFor(ep);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await ep.setViewportSize({width,height:1000});
  await page.goto(base+'/app#/work');await page.getByRole('link',{name:'Settings',exact:true}).click();await page.getByRole('link',{name:'Delivery & notifications',exact:true}).click();
  await page.getByRole('heading',{name:'Rules, templates & preferences'}).waitFor();
  const created=await action(page,'New notification template',{name:`Resolved ${width}`,language:'en-US',subject:'Resolution {{ticket.number}}',body:'Your request is complete, {{requester.first_name}}.',reason:'Use a clear personal resolution notice'},'/notification-templates','Save notification template',201);
  await page.getByLabel('Edit an existing template').selectOption(created.id);
  const edited=await action(page,'Edit notification template',{name:`Resolved ${width}`,language:'en-US',subject:'Resolved {{ticket.number}}',body:'All set, {{requester.first_name}}: {{ticket.title}}.',reason:'Include the request title and the first name'},'/notification-templates','Save notification template',201);
  await page.getByLabel('Rule recipient type').selectOption('person');
  await action(page,'Add a notification rule',{name:`Resolved requester ${width}`,event:'ticket.resolved',priority:'',departmentId:'',groupId:'',recipient:employee.id,templateId:edited.id,channel:'portal',mandatory:false,enabled:true,consent:true,reason:'Notify the named current requester on resolution'},'/notification-rules','Save notification rule',201);
  const work=await employeeApi('/work',{title:`Denver monitor restored ${width}`,body:'The display is working again after the replacement cable.',deduplicationKey:`notify-${width}`});
  await action(page,'Notification branding',{logoUrl:'',primaryColor:'#23483b',textColor:'#17251d',senderConnectionId:'',consent:true,reason:'Use Northstar colors in reviewed notifications'},'/notification-branding','Save notification branding');
  await action(page,'Preview with a ticket',{workId:work.id},`/notification-templates/${edited.id}/preview`,'Preview template');
  await page.getByRole('region',{name:'Branded message preview'}).getByText(`All set, Jordan: Denver monitor restored ${width}.`,{exact:true}).waitFor();
  assert.equal(await page.getByRole('region',{name:'Branded message preview'}).evaluate(e=>getComputedStyle(e).borderLeftColor),'rgb(35, 72, 59)');
  await api(`/work/${work.id}/commands`,{revision:work.revision,command:'close',reason:'Requester confirmed a working display'});
  await page.getByText('Notification change history',{exact:true}).click();
  await page.locator('details.evidence p').filter({hasText:'Include the request title and the first name'}).first().waitFor();
  await page.getByRole('heading',{name:'Before',exact:true}).first().waitFor();await page.getByRole('heading',{name:'After',exact:true}).first().waitFor();
  const profile=page.getByRole('button',{name:'Your workspace and account'});await page.keyboard.press('Tab');await profile.focus();assert.equal(await profile.evaluate(e=>getComputedStyle(e,'::after').opacity),'1');await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${out}/notification-rules-${width}.png`,fullPage:true});
  await page.getByRole('heading',{name:'Before',exact:true}).first().scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/notification-audit-${width}.png`,fullPage:false});
  await ep.goto(base+'/app#/work');await ep.getByRole('button',{name:'Your workspace and account'}).click();await ep.getByRole('link',{name:'Notification preferences',exact:true}).click();await ep.getByRole('heading',{name:'Your notifications',exact:true,level:1}).waitFor();
  await ep.getByRole('region',{name:'Your notification inbox'}).getByText(`All set, Jordan: Denver monitor restored ${width}.`,{exact:true}).waitFor();
  await action(ep,'Your notification preferences',{event:'ticket.public_update',channel:'portal',enabled:false},'/notification-preferences','Save preference');
  await ep.locator('p').filter({hasText:/Ticket.public update.*Opted out/i}).waitFor();
  // Mandatory preference refusal stays visible in the native form.
  const pref=ep.locator('details[data-action-path="/notification-preferences"]');await pref.getByRole('combobox',{name:/^Notification event/}).selectOption('approval.requested');
  const denied=ep.waitForResponse(r=>r.url().endsWith('/notification-preferences')&&r.request().method()==='POST');await pref.getByRole('button',{name:'Save preference',exact:true}).click();assert.equal((await denied).status(),422);await pref.getByRole('alert').waitFor();
  await ep.screenshot({path:`${out}/notification-preferences-${width}.png`,fullPage:true});
  assert.ok(await ep.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const ruleCard=page.locator('section.connection-record').filter({has:page.getByRole('heading',{name:`Resolved requester ${width}`,exact:true})});
  const disabled=page.waitForResponse(r=>r.url().endsWith('/notification-rules')&&r.request().method()==='POST');await ruleCard.getByRole('button',{name:'Disable rule',exact:true}).click();assert.equal((await disabled).status(),201);

 }
 assert.deepEqual(errors,[]);console.log('PASS native notification template edit, filled resolution, before/after audit, preferences and mandatory refusal at 1440/390');
}catch(error){await debugPage?.screenshot({path:`${out}/notification-failure.png`,fullPage:true}).catch(()=>{});throw error}finally{await browser.close()}

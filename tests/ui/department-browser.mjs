import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {apiFor,fields,finishFirstRun,signIn} from './connected-helpers.mjs';

const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
if(!base)throw Error('Start with node tests/ui/run.mjs tests/ui/department-browser.mjs');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']}),errors=[];
const password='synthetic-linen-302-password';
async function formAction(page,root,title,path,values,button='Save',expected=200,proofName) {
  const disclosure=root.locator(`details[data-action-path="${path}"]`).filter({has:page.locator('summary').getByText(title,{exact:true})}).last();
  if(!await disclosure.evaluate(e=>e.open))await disclosure.locator(':scope > summary').click();
  const form=disclosure.locator('form');await fields(form,values);
  if(proofName)for(const width of [1440,390]) {await page.setViewportSize({width,height:1000});await fields(form,values);await capture(page,proofName+'-editing',width);}
  const waiting=page.waitForResponse(r=>r.url().endsWith(path)&&r.request().method()==='POST');
  await form.getByRole('button',{name:button,exact:true}).click();const response=await waiting,data=await response.json();
  assert.equal(response.status(),expected,JSON.stringify(data));return data;
}
async function capture(page,name,width) {
  await page.setViewportSize({width,height:1000});
  await page.waitForFunction(()=>!document.querySelector('.loading'));await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} fits ${width}`);
  await page.screenshot({path:`${out}/DESK-011-${name}-${width}.png`,fullPage:true});
  await page.screenshot({path:`${out}/DESK-011-${name}-${width}-viewport.png`});
}
async function captureBoth(page,name) {for(const width of [1440,390])await capture(page,name,width);}
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(base+'/app');await page.getByLabel('Your name').fill('Alex Patel');await page.getByLabel('Workspace name').fill('Northstar Studio');
  await page.getByLabel('Work email').fill('synthetic-linen-299@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Create workspace',exact:true}).click();
  await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();await finishFirstRun(page,base);
  const api=apiFor(page),owner=await api('/session');
  const member=async(n,name,roles)=>({...await api('/members',{name,email:`synthetic-linen-${n}@example.test`,password,roles}),name,email:`synthetic-linen-${n}@example.test`});
  const itAgent=await member(303,'Maya Chen',['operator']),facAgent=await member(304,'Jordan Lee',['operator']),hrAgent=await member(305,'Priya Shah',['operator']),employee=await member(306,'Avery Morgan',['employee']);
  await page.goto(base+'/app#/members');
  const management=page.getByRole('region',{name:'Department workspaces'}),departments={},groups={};
  for(const [kind,name] of [['it','IT'],['hr','HR service'],['facilities','Facilities'],['finance','Finance'],['legal','Legal']])departments[kind]=await formAction(page,management,'Add department workspace','/departments',{name,kind},'Create workspace',201,kind==='it'?'workspace-create':undefined);
  const openDepartment=async(name)=>{const details=management.locator('details').filter({has:page.locator(':scope > summary').getByText(name,{exact:true})}).first();await details.locator(':scope > summary').waitFor();if(!await details.evaluate(e=>e.open))await details.locator(':scope > summary').click();return details;};
  for(const [kind,person] of [['it',itAgent],['facilities',facAgent],['hr',hrAgent]]) {
    const panel=await openDepartment(departments[kind].name),form=panel.getByRole('form',{name:`${departments[kind].name} staff membership`});
    await form.getByLabel('Staff member',{exact:true}).selectOption(person.id);
    if(kind==='it')for(const width of [1440,390]) {await page.setViewportSize({width,height:1000});await form.getByLabel('Staff member',{exact:true}).selectOption(person.id);await capture(page,'staff-membership-add',width);}
    const saved=page.waitForResponse(r=>r.url().endsWith(`/departments/${departments[kind].id}/members`)&&r.request().method()==='POST');
    await form.getByRole('button',{name:'Save staff membership',exact:true}).click();assert.equal((await saved).status(),200);
    await panel.getByText(person.name,{exact:false}).first().waitFor();
  }
  // Remove and restore a staff membership through the owner's native controls, retaining no implicit role access.
  let itPanel=await openDepartment('IT'),staffForm=itPanel.getByRole('form',{name:'IT staff membership'});
  await staffForm.getByLabel('Membership action',{exact:true}).selectOption('remove');await staffForm.getByLabel('Staff member',{exact:true}).selectOption(itAgent.id);
  for(const width of [1440,390]) {await page.setViewportSize({width,height:1000});await staffForm.getByLabel('Membership action',{exact:true}).selectOption('remove');await staffForm.getByLabel('Staff member',{exact:true}).selectOption(itAgent.id);await capture(page,'staff-membership-remove',width);}
  let membershipSaved=page.waitForResponse(r=>r.url().endsWith(`/departments/${departments.it.id}/members`)&&r.request().method()==='POST');
  await staffForm.getByRole('button',{name:'Save staff membership',exact:true}).click();assert.equal((await membershipSaved).status(),200);
  await itPanel.getByText('No staff assigned',{exact:true}).waitFor();await captureBoth(page,'staff-membership-removed');
  staffForm=itPanel.getByRole('form',{name:'IT staff membership'});await staffForm.getByLabel('Staff member',{exact:true}).selectOption(itAgent.id);
  membershipSaved=page.waitForResponse(r=>r.url().endsWith(`/departments/${departments.it.id}/members`)&&r.request().method()==='POST');
  await staffForm.getByRole('button',{name:'Save staff membership',exact:true}).click();assert.equal((await membershipSaved).status(),200);
  for(const kind of ['it','facilities']) {
    const panel=await openDepartment(departments[kind].name);
    const group=await formAction(page,panel,'Add workspace group','/work-groups',{name:`${departments[kind].name} support`},'Create group',201,kind==='it'?'group-create':undefined);
    groups[kind]=group;
    if(kind==='it') {
      const groupPanel=panel.locator('details').filter({has:page.locator(':scope > summary').getByText('IT support',{exact:true})}).first();await groupPanel.locator(':scope > summary').click();
      await formAction(page,groupPanel,'Add an agent to this group',`/work-groups/${group.id}/members`,{userId:itAgent.id,lead:true},'Save',200,'group-member');
      await formAction(page,groupPanel,'Automatic assignment',`/work-groups/${group.id}/assignment`,{mode:'round_robin',maxOpen:8},'Save',200,'group-assignment');
      await formAction(page,groupPanel,`Remove ${itAgent.name} from group`,`/work-groups/${group.id}/members/${itAgent.id}/remove`,{},'Remove from group',200,'group-member-remove');
      await formAction(page,groupPanel,'Add an agent to this group',`/work-groups/${group.id}/members`,{userId:itAgent.id,lead:true});
    }
    const rule=await formAction(page,panel,'Add workspace routing rule','/work-routing/rules',{name:`${departments[kind].name} intake`,position:kind==='it'?10:20,groupId:group.id},'Create routing rule',201,kind==='it'?'routing-rule-create':undefined);
    if(kind==='it')await formAction(page,panel,'Remove IT intake',`/work-routing/rules/${rule.id}/remove`,{},'Remove rule',200,'routing-rule-remove');
    await formAction(page,panel,'Add workspace SLA policy','/sla-policies',{name:`${departments[kind].name} response`,position:kind==='it'?10:20,firstResponseMinutes:60,nextResponseMinutes:120,resolutionMinutes:480},'Create SLA policy',201,kind==='it'?'sla-policy-create':undefined);
  }
  for(const width of [1440,390]) {await openDepartment('IT');await capture(page,'workspace-management',width);}
  const finance=await openDepartment('Finance');
  await formAction(page,finance,'Edit workspace',`/departments/${departments.finance.id}`,{name:'Finance',active:false},'Save workspace',200,'workspace-deactivate');
  await management.getByText('Finance · Inactive',{exact:true}).waitFor();await captureBoth(page,'inactive-workspace');
  const inactiveFinance=management.locator('details').filter({has:page.locator(':scope > summary').getByText('Finance · Inactive',{exact:true})}).first();
  await formAction(page,inactiveFinance,'Edit workspace',`/departments/${departments.finance.id}`,{name:'Finance',active:true},'Save workspace',200,'workspace-reactivate');
  // Native catalog ownership selectors; employee discovery continues to use the existing reviewed audience door.
  await page.goto(base+'/app#/connections');
  const registry=page.getByRole('region',{name:'Application registry',exact:true}),items={};
  for(const [kind,name] of [['it','Replace a laptop adapter'],['facilities','Repair a desk socket']])items[kind]={...await formAction(page,registry,'Add catalog item','/catalog',{
    name,departmentId:departments[kind].id,kind:'service',target:kind==='it'?'Laptop adapter replacement':'Desk socket repair',ownerId:owner.user.id,
  },'Save catalog item',201,kind==='it'?'catalog-item-create':undefined),name};
  for(const width of [1440,390])await capture(page,'catalog-settings',width);
  // Edit catalog ownership and the quote requirement with the actual native editor at each width.
  const formsPanel=registry.locator('details').filter({has:page.locator(':scope > summary').getByText('Manage catalog forms',{exact:true})}).first();await formsPanel.locator(':scope > summary').click();
  const itemEditor=formsPanel.locator('details').filter({has:page.locator(':scope > summary').getByText(items.it.name,{exact:true})}).first();await itemEditor.locator(':scope > summary').click();
  const catalogForm=itemEditor.locator('form');
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});await catalogForm.getByLabel('Service workspace',{exact:true}).selectOption(departments.it.id);
    await catalogForm.getByLabel('Require a vendor quote (PDF)',{exact:true}).check();await capture(page,'catalog-form-workspace-editing',width);
  }
  let saved=page.waitForResponse(r=>r.url().endsWith(`/catalog/${items.it.id}/form`)&&r.request().method()==='POST');
  await catalogForm.getByRole('button',{name:'Save catalog form',exact:true}).click();assert.equal((await saved).status(),200);
  await captureBoth(page,'catalog-form-workspace-saved');
  // The registry and its catalog offer have their own service-workspace selectors.
  await registry.getByText('Register application',{exact:true}).click();
  const registration=registry.locator('details').filter({has:page.locator(':scope > summary').getByText('Register application',{exact:true})}).first().locator('form');
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    await registration.getByLabel('Application name',{exact:true}).fill('Studio Design');await registration.getByLabel('Service workspace',{exact:true}).selectOption(departments.it.id);
    await registration.getByLabel('Application owner',{exact:true}).selectOption(owner.user.id);await registration.getByLabel('Connector description',{exact:true}).fill('Ownership registration only; provider not connected');
    await registration.getByLabel('Application data sensitivity',{exact:true}).selectOption('internal');await registration.getByLabel('Entitlement name 1',{exact:true}).fill('Designer');
    await registration.getByLabel('Entitlement target 1',{exact:true}).fill('Studio designer access');await registration.getByLabel('Seat cost in USD 1',{exact:true}).fill('24');await registration.getByLabel('Billing period 1',{exact:true}).selectOption('month');
    await capture(page,'application-workspace-register',width);
  }
  saved=page.waitForResponse(r=>r.url().endsWith('/applications')&&r.request().method()==='POST');await registration.getByRole('button',{name:'Save application',exact:true}).click();assert.equal((await saved).status(),201);
  const application=registry.getByRole('article').filter({has:page.getByRole('heading',{name:'Studio Design',exact:true})});await application.getByRole('heading',{name:'Studio Design',exact:true}).waitFor();
  const designItem=await formAction(page,application,'Offer in catalog','/catalog',{name:'Design editor access',departmentId:departments.it.id},'Save',201,'application-catalog-offer');
  await application.getByText('Edit application',{exact:true}).click();const appEdit=application.locator('details').filter({has:page.locator(':scope > summary').getByText('Edit application',{exact:true})}).first().locator('form');
  for(const width of [1440,390]) {await page.setViewportSize({width,height:1000});await appEdit.getByLabel('Service workspace',{exact:true}).selectOption(departments.it.id);await appEdit.getByLabel('Connector description',{exact:true}).fill('IT owns the registration; provider not connected');await capture(page,'application-workspace-edit',width);}
  saved=page.waitForResponse(r=>/\/applications\/[^/]+$/.test(r.url())&&r.request().method()==='POST');await appEdit.getByRole('button',{name:'Save application',exact:true}).click();assert.equal((await saved).status(),200);
  await captureBoth(page,'application-workspace-saved');
  const loanerItem=await formAction(page,registry,'Add catalog item','/catalog',{name:'Set up a laptop loaner',departmentId:departments.it.id,kind:'service',target:'Laptop loaner preparation',ownerId:owner.user.id},'Save catalog item',201);
  const audienceValue=await api('/catalog-values',{dimension:'department',label:'Finance team'});
  const hiddenItem=await api('/catalog',{name:'Finance software review',kind:'service',target:'Finance software review service',ownerId:owner.user.id,departmentId:departments.it.id,audience:{department:[audienceValue.id],location:[],employmentType:[]}});
  await page.goto(base+'/app#/work');const bundlePanel=page.getByRole('region',{name:'Bundles',exact:true});
  await formAction(page,bundlePanel,'Build a bundle','/catalog-bundles',{name:'New designer setup',catalogIds:[designItem.id,loanerItem.id]},'Save',201,'same-workspace-bundle-build');
  for(const checkbox of await bundlePanel.locator('details[data-action-path="/catalog-bundles"]').getByRole('checkbox').all())await checkbox.uncheck();
  await formAction(page,bundlePanel,'Build a bundle','/catalog-bundles',{name:'Desk and design setup',catalogIds:[designItem.id,items.facilities.id]},'Save',201,'mixed-workspace-bundle-build');
  await bundlePanel.getByText('Desk and design setup spans different service workspaces.',{exact:false}).waitFor();await captureBoth(page,'mixed-workspace-bundle-refusal');
  await page.goto(base+'/app#/knowledge');
  await formAction(page,page,'Publish reviewed knowledge','/knowledge',{title:'Report a damaged power socket',body:'Stop using the socket. Ask Facilities to inspect it before connecting another device.',departmentId:departments.facilities.id,scope:'employees',expiresAt:'2030-01-01T00:00',review:true},'Save',201,'knowledge-publish');
  for(const width of [1440,390]) {await page.setViewportSize({width,height:1000});await page.getByLabel('Knowledge workspace',{exact:true}).selectOption(departments.it.id);await page.getByLabel('Knowledge workspace',{exact:true}).selectOption(departments.facilities.id);await capture(page,'knowledge-workspace-filter',width);}
  await page.getByRole('heading',{name:'Report a damaged power socket',exact:true}).waitFor();
  for(const width of [1440,390])await capture(page,'workspace-knowledge',width);

  const itContext=await browser.newContext({viewport:{width:1440,height:1000}}),employeeContext=await browser.newContext({viewport:{width:1440,height:1000}}),facContext=await browser.newContext({viewport:{width:1440,height:1000}});
  const ip=await itContext.newPage(),ep=await employeeContext.newPage(),fp=await facContext.newPage();
  for(const p of [ip,ep,fp])p.on('pageerror',error=>errors.push(String(error)));
  await signIn(ip,base,itAgent.email,password);await signIn(ep,base,employee.email,password);await signIn(fp,base,facAgent.email,password);
  const employeeApi=apiFor(ep),itApi=apiFor(ip),facApi=apiFor(fp);
  const nativeRequest=async(team,body)=>{
    await ep.goto(base+'/app#/work');for(const width of [1440,390]) {await ep.setViewportSize({width,height:1000});await ep.getByLabel('What would make work easier?',{exact:true}).fill(body);await ep.getByLabel('Service workspace (optional)',{exact:true}).selectOption(team);await capture(ep,'employee-workspace-draft',width);}
    // The routing choice remains with its unsent text after reload.
    await ep.reload();await ep.getByLabel('What would make work easier?',{exact:true}).waitFor();await ep.waitForFunction(expected=>document.querySelector('[aria-label="Service workspace (optional)"]')?.value===expected,team);
    assert.equal(await ep.getByLabel('Service workspace (optional)',{exact:true}).inputValue(),team);
    await ep.getByRole('button',{name:'Send message',exact:true}).click();await ep.waitForURL(/#\/work\/[^/?]+$/);
    return ep.url().split('/').at(-1);
  };
  const hrWork=await nativeRequest(departments.hr.id,'Please help me find the payroll correction form.');
  await ip.goto(base+'/app#/work/'+hrWork);await ip.getByRole('alert').first().waitFor();
  await captureBoth(ip,'it-denied-hr-workspace');
  assert.equal(await ip.evaluate(async id=>(await fetch('/api/v1/work/'+id)).status,hrWork),404,'IT staff cannot read an HR-service ticket');
  const hrRecord=await api('/work',{title:'Restricted employee record correction',body:'Review the recorded employee address with the HR record owner.',sensitivity:'hr',deduplicationKey:'synthetic-linen-311'});
  const hrContext=await browser.newContext(),hp=await hrContext.newPage();await signIn(hp,base,hrAgent.email,password);
  assert.equal(await hp.evaluate(async id=>(await fetch('/api/v1/work/'+id)).status,hrRecord.id),404,'HR-service membership does not grant HR-record authority');await hp.goto(base+'/app#/work/'+hrRecord.id);await hp.getByRole('alert').first().waitFor();await captureBoth(hp,'hr-service-denied-record');await hrContext.close();

  // HR history follows the existing ticket. A move grants no destination-only reader access.
  await page.goto(base+'/app#/work/'+hrWork);await page.getByLabel('Message visibility',{exact:true}).selectOption('private');
  const hrNote='HR service reviewed the payroll form location. Preserve this internal review when IT checks the portal link.';
  await page.getByLabel('A private note for the service team',{exact:true}).fill(hrNote);
  let hrSaved=page.waitForResponse(r=>r.url().endsWith(`/work/${hrWork}/messages`)&&r.request().method()==='POST');await page.getByRole('button',{name:'Send message',exact:true}).click();assert.equal((await hrSaved).status(),201);
  await page.locator('.message-body').getByText(hrNote,{exact:true}).waitFor();const hrBefore=await api('/work/'+hrWork);
  const retainedNotice='HR workspace restrictions stay with this ticket. Receiving staff need current access to both the receiving workspace and every retained HR workspace. Handoff does not grant access or lower sensitivity.';
  await page.getByText(retainedNotice,{exact:true}).waitFor();await page.getByText('Hand off to another workspace',{exact:true}).click();
  const hrHandoff=page.getByRole('form',{name:'Workspace handoff'});
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});await hrHandoff.getByLabel('Receiving workspace',{exact:true}).selectOption(departments.it.id);await hrHandoff.getByLabel('Receiving agent',{exact:true}).selectOption('');
    assert.ok(!(await hrHandoff.getByLabel('Receiving agent',{exact:true}).locator('option').allTextContents()).some(name=>name.includes(itAgent.name)),'An IT-only agent is not offered for retained HR history');
    await hrHandoff.getByLabel('Reason for handoff',{exact:true}).fill('IT will check the payroll portal link; the original HR service access restriction must remain.');await capture(page,'hr-to-it-handoff-editing',width);
  }
  hrSaved=page.waitForResponse(r=>r.url().endsWith(`/work/${hrWork}/department`)&&r.request().method()==='POST');await hrHandoff.getByRole('button',{name:'Hand off this ticket',exact:true}).click();assert.equal((await hrSaved).status(),200);
  await page.getByText(retainedNotice,{exact:true}).waitFor();await page.locator('.meta-line').getByText('IT',{exact:true}).waitFor();
  const hrAfter=await api('/work/'+hrWork);assert.equal(hrAfter.work.department_id,departments.it.id);assert.equal(hrAfter.work.assignee_id,null);assert.equal(hrAfter.work.sensitivity,hrBefore.work.sensitivity);
  assert.ok(JSON.parse(hrAfter.work.protected_departments_json).includes(departments.hr.id),'The original HR workspace remains a current access requirement');
  for(const message of hrBefore.messages)assert.ok(hrAfter.messages.some(m=>m.id===message.id&&m.body===message.body),'HR handoff preserves each original message');
  await page.locator('.message-body').getByText(hrNote,{exact:true}).waitFor();await captureBoth(page,'owner-retained-hr-history');
  await ip.goto(base+'/app#/work/'+hrWork);await ip.getByRole('alert').first().waitFor();assert.equal(await ip.evaluate(async id=>(await fetch('/api/v1/work/'+id)).status,hrWork),404,'IT-only staff remain denied after HR→IT handoff');await captureBoth(ip,'it-denied-retained-hr-history');
  // Only an explicit second staff membership admits the receiving agent; withdrawing it removes access again.
  await page.goto(base+'/app#/members');let hrPanel=await openDepartment('HR service'),hrMembership=hrPanel.getByRole('form',{name:'HR service staff membership'});
  await hrMembership.getByLabel('Staff member',{exact:true}).selectOption(itAgent.id);await captureBoth(page,'retained-hr-dual-staff-grant');
  hrSaved=page.waitForResponse(r=>r.url().endsWith(`/departments/${departments.hr.id}/members`)&&r.request().method()==='POST');await hrMembership.getByRole('button',{name:'Save staff membership',exact:true}).click();assert.equal((await hrSaved).status(),200);
  await ip.goto(base+'/app#/work/'+hrWork);await ip.locator('.message-body').getByText(hrNote,{exact:true}).waitFor();assert.equal((await itApi('/work/'+hrWork)).work.id,hrWork,'Current staff in both workspaces can read retained HR service history');await captureBoth(ip,'dual-staff-retained-hr-history');
  assert.equal(await ip.evaluate(async id=>(await fetch('/api/v1/work/'+id)).status,hrRecord.id),404,'Dual service memberships never grant HR-record authority');
  await page.reload();hrPanel=await openDepartment('HR service');hrMembership=hrPanel.getByRole('form',{name:'HR service staff membership'});await hrMembership.getByLabel('Membership action',{exact:true}).selectOption('remove');await hrMembership.getByLabel('Staff member',{exact:true}).selectOption(itAgent.id);
  hrSaved=page.waitForResponse(r=>r.url().endsWith(`/departments/${departments.hr.id}/members`)&&r.request().method()==='POST');await hrMembership.getByRole('button',{name:'Save staff membership',exact:true}).click();assert.equal((await hrSaved).status(),200);
  await ip.reload();await ip.getByRole('alert').first().waitFor();assert.equal(await ip.evaluate(async id=>(await fetch('/api/v1/work/'+id)).status,hrWork),404,'Withdrawing the original HR workspace membership immediately removes access');await captureBoth(ip,'retained-hr-access-withdrawn');

  for(const width of [1440,390]) {
    for(const p of [page,ep,ip,fp])await p.setViewportSize({width,height:1000});
    await ep.goto(base+'/app#/work');const portal=ep.getByRole('region',{name:'Services across departments'});
    await portal.getByRole('heading',{name:'IT',exact:true}).waitFor();await portal.getByRole('heading',{name:'Facilities',exact:true}).waitFor();
    await portal.getByRole('button',{name:items.it.name,exact:true}).waitFor();await portal.getByRole('button',{name:items.facilities.name,exact:true}).waitFor();
    assert.equal(await portal.getByRole('button',{name:'Finance software review',exact:true}).count(),0,'The new aggregate catalog keeps the existing audience restriction');
    await capture(ep,'employee-combined-catalog',width);
    await portal.getByRole('button',{name:items.facilities.name,exact:true}).click();
    const start=portal.getByRole('form',{name:'Start service request'});await start.getByLabel('What do you need?',{exact:true}).fill('The desk socket stopped working. Please inspect it safely.');await capture(ep,'employee-service-request-start',width);
    await start.getByRole('button',{name:'Continue to service form',exact:true}).click();await ep.waitForURL(/#\/work\/[^/?]+\?catalogId=/);
    const workId=new URL(ep.url()).hash.split('/').at(-1).split('?')[0],before=(await employeeApi('/work/'+workId)).work;
    assert.equal(before.department_id,departments.facilities.id,'Portal selection starts work with the selected service team');
    const serviceForm=ep.locator(`details[data-action-path="/work/${workId}/fulfilment"] form`);
    assert.equal(await serviceForm.getByRole('combobox',{name:'Service',exact:true}).inputValue(),items.facilities.id);
    assert.ok(!(await serviceForm.getByRole('combobox',{name:'Service',exact:true}).locator('option').allTextContents()).some(x=>x.includes(items.it.name)),'Existing ticket never silently changes teams for a catalog item');
    await serviceForm.getByLabel(/^What do you need it for\?/).fill('Restore power at the desk after inspection.');
    await capture(ep,'matching-workspace-service-form',width);
    const request=ep.waitForResponse(r=>r.url().endsWith(`/work/${workId}/fulfilment`)&&r.request().method()==='POST');await serviceForm.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await request).status(),201);
    await api(`/work/${workId}/messages`,{visibility:'private',body:'Facilities checked the socket. IT should inspect the laptop adapter next.',sourceMessageId:`synthetic-linen-${width===1440?312:313}`});
    const classification=await api(`/work/${workId}/classification`);
    await api(`/work/${workId}/classification/override`,{revision:classification.revision,workRevision:classification.workRevision,type:'service_request',category:'hardware',subcategory:'other',impact:'low',urgency:'low',priority:'P4',reason:'Existing Facilities request needs IT inspection.'});
    const messages=(await api('/work/'+workId)).messages,sla=await api(`/work/${workId}/sla`);
    await page.goto(base+'/app#/work/'+workId);
    await page.getByText('Hand off to another workspace',{exact:true}).click();const handoff=page.getByRole('form',{name:'Workspace handoff'});
    await handoff.getByLabel('Receiving workspace',{exact:true}).selectOption(departments.it.id);await handoff.getByLabel('Receiving group',{exact:true}).selectOption(groups.it.id);await handoff.getByLabel('Receiving agent',{exact:true}).selectOption(itAgent.id);await handoff.getByLabel('Reason for handoff',{exact:true}).fill('Facilities inspection is complete; IT will inspect the laptop adapter.');
    await capture(page,'owner-workspace-handoff-editing',width);
    const transferred=page.waitForResponse(r=>r.url().endsWith(`/work/${workId}/department`)&&r.request().method()==='POST');
    await handoff.getByRole('button',{name:'Hand off this ticket',exact:true}).focus();await page.keyboard.press('Enter');assert.equal((await transferred).status(),200);
    await page.getByRole('heading',{level:2,name:items.facilities.name,exact:true}).waitFor();
    const after=await api('/work/'+workId),afterSla=await api(`/work/${workId}/sla`);
    assert.equal(after.work.department_id,departments.it.id);assert.equal(after.work.sensitivity,before.sensitivity);assert.equal(after.work.assignee_id,itAgent.id);
    for(const message of messages)assert.ok(after.messages.some(m=>m.id===message.id&&m.body===message.body),'Handoff keeps original public and private history');
    assert.deepEqual(afterSla.policy,sla.policy,'Handoff retains the original bound SLA policy');assert.equal(afterSla.resolution.dueAt,sla.resolution.dueAt,'Handoff does not reset elapsed SLA time');
    await capture(page,'owner-handoff-history',width);
    const ticketGroup=page.getByRole('region',{name:'Group and owner',exact:true});await ticketGroup.getByLabel('Accountable group',{exact:true}).selectOption(groups.it.id);await ticketGroup.getByLabel('Owner (an agent in the group)',{exact:true}).selectOption(itAgent.id);await capture(page,'ticket-workspace-group-editing',width);
    const groupSaved=page.waitForResponse(r=>r.url().endsWith(`/work/${workId}/group`)&&r.request().method()==='POST');await ticketGroup.getByRole('button',{name:'Save group and owner',exact:true}).click();assert.equal((await groupSaved).status(),200);
    if(width===390)await page.locator('a.back-link[href="#/work"]').click();
    const ownerQueue=page.getByRole('region',{name:'Request queue'});await ownerQueue.getByLabel('Queue workspace',{exact:true}).selectOption(departments.it.id);
    await ownerQueue.getByText('Save a view',{exact:true}).click();const viewForm=ownerQueue.getByRole('form',{name:'Save a view'});
    await viewForm.getByLabel('View name',{exact:true}).fill(`IT handoffs · ${width===1440?'desktop':'mobile'}`);await viewForm.getByRole('checkbox').check();
    await capture(page,'workspace-queue-view-editing',width);
    const savingView=page.waitForResponse(r=>r.url().endsWith('/work-views')&&r.request().method()==='POST');await viewForm.getByRole('button',{name:'Save view',exact:true}).click();
    const viewResponse=await savingView;assert.equal(viewResponse.status(),201);const view=await viewResponse.json();assert.equal(view.departmentId,departments.it.id);
    assert.ok((await itApi('/work-views')).items.some(v=>v.id===view.id),'Receiving staff can use the workspace queue view');
    assert.ok(!(await facApi('/work-views')).items.some(v=>v.id===view.id),'Other service teams cannot discover the private workspace view');
    await capture(page,'workspace-queue-view',width);
    await ip.goto(base+'/app#/work/'+workId);await ip.getByRole('heading',{level:2,name:items.facilities.name,exact:true}).waitFor();
    if(width===390)await ip.locator('a.back-link[href="#/work"]').click();
    const queue=ip.getByRole('region',{name:'Request queue'});await queue.getByLabel('Queue workspace',{exact:true}).selectOption(departments.it.id);await queue.locator(`a[href="#/work/${workId}"]`).getByText(items.facilities.name,{exact:true}).waitFor();
    await capture(ip,'it-queue-after-handoff',width);
    assert.equal(await fp.evaluate(async id=>(await fetch('/api/v1/work/'+id)).status,workId),404,'Facilities staff lose access after handoff');
    await ep.reload();assert.ok(!(await ep.locator('body').innerText()).includes('Facilities checked the socket.'),'Employee never sees the private handoff investigation');
    assert.equal(await ep.getByText('Hand off to another workspace',{exact:true}).count(),0);
    await capture(ep,'employee-handoff-history',width);
    // The new portal start/form path inherits required quotes and exact quote readers.
    await ep.goto(base+'/app#/work');await portal.getByRole('button',{name:items.it.name,exact:true}).click();
    const quoteStart=portal.getByRole('form',{name:'Start service request'});await quoteStart.getByLabel('What do you need?',{exact:true}).fill('Please replace the damaged laptop adapter.');
    await quoteStart.getByRole('button',{name:'Continue to service form',exact:true}).click();await ep.waitForURL(/#\/work\/[^/?]+\?catalogId=/);
    const quoteWorkId=new URL(ep.url()).hash.split('/').at(-1).split('?')[0],quoteForm=ep.locator(`details[data-action-path="/work/${quoteWorkId}/fulfilment"] form`);
    await quoteForm.getByLabel(/^What do you need it for\?/).fill('Replace the damaged adapter with the quoted model.');
    let sending=ep.waitForResponse(r=>r.url().endsWith(`/work/${quoteWorkId}/fulfilment`)&&r.request().method()==='POST');
    await quoteForm.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await sending).status(),422,'Portal-created work still requires its catalog quote');
    await capture(ep,'portal-required-quote-refusal',width);
    await quoteForm.getByLabel('Vendor quote (PDF)',{exact:false}).setInputFiles({name:'adapter-quote.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\n% synthetic-linen-334\n%%EOF\n')});
    sending=ep.waitForResponse(r=>r.url().endsWith(`/work/${quoteWorkId}/fulfilment`)&&r.request().method()==='POST');await quoteForm.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await sending).status(),201);
    await ep.getByRole('region',{name:'Submitted catalog forms',exact:true}).getByRole('link',{name:/Download the quote/}).waitFor();
    const quote=(await employeeApi(`/work/${quoteWorkId}/catalog-requests`)).items[0].catalogSnapshot.quote;
    assert.equal(await ip.evaluate(async id=>(await fetch('/api/v1/catalog-quotes/'+id)).status,quote.id),404,'Department staff access never grants quote access');
    const refused=await ep.evaluate(async ({workId,catalogId,userId})=>{const s=await(await fetch('/api/v1/session')).json();return (await fetch(`/api/v1/work/${workId}/fulfilment`,{method:'POST',headers:{'content-type':'application/json','X-Linen-CSRF':s.csrfToken},body:JSON.stringify({catalogId,beneficiaryId:userId,purpose:'Review finance tools for the new hire'})})).status;},{workId:quoteWorkId,catalogId:hiddenItem.id,userId:employee.id});
    assert.equal(refused,403,'A crafted request cannot bypass audience from the new portal');
    await capture(ep,'portal-inherited-quote-privacy',width);
    await ep.goto(base+'/app#/work');const employeeBundles=ep.getByRole('region',{name:'Bundles',exact:true});
    await employeeBundles.getByText('Desk and design setup spans different service workspaces.',{exact:false}).waitFor();
    const bundled=await formAction(ep,employeeBundles,'Request New designer setup',`/catalog-bundles/${(await employeeApi('/catalog-bundles')).items.find(b=>b.name==='New designer setup').id}/request`,{purpose:'Prepare the approved design tools and a loaner for the next project.'},'Request bundle',201);
    await ep.waitForURL(/#\/work\/[^/?]+$/);assert.equal((await employeeApi('/work/'+bundled.workId)).work.department_id,departments.it.id,'A same-workspace bundle creates work with its service team');
    await capture(ep,'employee-same-workspace-bundle',width);
  }
  await itContext.close();await employeeContext.close();await facContext.close();assert.deepEqual(errors,[]);
  console.log('PASS DESK-011 native 1440/390: five service workspaces, explicit staff, scoped catalogs/knowledge/SLA, HR→IT retains original HR restrictions with live dual-membership grant/withdrawal, HR-service staff denied HR records, combined employee catalog, Facilities→IT audited handoff retaining history/restrictions/SLA and withdrawing old staff access.');
} catch(error) {
  for(const [i,context] of browser.contexts().entries())for(const [j,page] of context.pages().entries())await page.screenshot({path:`${out}/DESK-011-failure-${i}-${j}.png`,fullPage:true}).catch(()=>{});
  throw error;
} finally {await browser.close();}

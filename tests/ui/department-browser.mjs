import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {apiFor,fields,finishFirstRun,signIn} from './connected-helpers.mjs';

const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
if(!base)throw Error('Start with node tests/ui/run.mjs tests/ui/department-browser.mjs');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']}),errors=[];
const password='synthetic-linen-302-password';
async function formAction(page,root,title,path,values,button='Save',expected=200) {
  const disclosure=root.locator(`details[data-action-path="${path}"]`).filter({has:page.locator('summary').getByText(title,{exact:true})}).last();
  if(!await disclosure.evaluate(e=>e.open))await disclosure.locator(':scope > summary').click();
  const form=disclosure.locator('form');await fields(form,values);
  const waiting=page.waitForResponse(r=>r.url().endsWith(path)&&r.request().method()==='POST');
  await form.getByRole('button',{name:button,exact:true}).click();const response=await waiting,data=await response.json();
  assert.equal(response.status(),expected,JSON.stringify(data));return data;
}
async function capture(page,name,width) {
  await page.setViewportSize({width,height:1000});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} fits ${width}`);
  await page.waitForFunction(()=>!document.querySelector('.loading'));await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`${out}/DESK-011-${name}-${width}.png`,fullPage:true});
}
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(base+'/app');await page.getByLabel('Your name').fill('Owner · synthetic-linen-299');await page.getByLabel('Workspace name').fill('synthetic-linen-300');
  await page.getByLabel('Work email').fill('synthetic-linen-299@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Create workspace',exact:true}).click();
  await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();await finishFirstRun(page,base);
  const api=apiFor(page),owner=await api('/session');
  const member=async(n,name,roles)=>({...await api('/members',{name,email:`synthetic-linen-${n}@example.test`,password,roles}),name,email:`synthetic-linen-${n}@example.test`});
  const itAgent=await member(303,'IT agent · synthetic-linen-303',['operator']),facAgent=await member(304,'Facilities agent · synthetic-linen-304',['operator']),hrAgent=await member(305,'HR service agent · synthetic-linen-305',['operator']),employee=await member(306,'Employee · synthetic-linen-306',['employee']);
  await page.goto(base+'/app#/members');
  const management=page.getByRole('region',{name:'Department workspaces'}),departments={};
  for(const [kind,name] of [['it','IT'],['hr','HR service'],['facilities','Facilities'],['finance','Finance'],['legal','Legal']])departments[kind]=await formAction(page,management,'Add department workspace','/departments',{name,kind},'Create workspace',201);
  const openDepartment=async(name)=>{const details=management.locator('details').filter({has:page.locator(':scope > summary').getByText(name,{exact:true})}).first();await details.locator(':scope > summary').waitFor();if(!await details.evaluate(e=>e.open))await details.locator(':scope > summary').click();return details;};
  for(const [kind,person] of [['it',itAgent],['facilities',facAgent],['hr',hrAgent]]) {
    const panel=await openDepartment(departments[kind].name),form=panel.getByRole('form',{name:`${departments[kind].name} staff membership`});
    await form.getByLabel('Staff member',{exact:true}).selectOption(person.id);
    const saved=page.waitForResponse(r=>r.url().endsWith(`/departments/${departments[kind].id}/members`)&&r.request().method()==='POST');
    await form.getByRole('button',{name:'Save staff membership',exact:true}).click();assert.equal((await saved).status(),200);
    await panel.getByText(person.name,{exact:false}).first().waitFor();
  }
  for(const kind of ['it','facilities']) {
    const panel=await openDepartment(departments[kind].name);
    const group=await formAction(page,panel,'Add workspace group','/work-groups',{name:`${departments[kind].name} support`},'Create group',201);
    await formAction(page,panel,'Add workspace routing rule','/work-routing/rules',{name:`${departments[kind].name} intake`,position:kind==='it'?10:20,groupId:group.id},'Create routing rule',201);
    await formAction(page,panel,'Add workspace SLA policy','/sla-policies',{name:`${departments[kind].name} response`,position:kind==='it'?10:20,firstResponseMinutes:60,nextResponseMinutes:120,resolutionMinutes:480},'Create SLA policy',201);
  }
  for(const width of [1440,390]) {await openDepartment('IT');await capture(page,'workspace-management',width);}
  const finance=await openDepartment('Finance');
  await formAction(page,finance,'Edit workspace',`/departments/${departments.finance.id}`,{name:'Finance',active:false},'Save workspace');
  await management.getByText('Finance · Inactive',{exact:true}).waitFor();await capture(page,'inactive-workspace',390);
  // Native catalog ownership selectors; employee discovery continues to use the existing reviewed audience door.
  await page.goto(base+'/app#/connections');
  const registry=page.getByRole('region',{name:'Application registry',exact:true}),items={};
  for(const [kind,name] of [['it','Replace a laptop adapter'],['facilities','Repair a desk socket']])items[kind]={...await formAction(page,registry,'Add catalog item','/catalog',{
    name,departmentId:departments[kind].id,kind:'service',target:kind==='it'?'synthetic-linen-307':'synthetic-linen-308',ownerId:owner.user.id,
  },'Save catalog item',201),name};
  for(const width of [1440,390])await capture(page,'catalog-settings',width);
  const currentIt=(await api('/catalog')).items.find(c=>c.id===items.it.id);
  await api(`/catalog/${items.it.id}/form`,{name:items.it.name,revision:currentIt.revision,departmentId:departments.it.id,form:{...currentIt.form,quoteRequired:true}});
  const audienceValue=await api('/catalog-values',{dimension:'department',label:'synthetic-linen-330'});
  const hiddenItem=await api('/catalog',{name:'synthetic-linen-331',kind:'service',target:'synthetic-linen-332',ownerId:owner.user.id,departmentId:departments.it.id,audience:{department:[audienceValue.id],location:[],employmentType:[]}});
  await page.goto(base+'/app#/knowledge');
  await formAction(page,page,'Publish reviewed knowledge','/knowledge',{title:'Report a damaged power socket',body:'Stop using the socket. Ask Facilities to inspect it before connecting another device.',departmentId:departments.facilities.id,scope:'employees',expiresAt:'2030-01-01T00:00',review:true});
  await page.getByLabel('Knowledge workspace',{exact:true}).selectOption(departments.facilities.id);
  await page.getByRole('heading',{name:'Report a damaged power socket',exact:true}).waitFor();
  for(const width of [1440,390])await capture(page,'workspace-knowledge',width);

  const itContext=await browser.newContext({viewport:{width:1440,height:1000}}),employeeContext=await browser.newContext({viewport:{width:1440,height:1000}}),facContext=await browser.newContext({viewport:{width:1440,height:1000}});
  const ip=await itContext.newPage(),ep=await employeeContext.newPage(),fp=await facContext.newPage();
  for(const p of [ip,ep,fp])p.on('pageerror',error=>errors.push(String(error)));
  await signIn(ip,base,itAgent.email,password);await signIn(ep,base,employee.email,password);await signIn(fp,base,facAgent.email,password);
  const employeeApi=apiFor(ep),itApi=apiFor(ip),facApi=apiFor(fp);
  const nativeRequest=async(team,body)=>{
    await ep.goto(base+'/app#/work');await ep.getByLabel('What would make work easier?',{exact:true}).fill(body);await ep.getByLabel('Service workspace (optional)',{exact:true}).selectOption(team);
    // The routing choice remains with its unsent text after reload.
    await ep.reload();await ep.getByLabel('What would make work easier?',{exact:true}).waitFor();await ep.waitForFunction(()=>document.querySelector('[aria-label="Service workspace (optional)"]')?.value!== '');
    assert.equal(await ep.getByLabel('Service workspace (optional)',{exact:true}).inputValue(),team);
    await ep.getByRole('button',{name:'Send message',exact:true}).click();await ep.waitForURL(/#\/work\/[^/?]+$/);
    return ep.url().split('/').at(-1);
  };
  const hrWork=await nativeRequest(departments.hr.id,'Please help me find the payroll correction form.');
  await ip.goto(base+'/app#/work/'+hrWork);await ip.getByRole('alert').first().waitFor();
  assert.equal(await ip.evaluate(async id=>(await fetch('/api/v1/work/'+id)).status,hrWork),404,'IT staff cannot read an HR-service ticket');
  const hrRecord=await api('/work',{title:'synthetic-linen-309',body:'synthetic-linen-310',sensitivity:'hr',deduplicationKey:'synthetic-linen-311'});
  const hrContext=await browser.newContext(),hp=await hrContext.newPage();await signIn(hp,base,hrAgent.email,password);
  assert.equal(await hp.evaluate(async id=>(await fetch('/api/v1/work/'+id)).status,hrRecord.id),404,'HR-service membership does not grant HR-record authority');await hrContext.close();

  for(const width of [1440,390]) {
    for(const p of [page,ep,ip,fp])await p.setViewportSize({width,height:1000});
    await ep.goto(base+'/app#/work');const portal=ep.getByRole('region',{name:'Services across departments'});
    await portal.getByRole('heading',{name:'IT',exact:true}).waitFor();await portal.getByRole('heading',{name:'Facilities',exact:true}).waitFor();
    await portal.getByRole('button',{name:items.it.name,exact:true}).waitFor();await portal.getByRole('button',{name:items.facilities.name,exact:true}).waitFor();
    assert.equal(await portal.getByRole('button',{name:'synthetic-linen-331',exact:true}).count(),0,'The new aggregate catalog keeps the existing audience restriction');
    await capture(ep,'employee-combined-catalog',width);
    await portal.getByRole('button',{name:items.facilities.name,exact:true}).click();
    const start=portal.getByRole('form',{name:'Start service request'});await start.getByLabel('What do you need?',{exact:true}).fill('The desk socket stopped working. Please inspect it safely.');
    await start.getByRole('button',{name:'Continue to service form',exact:true}).click();await ep.waitForURL(/#\/work\/[^/?]+\?catalogId=/);
    const workId=new URL(ep.url()).hash.split('/').at(-1).split('?')[0],before=(await employeeApi('/work/'+workId)).work;
    assert.equal(before.department_id,departments.facilities.id,'Portal selection starts work with the selected service team');
    const serviceForm=ep.locator(`details[data-action-path="/work/${workId}/fulfilment"] form`);
    assert.equal(await serviceForm.getByRole('combobox',{name:'Service',exact:true}).inputValue(),items.facilities.id);
    assert.ok(!(await serviceForm.getByRole('combobox',{name:'Service',exact:true}).locator('option').allTextContents()).some(x=>x.includes(items.it.name)),'Existing ticket never silently changes teams for a catalog item');
    await serviceForm.getByLabel('What do you need it for?',{exact:true}).fill('Restore power at the desk after inspection.');
    const request=ep.waitForResponse(r=>r.url().endsWith(`/work/${workId}/fulfilment`)&&r.request().method()==='POST');await serviceForm.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await request).status(),201);
    await api(`/work/${workId}/messages`,{visibility:'private',body:'Facilities checked the socket. IT should inspect the laptop adapter next.',sourceMessageId:`synthetic-linen-${width===1440?312:313}`});
    const classification=await api(`/work/${workId}/classification`);
    await api(`/work/${workId}/classification/override`,{revision:classification.revision,workRevision:classification.workRevision,type:'service_request',category:'hardware',subcategory:'other',impact:'low',urgency:'low',priority:'P4',reason:'Existing Facilities request needs IT inspection.'});
    const messages=(await api('/work/'+workId)).messages,sla=await api(`/work/${workId}/sla`);
    await page.goto(base+'/app#/work/'+workId);
    await page.getByText('Hand off to another workspace',{exact:true}).click();const handoff=page.getByRole('form',{name:'Workspace handoff'});
    await handoff.getByLabel('Receiving workspace',{exact:true}).selectOption(departments.it.id);await handoff.getByLabel('Receiving agent',{exact:true}).selectOption(itAgent.id);await handoff.getByLabel('Reason for handoff',{exact:true}).fill('Facilities inspection is complete; IT will inspect the laptop adapter.');
    const transferred=page.waitForResponse(r=>r.url().endsWith(`/work/${workId}/department`)&&r.request().method()==='POST');
    await handoff.getByRole('button',{name:'Hand off this ticket',exact:true}).focus();await page.keyboard.press('Enter');assert.equal((await transferred).status(),200);
    await page.getByRole('heading',{level:2,name:items.facilities.name,exact:true}).waitFor();
    const after=await api('/work/'+workId),afterSla=await api(`/work/${workId}/sla`);
    assert.equal(after.work.department_id,departments.it.id);assert.equal(after.work.sensitivity,before.sensitivity);assert.equal(after.work.assignee_id,itAgent.id);
    for(const message of messages)assert.ok(after.messages.some(m=>m.id===message.id&&m.body===message.body),'Handoff keeps original public and private history');
    assert.deepEqual(afterSla.policy,sla.policy,'Handoff retains the original bound SLA policy');assert.equal(afterSla.resolution.dueAt,sla.resolution.dueAt,'Handoff does not reset elapsed SLA time');
    await capture(page,'owner-handoff-history',width);
    const ownerQueue=page.getByRole('region',{name:'Request queue'});await ownerQueue.getByLabel('Queue workspace',{exact:true}).selectOption(departments.it.id);
    await ownerQueue.getByText('Save a view',{exact:true}).click();const viewForm=ownerQueue.getByRole('form',{name:'Save a view'});
    await viewForm.getByLabel('View name',{exact:true}).fill(`synthetic-linen-${width===1440?341:342}`);await viewForm.getByRole('checkbox').check();
    const savingView=page.waitForResponse(r=>r.url().endsWith('/work-views')&&r.request().method()==='POST');await viewForm.getByRole('button',{name:'Save view',exact:true}).click();
    const viewResponse=await savingView;assert.equal(viewResponse.status(),201);const view=await viewResponse.json();assert.equal(view.departmentId,departments.it.id);
    assert.ok((await itApi('/work-views')).items.some(v=>v.id===view.id),'Receiving staff can use the workspace queue view');
    assert.ok(!(await facApi('/work-views')).items.some(v=>v.id===view.id),'Other service teams cannot discover the private workspace view');
    await capture(page,'workspace-queue-view',width);
    await ip.goto(base+'/app#/work/'+workId);await ip.getByRole('heading',{level:2,name:items.facilities.name,exact:true}).waitFor();
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
    await quoteForm.getByLabel('What do you need it for?',{exact:true}).fill('Replace the damaged adapter with the quoted model.');
    let sending=ep.waitForResponse(r=>r.url().endsWith(`/work/${quoteWorkId}/fulfilment`)&&r.request().method()==='POST');
    await quoteForm.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await sending).status(),422,'Portal-created work still requires its catalog quote');
    await quoteForm.getByLabel('Vendor quote (PDF)',{exact:false}).setInputFiles({name:'synthetic-linen-333.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\n% synthetic-linen-334\n%%EOF\n')});
    sending=ep.waitForResponse(r=>r.url().endsWith(`/work/${quoteWorkId}/fulfilment`)&&r.request().method()==='POST');await quoteForm.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await sending).status(),201);
    await ep.getByRole('region',{name:'Submitted catalog forms',exact:true}).getByRole('link',{name:/Download the quote/}).waitFor();
    const quote=(await employeeApi(`/work/${quoteWorkId}/catalog-requests`)).items[0].catalogSnapshot.quote;
    assert.equal(await ip.evaluate(async id=>(await fetch('/api/v1/catalog-quotes/'+id)).status,quote.id),404,'Department staff access never grants quote access');
    const refused=await ep.evaluate(async ({workId,catalogId,userId})=>{const s=await(await fetch('/api/v1/session')).json();return (await fetch(`/api/v1/work/${workId}/fulfilment`,{method:'POST',headers:{'content-type':'application/json','X-Linen-CSRF':s.csrfToken},body:JSON.stringify({catalogId,beneficiaryId:userId,purpose:'synthetic-linen-335'})})).status;},{workId:quoteWorkId,catalogId:hiddenItem.id,userId:employee.id});
    assert.equal(refused,403,'A crafted request cannot bypass audience from the new portal');
    await capture(ep,'portal-inherited-quote-privacy',width);
  }
  await itContext.close();await employeeContext.close();await facContext.close();assert.deepEqual(errors,[]);
  console.log('PASS DESK-011 native 1440/390: five service workspaces, explicit staff, scoped catalogs/knowledge/SLA, IT denied HR-service ticket, HR-service staff denied HR records, combined employee catalog, Facilities→IT audited handoff retaining history/restrictions/SLA and withdrawing old staff access.');
} catch(error) {
  for(const [i,context] of browser.contexts().entries())for(const [j,page] of context.pages().entries())await page.screenshot({path:`${out}/DESK-011-failure-${i}-${j}.png`,fullPage:true}).catch(()=>{});
  throw error;
} finally {await browser.close();}

import assert from 'node:assert/strict';
import {captureJourney} from './viewport-evidence.mjs';

export async function applicationJourney({page,api,base,out}) {
  const session=await api('/session');
  await page.goto(base+'/app#/connections');
  const registry=page.getByRole('region',{name:'Application registry',exact:true});
  await registry.getByText('Register application',{exact:true}).click();
  const form=registry.locator('form').first();
  await form.getByLabel('Application name',{exact:true}).fill('Salesforce');
  await form.getByLabel('Application owner',{exact:true}).selectOption(session.user.id);
  await form.getByLabel('Connector description',{exact:true}).fill('Salesforce · not connected');
  await form.getByLabel('Application data sensitivity',{exact:true}).selectOption('confidential');
  await form.getByLabel('Entitlement name 1',{exact:true}).fill('Sales user');
  await form.getByLabel('Entitlement target 1',{exact:true}).fill('salesforce-sales');
  await form.getByLabel('Seat cost in USD 1',{exact:true}).fill('80');
  await form.getByLabel('Billing period 1',{exact:true}).selectOption('month');
  await form.getByRole('button',{name:'Add entitlement',exact:true}).click();
  await form.getByLabel('Entitlement name 2',{exact:true}).fill('Salesforce administrator');
  await form.getByLabel('Entitlement target 2',{exact:true}).fill('salesforce-admin');
  await form.getByLabel('Seat cost in USD 2',{exact:true}).fill('165');
  await form.getByLabel('Billing period 2',{exact:true}).selectOption('month');
  await captureJourney(page,{path:out+'/ACCESS-008-registry-form.png',fullPage:true});
  const saving=page.waitForResponse(r=>r.url().endsWith('/applications')&&r.request().method()==='POST');
  await form.getByRole('button',{name:'Save application',exact:true}).click();
  assert.equal((await saving).status(),201,'ACCESS-008 native registry saves both permission sets');
  const app=registry.getByRole('article').filter({has:page.getByRole('heading',{name:'Salesforce',exact:true})});
  await app.getByText('Salesforce administrator',{exact:true}).waitFor();
  const link=app.getByRole('group',{name:'Salesforce administrator',exact:true});
  await link.getByText('Offer in catalog',{exact:true}).click();
  await link.getByLabel('Catalog service name').fill('Salesforce administrator access');
  const linking=page.waitForResponse(r=>r.url().endsWith('/catalog')&&r.request().method()==='POST');
  await link.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await linking).status(),201);
  await captureJourney(page,{path:out+'/ACCESS-008-registry.png',fullPage:true});
  const work=await api('/work',{title:'Salesforce administration',body:'Maintain the service configuration',deduplicationKey:crypto.randomUUID()});
  await page.goto(base+'/app#/work/'+work.id);
  const selection=page.locator('details').filter({has:page.getByText('Or choose a known service',{exact:true})});
  await selection.locator(':scope > summary').click();
  const catalog=(await api('/catalog')).items.find(c=>c.name==='Salesforce administrator access');
  await selection.getByLabel('Service').selectOption(catalog.id);
  await selection.getByLabel('What do you need it for?').fill('Maintain Salesforce settings');
  const submitted=page.waitForResponse(r=>r.url().endsWith('/fulfilment')&&r.request().method()==='POST');
  await selection.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await submitted).status(),201);
  await page.getByRole('region',{name:'Requested applications',exact:true}).getByText('$165.00 / month',{exact:true}).waitFor();
  await page.locator('.work-outcome details.obligation').first().locator(':scope > summary').click();
  await captureJourney(page,{path:out+'/ACCESS-008-request.png',fullPage:true});
  await page.reload();
  await page.getByRole('region',{name:'Requested applications',exact:true}).getByText('$165.00 / month',{exact:true}).waitFor();
  const duties=await api(`/work/${work.id}/obligations`);
  assert.ok(duties.items.some(d=>d.target==='salesforce-admin'&&d.owner_id===session.user.id),'ACCESS-008 native request persists the application-owner route');
  await captureJourney(page,{path:out+'/ACCESS-008-request-reloaded.png',fullPage:true});
  await page.goto(base+'/app#/connections');
  const edited=page.getByRole('region',{name:'Application registry',exact:true}).getByRole('article').filter({has:page.getByRole('heading',{name:'Salesforce',exact:true})});
  await edited.getByText('Edit application',{exact:true}).click();
  const edit=edited.locator('form').last();
  await edit.getByLabel('Seat cost in USD 2',{exact:true}).fill('199');
  await captureJourney(page,{path:out+'/ACCESS-008-registry-edit.png',fullPage:true});
  const updating=page.waitForResponse(r=>/\/applications\/[^/]+$/.test(r.url())&&r.request().method()==='POST');
  await edit.getByRole('button',{name:'Save application',exact:true}).click();assert.equal((await updating).status(),200);
  await edited.getByText('$199.00 / month',{exact:true}).waitFor();
  await captureJourney(page,{path:out+'/ACCESS-008-registry-updated.png',fullPage:true});
  await page.goto(base+'/app#/work/'+work.id);
  await page.getByRole('region',{name:'Requested applications',exact:true}).getByText('$165.00 / month',{exact:true}).waitFor();
  await captureJourney(page,{path:out+'/ACCESS-008-retained-request.png',fullPage:true});

}

/** CATALOG-001: the owner edits a real form; a submitted request keeps that revision. */
export async function catalogFormJourney({page,api,base,out}) {
  const session=await api('/session');
  const item=await api('/catalog',{name:'New monitor form',kind:'device',target:'monitor-form-'+crypto.randomUUID(),ownerId:session.user.id});
  await page.goto(base+'/app#/connections');
  const registry=page.getByRole('region',{name:'Application registry',exact:true});
  await registry.getByText('Manage catalog forms',{exact:true}).click();
  const card=registry.locator('details').filter({has:page.locator('summary').getByText('New monitor form',{exact:true})}).last();
  await card.locator(':scope > summary').click();
  const editor=card.locator('form');
  await editor.getByLabel('Request cost in USD',{exact:true}).fill('250');
  await editor.getByLabel('Expected delivery in elapsed hours',{exact:true}).fill('48');
  await editor.getByRole('button',{name:'Add question',exact:true}).click();
  await editor.getByLabel('Question label 1',{exact:true}).fill('Monitor mounting');
  await editor.getByLabel('Answer type 1',{exact:true}).selectOption('select');
  await editor.getByLabel('Choices 1',{exact:true}).fill('Desk\nWall');
  await editor.getByLabel('Required question 1',{exact:true}).check();
  await editor.getByRole('button',{name:'Add question',exact:true}).click();
  await editor.getByLabel('Question label 2',{exact:true}).fill('Wall type');
  await editor.getByLabel('Required question 2',{exact:true}).check();
  const firstId=(await editor.getByLabel('Show question 2 when',{exact:true}).locator('option').all()).at(-1);
  await editor.getByLabel('Show question 2 when',{exact:true}).selectOption(await firstId.getAttribute('value'));
  await editor.getByLabel('Matching answer 2',{exact:true}).fill('Wall');
  await captureJourney(page,{path:out+'/CATALOG-001-editor.png',fullPage:true});
  const saving=page.waitForResponse(r=>r.url().endsWith(`/catalog/${item.id}/form`)&&r.request().method()==='POST');
  await editor.getByRole('button',{name:'Save catalog form',exact:true}).click();
  assert.equal((await saving).status(),200,'CATALOG-001 owner edits conditional form, cost and delivery estimate');
  const current=(await api('/catalog')).items.find(c=>c.id===item.id);
  assert.equal(current.form.costCents,25000);assert.equal(current.form.fields.length,2);
  const work=await api('/work',{title:'Monitor for the training room',body:'Replace the old display for training',deduplicationKey:crypto.randomUUID()});
  await page.goto(base+'/app#/work/'+work.id);
  const chooser=page.locator('details[data-action-path$="/fulfilment"]');
  await chooser.locator(':scope > summary').click();
  await chooser.getByLabel('Service',{exact:true}).selectOption(item.id);
  await chooser.getByLabel('Monitor mounting',{exact:false}).selectOption('Desk');
  assert.equal(await chooser.getByLabel('Wall type',{exact:false}).count(),0,'CATALOG-001 hidden conditional question is absent');
  await chooser.getByLabel('Monitor mounting',{exact:false}).selectOption('Wall');
  await chooser.getByLabel('Wall type',{exact:false}).fill('Concrete');
  await chooser.getByLabel(/What do you need it for/).fill('A shared display for training');
  await captureJourney(page,{path:out+'/CATALOG-001-request-form.png',fullPage:true});
  const sending=page.waitForResponse(r=>r.url().endsWith(`/work/${work.id}/fulfilment`)&&r.request().method()==='POST');
  await chooser.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await sending).status(),201,'CATALOG-001 native request submits validated form');
  const submitted=page.getByRole('region',{name:'Submitted catalog forms',exact:true});
  await submitted.getByText('$250.00',{exact:true}).waitFor();
  await submitted.getByText('Concrete',{exact:true}).waitFor();
  await captureJourney(page,{path:out+'/CATALOG-001-submitted.png',fullPage:true});
  await page.goto(base+'/app#/connections');
  await registry.getByText('Manage catalog forms',{exact:true}).click();await card.locator(':scope > summary').click();
  await editor.getByLabel('Request cost in USD',{exact:true}).fill('300');
  const updating=page.waitForResponse(r=>r.url().endsWith(`/catalog/${item.id}/form`)&&r.request().method()==='POST');
  await editor.getByRole('button',{name:'Save catalog form',exact:true}).click();assert.equal((await updating).status(),200);
  await page.goto(base+'/app#/work/'+work.id);
  await submitted.getByText('$250.00',{exact:true}).waitFor();
  await submitted.getByText('Concrete',{exact:true}).waitFor();
  assert.equal((await api(`/work/${work.id}/catalog-requests`)).items[0].catalogSnapshot.revision,current.revision,'CATALOG-001 in-flight form retains original revision after owner edits');
  await captureJourney(page,{path:out+'/CATALOG-001-retained.png',fullPage:true});
  console.log('PASS CATALOG-001 native form editor, conditional request, cost/delivery and immutable submitted revision at 1440/390');
}

/** CATALOG-001: native employee selection and refusal use live reviewed audience facts. */
export async function catalogAudienceJourney({browser,page,api,base,out}) {
  const {apiFor,signIn}=await import('./connected-helpers.mjs');
  const password='synthetic-Connected-browser-2026', suffix=crypto.randomUUID();
  const sales=await api('/catalog-values',{dimension:'department',label:'Sales '+suffix});
  const support=await api('/catalog-values',{dimension:'department',label:'Support '+suffix});
  const legal=await api('/catalog-values',{dimension:'department',label:'Legal '+suffix});
  const users=[];
  for(const [label,value] of [['sales',sales],['support',support],['outside',legal]]) {
    const email=`catalog-${label}-${suffix}@example.test`;
    const member=await api('/members',{name:'Catalog '+label,email,password,roles:['employee'],isPerson:true});
    const person=(await api('/people')).items.find(p=>p.id===member.personId);
    await api('/people',{source:person.source,sourceId:person.source_id,name:person.name,
      effectiveAt:new Date(Date.now()+1).toISOString(),observedAt:new Date().toISOString(),expectedRevision:person.revision,attributes:{department:value.id}});
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),ep=await context.newPage();
    await signIn(ep,base,email,password);users.push({label,member,context,page:ep,api:apiFor(ep)});
  }
  const owner=await api('/session');
  await api('/catalog',{name:'Unrestricted help '+suffix,kind:'access',target:'help-'+suffix,ownerId:owner.user.id});
  const item=await api('/catalog',{name:'Audience monitor '+suffix,kind:'device',target:'monitor-'+suffix,ownerId:owner.user.id,
    audience:{department:[sales.id,support.id]},form:{costCents:25000,deliveryHours:48,fields:[
      {id:'mount',label:'Monitor mounting',type:'select',required:true,options:['Desk','Wall']},
      {id:'wall',label:'Wall type',type:'text',required:true,when:{fieldId:'mount',equals:'Wall'}},
    ]}});
  try {
    for(const width of [1440,390])for(const user of users){
      const ep=user.page;await ep.setViewportSize({width,height:1000});
      const work=await user.api('/work',{title:'A monitor for '+user.label,body:'Replace the training display',deduplicationKey:crypto.randomUUID()});
      await ep.goto(base+'/app#/work/'+work.id);
      const chooser=ep.locator('details[data-action-path$="/fulfilment"]');
      await chooser.locator(':scope > summary').focus();await ep.keyboard.press('Enter');
      const service=chooser.getByLabel('Service',{exact:true});await service.waitFor();
      if(user.label==='outside') {
        const catalog=await user.api('/catalog');assert.ok(!catalog.items.some(c=>c.id===item.id),'CATALOG-001 native outsider discovery omits the item');
        assert.equal(await service.locator(`option[value="${item.id}"]`).count(),0,'CATALOG-001 ineligible employee has no catalog choice');
        const refused=await ep.evaluate(async({workId,catalogId,userId})=>{
          const session=await(await fetch('/api/v1/session')).json();
          const r=await fetch('/api/v1/work/'+workId+'/fulfilment',{method:'POST',headers:{'Content-Type':'application/json','X-Linen-CSRF':session.csrfToken},
            body:JSON.stringify({catalogId,catalogRevision:1,beneficiaryId:userId,purpose:'Forged choice',answers:{mount:'Desk'}})});
          return {status:r.status,value:await r.json()};
        },{workId:work.id,catalogId:item.id,userId:user.member.id});
        assert.equal(refused.status,403);assert.equal(refused.value.error.code,'catalog_audience','CATALOG-001 native session cannot bypass audience via direct API');
      } else {
        await service.locator(`option[value="${item.id}"]`).waitFor({state:'attached'});await service.selectOption(item.id);
        await chooser.getByLabel('Monitor mounting',{exact:true}).focus();await ep.keyboard.press('End');await ep.keyboard.press('Tab');
        await chooser.getByLabel('Wall type',{exact:false}).fill('Concrete');
        await chooser.getByLabel(/What do you need it for/).fill('Training room display');
        await ep.screenshot({path:out+`/CATALOG-001-audience-${user.label}-form-${width}.png`,fullPage:true});
        const sending=ep.waitForResponse(r=>r.url().endsWith('/fulfilment')&&r.request().method()==='POST');
        await chooser.getByRole('button',{name:'Save',exact:true}).focus();await ep.keyboard.press('Enter');
        assert.equal((await sending).status(),201,'CATALOG-001 both eligible departments submit the native form');
        const submitted=ep.getByRole('region',{name:'Submitted catalog forms'});await submitted.getByText('$250.00',{exact:true}).waitFor();
        await submitted.getByText('Concrete',{exact:true}).waitFor();
      }
      assert.equal(await ep.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'CATALOG-001 audience screen fits the viewport');
      await ep.screenshot({path:out+`/CATALOG-001-audience-${user.label}-${width}.png`,fullPage:true});
    }
    // The item can move while an eligible employee has the old form open.
    const user=users[0],ep=user.page,work=await user.api('/work',{title:'Review changed monitor',body:'Changed availability',deduplicationKey:crypto.randomUUID()});
    await ep.goto(base+'/app#/work/'+work.id);const chooser=ep.locator('details[data-action-path$="/fulfilment"]');
    await chooser.locator(':scope > summary').click();await chooser.getByLabel('Service',{exact:true}).selectOption(item.id);
    await chooser.getByLabel('Monitor mounting',{exact:true}).selectOption('Desk');await chooser.getByLabel(/What do you need it for/).fill('Desk setup');
    await api(`/catalog/${item.id}/audience`,{revision:1,audience:{department:[legal.id]}});
    const sending=ep.waitForResponse(r=>r.url().endsWith('/fulfilment')&&r.request().method()==='POST');
    await chooser.getByRole('button',{name:'Save',exact:true}).focus();await ep.keyboard.press('Enter');assert.equal((await sending).status(),409,'CATALOG-001 native stale catalog revision is refused');
    for(const width of [1440,390]){await ep.setViewportSize({width,height:1000});await ep.getByText('Review the current catalog form and price before requesting',{exact:false}).waitFor();await ep.screenshot({path:out+`/CATALOG-001-audience-changed-${width}.png`,fullPage:true});}
    console.log('PASS CATALOG-001 native two-department conditional $250 selection/submission, outsider omission/direct refusal and changed-item refusal at 1440/390');
  } finally {for(const user of users)await user.context.close();}
}

// Developer-only focused entry point; the ordinary browser suite also runs this journey.
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href) {
  const {chromium}=await import('playwright');const {apiFor,finishFirstRun}=await import('./connected-helpers.mjs');
  const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;if(!base||!out)throw Error('Use tests/ui/run.mjs');
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
    await page.goto(base+'/app');await page.getByLabel('Your name').fill('Catalog owner');await page.getByLabel('Workspace name').fill('Audience proof');
    await page.getByLabel('Work email').fill('catalog-owner@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-Connected-browser-2026');
    await page.getByRole('button',{name:'Create workspace'}).click();await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();await finishFirstRun(page,base);
    await catalogAudienceJourney({browser,page,api:apiFor(page),base,out});
  } finally {await browser.close();}
}

import assert from 'node:assert/strict';
import {captureJourney} from './viewport-evidence.mjs';

/** The owner's native manager + finance path; fixture identities/calendar/team are setup, never simulated approvals. */
export async function approvalChainJourney(page,api,base,ownerId){
 const suffix=crypto.randomUUID().slice(0,6),name=n=>({740:'Avery Morgan',742:'Jordan Lee',744:'Finance reviewers',745:'New York business hours',746:'Sales laptop',747:'Dell Latitude 7450',748:'Finance approval',749:'Laptop for field sales',750:'A laptop for customer visits next month',751:'Field sales customer visits',752:'Budget approved for the new sales laptop',753:'Software purchase',754:'Figma design seat',755:'Application owner approval',756:'Manager review',757:'Finance review'}[n]??`synthetic-linen-${n}`)+' '+suffix;
 const owner=(await api('/members')).find(m=>m.id===ownerId);
 const manager=await api('/members',{name:name(740),email:'synthetic-linen-740-'+suffix+'@example.test',password:'synthetic-linen-741',roles:['approver'],isPerson:true});
 const beneficiary=await api('/members',{name:name(742),email:'synthetic-linen-742-'+suffix+'@example.test',password:'synthetic-linen-743',roles:['employee'],isPerson:true});
 let person=(await api('/people')).items.find(p=>p.id===beneficiary.personId);
 await api(`/people/${person.id}/binding`,{expectedRevision:person.revision,memberId:beneficiary.id,managerId:manager.id});
 const finance=await api('/work-groups',{name:name(744)});await api(`/work-groups/${finance.id}/members`,{userId:ownerId});
 const calendar=await api('/calendars',{name:name(745),timezone:'America/New_York',weekdays:[1,2,3,4,5],startHour:9,endHour:17,holidays:[],holidayCatalog:'us-federal'});
 await page.goto(base+'/app#/connections');
 const registry=page.getByRole('region',{name:'Application registry',exact:true});
 const create=registry.locator('details[data-action-path="/catalog"]').filter({has:page.locator(':scope > summary',{hasText:'Add catalog item'})});
 await create.locator(':scope > summary').click();await create.getByLabel('Item name').fill(name(746));await create.getByLabel('Item kind').selectOption('device');await create.getByLabel('Reviewed target or service name').fill(name(747));await create.getByLabel('Fulfilment owner').selectOption({label:owner.name});await create.getByLabel('Require existing manager approval',{exact:true}).check();
 const created=page.waitForResponse(r=>r.url().endsWith('/catalog')&&r.request().method()==='POST');await create.getByRole('button',{name:'Save catalog item',exact:true}).click();const response=await created;assert.equal(response.status(),201);const item=await response.json();
 async function editor(summary,itemName=name(746)){const section=registry.locator('details').filter({has:page.locator(':scope > summary',{hasText:summary})});await section.locator(':scope > summary').click();const card=section.locator('details').filter({has:page.locator(':scope > summary',{hasText:itemName})});await card.locator(':scope > summary').click();return card.locator('form');}
 const form=await editor('Manage catalog forms');await form.getByLabel('Request cost in USD',{exact:true}).fill('1800');const pricing=page.waitForResponse(r=>r.url().endsWith(`/catalog/${item.id}/form`)&&r.request().method()==='POST');await form.getByRole('button',{name:'Save catalog form',exact:true}).click();assert.equal((await pricing).status(),200);
 const approvals=await editor('Manage approval chains');await approvals.getByLabel('Approval business calendar',{exact:true}).selectOption({label:name(745)+' · America/New_York'});await approvals.getByLabel('Configure manager approval timing',{exact:true}).check();await approvals.getByRole('button',{name:'Add approval stage',exact:true}).click();await approvals.getByLabel('Stage name 1',{exact:true}).fill(name(748));await approvals.getByLabel(name(744)+' · stage 1',{exact:true}).check();await approvals.getByLabel('Applies above USD 1',{exact:true}).fill('1000');await approvals.getByLabel('Remind after business hours 1',{exact:true}).fill('24');await approvals.getByLabel('Approval SLA in business hours 1',{exact:true}).fill('48');
 await captureJourney(page,{path:(process.env.LINEN_TEST_OUTPUT||'test-results/ui')+'/CATALOG-002-editor.png',fullPage:true});
 const saving=page.waitForResponse(r=>r.url().endsWith(`/catalog/${item.id}/approvals`)&&r.request().method()==='POST');await approvals.getByRole('button',{name:'Save approval chain',exact:true}).focus();await page.keyboard.press('Enter');assert.equal((await saving).status(),200);
 const substitution=registry.locator('details').filter({has:page.locator(':scope > summary',{hasText:'Out-of-office approval delegation'})});await substitution.locator(':scope > summary').click();const delegation=substitution.locator('details[data-action-path="/people/delegations"]');await delegation.locator(':scope > summary').click();await delegation.getByLabel('Authority holder').selectOption({label:name(740)});await delegation.getByLabel('Delegate (approver or owner)').selectOption({label:owner.name});await delegation.getByLabel('Out of office from').fill(new Date(Date.now()-3600000).toISOString().slice(0,16));await delegation.getByLabel('Out of office until').fill(new Date(Date.now()+86400000).toISOString().slice(0,16));await captureJourney(page,{path:process.env.LINEN_TEST_OUTPUT+'/CATALOG-002-delegation.png',fullPage:true});const delegated=page.waitForResponse(r=>r.url().endsWith('/people/delegations')&&r.request().method()==='POST');await delegation.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await delegated).status(),201);
 const work=await api('/work',{title:name(749),body:name(750),beneficiaryId:beneficiary.id,deduplicationKey:crypto.randomUUID()});
 await page.goto(base+'/app#/work/'+work.id);const chooser=page.locator('details[data-action-path$="/fulfilment"]');await chooser.locator(':scope > summary').click();await chooser.getByLabel('Service',{exact:true}).selectOption({label:name(746)});await chooser.getByLabel(/What do you need it for/).fill(name(751));const submitting=page.waitForResponse(r=>r.url().endsWith(`/work/${work.id}/fulfilment`)&&r.request().method()==='POST');await chooser.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await submitting).status(),201);
 await page.goto(base+'/app#/decisions');const managerCard=page.locator('article.decision').filter({has:page.getByRole('heading',{name:name(749),exact:true})});await managerCard.getByRole('button',{name:'Approve this request',exact:true}).click();await page.getByText('Business approval recorded.',{exact:false}).waitFor();
 await page.reload();const financeCard=page.getByRole('region',{name:'Approval stages'}).locator('article').filter({has:page.getByRole('heading',{name:name(748)+': '+name(746),exact:true})});await financeCard.waitFor();await financeCard.getByText('$1,800.00',{exact:true}).waitFor();await financeCard.getByLabel('Decision comment',{exact:true}).fill(name(752));await captureJourney(page,{path:(process.env.LINEN_TEST_OUTPUT||'test-results/ui')+'/CATALOG-002-finance.png',fullPage:true});
 const decision=page.waitForResponse(r=>r.url().endsWith(`/work/${work.id}/approval-stage`)&&r.request().method()==='POST');await financeCard.getByRole('button',{name:'Record stage decision',exact:true}).focus();await page.keyboard.press('Enter');assert.equal((await decision).status(),200);
 assert.equal((await api(`/work/${work.id}/approvals/${item.id}`)).satisfied,true);
 const parallel=await api('/catalog',{name:name(753),kind:'service',target:name(754),ownerId,form:{costCents:180000}});
 await page.goto(base+'/app#/connections');const grouped=await editor('Manage approval chains',name(753));
 await grouped.getByLabel('Approval business calendar',{exact:true}).selectOption({label:name(745)+' · America/New_York'});
 for(const index of [1,2,3]){await grouped.getByRole('button',{name:'Add approval stage',exact:true}).click();await grouped.getByLabel(`Stage name ${index}`,{exact:true}).fill(name(754+index));}
 await grouped.getByLabel('Application or item owner · stage 1',{exact:true}).check();await grouped.getByLabel('Applies above USD 1',{exact:true}).fill('1500');
 await grouped.getByLabel('Reviewed manager or delegate · stage 2',{exact:true}).check();await grouped.getByLabel('Open stage 2 with preceding stage',{exact:true}).check();
 await grouped.getByLabel(name(744)+' · stage 3',{exact:true}).check();await grouped.getByLabel('Open stage 3 with preceding stage',{exact:true}).check();await grouped.getByLabel('Applies above USD 3',{exact:true}).fill('1000');
 await captureJourney(page,{path:(process.env.LINEN_TEST_OUTPUT||'test-results/ui')+'/CATALOG-002-parallel-editor.png',fullPage:true});
 const parallelSave=page.waitForResponse(r=>r.url().endsWith(`/catalog/${parallel.id}/approvals`)&&r.request().method()==='POST');await grouped.getByRole('button',{name:'Save approval chain',exact:true}).click();assert.equal((await parallelSave).status(),200);
 const configured=(await api('/catalog')).items.find(c=>c.id===parallel.id).approvals;assert.deepEqual(configured.map(s=>s.withPrevious),[false,true,true]);assert.equal(configured[1].approvers[0].type,'reviewed_manager');
 await page.goto(base+'/app#/notifications');
 const mailSettings=page.locator('details').filter({has:page.locator(':scope > summary').getByText('Approval email replies',{exact:true})});
 await mailSettings.locator(':scope > summary').click();
 await mailSettings.getByLabel('SES receiving mailbox',{exact:true}).fill('approvals@example.test');
 await mailSettings.getByLabel('SNS topic ARN',{exact:true}).fill('arn:aws:sns:us-east-1:000000000000:synthetic-linen-762');
 await mailSettings.getByLabel('SNS signing certificate URL',{exact:true}).fill('https://sns.us-east-1.amazonaws.com/SimpleNotificationService-00000000000000000000000000000000.pem');
 await mailSettings.getByLabel('Enable approval email',{exact:true}).uncheck();
 const disabled=page.waitForResponse(r=>r.url().endsWith('/approval-mail/config')&&r.request().method()==='POST');
 await mailSettings.getByRole('button',{name:'Save approval email configuration',exact:true}).click();
 assert.equal((await disabled).status(),200);
 assert.equal((await api('/approval-mail/config')).enabled,0,'email remains disabled until explicit reviewed consent');
 await captureJourney(page,{path:process.env.LINEN_TEST_OUTPUT+'/CATALOG-002-mail-settings.png',fullPage:true});
 console.log('CATALOG-002 native item, cost, explicit finance stage/calendar, OOO delegation, manager and finance decisions with keyboard and responsive evidence.');
}

// Run this same native journey alone while iterating; Verify also reaches it from browser.mjs.
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
 const {chromium}=await import('playwright');
 const {apiFor,finishFirstRun}=await import('./connected-helpers.mjs');
 const base=process.env.LINEN_TEST_URL;
 if(!base || !process.env.LINEN_TEST_OUTPUT)throw Error('Use tests/ui/run.mjs');
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  await page.goto(base+'/app');
  await page.getByLabel('Your name').fill('Approval owner');
  await page.getByLabel('Workspace name').fill('Approval proof');
  await page.getByLabel('Work email').fill('synthetic-linen-760@example.test');
  await page.getByLabel('Password',{exact:true}).fill('synthetic-linen-761');
  await page.getByRole('button',{name:'Create workspace'}).click();
  await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
  await finishFirstRun(page,base);
  const api=apiFor(page),session=await api('/session');
  await approvalChainJourney(page,api,base,session.user.id);
 } finally {await browser.close();}
}

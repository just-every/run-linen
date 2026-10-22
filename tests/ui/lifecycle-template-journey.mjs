import assert from 'node:assert/strict';
import {captureJourney} from './viewport-evidence.mjs';

/**
 * LIFE-002 on native screens: the owner adds a task template, a Sales/Austin hire is admitted and gets its dated team tasks,
 * and the manager is reminded in their own requests and marks their task done there. Evidence at 1440, 390 and 320.
 */
export async function lifecycleTemplateJourney({browser,page,api,base,out}) {
  const {apiFor,signIn}=await import('./connected-helpers.mjs');
  const password='synthetic-linen-1', suffix=crypto.randomUUID().slice(0,8);
  const owner=await api('/session');
  const emails=new Map();
  const member=async(name,role)=>{const email=`synthetic-linen-${emails.size+3}-${suffix}@example.test`;const m=await api('/members',{name,email,password,roles:[role],isPerson:true});emails.set(m.id,email);return m;};
  const manager=await member('Life manager','employee'), hire=await member('Life hire','employee');
  const sales=await api('/catalog-values',{dimension:'department',label:'Life Sales '+suffix}), austin=await api('/catalog-values',{dimension:'location',label:'Life Austin '+suffix});
  const it=await api('/work-groups',{name:'Life IT '+suffix});
  const person=(await api('/people')).items.find(p=>p.id===hire.personId);
  await api('/people',{source:person.source,sourceId:person.source_id,name:person.name,managerId:manager.id,effectiveAt:new Date(Date.now()+1).toISOString(),
    observedAt:new Date().toISOString(),expectedRevision:person.revision,attributes:{department:sales.id,location:austin.id}});

  await page.goto(base+'/app#/lifecycle');
  const region=page.getByRole('region',{name:'Task templates',exact:true});
  await region.getByText('Add a task template',{exact:true}).click();
  const form=region.locator('details[data-action-path="/lifecycle-templates"] form');
  await form.getByLabel('Template name').fill('Sales Austin onboarding '+suffix);
  await form.getByRole('combobox',{name:/^Applies to/}).selectOption('join');
  await form.getByLabel('Reviewed values it applies to').fill(JSON.stringify({department:[sales.id],location:[austin.id]}));
  await form.getByLabel('Dated tasks').fill(JSON.stringify([
    {key:'laptop',title:'Order the laptop',assignee:{type:'group',groupId:it.id},anchor:'start',offsetDays:-5,remindDays:2},
    {key:'buddy',title:'Buddy assigned',assignee:{type:'manager'},anchor:'start',offsetDays:0,remindDays:2},
    {key:'quota',title:'Set the quota plan',assignee:{type:'owner'},anchor:'start',offsetDays:3}]));
  await captureJourney(page,{path:out+'/LIFE-002-template-form.png',fullPage:true});
  const saving=page.waitForResponse(r=>r.url().endsWith('/lifecycle-templates')&&r.request().method()==='POST');
  await form.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await saving).status(),201,'LIFE-002 the owner adds a template natively');
  await region.getByRole('heading',{name:'Sales Austin onboarding '+suffix,exact:true}).waitFor();

  // The hire starts within the hour: its tasks exist, and the reminders are due now.
  const soon=new Date(Date.now()+3600_000).toISOString().replace(/\.\d+Z$/,'Z');
  await api('/calendars',{name:'synthetic-linen-6',timezone:'UTC',weekdays:[1,2,3,4,5],startHour:9,endHour:17,holidays:[]});
  const lifecycle=await api('/lifecycle',{personId:hire.personId,kind:'join',effectiveAt:soon,timezone:'UTC',source:'synthetic-linen-5-'+suffix,sourceRevision:1,ownerId:owner.user.id,
    identityTarget:hire.personId,retained:[],added:[],removed:[],deviceIds:[]});
  await page.goto(base+'/app#/lifecycle/'+lifecycle.lifecycleId);
  for(const title of ['Order the laptop','Buddy assigned','Set the quota plan'])await page.getByRole('heading',{name:title,exact:true}).waitFor();
  const quota=page.locator('section.connection-record').filter({has:page.getByRole('heading',{name:'Set the quota plan',exact:true})});
  await quota.getByText('Mark this task done',{exact:true}).click();
  const completing=page.waitForResponse(r=>/\/lifecycle-tasks\/[^/]+\/complete$/.test(r.url())&&r.request().method()==='POST');
  await quota.getByRole('button',{name:'Mark done',exact:true}).click();assert.equal((await completing).status(),200,'LIFE-002 the owner marks a task done on the record');
  await captureJourney(page,{path:out+'/LIFE-002-record-tasks.png',fullPage:true});
  await api('/work/process-due',{});

  // The manager finds the reminder in their own requests and does the task there.
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),mp=await context.newPage();
  try {
    await signIn(mp,base,emails.get(manager.id),password);
    const mine=apiFor(mp),reminder=(await mine('/work')).items.find(w=>w.title.startsWith('Reminder: Buddy assigned for Life hire'));
    assert.ok(reminder,'LIFE-002 the manager is reminded in their own requests');
    await mp.goto(base+'/app#/work/'+reminder.id);
    const card=mp.getByRole('region',{name:'Lifecycle task',exact:true});
    await card.getByText('Mark this task done',{exact:true}).click();
    await captureJourney(mp,{path:out+'/LIFE-002-reminder.png',fullPage:true});
    const done=mp.waitForResponse(r=>/\/lifecycle-tasks\/[^/]+\/complete$/.test(r.url())&&r.request().method()==='POST');
    await card.getByRole('button',{name:'Mark done',exact:true}).click();assert.equal((await done).status(),200,'LIFE-002 the manager marks their reminded task done');
    await card.getByText('done, waived, cancelled or not yours to do',{exact:false}).waitFor();
    assert.equal((await mine('/lifecycle-tasks')).items.some(t=>t.title==='Buddy assigned'),false);
    console.log('PASS LIFE-002 native template editor, dated team tasks on the record, owner completion and the manager reminder at 1440/390/320');
  } finally {await context.close();}
}

// Developer-only focused entry point; the ordinary browser suite also runs this journey.
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href) {
  const {chromium}=await import('playwright');const {apiFor,finishFirstRun}=await import('./connected-helpers.mjs');
  const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;if(!base||!out)throw Error('Use tests/ui/run.mjs');
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
    await page.goto(base+'/app');await page.getByLabel('Your name').fill('Life owner');await page.getByLabel('Workspace name').fill('Life proof');
    await page.getByLabel('Work email').fill('synthetic-linen-2@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-linen-1');
    await page.getByRole('button',{name:'Create workspace'}).click();await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();await finishFirstRun(page,base);
    await lifecycleTemplateJourney({browser,page,api:apiFor(page),base,out});
  } finally {await browser.close();}
}

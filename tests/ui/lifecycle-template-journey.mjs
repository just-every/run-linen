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
  const subjectMarker='synthetic-linen-7-'+suffix;
  const manager=await member('Life manager','employee'), hire=await member(subjectMarker,'employee'), unrelated=await member('Life other operator','operator');
  const sales=await api('/catalog-values',{dimension:'department',label:'Life Sales '+suffix}), austin=await api('/catalog-values',{dimension:'location',label:'Life Austin '+suffix});
  const role=await api('/catalog-values',{dimension:'title',label:'Life account executive '+suffix}), employment=await api('/catalog-values',{dimension:'employmentType',label:'Life W-2 '+suffix});
  const it=await api('/work-groups',{name:'Life IT '+suffix});
  const person=(await api('/people')).items.find(p=>p.id===hire.personId);
  await api('/people',{source:person.source,sourceId:person.source_id,name:person.name,managerId:manager.id,effectiveAt:new Date(Date.now()+1).toISOString(),
    observedAt:new Date().toISOString(),expectedRevision:person.revision,attributes:{department:sales.id,location:austin.id,title:role.id,employmentType:employment.id}});

  await page.goto(base+'/app#/lifecycle');
  const region=page.getByRole('region',{name:'Task templates',exact:true});
  await region.getByText('Add a task template',{exact:true}).click();
  const form=region.locator('details[data-action-path="/lifecycle-templates"] form');
  await form.getByLabel('Template name').fill('Sales Austin onboarding '+suffix);
  await form.getByRole('combobox',{name:/^Applies to/}).selectOption('join');
  for(const label of ['Life Sales '+suffix,'Life Austin '+suffix,'Life account executive '+suffix,'Life W-2 '+suffix])
    await form.getByRole('checkbox',{name:label,exact:true}).check();
  const fillTask=async(index,{title,assignee,team,offset,remind,anchor='start'})=>{
    const row=form.getByRole('group',{name:'Task '+index,exact:true});
    await row.getByLabel('Task title '+index,{exact:true}).fill(title);
    await row.getByLabel('Who does task '+index+'?',{exact:true}).selectOption(assignee);
    if(team)await row.getByLabel('Team for task '+index,{exact:true}).selectOption({label:team});
    await row.getByLabel('Date for task '+index,{exact:true}).selectOption(anchor);
    await row.getByLabel('Business days from date '+index,{exact:false}).fill(String(offset));
    if(remind!==undefined)await row.getByLabel('Remind business days before due '+index,{exact:false}).fill(String(remind));
  };
  await fillTask(1,{title:'Order the laptop',assignee:'group',team:'Life IT '+suffix,offset:-5,remind:2});
  await form.getByRole('button',{name:'Add task',exact:true}).click();
  await fillTask(2,{title:'Buddy assigned',assignee:'manager',offset:0,remind:2});
  await form.getByRole('button',{name:'Add task',exact:true}).click();
  await fillTask(3,{title:'Set the quota plan',assignee:'owner',offset:3});
  await form.getByRole('button',{name:'Add task',exact:true}).click();
  await fillTask(4,{title:'Close out the contract',assignee:'owner',offset:0,anchor:'end'});
  await form.getByRole('button',{name:'Add task',exact:true}).click();
  await form.getByRole('button',{name:'Remove task 5',exact:true}).click();
  assert.equal(await form.getByRole('group',{name:'Task 5',exact:true}).count(),0,'LIFE-002 owners remove an unwanted task before saving');
  await captureJourney(page,{path:out+'/LIFE-002-template-form.png',fullPage:true});
  const saving=page.waitForResponse(r=>r.url().endsWith('/lifecycle-templates')&&r.request().method()==='POST');
  await form.getByRole('button',{name:'Save',exact:true}).click();const savedResponse=await saving;assert.equal(savedResponse.status(),201,'LIFE-002 the owner adds a template natively');
  const savedTemplate=await savedResponse.json();
  await region.getByRole('heading',{name:'Sales Austin onboarding '+suffix,exact:true}).waitFor();

  // The hire starts within the hour: its tasks exist, and the reminders are due now.
  const soon=new Date(Date.now()+3600_000).toISOString().replace(/\.\d+Z$/,'Z');
  await api('/calendars',{name:'synthetic-linen-6',timezone:'UTC',weekdays:[1,2,3,4,5],startHour:9,endHour:17,holidays:[]});
  const lifecycle=await api('/lifecycle',{personId:hire.personId,kind:'join',effectiveAt:soon,timezone:'UTC',source:'synthetic-linen-5-'+suffix,sourceRevision:1,ownerId:owner.user.id,
    identityTarget:hire.personId,retained:[],added:[],removed:[],deviceIds:[]});
  await page.goto(base+'/app#/lifecycle/'+lifecycle.lifecycleId);
  for(const title of ['Order the laptop','Buddy assigned','Set the quota plan'])await page.getByRole('heading',{name:title,exact:true}).waitFor();
  const templateReview=page.getByRole('region',{name:'Task template review',exact:true});
  const previousViewport=page.viewportSize();
  try {
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:width===1440?1000:844});
      await templateReview.getByRole('heading',{name:'Close out the contract',exact:true}).waitFor();
      assert.ok(await templateReview.getByText(`${savedTemplate.name} (revision ${savedTemplate.revision})`,{exact:true}).isVisible(),`LIFE-002 applied template and revision are visible at ${width}px`);
      assert.ok(await templateReview.getByText('No end date is recorded to date this task from.',{exact:false}).isVisible(),`LIFE-002 the undated task has a visible named reason at ${width}px`);
    }
  } finally {await page.setViewportSize(previousViewport);}
  const quota=page.locator('section.connection-record').filter({has:page.getByRole('heading',{name:'Set the quota plan',exact:true})});
  await quota.getByText('Mark this task done',{exact:true}).click();
  const completing=page.waitForResponse(r=>/\/lifecycle-tasks\/[^/]+\/complete$/.test(r.url())&&r.request().method()==='POST');
  await quota.getByRole('button',{name:'Mark done',exact:true}).click();assert.equal((await completing).status(),200,'LIFE-002 the owner marks a task done on the record');
  await captureJourney(page,{path:out+'/LIFE-002-record-tasks.png',fullPage:true});
  await api('/work/process-due',{});

  const buddyTask=(await api('/lifecycle/'+lifecycle.lifecycleId)).obligations.find(t=>t.title==='Buddy assigned');
  const forTask=work=>JSON.parse(work.context_json||'{}').lifecycleTaskReminder?.taskId===buddyTask.id;
  const reminderRecord=(await api('/work')).items.find(w=>w.beneficiary_id===manager.id&&forTask(w));
  assert.ok(reminderRecord,'LIFE-002 the portal reminder links to the manager task');
  const otherContext=await browser.newContext({viewport:{width:1440,height:1000}}),otherPage=await otherContext.newPage();
  try {
    await signIn(otherPage,base,emails.get(unrelated.id),password);
    const other=apiFor(otherPage),ordinaryQueue=await other('/work');
    assert.equal(JSON.stringify(ordinaryQueue).includes(subjectMarker),false,'LIFE-002 ordinary operator work lists reveal no reminder subject');
    const ordinaryRead=await other('/work/'+reminderRecord.id+'/conversation');
    assert.equal(JSON.stringify(ordinaryRead).includes(subjectMarker),false,'LIFE-002 ordinary operator reminder reads reveal no subject');
    assert.equal((await other('/search?q='+encodeURIComponent(subjectMarker)+'&type=ticket')).total,0,'LIFE-002 ordinary operator ticket search reveals no reminder subject');
    assert.ok(!(await other('/search?q='+encodeURIComponent(subjectMarker))).items.some(item=>item.id===reminderRecord.id),'LIFE-002 unfiltered search cannot associate the subject with the generic reminder');
    await otherPage.goto(base+'/app#/work/'+reminderRecord.id);
    await otherPage.getByRole('heading',{name:ordinaryRead.work.title,exact:true}).waitFor();
    assert.equal(await otherPage.getByText(subjectMarker,{exact:false}).count(),0,'LIFE-002 an unrelated operator sees only the generic reminder');
    await captureJourney(otherPage,{path:out+'/LIFE-002-generic-reminder.png',fullPage:true});
  } finally {await otherContext.close();}

  // The manager finds the reminder in their own requests and does the task there.
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),mp=await context.newPage();
  try {
    await signIn(mp,base,emails.get(manager.id),password);
    const mine=apiFor(mp),reminder=(await mine('/work')).items.find(forTask);
    assert.ok(reminder,'LIFE-002 the manager is reminded in their own requests');
    await mp.goto(base+'/app#/work/'+reminder.id);
    const card=mp.getByRole('region',{name:'Lifecycle task',exact:true});
    await card.getByRole('heading',{name:'Buddy assigned for '+subjectMarker,exact:true}).waitFor();
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

import assert from 'node:assert/strict';
import {captureJourney} from './viewport-evidence.mjs';

export async function sandboxJourney({page,api,base,out}) {
 const session=await api('/session'),owner=session.user.id,suffix=crypto.randomUUID().slice(0,6);
 const reviewerEmail=`synthetic-linen-${suffix}@example.test`,password='synthetic-linen-455';
 await api('/members',{name:'Sandbox reviewer',email:reviewerEmail,password,roles:['owner']});
 const team=await api('/work-groups',{name:'Sandbox team '+suffix});
 const catalog=await api('/catalog',{name:'Sandbox equipment '+suffix,kind:'device',target:'synthetic-linen-'+suffix,ownerId:owner});
 catalog.name='Sandbox equipment '+suffix;
 const position=Math.max(0,...(await api('/sla-policies')).items.map(x=>x.position))+1;
 const policy=await api('/sla-policies',{name:'Sandbox response '+suffix,position,firstResponseMinutes:60,nextResponseMinutes:120,resolutionMinutes:480,pauseOn:[]});
 await api('/calendars',{name:'Sandbox hours '+suffix,timezone:'UTC',weekdays:[1,2,3,4,5],startHour:9,endHour:17,holidays:[]});
 await api('/escalation-levels',{target:'resolution',level:1,offsetMinutes:0,notify:'assignee',label:'Sandbox resolution'});
 await api('/waiting-rule',{remindBusinessDays:2,resolveBusinessDays:5});
 const department=await api('/departments',{name:'Sandbox department '+suffix,kind:'it'});
 const role=await api('/department-roles',{departmentId:department.id,name:'Sandbox reader '+suffix,permissions:['ticket.read']});
 const template=await api('/lifecycle-templates',{name:'Sandbox lifecycle '+suffix,kind:'join',match:{},tasks:[{key:'prepare',title:'Prepare lifecycle equipment',assignee:{type:'group',groupId:team.id},anchor:'start',offsetDays:0,remindDays:null}]});
 const writeClick=async(button,ending,method='POST')=>{
  const response=page.waitForResponse(r=>r.url().endsWith(ending)&&r.request().method()===method);
  await button.focus();await page.keyboard.press('Enter');const r=await response;assert.equal(r.status(),200,await r.text());
  const saved=await r.json();
  if(saved.id&&typeof saved.revision==='number'&&saved.state){
   await page.locator('.sandbox-space .facts').getByText(String(saved.revision),{exact:true}).waitFor();
   await page.locator('.sandbox-space .facts').getByText(saved.state,{exact:true}).waitFor();
  }
 };
 await page.goto(base+'/app#/sandboxes');
 await page.getByLabel('Sandbox name',{exact:true}).fill('Reviewed sandbox '+suffix);
 // The shared account control becomes icon-only at narrow widths and already carries its tooltip.
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000});
  const account=page.getByRole('button',{name:'Your workspace and account',exact:true});
  await page.keyboard.press('Tab');await account.focus();
  assert.equal(await account.evaluate(node=>getComputedStyle(node,'::after').opacity),'1');
  await page.getByLabel('Sandbox name',{exact:true}).focus();await page.mouse.move(0,0);await account.hover();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.profile'),'::after').opacity==='1');
 }
 await page.setViewportSize({width:1440,height:1000});

 await captureJourney(page,{path:out+'/SANDBOX-001-create.png',fullPage:true});
 await page.getByRole('button',{name:'Create configuration sandbox',exact:true}).click();
 await page.waitForURL(/#\/sandboxes\/.+/);
 const id=page.url().split('/').at(-1),path='/sandboxes/'+id;
 await page.getByRole('heading',{name:'Reviewed sandbox '+suffix,exact:true}).waitFor();
 let item=page.locator('details').filter({has:page.locator(':scope > summary',{hasText:'Edit '+catalog.name})}).first();
 await item.locator(':scope > summary').press('Enter');
 await item.getByLabel('Catalog item name',{exact:true}).fill('Reviewed equipment '+suffix);
 await item.getByRole('button',{name:'Add question',exact:true}).click();
 await item.getByLabel('Question label 1',{exact:true}).fill('Rehearsal purpose');
 await item.getByLabel('Required question 1',{exact:true}).check();
 await item.getByRole('button',{name:'Add question',exact:true}).click();
 await item.getByLabel('Question label 2',{exact:true}).fill('Loaner needed');
 await item.getByLabel('Answer type 2',{exact:true}).selectOption('checkbox');
 await item.getByLabel('Required question 2',{exact:true}).check();
 await item.getByRole('button',{name:'Add question',exact:true}).click();
 await item.getByLabel('Question label 3',{exact:true}).fill('Return date');
 await item.getByLabel('Answer type 3',{exact:true}).selectOption('date');
 await item.getByLabel('Required question 3',{exact:true}).check();
 await item.getByLabel('Show question 3 when',{exact:true}).selectOption({label:'Loaner needed'});
 await item.getByLabel('Matching answer 3',{exact:true}).fill('true');

 await captureJourney(page,{path:out+'/SANDBOX-001-form-editor.png',fullPage:true});
 await writeClick(item.getByRole('button',{name:'Save catalog form',exact:true}),path+'/catalog/'+catalog.id,'PUT');
 item=page.locator('details').filter({has:page.locator(':scope > summary',{hasText:'Edit Reviewed equipment '+suffix})}).first();
 await item.locator(':scope > summary').press('Enter');
 await item.getByRole('button',{name:'Add task',exact:true}).click();
 await item.getByLabel('Task title 1',{exact:true}).fill('Prepare sandbox equipment');
 await item.getByLabel('Team for task 1',{exact:true}).selectOption(team.id);
 await captureJourney(page,{path:out+'/SANDBOX-001-task-editor.png',fullPage:true});
 await writeClick(item.getByRole('button',{name:'Save task plan',exact:true}),path+'/catalog/'+catalog.id,'PUT');
 await item.locator(':scope > summary').press('Enter');
 await item.getByLabel(/Rehearsal purpose/).fill('synthetic-linen-456');
 await item.getByLabel('Loaner needed',{exact:true}).selectOption('false');assert.equal(await item.getByLabel(/Return date/).count(),0);
 await writeClick(item.getByRole('button',{name:'Test form',exact:true}),path+'/test-form');
 await item.getByLabel(/Rehearsal purpose/).fill('synthetic-linen-457');
 await item.getByLabel('Loaner needed',{exact:true}).selectOption('true');await item.getByLabel(/Return date/).fill('2027-02-01');
 const runResponse=page.waitForResponse(r=>r.url().endsWith(path+'/runs')&&r.request().method()==='POST');
 await item.getByRole('button',{name:'Rehearse team tasks',exact:true}).click();assert.equal((await runResponse).status(),201);
 await page.getByRole('button',{name:'Complete Prepare sandbox equipment',exact:true}).waitFor();
 await captureJourney(page,{path:out+'/SANDBOX-001-rehearsal.png',fullPage:true});
 await page.getByRole('button',{name:'Complete Prepare sandbox equipment',exact:true}).click();
 await page.getByRole('heading',{name:'Team rehearsal · completed',exact:true}).waitFor();
 let sla=page.locator('details').filter({has:page.locator(':scope > summary',{hasText:'Edit SLA: '+policy.name})}).first();
 await sla.locator(':scope > summary').press('Enter');
 await sla.getByLabel('SLA name',{exact:true}).fill('Reviewed response '+suffix);
 await sla.getByLabel('first response minutes',{exact:true}).fill('30');
 await sla.getByLabel('priority',{exact:true}).selectOption('P3');
 await sla.getByLabel('category',{exact:true}).selectOption('hardware');
 await sla.getByLabel('Business calendar',{exact:true}).selectOption({label:'Sandbox hours '+suffix});
 await captureJourney(page,{path:out+'/SANDBOX-001-sla-editor.png',fullPage:true});
 await writeClick(sla.getByRole('button',{name:'Save sandbox SLA',exact:true}),path+'/slas/'+policy.id,'PUT');
 for(const [family,label,field,value] of [['role','Sandbox reader '+suffix,'name','Reviewed reader '+suffix],['calendar','Sandbox hours '+suffix,'name','Reviewed hours '+suffix],['escalation','Sandbox resolution','label','Reviewed escalation '+suffix],['waiting','Waiting rule','remind business days','3']]) {
  const config=page.locator('details').filter({has:page.locator(':scope > summary',{hasText:`Edit ${family}: ${label}`})}).first();
  await config.locator(':scope > summary').press('Enter');
  await config.getByLabel(field,{exact:true}).fill(value);
  await captureJourney(page,{path:out+`/SANDBOX-001-${family}-editor.png`,fullPage:true});
  const response=page.waitForResponse(r=>r.url().includes(path+'/sla-configuration/'+family+'/')&&r.request().method()==='PUT');
  await config.getByRole('button',{name:'Save sandbox '+family,exact:true}).click();const saved=await response;assert.equal(saved.status(),200,await saved.text());
  const updatedLabel=family==='role'||family==='calendar'||family==='escalation'?value:label;
  const updated=page.locator('details').filter({has:page.locator(':scope > summary',{hasText:`Edit ${family}: ${updatedLabel}`})}).first();
  await updated.locator(':scope > summary').press('Enter');
  await writeClick(updated.getByRole('button',{name:'Test sandbox '+family,exact:true}),path+'/test-configuration');
 }
 const lifecycle=page.locator('details').filter({has:page.locator(':scope > summary',{hasText:'Edit lifecycle: '+template.name})}).first();
 await lifecycle.locator(':scope > summary').press('Enter');
 const templateEditor=lifecycle.locator('details').first();await templateEditor.locator(':scope > summary').press('Enter');
 await templateEditor.getByLabel('Template name',{exact:true}).fill('Reviewed lifecycle '+suffix);
 await templateEditor.getByLabel('Task title 1',{exact:true}).fill('Reviewed lifecycle preparation');
 await templateEditor.getByLabel('Business days from date 1',{exact:true}).fill('2');
 await captureJourney(page,{path:out+'/SANDBOX-001-lifecycle-editor.png',fullPage:true});
 await writeClick(templateEditor.getByRole('button',{name:'Save',exact:true}),path+'/sla-configuration/lifecycle/'+template.id,'PUT');
 const testedTemplate=page.locator('details').filter({has:page.locator(':scope > summary',{hasText:'Edit lifecycle: Reviewed lifecycle '+suffix})}).first();
 await testedTemplate.locator(':scope > summary').press('Enter');
 await writeClick(testedTemplate.getByRole('button',{name:'Test sandbox lifecycle',exact:true}),path+'/test-configuration');
 const lifecycleRehearsal=page.locator('details').filter({has:page.locator(':scope > summary',{hasText:'Rehearse lifecycle tasks'})}).first();
 await lifecycleRehearsal.locator(':scope > summary').press('Enter');
 await lifecycleRehearsal.getByLabel('Rehearsal business calendar',{exact:true}).selectOption({label:'Reviewed hours '+suffix});
 await lifecycleRehearsal.getByLabel('Rehearsal effective instant (UTC)',{exact:true}).fill('2027-02-01T09:00');
 await writeClick(lifecycleRehearsal.getByRole('button',{name:'Preview lifecycle tasks',exact:true}),path+'/test-lifecycle');
 await lifecycleRehearsal.getByText('Preview only. No work, reminders or answers were saved. No external calls were made.',{exact:true}).waitFor();
 assert.match(await lifecycleRehearsal.innerText(),/Reviewed lifecycle preparation.*2027-02-03T09:00:00.000Z/);
 await captureJourney(page,{path:out+'/SANDBOX-001-lifecycle-rehearsal.png',fullPage:true});
 assert.equal((await api('/lifecycle-templates')).items.find(row=>row.id===template.id).name,template.name);
 const production=(await api('/catalog')).items.find(x=>x.id===catalog.id);assert.equal(production.name,catalog.name);
 const isolated=await api(path);assert.ok(!JSON.stringify(isolated).includes('synthetic-linen-456'));assert.ok(!JSON.stringify(isolated).includes('synthetic-linen-457'));
 await writeClick(page.getByRole('button',{name:'Request separate owner review',exact:true}),path+'/package');
 await page.getByRole('button',{name:'Approve reviewed package',exact:true}).waitFor();
 // Every changed field is reviewable before authority is given.
 const diffDisclosures=page.locator('section[aria-label="Configuration sandboxes"] > details.action-disclosure');
 assert.equal(await diffDisclosures.count(),isolated.differences.length,'Review exposes every package difference');
 for(const disclosure of await diffDisclosures.all()) {
  await disclosure.locator(':scope > summary').press('Enter');
  assert.equal(await disclosure.getAttribute('open'),'','Keyboard opens every before and after value');
 }

 await captureJourney(page,{path:out+'/SANDBOX-001-diff.png',fullPage:true});
 const self=page.waitForResponse(r=>r.url().endsWith(path+'/approve')&&r.request().method()==='POST');await page.getByRole('button',{name:'Approve reviewed package',exact:true}).click();assert.equal((await self).status(),403);
 await api('/login',{email:reviewerEmail,password});await page.reload();
 await page.getByRole('button',{name:'Approve reviewed package',exact:true}).waitFor();
 await captureJourney(page,{path:out+'/SANDBOX-001-separate-approval.png',fullPage:true});
 await writeClick(page.getByRole('button',{name:'Approve reviewed package',exact:true}),path+'/approve');
 await captureJourney(page,{path:out+'/SANDBOX-001-promotion.png',fullPage:true});
 await writeClick(page.getByRole('button',{name:'Promote reviewed configuration',exact:true}),path+'/promote');
 assert.equal((await api('/catalog')).items.find(x=>x.id===catalog.id).name,'Reviewed equipment '+suffix);
 assert.equal((await api('/lifecycle-templates')).items.find(row=>row.id===template.id).name,'Reviewed lifecycle '+suffix);
 assert.equal((await api('/department-roles')).items.find(x=>x.id===role.id).name,'Reviewed reader '+suffix);
 await captureJourney(page,{path:out+'/SANDBOX-001-promoted.png',fullPage:true});
 const rollbackResponse=page.waitForResponse(r=>r.url().endsWith(path+'/rollback-package')&&r.request().method()==='POST');await page.getByRole('button',{name:'Request reviewed rollback',exact:true}).click();const rollback=await rollbackResponse;assert.equal(rollback.status(),201);const rollbackRow=await rollback.json();
 await page.waitForURL(new RegExp(rollbackRow.id));
 await captureJourney(page,{path:out+'/SANDBOX-001-rollback-review.png',fullPage:true});
 await api('/login',{email:session.user.email,password:'Browser-proof-2026'});await page.reload();
 await writeClick(page.getByRole('button',{name:'Approve reviewed package',exact:true}),'/sandboxes/'+rollbackRow.id+'/approve');
 await writeClick(page.getByRole('button',{name:'Promote reviewed configuration',exact:true}),'/sandboxes/'+rollbackRow.id+'/promote');
 assert.equal((await api('/catalog')).items.find(x=>x.id===catalog.id).name,catalog.name);
 assert.equal((await api('/lifecycle-templates')).items.find(row=>row.id===template.id).name,template.name);
 await captureJourney(page,{path:out+'/SANDBOX-001-rolled-back.png',fullPage:true});
 const employeeEmail=`synthetic-linen-${suffix}-employee@example.test`;
 await api('/members',{name:'Sandbox employee',email:employeeEmail,password,roles:['employee']});
 await api('/login',{email:employeeEmail,password});await page.reload();
 await page.getByText('A current workspace owner is required.',{exact:true}).waitFor();
 await captureJourney(page,{path:out+'/SANDBOX-001-scope-refusal.png',fullPage:true});
 assert.equal(await page.getByRole('button',{name:'Promote reviewed configuration',exact:true}).count(),0);
 await api('/login',{email:session.user.email,password:'Browser-proof-2026'});await page.reload();
 console.log('PASS sandbox native settings: isolated catalog, form, tasks, roles, full existing SLA configuration, rehearsals, field diffs, separate owner approval, promotion, reviewed rollback and employee refusal at 1440, 390 and 320');
}

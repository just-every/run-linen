import assert from 'node:assert/strict';
import {captureJourney} from './viewport-evidence.mjs';

/** CATALOG-003: the owner edits a team task plan, a request copies it, tasks wait for what they follow, and the request closes only when every responsibility is done or waived. */
export async function catalogTaskJourney({page,api,base,out}) {
  const session=await api('/session'),owner=session.user.id,suffix=crypto.randomUUID().slice(0,4);
  const team=await api('/work-groups',{name:'Rollout team '+suffix});
  await api(`/work-groups/${team.id}/members`,{userId:owner});
  const item=await api('/catalog',{name:'Design tool '+suffix,kind:'software',target:'design-tool-'+crypto.randomUUID(),ownerId:owner});
  await page.goto(base+'/app#/connections');
  const registry=page.getByRole('region',{name:'Application registry',exact:true});
  await registry.locator('details > summary',{hasText:'Manage catalog task plans'}).click();
  const plans=registry.locator('details > summary',{hasText:'Manage catalog task plans'}).locator('..');
  const card=plans.locator('details').filter({has:page.locator('summary',{hasText:item.name})});
  await card.locator(':scope > summary').click();
  const editor=card.locator('form');
  for(const [index,title,hours] of [[1,'Configure the design tool',48],[2,'Welcome the employee',72]]) {
    await editor.getByRole('button',{name:'Add task',exact:true}).click();
    await editor.getByLabel(`Task title ${index}`,{exact:true}).fill(title);
    await editor.getByLabel(`Team for task ${index}`,{exact:true}).selectOption(team.id);
    await editor.getByLabel(`Due after (elapsed hours) ${index}`,{exact:true}).fill(String(hours));
  }
  await editor.getByLabel('Task 1 follows The automated step',{exact:true}).check();
  await editor.getByLabel('Task 2 follows Configure the design tool',{exact:true}).check();
  await captureJourney(page,{path:out+'/CATALOG-003-plan-editor.png',fullPage:true});
  const saving=page.waitForResponse(r=>r.url().endsWith(`/catalog/${item.id}/tasks`)&&r.request().method()==='POST');
  await editor.getByRole('button',{name:'Save task plan',exact:true}).click();
  assert.equal((await saving).status(),200,'CATALOG-003 owner saves an ordered team task plan');
  const saved=(await api('/catalog')).items.find(c=>c.id===item.id);
  assert.deepEqual(saved.tasks.map(t=>[t.title,t.after.length,t.dueHours]),[['Configure the design tool',1,48],['Welcome the employee',1,72]]);

  const work=await api('/work',{title:'Design tool for the new hire',body:'Please set up the design tool',deduplicationKey:crypto.randomUUID()});
  await page.goto(base+'/app#/work/'+work.id);
  const chooser=page.locator('details[data-action-path$="/fulfilment"]');
  await chooser.locator(':scope > summary').click();
  await chooser.getByLabel('Service',{exact:true}).selectOption(item.id);
  await chooser.getByLabel(/What do you need it for/).fill('Design work');
  const sending=page.waitForResponse(r=>r.url().endsWith(`/work/${work.id}/fulfilment`)&&r.request().method()==='POST');
  await chooser.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await sending).status(),201);
  const duty=title=>page.locator('.work-outcome details.obligation').filter({has:page.locator(':scope > summary',{hasText:title})});
  await duty('Configure the design tool').locator(':scope > summary').click();
  await duty('Configure the design tool').getByText('The automated step',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Mark Configure the design tool done',exact:true}).count(),0,'CATALOG-003 a task cannot be marked done while the step it follows is open');
  await captureJourney(page,{path:out+'/CATALOG-003-waiting.png',fullPage:true});
  const closing=await page.evaluate(async({workId})=>{
    const s=await(await fetch('/api/v1/session')).json(),w=await(await fetch('/api/v1/work/'+workId)).json();
    const r=await fetch('/api/v1/work/'+workId+'/commands',{method:'POST',headers:{'Content-Type':'application/json','X-Linen-CSRF':s.csrfToken},body:JSON.stringify({command:'close',reason:'Done',revision:w.work.revision})});
    return {status:r.status,code:(await r.json()).error?.code};
  },{workId:work.id});
  assert.deepEqual([closing.status,closing.code],[409,'obligations_open'],'CATALOG-003 native session cannot close a request with open responsibilities');

  const step=duty('Access grant');
  await step.locator(':scope > summary').click();
  await step.getByLabel('Reason for waiving Access grant',{exact:true}).fill('The tool is licensed outside Linen');
  const waiving=page.waitForResponse(r=>/\/obligations\/[^/]+\/waive$/.test(r.url())&&r.request().method()==='POST');
  await step.getByRole('button',{name:'Waive Access grant',exact:true}).click();
  assert.equal((await waiving).status(),200,'CATALOG-003 the owner waives the automated step with a reason');
  await step.locator(':scope > summary').click();
  await step.getByText('Waived by',{exact:true}).waitFor();
  for(const title of ['Configure the design tool','Welcome the employee']) {
    const task=duty(title);
    if(!await task.evaluate(el=>el.open))await task.locator(':scope > summary').click();
    const done=task.getByRole('button',{name:`Mark ${title} done`,exact:true});
    await done.waitFor();
    await captureJourney(page,{path:out+`/CATALOG-003-${title.startsWith('Config')?'ready':'last'}.png`,fullPage:true});
    const completing=page.waitForResponse(r=>/\/tasks\/[^/]+\/complete$/.test(r.url())&&r.request().method()==='POST');
    await done.focus();await page.keyboard.press('Enter');
    assert.equal((await completing).status(),200,'CATALOG-003 the named team marks its task done');
    await duty(title).locator(':scope > summary',{hasText:/done/i}).waitFor();
    if(!await task.evaluate(el=>el.open))await task.locator(':scope > summary').click();
    await task.getByText('Recorded done by',{exact:true}).waitFor();
  }
  await captureJourney(page,{path:out+'/CATALOG-003-complete.png',fullPage:true});
  const states=(await api(`/work/${work.id}/obligations`)).items.map(o=>o.state).sort();
  assert.deepEqual(states,['done','done','waived'],'CATALOG-003 the request holds one waived step and two done tasks');
  await api(`/work/${work.id}/commands`,{command:'close',reason:'All responsibilities settled',revision:(await api('/work/'+work.id)).work.revision});
  assert.equal((await api('/work/'+work.id)).work.state,'closed','CATALOG-003 the request closes once every responsibility is settled');
  console.log('PASS CATALOG-003 native task plan editor, waiting and ready tasks, owner waiver, team completion and close gate at 1440/390');
}

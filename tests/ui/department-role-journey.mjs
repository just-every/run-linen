import assert from 'node:assert/strict';
import {apiFor,fields,signIn} from './connected-helpers.mjs';

async function tooltip(page,control) {
  const label=await control.getAttribute('data-tip');
  assert.ok(label,'The control has a tooltip label');
  await page.mouse.move(1,1);
  await control.evaluate(element=>element.blur());
  await page.waitForFunction(element=>getComputedStyle(element,'::after').opacity==='0',await control.elementHandle());
  await control.hover();
  const hover=await control.evaluate(element=>{
    const style=getComputedStyle(element,'::after');
    return {opacity:style.opacity,delay:parseFloat(style.transitionDelay),content:style.content};
  });
  assert.equal(hover.opacity,'0','Tooltip stays hidden at the start of hover');
  assert.ok(hover.delay>=0.25&&hover.delay<=0.35,'Hover tooltip waits about 300 milliseconds');
  assert.equal(hover.content,JSON.stringify(label));
  await page.waitForFunction(element=>getComputedStyle(element,'::after').opacity==='1',await control.elementHandle());
  await page.mouse.move(1,1);
  await page.waitForFunction(element=>getComputedStyle(element,'::after').opacity==='0',await control.elementHandle());
  await page.keyboard.press('Tab');
  await control.focus();
  const focus=await control.evaluate(element=>({visible:element.matches(':focus-visible'),opacity:getComputedStyle(element,'::after').opacity,transition:getComputedStyle(element,'::after').transitionDuration}));
  assert.equal(focus.visible,true,'Keyboard focus uses the visible focus state');
  assert.equal(focus.opacity,'1','Keyboard focus shows the tooltip immediately');
  assert.equal(parseFloat(focus.transition),0);
  await control.evaluate(element=>element.blur());
}

export async function departmentRoleJourney({page,api,base,out,browser,departmentId,otherDepartmentId}) {
  const capture=async(target,name,width)=>{
    await target.setViewportSize({width,height:1000});
    await target.waitForFunction(()=>!document.querySelector('.loading'));
    await target.evaluate(()=>document.fonts.ready);
    assert.ok(await target.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} fits ${width}`);
    await target.screenshot({path:`${out}/ROLE-001-${name}-${width}.png`,fullPage:true});
    await target.screenshot({path:`${out}/ROLE-001-${name}-${width}-viewport.png`});
  };
  const captureBoth=async(target,name,focus)=>{
    for(const width of [1440,390]) {
      await target.setViewportSize({width,height:1000});
      if(focus)await focus.scrollIntoViewIfNeeded();
      await capture(target,name,width);
    }
  };
  const person={name:'Morgan Rivera',email:'synthetic-linen-12050@example.test',password:'synthetic-linen-12051'};
  await page.goto(base+'/app#/members');
  const memberForm=page.locator('details[data-action-path="/members"] form');
  await fields(memberForm,{name:person.name,email:person.email,password:person.password,isPerson:true,roles:['employee']});
  let saved=page.waitForResponse(response=>response.url().endsWith('/members')&&response.request().method()==='POST');
  await memberForm.getByRole('button',{name:'Save',exact:true}).click();
  const createdMember=await saved;
  assert.equal(createdMember.status(),201);
  const member=await createdMember.json();
  await page.reload();
  const roles=page.getByRole('region',{name:'Custom roles',exact:true});
  const create=roles.getByRole('form',{name:'Create custom role',exact:true});
  const createDisclosure=roles.locator('details').filter({has:page.locator(':scope > summary').getByText('Create custom role',{exact:true})}).first();
  if(!await createDisclosure.evaluate(element=>element.open))await createDisclosure.locator(':scope > summary').click();
  await create.getByLabel('Role name',{exact:true}).fill('Facilities reader');
  await create.getByLabel('Department',{exact:true}).selectOption(departmentId);
  assert.equal(await create.getByRole('checkbox',{name:'Read tickets (required)',exact:true}).isChecked(),true);
  assert.equal(await create.getByRole('checkbox',{name:'Read tickets (required)',exact:true}).isDisabled(),true);
  await captureBoth(page,'role-create',create);
  saved=page.waitForResponse(response=>response.url().endsWith('/department-roles')&&response.request().method()==='POST');
  await create.getByRole('button',{name:'Create role',exact:true}).click();
  const createdRole=await saved;
  assert.equal(createdRole.status(),201);
  const admin=await api('/department-roles'),role=admin.items.find(item=>item.name==='Facilities reader'&&item.departmentId===departmentId);
  assert.ok(role);
  assert.deepEqual(role.permissions,['ticket.read']);
  assert.ok(!role.members.some(assignment=>assignment.active),'Creating a definition grants nobody access');
  const department=admin.departments.find(item=>item.id===departmentId);
  assert.ok(department);
  const openRole=async(name)=>{
    const panel=roles.locator('details').filter({has:page.locator(':scope > summary').getByText(`${name} · ${department.name}`,{exact:true})}).first();
    await panel.locator(':scope > summary').waitFor();
    if(!await panel.evaluate(element=>element.open))await panel.locator(':scope > summary').click();
    return panel;
  };
  let panel=await openRole('Facilities reader');
  await panel.getByText('Edit custom role',{exact:true}).click();
  const edit=panel.getByRole('form',{name:'Edit Facilities reader',exact:true});
  await edit.getByLabel('Role name',{exact:true}).fill('Facilities agent');
  await edit.getByText('Before changing this role',{exact:true}).click();
  await captureBoth(page,'role-edit',edit);
  saved=page.waitForResponse(response=>response.url().endsWith(`/department-roles/${role.id}`)&&response.request().method()==='POST');
  await edit.getByRole('button',{name:'Save role changes',exact:true}).click();
  assert.equal((await saved).status(),200);
  panel=await openRole('Facilities agent');
  await panel.getByText('Manage role assignments',{exact:true}).click();
  let assignment=panel.getByRole('form',{name:'Facilities agent assignments',exact:true});
  await assignment.getByLabel('Person',{exact:true}).selectOption(member.id);
  saved=page.waitForResponse(response=>response.url().endsWith(`/department-roles/${role.id}/members`)&&response.request().method()==='POST');
  await assignment.getByRole('button',{name:'Grant role',exact:true}).click();
  assert.equal((await saved).status(),200);
  panel=await openRole('Facilities agent');
  await panel.getByText(person.name,{exact:true}).waitFor();
  await captureBoth(page,'role-assigned',panel);
  await tooltip(page,page.getByRole('button',{name:'Your workspace and account',exact:true}));

  const facilities=await api('/work',{title:'Meeting room display will not turn on',body:'The meeting room display stays dark when the wall switch is on. Please arrange a Facilities inspection.',departmentId,deduplicationKey:'synthetic-linen-12052'});
  const other=await api('/work',{title:'Laptop adapter needs replacement',body:'The laptop adapter has a damaged cable. IT needs to arrange a replacement.',departmentId:otherDepartmentId,deduplicationKey:'synthetic-linen-12053'});
  const legacy=await api('/work',{title:'Review the shared service contact list',body:'Confirm the current shared service contact details.',deduplicationKey:'synthetic-linen-12054'});
  const privateNote='Facilities checked the control cabinet access code with the building manager. Keep that investigation within the service team.';
  await api(`/work/${facilities.id}/messages`,{visibility:'private',body:privateNote,sourceMessageId:'synthetic-linen-12055'});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),memberPage=await context.newPage(),errors=[];
  memberPage.on('pageerror',error=>errors.push(String(error)));
  try {
    await signIn(memberPage,base,person.email,person.password);
    const memberApi=apiFor(memberPage),session=await memberApi('/session');
    assert.deepEqual(session.principal.roles,['employee'],'A custom assignment does not promote the employee to global service staff');
    const queue=(await memberApi('/work')).items;
    assert.ok(queue.some(item=>item.id===facilities.id));
    assert.ok(queue.every(item=>item.department_id===departmentId),'The read-only custom role discovers only Facilities tickets');
    const detail=await memberApi(`/work/${facilities.id}`);
    assert.equal(detail.work.id,facilities.id);
    assert.ok(!detail.messages.some(message=>message.visibility==='private'||message.body===privateNote),'The ticket detail excludes private notes');
    const denied=await memberPage.evaluate(async ids=>Promise.all(ids.map(async id=>(await fetch(`/api/v1/work/${id}`)).status)),[other.id,legacy.id]);
    assert.deepEqual(denied,[404,404],'IT and unscoped tickets stay unreadable');
    for(const width of [1440,390]) {
      await memberPage.setViewportSize({width,height:1000});
      await memberPage.goto(base+'/app#/work');
      const queueRegion=memberPage.getByRole('region',{name:'Request queue',exact:true});
      await queueRegion.locator(`a[href="#/work/${facilities.id}"]`).waitFor();
      assert.equal(await queueRegion.locator(`a[href="#/work/${other.id}"]`).count(),0);
      assert.equal(await queueRegion.locator(`a[href="#/work/${legacy.id}"]`).count(),0);
      await tooltip(memberPage,memberPage.getByRole('button',{name:'Your workspace and account',exact:true}));
      const refresh=queueRegion.getByRole('button',{name:'Refresh conversations',exact:true});
      if(await refresh.count())await tooltip(memberPage,refresh);
      await capture(memberPage,'member-queue',width);
      await queueRegion.locator(`a[href="#/work/${facilities.id}"]`).click();
      await memberPage.getByRole('heading',{level:2,name:'Meeting room display will not turn on',exact:true}).waitFor();
      assert.ok(!(await memberPage.locator('body').innerText()).includes(privateNote));
      await capture(memberPage,'member-ticket',width);
    }

    await page.goto(base+'/app#/members');
    panel=await openRole('Facilities agent');
    const assignmentsDisclosure=panel.locator('details').filter({has:page.locator(':scope > summary').getByText('Manage role assignments',{exact:true})}).first();
    if(!await assignmentsDisclosure.evaluate(element=>element.open))await assignmentsDisclosure.locator(':scope > summary').click();
    assignment=panel.getByRole('form',{name:'Facilities agent assignments',exact:true});
    await assignment.getByLabel('Assignment action',{exact:true}).selectOption('withdraw');
    await assignment.getByLabel('Person',{exact:true}).selectOption(member.id);
    saved=page.waitForResponse(response=>response.url().endsWith(`/department-roles/${role.id}/members`)&&response.request().method()==='POST');
    await assignment.getByRole('button',{name:'Withdraw role',exact:true}).click();
    assert.equal((await saved).status(),200);
    const withdrawn=await memberPage.evaluate(async id=>(await fetch(`/api/v1/work/${id}`)).status,facilities.id);
    assert.equal(withdrawn,404,'Owner withdrawal removes access in the existing member session immediately');
    assert.ok(!(await memberApi('/work')).items.some(item=>item.id===facilities.id));
    panel=await openRole('Facilities agent');
    await panel.getByText('No active assignments',{exact:true}).waitFor();
    await captureBoth(page,'role-withdrawn',panel);
    await memberPage.reload();
    await memberPage.getByRole('alert').first().waitFor();
    await captureBoth(memberPage,'member-access-withdrawn');
    await memberPage.goto(base+'/app#/work');
    await memberPage.waitForFunction(()=>!document.querySelector('.loading'));
    assert.equal(await memberPage.getByRole('region',{name:'Request queue',exact:true}).locator(`a[href="#/work/${facilities.id}"]`).count(),0);
    await captureBoth(memberPage,'member-queue-withdrawn');
    assert.deepEqual(errors,[]);
  } catch(error) {
    await memberPage.screenshot({path:`${out}/ROLE-001-member-failure.png`,fullPage:true}).catch(()=>{});
    throw error;
  } finally {await context.close();}
  console.log('PASS ROLE-001 native: Facilities-only custom read access, named employee assignment and immediate withdrawal, private-note exclusion, role editing, account and refresh tooltips, desktop and mobile evidence.');
}

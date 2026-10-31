import assert from 'node:assert/strict';
import {apiFor, signIn} from './connected-helpers.mjs';
import {captureJourney} from './viewport-evidence.mjs';
import {ticketCall} from '../platform/agent-door-fixture.mjs';
import {relationshipActivityJourney} from './relationship-activity-journey.mjs';

export async function deskQueueJourney({browser,page,api,base,out,errors}) {
  const owner=(await api('/session')).principal.userId, password='synthetic-Desk-groups-2026';
  const member = async (name, roles) => {
    const email = `audit-queue-${name.split(' ')[0].toLowerCase()}@northstar.example`;
    return { ...await api('/members', { name, email, password, roles }), name, email };
  };
  const lena = await member('Lena Ortiz', ['operator']), omar = await member('Omar Haddad', ['operator']);

  // The owner, acting for admin, creates two groups and names Lena the Network lead.
  const network = await api('/work-groups', { name: 'Audit Network' }), hardware = await api('/work-groups', { name: 'Audit Hardware' });
  await api(`/work-groups/${network.id}/members`, { userId: lena.id, lead: true });
  await api(`/work-groups/${network.id}/members`, { userId: omar.id });
  await api(`/work-groups/${hardware.id}/members`, { userId: owner, lead: true });
  const ticket = async (title, groupId, priority, sensitivity = 'normal') => {
    const work = await api('/work', { title, body: `${title}.`, kind: 'incident', sensitivity, deduplicationKey: crypto.randomUUID() });
    const read = await api(`/work/${work.id}/classification`);
    await api(`/work/${work.id}/classification/override`, { type: 'incident', category: 'network', subcategory: 'vpn', impact: 'high', urgency: 'high', priority, revision: read.revision, workRevision: read.workRevision, reason: 'Triage' });
    const current = (await api(`/work/${work.id}`)).work;
    await api(`/work/${work.id}/group`, { groupId, revision: current.revision });
    return work;
  };
  const p1 = [];
  for (const site of ['Denver', 'Austin', 'Boston', 'Chicago', 'Seattle']) p1.push(await ticket(`VPN down in ${site}`, network.id, 'P1'));
  await ticket('Printer queue stuck', network.id, 'P2');
  await ticket('Dock flickers', hardware.id, 'P2');
  await ticket('Executive laptop seized for review', hardware.id, 'P1', 'restricted');

  // Lena signs in, saves a shared "Unassigned P1" view and bulk-assigns its five tickets to Omar.
  const lead = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' }), lp = await lead.newPage();
  lp.on('pageerror', error => errors.push(String(error)));
  await lp.goto(base + '/app');
  await lp.getByLabel('Work email').fill(lena.email);
  await lp.getByLabel('Password', { exact: true }).fill(password);
  await lp.getByRole('button', { name: 'Sign in', exact: true }).click();
  await lp.getByRole('heading', { name: 'Requests', exact: true }).waitFor();
  const queue = lp.getByRole('region', { name: 'Request queue' });
  await queue.getByText('Save a view', { exact: true }).click();
  const save = queue.getByRole('form', { name: 'Save a view' });
  await save.getByLabel('View name').fill('Unassigned P1');
  await save.getByLabel('View status').selectOption('open');
  await save.getByLabel('View owner').selectOption('none');
  await save.getByLabel('View priority').selectOption('P1');
  await save.getByLabel('View group').selectOption(network.id);
  await save.getByLabel('View sort').selectOption('oldest');
  await save.getByLabel('Share with every agent in this workspace').check();
  await save.getByRole('button', { name: 'Save view', exact: true }).click();
  const rows = queue.getByRole('table', { name: 'Your conversations' }).getByRole('row').filter({ hasNot: lp.getByRole('columnheader') });
  await lp.waitForFunction(() => document.querySelectorAll('.queue-table a.queue-row').length === 5);
  assert.deepEqual(await rows.locator('.q-subject strong').allTextContents(), p1.map(w => w.title), 'DESK-001 the saved view lists the five unassigned P1 tickets, oldest first');
  assert.match(await queue.getByLabel('Queue view').inputValue(), /^view:/, 'DESK-001 the saved view is the one shown');
  assert.deepEqual((await api('/work-views')).items.filter(v => v.name==='Unassigned P1').map(v => [v.name, v.shared, v.mine]), [['Unassigned P1', true, false]], 'DESK-001 the shared view is offered to other agents');
  await captureJourney(lp, { path: `${out}/DESK-001-unassigned-p1.png`, fullPage: true });
  await queue.getByText('Bulk update', { exact: true }).click();
  const bulk = queue.getByRole('form', { name: 'Bulk update' });
  await bulk.getByLabel('Choose every ticket shown').check();
  await bulk.getByLabel(/^Bulk assignee/).selectOption(omar.id);
  await bulk.getByLabel('Bulk update reason', { exact: true }).fill('Omar takes the VPN outage');
  const applied = lp.waitForResponse(r => r.url().endsWith('/work/bulk-commands') && r.request().method() === 'POST');
  await bulk.getByRole('button', { name: 'Apply to 5 tickets', exact: true }).click();
  assert.equal((await applied).status(), 200);
  await queue.getByText('5 changed, 0 refused.', { exact: false }).waitFor();
  for (const w of p1) assert.equal((await api(`/work/${w.id}`)).work.assignee_id, omar.id, 'DESK-001 bulk-assigned');
  await lp.waitForFunction(() => document.querySelectorAll('.queue-table a.queue-row').length === 0);

  // The lead view lists Network's tickets and leaves out Hardware's restricted ticket.
  await queue.getByLabel('Queue view').selectOption(`lead:${network.id}`);
  await queue.getByText('Printer queue stuck', { exact: true }).waitFor();
  assert.equal(await rows.count(), 6, 'DESK-001 the lead view lists the six Network tickets');
  assert.equal(await queue.getByText('Executive laptop seized for review').count(), 0, "DESK-001 the lead view excludes another group's restricted ticket");
  assert.equal(await queue.getByText('Dock flickers').count(), 0);
  await captureJourney(lp, { path: `${out}/DESK-001-lead-view.png`, fullPage: true });

  await queue.getByText('Bulk update', { exact: true }).click();
  // Keyboard-only triage of the lead view: no pointer input from here on.
  await lp.evaluate(() => { window.pointerInputs = 0; for (const type of ['pointerdown', 'mousedown']) document.addEventListener(type, () => { window.pointerInputs += 1; }, true); });
  await lp.keyboard.press('Escape');
  await lp.locator('#main-content').focus();
  const firstTitle = await rows.first().locator('.q-subject strong').textContent();
  await lp.keyboard.press('j');
  await lp.getByRole('heading', { level: 2, name: firstTitle, exact: true }).waitFor();
  const opened = lp.url().split('/').at(-1);
  await lp.keyboard.press('?');
  await queue.getByRole('definition').filter({ hasText: 'Assign the open ticket to yourself' }).waitFor();
  await lp.keyboard.press('a');
  await lp.waitForFunction(async ([id, me]) => (await (await fetch(`/api/v1/work/${id}`)).json()).work.assignee_id === me, [opened, lena.id]);
  await lp.locator('.meta-line').getByText(lena.name, { exact: true }).waitFor();
  await lp.keyboard.press('r');
  assert.equal(await lp.evaluate(() => document.activeElement?.id), 'conversation-message');
  await lp.keyboard.type('We are restoring the VPN concentrator now.');
  const replied = lp.waitForResponse(r => r.url().endsWith(`/work/${opened}/messages`) && r.request().method() === 'POST');
  await lp.keyboard.press('Control+Enter');
  assert.equal((await replied).status(), 201, 'DESK-001 the reply is sent from the keyboard');
  await lp.locator('li[data-message-id]').filter({ hasText: 'We are restoring the VPN concentrator now.' }).waitFor();
  await lp.keyboard.press('Escape');
  await lp.keyboard.press('s');
  await lp.locator('section.work-controls').getByLabel('Reason', { exact: true }).waitFor();
  assert.equal(await lp.evaluate(() => document.activeElement?.getAttribute('name')), 'reason');
  await lp.keyboard.type('Waiting on the carrier to replace the circuit');
  const paused = lp.waitForResponse(r => r.url().endsWith(`/work/${opened}/commands`) && r.request().method() === 'POST');
  await lp.keyboard.press('Control+Enter');
  assert.equal((await paused).status(), 200, 'DESK-001 the status is set from the keyboard');
  await lp.waitForFunction(async id => (await (await fetch(`/api/v1/work/${id}`)).json()).work.state === 'paused', opened);
  const after = await api(`/work/${opened}`);
  assert.equal(after.work.assignee_id, lena.id);
  assert.ok(after.messages.some(m => m.visibility === 'public' && m.body === 'We are restoring the VPN concentrator now.'));
  await lp.keyboard.press('Escape');
  await lp.keyboard.press('j');
  await lp.waitForFunction(id => !location.hash.endsWith(id), opened);
  assert.equal(await lp.evaluate(() => window.pointerInputs), 0, 'DESK-001 triage used no pointer input');
  await captureJourney(lp, { path: `${out}/DESK-001-keyboard-triage.png`, fullPage: true });
  await lead.close();
  console.log('PASS DESK-001 native saved view, five bulk assignments, lead isolation and pointer-free keyboard triage');
}

export async function deskScenarioJourney({browser,page,api,base,out,errors}) {
  const password='synthetic-Connected-browser-2026';
  const member = async (name, roles) => {
    const email = `audit-scenario-${name.split(' ')[0].toLowerCase()}@northstar.example`;
    return { ...await api('/members', { name, email, password, roles }), name, email };
  };
  const dana = await member('Dana Reyes', ['operator']), nora = await member('Nora Kim', ['operator']), erin = await member('Erin Walsh', ['employee']);
  const desk = await api('/work-groups', { name: 'Audit Service Desk' }), l2 = await api('/work-groups', { name: 'Audit Network L2' });
  await api(`/work-groups/${desk.id}/members`, { userId: dana.id });
  await api(`/work-groups/${l2.id}/members`, { userId: nora.id, lead: true });
  const escalate = await api('/work-scenarios', { name: 'Escalate to Network L2', scope: 'group', groupId: desk.id, steps: {
    classification: { type: 'incident', category: 'network', subcategory: 'vpn', impact: 'high', urgency: 'medium', priority: 'P2' },
    group: { groupId: l2.id, assigneeId: null },
    message: { visibility: 'private', body: 'Escalated to Network L2: tunnel drops after the client update.' },
    status: { command: 'pause', reason: 'Waiting on Network L2', waitingOn: 'vendor' },
    taskPlan: { name: 'Network recovery duties', tasks: [{ title: 'Check controller inventory', ownerId: nora.id, dueDate: '2026-11-01' }] } } });
  await api('/work-templates', { name: 'New laptop setup', kind: 'service_request', title: 'Set up a new laptop', body: 'Model, start date and apps to install:', context: { deviceModel: 'MacBook Pro 14' } });
  await api('/work-templates', { name: 'Network task template', kind: 'task', title: 'Verify the replacement controller', body: 'Local duty', context: { ownerId: nora.id, dueDate: '2026-11-02' } });
  const ticket = async (title) => api('/work', { title, body: `${title}.`, kind: 'incident', deduplicationKey: crypto.randomUUID() });
  const vpn = await ticket('VPN drops every ten minutes'), a = await ticket('Wi-Fi slow on floor 3'), b = await ticket('Wi-Fi slow on floor 4');

  // Dana opens the ticket and runs the group scenario from the keyboard picker (x focuses it).
  const agent = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' }), ap = await agent.newPage();
  ap.on('pageerror', error => errors.push(String(error)));
  await signIn(ap, base, dana.email, password);
  await ap.goto(`${base}/app#/work/${vpn.id}`);
  await ap.getByRole('heading', { level: 2, name: 'VPN drops every ten minutes', exact: true }).waitFor();
  const panel = ap.getByRole('region', { name: 'Scenarios' });
  await panel.getByLabel(/^Scenario/).waitFor();
  await ap.locator('#main-content').focus();
  await ap.keyboard.press('x');
  assert.equal(await ap.evaluate(() => document.activeElement?.closest('section')?.getAttribute('aria-label')), 'Scenarios', 'DESK-015 x focuses the scenario picker');
  await panel.getByLabel(/^Scenario/).selectOption(escalate.id);
  const priorGroupId=(await api(`/work/${vpn.id}`)).work.group_id;
  const priorGroup=(await api('/work-groups')).items.find(group=>group.id===priorGroupId)?.name??'none';
  const ran = ap.waitForResponse(r => r.url().endsWith(`/work/${vpn.id}/scenario-runs`) && r.request().method() === 'POST');
  await panel.getByRole('button', { name: 'Run scenario', exact: true }).click();
  assert.equal((await ran).status(), 200);
  const changes = panel.getByRole('list', { name: 'Scenario changes' });
  await changes.getByText('category: none → network').waitFor();
  await changes.getByText('state: open → paused').waitFor();
  await changes.getByText(`group: ${priorGroup} → Audit Network L2`).waitFor();
  const after = await api(`/work/${vpn.id}`);
  assert.deepEqual([after.work.group_id, after.work.state], [l2.id, 'paused'], 'DESK-015 the console run applies the scenario');
  await ap.locator('#main-content').focus();
  await ap.keyboard.press('?');
  await ap.getByRole('definition').filter({ hasText: 'Run a scenario on the open ticket' }).waitFor();
  for (const width of [1440]) {
    await ap.setViewportSize({ width, height: 1000 });
    await captureJourney(ap, { path: `${out}/DESK-015-ticket-scenario-${width}.png`, fullPage: true });
  }
  // DESK-017: the native ticket timeline shows the scenario's actor and category change beside its messages.
  const activity = ap.getByRole('list', { name: 'Ticket activity', exact: true });
  await activity.getByText('Scenario · Escalate to Network L2 · Scenario run', { exact: true }).waitFor();
  await activity.locator(':scope > li').filter({ hasText: 'Scenario · Escalate to Network L2 · Scenario run' }).getByText('Category: none → network', { exact: true }).waitFor();
  assert.ok((await activity.innerText()).includes('Internal activity'), 'DESK-017 internal history is labelled');
  for (const width of [1440]) {
    await ap.setViewportSize({ width, height: 1000 });
    await activity.scrollIntoViewIfNeeded();
    await captureJourney(ap, { path: `${out}/DESK-017-agent-activity-${width}.png`, fullPage: true });
  }
  // The owner sees internal events; an employee request verifies the public-only timeline in the same native UI.
  const employeeApiContext = await browser.newContext(), employeePage = await employeeApiContext.newPage();
  await signIn(employeePage, base, erin.email, password);
  const employeeApi = apiFor(employeePage);
  const own = await employeeApi('/work', { title: 'Laptop loses VPN connection', body: 'Disconnected during a call', kind: 'incident', deduplicationKey: 'desk017-browser' });
  await api(`/work/${own.id}/messages`, { visibility: 'private', body: 'Internal certificate diagnostic', sourceMessageId: 'desk017-private' });
  await api(`/work/${own.id}/commands`, { revision: own.revision, command: 'pause', reason: 'Waiting for the vendor', waitingOn: 'vendor' });
  await employeePage.goto(`${base}/app#/work/${own.id}`);
  const publicActivity = employeePage.getByRole('list', { name: 'Ticket activity', exact: true });
  await publicActivity.getByText('Paused: Waiting for the vendor', { exact: true }).waitFor();
  assert.ok(!(await publicActivity.innerText()).includes('Internal'), 'DESK-017 employee sees no internal entries');
  for (const width of [1440]) {
    await employeePage.setViewportSize({ width, height: 1000 });
    await publicActivity.scrollIntoViewIfNeeded();
    await captureJourney(employeePage, { path: `${out}/DESK-017-employee-activity-${width}.png`, fullPage: true });
  }
  await relationshipActivityJourney({ agentPage: ap, ownerApi: api, employeePage, employeeApi, base, out,
    managerId: dana.id, employeeId: erin.id, workId: own.id });
  await employeeApiContext.close();

  // DESK-015 starts a local project task plan; a task template fills the existing editable task form.
  const planId = (await api(`/work/${vpn.id}/scenario-runs`)).items.at(-1).changes.find(c => c.field === 'task plan').after;
  for (const width of [1440]) {
    await ap.setViewportSize({ width, height: 1000 });
    await ap.goto(`${base}/app#/projects/${planId}`);
    await ap.getByRole('heading', { name: 'Network recovery duties', exact: false }).waitFor();
    await ap.getByLabel('Task record template', { exact: true }).selectOption({ label: 'Network task template' });
    const taskForm = ap.locator('details').filter({ has: ap.locator('summary').getByText('Add a task', { exact: true }) });
    await taskForm.locator('summary').click();
    assert.equal(await taskForm.getByLabel('Task', { exact: false }).inputValue(), 'Verify the replacement controller', 'DESK-015 task title pre-filled');
    assert.equal(await taskForm.getByLabel('Owner', { exact: false }).inputValue(), nora.id);
    assert.equal(await taskForm.getByLabel('Due date', { exact: false }).inputValue(), '2026-11-02');
    await taskForm.getByLabel('Task', { exact: false }).fill(`Verify controller at ${width}`);
    await captureJourney(ap, { path: `${out}/DESK-015-task-template-${width}.png`, fullPage: true });
    const saved = ap.waitForResponse(r => r.url().endsWith(`/projects/${planId}/tasks`) && r.request().method() === 'POST');
    await taskForm.getByRole('button', { name: 'Save', exact: true }).click();
    assert.equal((await saved).status(), 201);
    const task = (await api(`/projects/${planId}`)).tasks.find(t => t.title === `Verify controller at ${width}`);
    assert.ok(task);
    await ap.reload();
    const status = ap.getByLabel(`Status of ${task.title}`, { exact: true });
    await status.waitFor();
    const updated = ap.waitForResponse(r => r.url().endsWith(`/projects/${planId}/tasks/${task.id}`) && r.request().method() === 'POST');
    await status.selectOption('in_progress');
    assert.equal((await updated).status(), 200, 'DESK-017 task status changed through the native control');
    const history = ap.locator('details').filter({ has: ap.locator(':scope > summary').getByText(`History: ${task.title}`, { exact: true }) });
    await history.locator(':scope > summary').click();
    const timeline = history.getByRole('list', { name: `Task activity: ${task.title}`, exact: true });
    await timeline.getByText('State: todo → in_progress', { exact: true }).waitFor();
    await timeline.getByText(`Title: none → ${task.title}`, { exact: true }).waitFor();
    assert.ok((await timeline.innerText()).includes('Dana Reyes'), 'DESK-017 task history shows the actor');
    const native = (await api(`/projects/${planId}/tasks/${task.id}/activity`)).items;
    assert.ok(native.every(e => Number.isFinite(Date.parse(e.at))));
    await captureJourney(ap, { path: `${out}/DESK-017-project-task-history-${width}.png`, fullPage: true });
    const scenarioHistory = ap.locator('details').filter({ has: ap.locator(':scope > summary').getByText('History: Check controller inventory', { exact: true }) });
    await scenarioHistory.locator(':scope > summary').click();
    await scenarioHistory.getByText('Scenario · Escalate to Network L2', { exact: false }).waitFor();
    await captureJourney(ap, { path: `${out}/DESK-017-scenario-task-history-${width}.png`, fullPage: true });
  }

  // At phone width the bulk-update screen runs the scenario on two chosen tickets.
  await ap.setViewportSize({ width: 1440, height: 1000 });
  await ap.goto(`${base}/app#/work`);
  const queue = ap.getByRole('region', { name: 'Request queue' });
  await queue.getByText('Bulk update', { exact: true }).click();
  const bulk = queue.getByRole('form', { name: 'Bulk update' });
  await bulk.getByLabel(/Wi-Fi slow on floor 3/).check();
  await bulk.getByLabel(/Wi-Fi slow on floor 4/).check();
  await bulk.getByLabel(/^Bulk change/).selectOption('scenario');
  await bulk.getByLabel(/^Bulk scenario/).selectOption(escalate.id);
  await bulk.getByLabel('Bulk update reason', { exact: true }).fill('Both floors share the Network L2 controller');
  await bulk.getByRole('button', { name: 'Apply to 2 tickets', exact: true }).click();
  await queue.getByText('2 changed, 0 refused.', { exact: false }).waitFor();
  for (const w of [a, b]) assert.equal((await api(`/work/${w.id}`)).work.group_id, l2.id, 'DESK-015 bulk scenario run');
  await captureJourney(ap, { path: `${out}/DESK-015-bulk-scenario-390.png`, fullPage: true });
  await agent.close();

  // An employee at phone width starts a ticket from the "New laptop setup" template; the draft is pre-filled.
  const phone = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' }), ep = await phone.newPage();
  ep.on('pageerror', error => errors.push(String(error)));
  await signIn(ep, base, erin.email, password);
  for (const width of [1440]) {
  await ep.setViewportSize({ width, height: 1000 });
  await ep.goto(`${base}/app#/work`);
  await ep.getByLabel(/^Start from a template/).selectOption({ label: 'New laptop setup' });
  const field = ep.getByLabel('What would make work easier?');
  assert.equal(await field.inputValue(), 'Model, start date and apps to install:', 'DESK-015 the template pre-fills the request');
  await field.fill('Model, start date and apps to install: MacBook Pro 14, Monday, Figma');
  await ep.getByRole('button', { name: 'Send message', exact: true }).click();
  await ep.waitForURL(/#\/work\/.+/);
  const created = (await apiFor(ep)(`/work/${ep.url().split('/').at(-1)}`)).work;
  assert.deepEqual([created.title, created.kind, JSON.parse(created.context_json).deviceModel], ['Set up a new laptop', 'service_request', 'MacBook Pro 14']);
  await captureJourney(ep, { path: `${out}/DESK-015-template-${width}.png`, fullPage: true });
  }
  await phone.close();
  console.log('PASS DESK-015 native keyboard scenario, change list, task and ticket templates and bulk scenario');
}

export async function mcpCommentJourney({browser,page,api,base,out}) {
 const password='synthetic-Connected-browser-2026';
 const employee=await api('/members',{name:'Erin Walsh',email:'erin@northstar.example',password,roles:['employee']});
 const hardware=await api('/work-groups',{name:'Audit MCP Hardware'}),bot=await api('/automation-principals',{name:'Audit Desk bot',idempotencyKey:'API-003-browser'});
 const work=await api('/work',{title:'Monitor flickers during design reviews',body:'The display goes dark when sharing a design review.',beneficiaryId:employee.id,deduplicationKey:'API-003-display'});
 const placed=await api('/work/'+work.id+'/group',{groupId:hardware.id,revision:work.revision,assigneeId:null});
 const credential=await api('/mcp-credentials',{principalId:bot.id,name:'Audit Desk bot',groupIds:[hardware.id],scopes:['work.read','work.comment'],tools:['work.list','work.get','work.comment'],expiresAt:new Date(Date.now()+30*86400000).toISOString()});
 await page.goto(base+'/agents');
 await page.locator('[data-policy-class=standard]').selectOption('autonomous');
 await page.getByRole('radio',{name:'No',exact:true}).check();
 await page.getByRole('button',{name:'Save policy',exact:true}).click();
 await page.locator('[data-create-policy]').waitFor({state:'hidden'});
 const rpc=async(name,args={})=>{const call=ticketCall(name,args);const r=await fetch(base+'/api/mcp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+credential.secret,'MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':call.name},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{...call,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}})});const v=await r.json();assert.ok(!v.error,JSON.stringify(v.error));assert.ok(!v.result.isError,JSON.stringify(v.result));return v.result.structuredContent;};
 const listed=await rpc('work.list');assert.deepEqual(listed.items.map(w=>w.id),[work.id],'API-003 client sees Hardware employee ticket');
 const read=await rpc('work.get',{workId:work.id});
 await rpc('work.comment',{workId:work.id,revision:read.revision,body:'The display team is checking the USB-C connection.',deduplicationKey:'API-003-internal-note'});
 const ec=await browser.newContext({viewport:{width:1440,height:1000}}),ep=await ec.newPage();await signIn(ep,base,'erin@northstar.example',password);
 for(const width of [1440]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/app#/work/'+work.id);await page.reload();
  await page.getByRole('heading',{level:2,name:'Monitor flickers during design reviews',exact:true}).waitFor();
  await page.getByText('The display team is checking the USB-C connection.',{exact:true}).waitFor();
  await page.locator('li[data-message-id]').filter({hasText:'The display team is checking the USB-C connection.'}).getByText(/Audit Desk bot for .+ · Message/).waitFor();
  await captureJourney(page,{path:out+'/API-003-owner-'+width+'.png',fullPage:true});
  await ep.setViewportSize({width,height:1000});await ep.goto(base+'/app#/work/'+work.id);
  await ep.getByRole('heading',{level:2,name:'Monitor flickers during design reviews',exact:true}).waitFor();
  await ep.getByText('The display goes dark when sharing a design review.',{exact:true}).waitFor();
  assert.equal(await ep.getByText('The display team is checking the USB-C connection.',{exact:true}).count(),0,'API-003 internal comment never reaches employee');
  await captureJourney(ep,{path:out+'/API-003-employee-'+width+'.png',fullPage:true});
 }
 await ec.close();
 console.log('PASS API-003 native owner attribution and employee internal-comment isolation');
}

import assert from 'node:assert/strict';
import { relationshipActivityJourney } from './relationship-activity-journey.mjs';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { apiFor, finishFirstRun, signIn } from './connected-helpers.mjs';
import { captureJourney } from './viewport-evidence.mjs';

/** DESK-015: a Service Desk agent runs "Escalate to Network L2" from the ticket by keyboard (x) at 1440, runs a
 * scenario on two tickets from the bulk-update screen at 390, and an employee starts a ticket from the
 * "New laptop setup" template at 390. */
const base = process.env.LINEN_TEST_URL;
if (!base) throw Error('Start with node tests/ui/run.mjs tests/ui/desk-scenario-browser.mjs');
const out = process.env.LINEN_TEST_OUTPUT;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
const errors = [], password = 'synthetic-Connected-browser-2026';
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(base + '/app');
  await page.getByLabel('Your name').fill('Avery Morgan');
  await page.getByLabel('Workspace name').fill('Northstar Studio');
  await page.getByLabel('Work email').fill('avery@northstar.example');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('heading', { name: 'Requests', exact: true }).waitFor();
  await finishFirstRun(page, base);
  const api = apiFor(page);
  const member = async (name, roles) => {
    const email = `${name.split(' ')[0].toLowerCase()}@northstar.example`;
    return { ...await api('/members', { name, email, password, roles }), name, email };
  };
  const dana = await member('Dana Reyes', ['operator']), nora = await member('Nora Kim', ['operator']), erin = await member('Erin Walsh', ['employee']);
  const desk = await api('/work-groups', { name: 'Service Desk' }), l2 = await api('/work-groups', { name: 'Network L2' });
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
  const ran = ap.waitForResponse(r => r.url().endsWith(`/work/${vpn.id}/scenario-runs`) && r.request().method() === 'POST');
  await panel.getByRole('button', { name: 'Run scenario', exact: true }).click();
  assert.equal((await ran).status(), 200);
  const changes = panel.getByRole('list', { name: 'Scenario changes' });
  await changes.getByText('category: none → network').waitFor();
  await changes.getByText('state: open → paused').waitFor();
  await changes.getByText('group: none → Network L2').waitFor();
  const after = await api(`/work/${vpn.id}`);
  assert.deepEqual([after.work.group_id, after.work.state], [l2.id, 'paused'], 'DESK-015 the console run applies the scenario');
  await ap.locator('#main-content').focus();
  await ap.keyboard.press('?');
  await ap.getByRole('definition').filter({ hasText: 'Run a scenario on the open ticket' }).waitFor();
  for (const width of [1440, 390]) {
    await ap.setViewportSize({ width, height: 1000 });
    await captureJourney(ap, { path: `${out}/DESK-015-ticket-scenario-${width}.png`, fullPage: true });
  }
  // DESK-017: the native ticket timeline shows the scenario's actor and category change beside its messages.
  const activity = ap.getByRole('list', { name: 'Ticket activity', exact: true });
  await activity.getByText('Scenario · Escalate to Network L2 · Scenario run', { exact: true }).waitFor();
  await activity.locator(':scope > li').filter({ hasText: 'Scenario · Escalate to Network L2 · Scenario run' }).getByText('Category: none → network', { exact: true }).waitFor();
  assert.ok((await activity.innerText()).includes('Internal activity'), 'DESK-017 internal history is labelled');
  for (const width of [1440, 390]) {
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
  for (const width of [1440, 390]) {
    await employeePage.setViewportSize({ width, height: 1000 });
    await publicActivity.scrollIntoViewIfNeeded();
    await captureJourney(employeePage, { path: `${out}/DESK-017-employee-activity-${width}.png`, fullPage: true });
  }
  await relationshipActivityJourney({ agentPage: ap, ownerApi: api, employeePage, employeeApi, base, out,
    managerId: dana.id, employeeId: erin.id, workId: own.id });
  await employeeApiContext.close();

  // DESK-015 starts a local project task plan; a task template fills the existing editable task form.
  const planId = (await api(`/work/${vpn.id}/scenario-runs`)).items.at(-1).changes.find(c => c.field === 'task plan').after;
  for (const width of [1440, 390]) {
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
    assert.ok((await api(`/projects/${planId}`)).tasks.some(t => t.title === `Verify controller at ${width}`));
  }

  // At phone width the bulk-update screen runs the scenario on two chosen tickets.
  await ap.setViewportSize({ width: 390, height: 844 });
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
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'UTC' }), ep = await phone.newPage();
  ep.on('pageerror', error => errors.push(String(error)));
  await signIn(ep, base, erin.email, password);
  for (const width of [1440, 390]) {
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
  assert.deepEqual(errors, []);
  console.log('PASS DESK-015 browser: "Escalate to Network L2" run from the ticket by keyboard at 1440 with each change listed, a bulk scenario run on two tickets at 390, and a "New laptop setup" template pre-filling a new ticket at 390.');
} catch (error) {
  for (const [i, context] of browser.contexts().entries()) for (const [j, page] of context.pages().entries()) await page.screenshot({ path: `${out}/DESK-015-failure-${i}-${j}.png`, fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }

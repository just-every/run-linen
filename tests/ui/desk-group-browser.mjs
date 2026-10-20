import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { apiFor, finishFirstRun } from './connected-helpers.mjs';
import { captureJourney } from './viewport-evidence.mjs';

/** DESK-001: the owner creates two groups; the Network lead saves a shared "Unassigned P1" view in the console,
 * bulk-assigns its five tickets on the bulk-update screen, reads the lead view without Hardware's restricted ticket,
 * then triages that view keyboard-only (open next, assign to self, reply, set status) with no pointer input. */
const base = process.env.LINEN_TEST_URL;
if (!base) throw Error('Start with node tests/ui/run.mjs tests/ui/desk-group-browser.mjs');
const out = process.env.LINEN_TEST_OUTPUT;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
const errors = [], password = 'synthetic-Desk-groups-2026';
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
  const api = apiFor(page), owner = (await api('/session')).principal.userId;
  const member = async (name, roles) => {
    const email = `${name.split(' ')[0].toLowerCase()}@northstar.example`;
    return { ...await api('/members', { name, email, password, roles }), name, email };
  };
  const lena = await member('Lena Ortiz', ['operator']), omar = await member('Omar Haddad', ['operator']);

  // The owner, acting for admin, creates two groups and names Lena the Network lead.
  const network = await api('/work-groups', { name: 'Network' }), hardware = await api('/work-groups', { name: 'Hardware' });
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
  await save.getByLabel('View sort').selectOption('oldest');
  await save.getByLabel('Share with every agent in this workspace').check();
  await save.getByRole('button', { name: 'Save view', exact: true }).click();
  const rows = queue.getByRole('table', { name: 'Your conversations' }).getByRole('row').filter({ hasNot: lp.getByRole('columnheader') });
  await lp.waitForFunction(() => document.querySelectorAll('.queue-table a.queue-row').length === 5);
  assert.deepEqual(await rows.locator('.q-subject strong').allTextContents(), p1.map(w => w.title), 'DESK-001 the saved view lists the five unassigned P1 tickets, oldest first');
  assert.match(await queue.getByLabel('Queue view').inputValue(), /^view:/, 'DESK-001 the saved view is the one shown');
  assert.deepEqual((await api('/work-views')).items.map(v => [v.name, v.shared, v.mine]), [['Unassigned P1', true, false]], 'DESK-001 the shared view is offered to other agents');
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
  assert.deepEqual(errors, []);
  console.log('PASS DESK-001 browser: two groups, a shared "Unassigned P1" view saved in the console, five tickets bulk-assigned, a lead view without the other group\'s restricted ticket, and keyboard-only triage (next, assign to self, reply, status) at 1440, 390 and 320.');
} finally { await browser.close(); }

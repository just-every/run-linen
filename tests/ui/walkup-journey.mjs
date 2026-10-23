import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { action, apiFor, createConnection, finishFirstRun, signIn } from './connected-helpers.mjs';
// CHANNEL-007: the owner connects a RingCentral sandbox line, maps a badge and a phone number, takes a call into a ticket, holds an unknown
// number, and runs the walk-up desk: check in by name and by badge, serve and resolve one visit, and record that another left.
export async function walkupJourney({ browser, page, api, base, out, errors }) {
  const password = 'synthetic-Connected-browser-2026';
  const member = async (name, email) => ({ ...await api('/members', { name, email, password, roles: ['employee'] }), name, email });
  const priya = await member('Priya Nair', 'priya.nair@example.test'), tomas = await member('Tomas Eze', 'tomas.eze@example.test');
  const line = await createConnection(page, api, base, 'ringcentral', 'IT line', { line: '+1 303 555 0100', environment: 'sandbox', clientId: 'synthetic-linen-9600', clientSecret: 'synthetic-linen-9601', jwt: 'synthetic-linen-9602' });
  assert.equal((await api('/connection-status')).connections.find(c => c.id === line.id).evidence.extensionId, '1234');
  await page.goto(base + '/app#/walkup');
  await page.getByRole('heading', { name: 'Walk-up desk', exact: true }).waitFor();
  await action(page, 'Map a badge or phone number', { kind: 'badge', value: 'b-7731', userId: tomas.id }, '/contact-points', 'Map');
  await action(page, 'Map a badge or phone number', { kind: 'phone', value: '(303) 555-0142', userId: priya.id }, '/contact-points', 'Map');
  const mapped = page.getByRole('list', { name: 'Mapped badges and numbers' });
  await mapped.getByText('Badge B-7731 → Tomas Eze').waitFor(); await mapped.getByText('Phone +13035550142 → Priya Nair').waitFor();
  // A call from the mapped number becomes a ticket; one from an unknown number is held.
  const state = body => fetch(base + '/__fixture/state', { method: 'POST', body: JSON.stringify(body) });
  await state({ rc: [{ id: 'synthetic-linen-9610', startTime: new Date().toISOString(), duration: 61, from: { phoneNumber: '+13035550142' }, recording: { contentUri: 'https://platform.devtest.ringcentral.com/recording/synthetic-linen-9611' } },
    { id: 'synthetic-linen-9612', startTime: new Date().toISOString(), duration: 12, from: { phoneNumber: '+13035559999' } }] });
  assert.equal((await fetch(base + '/__fixture/tick')).status, 200);
  await page.reload();
  const held = page.getByRole('list', { name: 'Held calls' }); await held.getByText('+13035559999').waitFor();
  const call = await api('/calls/events', { connectionId: line.id, callId: 'synthetic-linen-9613', from: '+13035550142', durationSeconds: 40, transcript: 'synthetic-linen-9614 the projector in room 4 will not connect' });
  await page.goto(base + '/app#/work/' + call.workId);
  await page.locator('.message-body').getByText('synthetic-linen-9614 the projector in room 4 will not connect', { exact: false }).waitFor();
  await page.locator('.message-body').getByText('Recording: https://platform.devtest.ringcentral.com/recording/synthetic-linen-9611', { exact: false }).first().waitFor();
  await page.screenshot({ path: `${out}/CHANNEL-007-call-ticket-1440.png`, fullPage: true });
  await page.goto(base + '/app#/walkup'); await page.getByRole('list', { name: 'Held calls' }).waitFor();
  const dismissed = page.waitForResponse(r => r.url().includes('/dismiss')); await page.getByRole('button', { name: 'Dismiss and forget number' }).click(); assert.equal((await dismissed).status(), 200);
  await page.getByText('None held.').waitFor();
  // The walk-up desk.
  await action(page, 'Check someone in', { site: 'Denver IT bar', name: 'priya nair' }, '/walkups', 'Check in', 201);
  await action(page, 'Check someone in', { site: 'Denver IT bar', badge: 'b-7731' }, '/walkups', 'Check in', 201);
  const queue = page.getByRole('region', { name: 'Walk-up queue' }), rows = queue.getByRole('listitem');
  await rows.filter({ hasText: 'Priya Nair' }).waitFor(); assert.equal(await rows.count(), 2);
  assert.match(await rows.first().innerText(), /Priya Nair/, 'first in, first served');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'CHANNEL-007 queue fits at 1440');
  await page.screenshot({ path: `${out}/CHANNEL-007-queue-1440.png`, fullPage: true });
  await rows.filter({ hasText: 'Priya Nair' }).getByRole('button', { name: 'Start visit' }).click();
  await rows.filter({ hasText: 'Priya Nair' }).getByText('with Morgan Hayes').waitFor();
  await rows.filter({ hasText: 'Priya Nair' }).getByRole('button', { name: 'Resolve visit' }).click();
  await queue.getByLabel('How did the visit end?').fill('Swapped the dock; the monitor now wakes.');
  const resolved = page.waitForResponse(r => r.url().endsWith('/finish')); await queue.getByRole('button', { name: 'Resolve visit' }).last().click(); assert.equal((await resolved).status(), 200);
  await rows.filter({ hasText: 'Tomas Eze' }).getByRole('button', { name: 'Left without being served' }).click();
  const recent = page.getByRole('region', { name: 'Recent visits' });
  await recent.getByText('Swapped the dock; the monitor now wakes.', { exact: false }).waitFor(); await recent.getByText('Left before being served', { exact: false }).waitFor();
  assert.equal((await api('/walkups')).items.filter(v => ['waiting', 'serving'].includes(v.state)).length, 0);
  // The employee sees how their visit ended on their own request.
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'UTC' }), ep = await context.newPage();
  ep.on('pageerror', e => errors.push(String(e)));
  try {
    await signIn(ep, base, priya.email, password);
    await ep.goto(base + '/app#/work'); await ep.getByText('Walk-up visit: Denver IT bar', { exact: false }).first().click();
    await ep.getByText('Resolved at the desk: Swapped the dock; the monitor now wakes.', { exact: false }).waitFor();
    assert.equal(await ep.getByText('synthetic-linen-9614', { exact: false }).count(), 0, 'the caller never sees staff-only call notes');
    assert.ok(await ep.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'CHANNEL-007 employee view fits at 390');
    await ep.screenshot({ path: `${out}/CHANNEL-007-employee-390.png`, fullPage: true });
    assert.equal(await ep.getByText('Walk-up desk', { exact: true }).count(), 0, 'employees have no desk');
  } finally { await context.close(); }
  const phone = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'UTC' }), op = await phone.newPage();
  try {
    await signIn(op, base, 'walkup-owner@example.test'); await op.goto(base + '/app#/walkup'); await op.getByRole('heading', { name: 'Walk-up desk', exact: true }).waitFor();
    assert.ok(await op.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'CHANNEL-007 desk fits at 390');
    await op.screenshot({ path: `${out}/CHANNEL-007-desk-390.png`, fullPage: true });
  } finally { await phone.close(); }
  console.log('PASS CHANNEL-007 native 1440/390: RingCentral sandbox line check, badge and number mapping, call-log call to ticket with recording link and staff-only transcript, held unknown number, walk-up check-in by name and badge, serve, resolve and left visits, employee view.');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.env.LINEN_TEST_URL, out = process.env.LINEN_TEST_OUTPUT;
  if (!base || !out) throw Error('Run through tests/ui/connected-run.mjs');
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] }), errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' }), page = await context.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(base + '/app'); await page.getByLabel('Your name').fill('Morgan Hayes'); await page.getByLabel('Workspace name').fill('Walk-up proof');
    await page.getByLabel('Work email').fill('walkup-owner@example.test'); await page.getByLabel('Password', { exact: true }).fill('synthetic-Connected-browser-2026');
    await page.getByRole('button', { name: 'Create workspace' }).click(); await page.getByRole('heading', { name: 'Requests', exact: true }).waitFor();
    await finishFirstRun(page, base);
    await walkupJourney({ browser, page, api: apiFor(page), base, out, errors }); assert.deepEqual(errors, []);
  } catch (error) {
    for (const [i, c] of browser.contexts().entries()) for (const [j, p] of c.pages().entries()) await p.screenshot({ path: `${out}/CHANNEL-007-failure-${i}-${j}.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
}

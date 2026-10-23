import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { apiFor, finishFirstRun, requestWork, signIn } from './connected-helpers.mjs';
// CHANNEL-006 portal handoff: with nobody available the conversation stays a request with a stated reply time; an available agent accepts and
// replies in the same conversation; outside business hours the request files at once.
export async function handoffJourney({ browser, page, api, base, out, errors }) {
  const password = 'synthetic-Connected-browser-2026', email = 'ana.ruiz@example.test';
  await api('/members', { name: 'Ana Ruiz', email, password, roles: ['employee'] });
  const calendar = await api('/calendars', { name: 'Desk hours', timezone: 'UTC', weekdays: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 24, holidays: [] });
  await api('/handoff-config', { calendarId: calendar.id, acceptSeconds: 120, responseMinutes: 240 });
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'UTC' }), ep = await context.newPage();
  ep.on('pageerror', e => errors.push(String(e)));
  const fits = async (p, label) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `CHANNEL-006 ${label} fits`);
  try {
    await signIn(ep, base, email, password);
    // 1. Nobody is available: the same conversation stays a request and says when to expect a reply.
    await requestWork(ep, base, 'My laptop fan is loud all day.');
    const talk = ep.getByRole('region', { name: 'Talk to a person' });
    await talk.getByRole('button', { name: 'Ask for a person' }).click();
    await talk.getByText('No agent could join. This conversation stays open as your request; expect a reply by', { exact: false }).waitFor();
    await ep.getByText('Linen: No agent is available right now.', { exact: false }).first().waitFor();
    await fits(ep, 'unanswered request at 390'); await ep.screenshot({ path: `${out}/CHANNEL-006-ticketed-390.png`, fullPage: true });
    // 2. An agent marks themselves available; a new request is accepted and answered in the same conversation.
    await page.goto(base + '/app#/work');
    const desk = page.getByRole('region', { name: 'Live chat requests' });
    const present = page.waitForResponse(r => r.url().endsWith('/agents/presence') && r.request().method() === 'POST');
    await desk.getByLabel('I am available for live chats').check(); assert.equal((await present).status(), 200);
    await requestWork(ep, base, 'My monitor keeps flickering.');
    await ep.getByRole('region', { name: 'Talk to a person' }).getByRole('button', { name: 'Ask for a person' }).click();
    await ep.getByText('Asking an agent to join this conversation…').waitFor();
    await page.goto(base + '/app#/work'); await page.reload();
    await desk.getByText('Ana Ruiz asked for a person', { exact: false }).waitFor();
    await fits(page, 'agent desk at 1440'); await page.screenshot({ path: `${out}/CHANNEL-006-agent-1440.png`, fullPage: true });
    await desk.getByRole('button', { name: 'Accept and join' }).click();
    await page.locator('.message-body').getByText('Morgan Hayes joined this conversation.', { exact: true }).waitFor();
    await page.locator('.message-body').getByText('My monitor keeps flickering.', { exact: false }).first().waitFor(); // the transcript is in view
    await page.locator('#conversation-message').fill('Hi Ana, which monitor is it?');
    const sent = page.waitForResponse(r => r.url().endsWith('/messages') && r.request().method() === 'POST'); await page.getByRole('button', { name: 'Send message' }).click(); assert.equal((await sent).status(), 201);
    await ep.reload();
    await ep.getByRole('region', { name: 'Talk to a person' }).getByText('Morgan Hayes is in this conversation.').waitFor();
    await ep.locator('.message-body').getByText('Hi Ana, which monitor is it?', { exact: true }).waitFor();
    await fits(ep, 'live chat at 390'); await ep.screenshot({ path: `${out}/CHANNEL-006-live-390.png`, fullPage: true });
    await ep.getByRole('button', { name: 'End live chat' }).click(); await ep.getByRole('button', { name: 'Ask for a person' }).waitFor();
    // 3. Outside business hours the request files at once with the next opening.
    const closed = await api('/calendars', { name: 'Closed today', timezone: 'UTC', weekdays: [0, 1, 2, 3, 4, 5, 6], startHour: 9, endHour: 17, holidays: [new Date().toISOString().slice(0, 10)] });
    await api('/handoff-config', { calendarId: closed.id, acceptSeconds: 120, responseMinutes: 240 });
    await requestWork(ep, base, 'The badge reader is dead.');
    await ep.getByRole('region', { name: 'Talk to a person' }).getByRole('button', { name: 'Ask for a person' }).click();
    await ep.getByText('Linen: The service desk is outside its business hours.', { exact: false }).first().waitFor();
    await fits(ep, 'after-hours request at 390'); await ep.screenshot({ path: `${out}/CHANNEL-006-after-hours-390.png`, fullPage: true });
  } finally { await context.close(); }
  console.log('PASS CHANNEL-006 native 1440/390: portal ask-for-a-person with no agent, accepted live chat with transcript in view and agent reply, and an after-hours request filed with its reply time. Slack handoff remains blocked by CHANNEL-001.');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.env.LINEN_TEST_URL, out = process.env.LINEN_TEST_OUTPUT;
  if (!base || !out) throw Error('Run through tests/ui/connected-run.mjs');
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] }), errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' }), page = await context.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(base + '/app'); await page.getByLabel('Your name').fill('Morgan Hayes'); await page.getByLabel('Workspace name').fill('Handoff proof');
    await page.getByLabel('Work email').fill('handoff-owner@example.test'); await page.getByLabel('Password', { exact: true }).fill('synthetic-Connected-browser-2026');
    await page.getByRole('button', { name: 'Create workspace' }).click(); await page.getByRole('heading', { name: 'Requests', exact: true }).waitFor();
    await finishFirstRun(page, base);
    await handoffJourney({ browser, page, api: apiFor(page), base, out, errors }); assert.deepEqual(errors, []);
  } catch (error) {
    for (const [i, c] of browser.contexts().entries()) for (const [j, p] of c.pages().entries()) await p.screenshot({ path: `${out}/CHANNEL-006-failure-${i}-${j}.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
}

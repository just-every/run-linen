import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { apiFor, finishFirstRun } from './connected-helpers.mjs';
import { pendingPersonJourney } from './pending-person-journey.mjs';

const base = process.env.LINEN_TEST_URL;
if (!base) throw Error('Start with node tests/ui/run.mjs tests/ui/pending-person-browser.mjs');
const out = process.env.LINEN_TEST_OUTPUT;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(base + '/app');
  await page.getByLabel('Your name').fill('Avery Morgan');
  await page.getByLabel('Workspace name').fill('Northstar Studio');
  await page.getByLabel('Work email').fill('avery@northstar.example');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-Pending-browser-2026');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('heading', { name: 'Requests', exact: true }).waitFor();
  await finishFirstRun(page, base);
  const api = apiFor(page), owner = (await api('/session')).principal.userId;
  const laptop = await api('/catalog', { name: 'Work laptop', kind: 'device', target: 'standard-laptop', ownerId: owner, capacity: 3 });
  const figma = await api('/catalog', { name: 'Figma seat', kind: 'software', target: 'figma-design', ownerId: owner, capacity: 10 });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await pendingPersonJourney({ browser, page, context, api, base, out, width, catalogIds: [laptop.id, figma.id] });
  }
  assert.deepEqual(errors, []);
  console.log('PASS pending-person browser: create, review, edit, held laptop/Figma request, authenticated binding, normal release, employee readback and withdrawal at 1440 and 390.');
} finally { await browser.close(); }

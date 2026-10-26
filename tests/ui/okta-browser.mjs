import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { finishFirstRun, apiFor, createConnection } from './connected-helpers.mjs';
const base = process.env.LINEN_TEST_URL, out = process.env.LINEN_TEST_OUTPUT;
if (!base || !out || !process.env.OKTA_ORG_URL || !process.env.OKTA_API_TOKEN) throw Error('Run the named live journey with held Okta keys');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.goto(base + '/app');
  await page.getByLabel('Your name').fill('Morgan Hayes');
  await page.getByLabel('Workspace name').fill('Linen acceptance desk');
  await page.getByLabel('Work email').fill('morgan@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-linen-842-Password!');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('heading', { name: 'Requests', exact: true }).waitFor();
  await finishFirstRun(page, base);
  const api = apiFor(page);
  const connection = await createConnection(page, api, base, 'okta', 'Linen developer identity', { orgUrl: process.env.OKTA_ORG_URL, apiToken: process.env.OKTA_API_TOKEN });
  assert.equal(connection.status, 'active');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + '/app#/connections');
    const card = page.locator('.connection-record').filter({ has: page.getByRole('heading', { name: 'Linen developer identity', exact: true }) });
    await card.waitFor();
    await page.screenshot({ path: `${out}/ACCESS-002-connection-${width}.png`, fullPage: true });
    await card.getByRole('button', { name: 'Edit connection', exact: true }).click();
    const form = page.locator('form.inline-form').filter({ has: page.getByRole('heading', { name: 'Update this connection' }) });
    await form.getByLabel('Okta organization URL').fill('https://linen-acceptance.okta.com');
    assert.equal(await form.getByLabel('Scoped API token').inputValue(), '', 'saved credentials never return to the form');
    await form.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/ACCESS-002-editor-${width}.png`, fullPage: true });
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
  }
  assert.deepEqual(errors, []);
  console.log('PASS Okta native connection save, live read check and private editor at 1440 and 390');
} finally { await context.close(); await browser.close(); }

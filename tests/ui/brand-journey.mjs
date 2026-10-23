import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { apiFor, finishFirstRun, signIn } from './connected-helpers.mjs';
// CHANNEL-004: the owner brands the portal; an employee sees the name, logo and colors and their own device, and is not offered another's.
export async function brandJourney({ browser, page, api, base, out, errors }) {
  const password = 'synthetic-Connected-browser-2026';
  const member = async (name, email) => ({ ...await api('/members', { name, email, password, roles: ['employee'] }), name, email });
  const eve = await member('Eve Marsh', 'eve.marsh@example.test'), otto = await member('Otto Vale', 'otto.vale@example.test');
  const person = await api('/people', { source: 'browser-hris', sourceId: eve.email, name: eve.name, effectiveAt: '2026-01-01T00:00:00Z', observedAt: new Date().toISOString() });
  await api(`/people/${person.id}/binding`, { expectedRevision: person.revision, memberId: eve.id });
  const asset = await api('/assets', { serial: 'SYNTHETIC-LINEN-9820', source: 'synthetic purchase', location: 'Denver stockroom', procured: true });
  let revision = 1;
  for (const [command, extra] of [['receive', {}], ['assign', { personId: person.id }], ['receive', { personId: person.id }]]) revision = (await api(`/assets/${asset.id}/commands`, { revision, command, evidence: 'synthetic receipt', ...extra })).revision;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('synthetic-linen-9821 logo bytes for the browser journey')]);
  // The owner sets the branding in the product.
  await page.goto(base + '/app#/connections');
  const form = page.locator('details[aria-label="Portal branding"]'); await form.locator('summary').click();
  await form.getByLabel('Portal name').fill('Acme Help');
  // A color too dark for the button text is refused with a reason, and nothing is saved.
  await form.getByLabel('Primary color').fill('#101010'); await form.getByLabel('Accent color').fill('#0b5cab');
  await form.getByRole('button', { name: 'Save branding' }).click();
  await form.getByText('The primary color is too dark', { exact: false }).waitFor();
  assert.equal((await api('/branding')).brand, null);
  await form.getByLabel('Primary color').fill('#ffcc00');
  await form.getByLabel('Logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  const saved = page.waitForResponse(r => r.url().endsWith('/branding') && r.request().method() === 'POST'); await form.getByRole('button', { name: 'Save branding' }).click(); assert.equal((await saved).status(), 200);
  await form.getByText('Saved. Employees see the new branding', { exact: false }).waitFor();
  const logoUrl = (await api('/branding')).brand.logoUrl;
  const logo = await fetch(new URL(logoUrl, base)); // no cookies: mail clients fetch it
  assert.deepEqual([logo.status, logo.headers.get('content-type'), logo.headers.get('x-content-type-options')], [200, 'image/png', 'nosniff']); assert.deepEqual(Buffer.from(await logo.arrayBuffer()), png);
  assert.equal((await fetch(base + '/api/v1/branding/not-a-workspace/logo')).status, 404);
  const contexts = [];
  try {
    for (const [width, who, label] of [[1440, eve, 'employee'], [390, eve, 'employee'], [390, otto, 'other']]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'UTC' }), p = await context.newPage(); contexts.push(context);
      p.on('pageerror', e => errors.push(String(e)));
      await signIn(p, base, who.email, password); await p.goto(base + '/app#/work'); await p.reload();
      await p.locator('header.topbar .brand').getByText('Acme Help', { exact: true }).waitFor();
      assert.equal(await p.locator('header.topbar img.brand-logo').getAttribute('src').then(s => new URL(s, base).pathname), new URL(logoUrl, base).pathname);
      assert.deepEqual(await p.evaluate(() => [getComputedStyle(document.documentElement).getPropertyValue('--marigold-bright').trim(), getComputedStyle(document.documentElement).getPropertyValue('--denim').trim()]), ['#ffcc00', '#0b5cab'], 'the colors reach the portal');
      assert.equal(await p.locator('.chip-refresh').getAttribute('data-tip'), 'Refresh list');
      if (who === eve) { await p.getByRole('region', { name: 'My devices' }).getByText('SYNTHETIC-LINEN-9820', { exact: false }).first().waitFor(); }
      else assert.equal(await p.getByRole('region', { name: 'My devices' }).count(), 0, 'nobody sees another employee\'s device');
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `CHANNEL-004 ${label} portal fits at ${width}`);
      await p.screenshot({ path: `${out}/CHANNEL-004-${label}-${width}.png`, fullPage: true });
    }
  } finally { for (const c of contexts) await c.close(); }
  console.log('PASS CHANNEL-004 native 1440/390: owner branding with a refused unreadable color, a public logo, the portal name, logo and colors for an employee, and my devices shown only to the device holder. Custom domain with managed TLS remains unbuilt.');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.env.LINEN_TEST_URL, out = process.env.LINEN_TEST_OUTPUT;
  if (!base || !out) throw Error('Run through tests/ui/connected-run.mjs');
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] }), errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' }), page = await context.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(base + '/app'); await page.getByLabel('Your name').fill('Morgan Hayes'); await page.getByLabel('Workspace name').fill('Brand proof');
    await page.getByLabel('Work email').fill('brand-owner@example.test'); await page.getByLabel('Password', { exact: true }).fill('synthetic-Connected-browser-2026');
    await page.getByRole('button', { name: 'Create workspace' }).click(); await page.getByRole('heading', { name: 'Requests', exact: true }).waitFor();
    await finishFirstRun(page, base);
    await brandJourney({ browser, page, api: apiFor(page), base, out, errors }); assert.deepEqual(errors, []);
  } catch (error) {
    for (const [i, c] of browser.contexts().entries()) for (const [j, p] of c.pages().entries()) await p.screenshot({ path: `${out}/CHANNEL-004-failure-${i}-${j}.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
}

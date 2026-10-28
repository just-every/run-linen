import { captureScreens } from './screen-proof.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { action, apiFor, fields, finishFirstRun } from './connected-helpers.mjs';

/** Native contract and configuration journey only. No provider interception or fabricated readback. */
export async function softwareLicenseJourney({ page, api, base, out }) {
  const service = await api('/services', {
    name: 'Workplace software', description: 'Employee meetings and document work', businessImpact: 'Employees cannot collaborate',
    source: 'Owner software register', observedAt: new Date().toISOString(), visibility: 'workspace',
  });
  const session = await api('/session');
  for (const [index, width, title, publisher, seats, annualCostUsd, provider] of [
    [1, 1440, 'Zoom Workplace', 'Zoom', 120, 24000, 'zoom'],
    [2, 1440, 'Adobe Acrobat Pro', 'Adobe', 25, 6000, 'jamf'],
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + '/app#/software-assets');
    await page.getByRole('link',{name:'Software licenses & renewals',exact:true}).waitFor();await page.getByText('Add software context',{exact:true}).waitFor();await captureScreens(page,{path:`${out}/ASSET-006-entry-${index}-${width}.png`,fullPage:true});
    await page.getByRole('link',{name:'Software licenses & renewals',exact:true}).click();
    await page.getByRole('heading', { name: 'Software licenses', exact: true }).waitFor();
    const connection = page.locator('details[data-action-path="/software-license-connections"]');
    await connection.locator(':scope > summary').click();
    await connection.locator('select[name="provider"]').selectOption(provider);
    await fields(connection, {
      name: `${provider === 'zoom' ? 'Zoom' : 'Jamf'} license source`,
      ...(provider === 'zoom' ? { accountId: `synthetic-linen-${index}` } : { origin: `https://synthetic-linen-${index}.jamfcloud.com` }),
      clientId: `synthetic-linen-${index}`, clientSecret: `synthetic-linen-${index}`,
      reason: 'Native form evidence; no external sync is authorized by this browser journey', consent: true,
    });
    const stored = page.waitForResponse(response => response.url().endsWith('/software-license-connections') && response.request().method() === 'POST');
    await connection.getByRole('button', { name: 'Save license connection', exact: true }).click();
    const response = await stored;
    assert.equal(response.status(), 201, 'Native encrypted connection configuration is accepted');
    const configured = await response.json();
    assert.equal(configured.status, 'unverified', 'Saving credentials makes no provider success claim');
    const create = page.locator('details[data-action-path="/software-licenses"]');
    await create.locator(':scope > summary').click();
    await fields(create, {
      name: title, publisher, ownerId: session.principal.userId, serviceId: service.id,
      metric: provider === 'zoom' ? 'per-user' : 'per-device', policy: 'managed', seats,
      renewalAt: '2027-01-21', annualCostUsd, trueUpUnitUsd: 200, reference: `PO-SOFTWARE-${index}`,
    });
    await create.getByRole('button', { name: 'Add a connected source', exact: true }).click();
    await fields(create, { 'source-0-kind': provider, 'source-0-connectionId': configured.id });
    if (provider === 'jamf') await fields(create, { 'source-0-title': 'Adobe Acrobat Pro', 'source-0-publisher': 'Adobe', 'source-0-productId': 'com.adobe.Acrobat.Pro' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Create form fits ${width}px`);
    await page.evaluate(()=>scrollTo(0,0));
    await captureScreens(page,{ path: `${out}/ASSET-006-contract-form-${index}-${width}.png`,fullPage:true });
    const recorded = page.waitForResponse(result => result.url().endsWith('/software-licenses') && result.request().method() === 'POST');
    await create.getByRole('button', { name: 'Record software license', exact: true }).click();
    const createdResponse = await recorded;
    assert.equal(createdResponse.status(), 201, 'Native software contract is recorded');
    const license = await createdResponse.json();
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
    const position = page.getByRole('region', { name: `${title} license position` });
    await position.getByText('No provider observations have been synced.', { exact: false }).waitFor();
    assert.equal(await position.locator('.facts > div').filter({ hasText: 'Consumed licenses' }).locator('dd').textContent(), 'Unknown', 'No observations means unknown consumption');
    assert.equal(await page.getByRole('button', { name: 'Reclaim selected seats', exact: true }).count(), 0, 'Unobserved usage has no reclamation action');
    const persisted = await api(`/software-licenses/${license.id}`);
    assert.equal(persisted.data.observation, null, 'Native journey does not fabricate provider observations');
    assert.equal(persisted.summary.consumed, null);
    assert.equal(persisted.summary.reclaimable, null);
    assert.equal(persisted.data.contract.seats, seats);
    assert.equal(persisted.data.contract.currency, 'USD');
    assert.equal(persisted.data.sourceBindings[0].connectionId, configured.id);
    assert.equal(persisted.data.grant, null, 'A contract and connection confer no action grant');
    await action(page, 'Edit contract terms', { annualCostUsd: annualCostUsd + 100, reference: `PO-SOFTWARE-${index}-AMENDED` }, `/software-licenses/${license.id}`, 'Save contract');
    await page.reload();
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
    const amended = await api(`/software-licenses/${license.id}`);
    assert.equal(amended.data.contract.annualCostUsd, annualCostUsd + 100, 'Revised USD terms survive a reload');
    assert.equal(amended.data.contract.reference, `PO-SOFTWARE-${index}-AMENDED`);
    assert.equal(amended.summary.fresh, false, 'Contract edits do not certify provider state');
    const sources = page.locator('details[data-action-path$="/source-bindings"]');
    await sources.locator(':scope > summary').click();
    await sources.getByRole('button', { name: 'Remove source 1', exact: true }).click();
    const changed = page.waitForResponse(result => result.url().endsWith(`/software-licenses/${license.id}`) && result.request().method() === 'PATCH');
    await sources.getByRole('button', { name: 'Save connected sources', exact: true }).click();
    assert.equal((await changed).status(), 200);
    await page.getByText('No source is configured for this title.', { exact: false }).waitFor();
    assert.equal((await api(`/software-licenses/${license.id}`)).data.sourceBindings.length, 0, 'An owner can explicitly remove a source');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Owner license screen fits ${width}px`);
    await captureScreens(page,{ path: `${out}/ASSET-006-unconfigured-${width}.png`, fullPage: true });
    await page.getByRole('link', { name: 'All software licenses', exact: true }).click();
    await page.getByRole('link', { name: `Review ${title}`, exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Software license list fits ${width}px`);
    await captureScreens(page,{ path: `${out}/ASSET-006-license-list-${index}-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Your workspace and account' }).click();
    await page.getByRole('link', { name: 'Notification preferences', exact: true }).click();
    await page.getByRole('heading', { name: 'Your software notices', exact: true }).waitFor();
    await page.getByText('No software notices are recorded for you.', { exact: true }).waitFor();
    await captureScreens(page,{path:`${out}/ASSET-006-empty-notices-${width}.png`,fullPage:true});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Software notices fit ${width}px`);
  }
}

if (process.env.LINEN_TEST_URL && process.env.LINEN_TEST_OUTPUT) {
  const base = process.env.LINEN_TEST_URL, out = process.env.LINEN_TEST_OUTPUT;
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox','--use-mock-keychain', '--password-store=basic'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await page.goto(base + '/app');
    await page.getByLabel('Your name').fill('Morgan Hayes');
    await page.getByLabel('Workspace name').fill('Denver Service Desk');
    await page.getByLabel('Work email').fill('synthetic-linen-1@example.test');
    await page.getByLabel('Password', { exact: true }).fill('synthetic-linen-1');
    await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
    await page.getByRole('heading', { name: 'Requests', exact: true }).waitFor();
    await finishFirstRun(page, base);
    await softwareLicenseJourney({ page, api: apiFor(page), base, out });
    assert.deepEqual(errors, [], 'Native software-license journey has no application errors');
    console.log('PASS ASSET-006 native software contracts, encrypted source configuration, honest unknowns and revision edits at 1440 with both review widths; no provider claim');
  } finally { await context.close(); await browser.close(); }
}

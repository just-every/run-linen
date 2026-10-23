import {biDestinationJourney} from './bi-destination-journey.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { apiFor, fields, finishFirstRun, signIn } from './connected-helpers.mjs';

const base = process.env.LINEN_TEST_URL, out = process.env.LINEN_TEST_OUTPUT;
if (!base || !out) throw Error('Run through tests/ui/run.mjs tests/ui/reporting-browser.mjs');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Denver' });
const page = await context.newPage(), errors = [];
const password = 'synthetic-linen-9100';
page.on('pageerror', error => errors.push(String(error)));

async function capture(name, width) {
  await page.evaluate(() => document.fonts.ready);
  const account=page.getByRole('button',{name:'Your workspace and account'});await page.keyboard.press('Tab');await account.focus();assert.equal(await account.evaluate(e=>getComputedStyle(e,'::after').opacity),'1');await account.evaluate(e=>e.blur());await page.evaluate(()=>window.scrollTo(0,0));await page.mouse.move(0,0);await account.hover();assert.equal(await account.evaluate(e=>getComputedStyle(e,'::after').transitionDelay),'0.3s');await page.waitForTimeout(420);assert.equal(await account.evaluate(e=>getComputedStyle(e,'::after').opacity),'1');
  await page.waitForFunction(() => !document.querySelector('.loading'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} fits ${width}`);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({ path: `${out}/reporting-${name}-${width}.png`, fullPage: true });
}
async function savedDownload(root, name) {
  const pending = page.waitForEvent('download');
  await root.getByRole('link', { name, exact: true }).click();
  const stream = await (await pending).createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function submit(form, name, path, expected) {
  const waiting = page.waitForResponse(response => response.url().endsWith(path) && response.request().method() === 'POST');
  await form.getByRole('button', { name, exact: true }).click();
  const response = await waiting, body = await response.json();
  assert.equal(response.status(), expected, JSON.stringify(body));
  return body;
}

try {
  await page.goto(base + '/app');
  await page.getByLabel('Your name').fill('Avery Bennett');
  await page.getByLabel('Workspace name').fill('Northstar Service Desk');
  await page.getByLabel('Work email').fill('synthetic-linen-9100@example.test');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await page.getByRole('heading', { name: 'Requests', exact: true }).waitFor();
  await finishFirstRun(page, base);
  const api = apiFor(page);
  const auditor = await api('/members', { name: 'Casey Rivera', email: 'synthetic-linen-9101@example.test', password, roles: ['auditor'] });
  await api('/members', { name: 'Morgan Patel', email: 'synthetic-linen-9102@example.test', password, roles: ['operator'] });
  const source = [
    ['Denver network unavailable', 'Denver', 'P1'],
    ['Denver checkout interruption', 'Denver', 'P1'],
    ['Austin login interruption', 'Austin', 'P1'],
    ['Denver display flickering', 'Denver', 'P2'],
  ];
  for (const [index, [title, location, priority]] of source.entries()) {
    const ticket = await api('/work', { title, body: `${title}. The service desk has recorded the affected office.`, kind: 'incident', context: { location }, deduplicationKey: `synthetic-linen-${9110 + index}` });
    const classification = await api(`/work/${ticket.id}/classification`);
    await api(`/work/${ticket.id}/classification/override`, { revision: classification.revision, workRevision: classification.workRevision, type: 'incident', category: 'hardware', subcategory: 'other', impact: 'high', urgency: 'high', priority, reason: 'Service owner reviewed the office impact and response priority.' });
  }
  const restricted = await api('/work', { title: 'Restricted HR case', body: 'Private HR service work.', kind: 'question', sensitivity: 'hr', context: { location: 'Denver' }, deduplicationKey: 'synthetic-linen-9119' });
  const reports = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + '/app#/reports');
    const root = page.getByRole('region', { name: 'Custom reports', exact: true });
    await root.getByText('Build a custom report', { exact: true }).click();
    const builder = root.getByRole('form', { name: 'Report builder', exact: true });
    await builder.getByLabel('Report source').selectOption('tickets');
    const columns = builder.getByRole('group', { name: 'Report columns' });
    await columns.getByLabel('Location').check();
    await builder.getByRole('button', { name: 'Add filter', exact: true }).click();
    await builder.getByLabel('Filter 1 field').selectOption('priority');
    await builder.getByLabel('Filter 1 value').fill('P1');
    await builder.getByLabel('Group report by').selectOption('location');
    const preview = await submit(builder, 'Preview report', '/reports/preview', 200);
    assert.deepEqual(preview.rows, [{ location: 'Austin', count: 1 }, { location: 'Denver', count: 2 }]);
    assert.equal(preview.total, 3);
    await root.getByRole('region', { name: 'Report preview', exact: true }).getByRole('row', { name: 'Denver 2', exact: true }).waitFor();
    await capture('builder', width);
    const store = root.getByRole('form', { name: 'Save custom report', exact: true });
    const name = `P1 by location · ${width === 1440 ? 'desktop' : 'mobile'}`;
    await store.getByLabel('Report name').fill(name);
    await store.getByLabel('Casey Rivera').check();
    const report = await submit(store, 'Save report', '/reports/custom', 201);
    reports.push(report);
    assert.deepEqual(report.sharedWith, [auditor.id]);
    const saved = root.getByRole('article', { name: 'Saved report result', exact: true });
    await saved.getByRole('heading', { name, exact: true }).waitFor();
    const table = saved.getByRole('region', { name: 'Saved report view table', exact: true }).getByRole('table');
    const shown = await table.locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.textContent)));
    const csv = (await savedDownload(saved, 'Export CSV')).toString('utf8');
    // The current grouped values are plain text and numbers; every CSV field is quoted.
    const exported = csv.trim().split('\r\n').map(row => row.slice(1, -1).split('","').map(cell => cell.replaceAll('""', '"')));
    assert.deepEqual(exported, [['location', 'count'], ...shown], 'Downloaded CSV matches the rendered saved view');
    const xlsx = await savedDownload(saved, 'Export XLSX');
    assert.equal(xlsx.readUInt32LE(0), 0x04034b50, 'XLSX download is an actual ZIP workbook');
    assert.ok(xlsx.includes(Buffer.from('xl/worksheets/sheet1.xml')));
    assert.ok(xlsx.includes(Buffer.from('Denver')));
    const scheduleRoot = saved.getByRole('region', { name: 'Report schedules', exact: true });
    await scheduleRoot.getByText('Schedule this report', { exact: true }).click();
    const schedule = scheduleRoot.getByRole('form', { name: 'Schedule report', exact: true });
    await schedule.getByLabel('Delivery channel').selectOption('slack');
    await schedule.getByText(/Slack delivery needs configuration \(CHANNEL-001\)/).waitFor();
    assert.equal(await schedule.getByRole('button', { name: 'Save delivery schedule', exact: true }).isDisabled(), true);
    await capture('slack-gap', width);
    await schedule.getByLabel('Delivery channel').selectOption('email');
    await schedule.getByLabel('Email recipient').selectOption(auditor.id);
    await schedule.getByLabel('I authorize recurring report emails to this recipient.').check();
    // This journey's public runner deliberately has no SendGrid provider credentials.
    const mail = await submit(schedule, 'Save delivery schedule', `/reports/custom/${report.id}/schedules`, 503);
    assert.equal(mail.error.code, 'needs_configuration');
    await scheduleRoot.getByText('Scheduled email reports require a configured SendGrid sender', { exact: true }).waitFor();
    assert.equal((await api(`/reports/custom/${report.id}/schedules`)).items.length, 0);
    await capture('email-configuration-gap', width);

    const bi = page.getByRole('region', { name: 'BI data and exports', exact: true });
    await bi.getByText('Configure an S3 export', { exact: true }).click();
    const setup = bi.getByRole('form', { name: 'S3 export setup', exact: true });
    await fields(setup, { name: `Northstar ticket archive · ${width}`, bucket: `synthetic-linen-${width === 1440 ? 9120 : 9121}`, region: 'us-east-1', prefix: 'linen/tickets', accessKeyId: 'synthetic-linen-9122', secretAccessKey: 'synthetic-linen-9123' });
    for (const label of ['AWS access key ID', 'AWS secret access key', 'AWS session token (optional)']) assert.equal(await setup.getByLabel(label, { exact: true }).getAttribute('type'), 'password');
    await setup.getByLabel('I authorize nightly ticket CSV exports to this bucket and prefix under my current source permissions, using these credentials.').check();
    await capture('s3-consent', width);
    const destination = await submit(setup, 'Save S3 export', '/bi/exports', 201);
    assert.ok(!JSON.stringify(destination).includes('synthetic-linen-9122'));
    assert.ok(!JSON.stringify(destination).includes('synthetic-linen-9123'));
    const detail = bi.getByRole('article', { name: 'Saved BI export', exact: true });
    await detail.getByText('No delivery receipt yet. No export run has been recorded for this destination.', { exact: true }).waitFor();
    assert.deepEqual((await api(`/bi/exports/${destination.id}`)).runs, [], 'Saving destination creates no pretend receipt');
    assert.equal(await setup.getByLabel('AWS secret access key').inputValue(), '', 'Saved credentials cleared from form');
    const pause = page.waitForResponse(response => response.url().endsWith(`/bi/exports/${destination.id}`) && response.request().method() === 'POST');
    await detail.getByRole('button', { name: 'Pause nightly export', exact: true }).click();
    assert.equal((await pause).status(), 200);
    await detail.getByRole('button', { name: 'Resume nightly export', exact: true }).waitFor();
    await capture('s3-saved-without-receipt', width);
    await biDestinationJourney({page,bi,api,out,width});
  }
  const readerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), reader = await readerContext.newPage();
  try {
    reader.on('pageerror', error => errors.push(String(error)));
    await signIn(reader, base, 'synthetic-linen-9101@example.test', password);
    const readerApi = apiFor(reader);
    const tickets = await readerApi('/bi/tickets');
    assert.equal(tickets.total, 4);
    assert.ok(!tickets.rows.some(row => row.id === restricted.id), 'Auditor BI data excludes restricted HR work');
    for (const width of [1440, 390]) {
      await reader.setViewportSize({ width, height: 1000 });
      await reader.goto(base + '/app#/reports');
      const root = reader.getByRole('region', { name: 'Custom reports', exact: true });
      await root.getByLabel('Saved report').selectOption(reports[0].id);
      await root.getByRole('region', { name: 'Saved report view table', exact: true }).getByRole('row', { name: 'Denver 2', exact: true }).waitFor();
      assert.equal(await root.getByText('Build a custom report', { exact: true }).count(), 0);
      assert.equal(await root.getByText('Schedule this report', { exact: true }).count(), 0);
      assert.equal(await reader.getByText('Configure an S3 export', { exact: true }).count(), 0);
      assert.equal(await reader.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await reader.screenshot({ path: `${out}/reporting-auditor-shared-${width}.png`, fullPage: true });
    }
  } finally { await readerContext.close(); }
  assert.deepEqual(errors, [], 'Custom reporting screens have no application errors');
  console.log('PASS native reports 1440/390: grouped P1 view, named sharing, matching CSV, XLSX, explicit Slack/SendGrid gaps, owner S3 consent with masked credentials and no fabricated receipt, auditor-scoped reads.');
} catch (error) {
  await page.screenshot({ path: `${out}/reporting-failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally { await context.close(); await browser.close(); }

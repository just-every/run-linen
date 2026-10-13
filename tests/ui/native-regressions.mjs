import assert from 'node:assert/strict';
import { captureJourney } from './viewport-evidence.mjs';

export async function nativeCreate(page, base, section, title, values) {
  await page.goto(base + '/app#/' + section);
  await page.getByText(title, { exact: true }).click();
  const form = page.locator('details').filter({ has: page.getByText(title, { exact: true }) });
  for (const [label, value] of Object.entries(values)) {
    const field = form.getByLabel(label, { exact: false });
    const tag = await field.evaluate(e => e.tagName);
    if (tag === 'SELECT') await field.selectOption(value);
    else await field.fill(String(value));
  }
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForURL(new RegExp('#/' + section + '/.+'));
  return page.url().split('/').at(-1);
}

export async function dstJourney(browser, context, base, personId, ownerId, out) {
  const dst = await browser.newContext({ storageState: await context.storageState(), timezoneId: 'America/New_York' });
  try {
    const page = await dst.newPage();
    await page.goto(base + '/app#/lifecycle');
    await page.getByText('Record an authoritative HR change', { exact: true }).click();
    const form = page.locator('details').filter({ has: page.getByText('Record an authoritative HR change', { exact: true }) });
    await form.getByLabel('Person', { exact: false }).selectOption(personId);
    await form.getByLabel('What is changing?').selectOption('leave');
    await form.getByLabel('Authoritative HR source').fill('DST-browser-fixture');
    await form.getByLabel('HR source revision').fill('1');
    await form.getByLabel('Accountable owner').selectOption(ownerId);
    let sent = 0;
    page.on('request', r => { if (r.url().endsWith('/lifecycle') && r.method() === 'POST') sent++; });
    for (const [wall, error] of [['2026-11-01T01:30', 'occurs twice'], ['2026-03-08T02:30', 'does not exist']]) {
      await form.getByLabel('Effective date and time').fill(wall);
      await form.getByRole('button', { name: 'Save', exact: true }).click();
      await form.getByRole('alert').filter({ hasText: error }).waitFor();
      assert.equal(sent, 0, 'Invalid local time must never silently choose an instant or reach the API');
      await page.screenshot({ path: `${out}/dst-${wall.slice(5, 10)}.png`, fullPage: true });
    }
    await form.getByLabel('Effective date and time').fill('2026-11-01T02:30');
    await form.getByText(/Chosen offset UTC−05:00/).waitFor();
    const response = page.waitForResponse(r => r.url().endsWith('/lifecycle') && r.request().method() === 'POST');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    const result = await response;
    assert.equal(result.status(), 201);
    assert.equal(result.request().postDataJSON().effectiveAt, '2026-11-01T07:30:00.000Z');
    await page.waitForURL(/#\/lifecycle\/.+/);
    await captureJourney(page, { path: `${out}/dst-explicit-offset.png`, fullPage: true });
  } finally { await dst.close(); }
}

export async function incidentNativeDetails(page, api, base, incidentId, ownerId, out) {
  await page.goto(base + '/app#/incidents/' + incidentId);
  for (const hypothesis of ['Rotated identity claim no longer matches the application', 'An unrelated routing fault blocks the order workflow']) {
    const form = page.locator('details').filter({ has: page.getByText('Assign a scoped diagnostic', { exact: true }) });
    if (!await form.evaluate(e => e.open)) await form.locator('summary').click();
    await form.getByLabel('Operator ID').fill(ownerId);
    await form.getByLabel('Permitted read-only scope').fill('Read selected fixture identity and workflow observations; no write authority');
    await form.getByLabel('Explanation to test').fill(hypothesis);
    await form.getByLabel('Bounded diagnostic budget').fill('2');
    const response = page.waitForResponse(r => r.url().endsWith('/diagnostics') && r.request().method() === 'POST');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    assert.equal((await response).status(), 200);
    await page.reload();
  }
  const incident = await api('/incidents/' + incidentId);
  assert.equal(incident.data.diagnostics.length, 2);
  assert.ok(incident.data.diagnostics.every(d => d.readOnly));
  const update = page.locator('details').filter({ has: page.getByText('Share an audience-scoped update', { exact: true }) });
  await update.locator('summary').click();
  await update.getByLabel('Useful update').fill('Investigating rival causes. No recovery has yet been independently observed.');
  await update.getByLabel('Actual recipient IDs').fill(ownerId);
  const sent = page.waitForResponse(r => r.url().endsWith('/updates') && r.request().method() === 'POST');
  await update.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal((await sent).status(), 200);
  const notices = await api('/service-notifications');
  const notice = notices.items.find(n => n.record_id === incidentId);
  assert.ok(notice);
  await page.goto(base + '/app#/notifications');
  await page.getByText('Reconcile delivery failure', { exact: true }).first().click();
  const reconciled = page.waitForResponse(r => r.url().endsWith('/service-notifications/' + notice.id + '/reconcile'));
  await page.getByRole('button', { name: 'Check actual delivery' }).first().click();
  const result = await reconciled;
  assert.notEqual(result.status(), 404, 'Native click reaches the registered service notification route');
  assert.equal((await api('/service-notifications')).items.find(n => n.id === notice.id).state, 'pending');
  await captureJourney(page, { path: `${out}/notification-actual-route-unconfigured.png`, fullPage: true });
}

export async function namedApproverJourney(browser, page, api, base, serviceId, out) {
  const member = await api('/members', { name: 'Morgan Business Approver', email: 'morgan-approver@example.test', password: 'Browser-proof-approver-2026', roles: ['approver'] });
  const decision = await api('/decisions', { title: 'Morgan chooses actual coverage', contextId: serviceId, holderId: member.id, holderRoles: ['approver'], options: [{ id: 'retain', label: 'Keep current coverage', consequences: 'Single region exposure remains' }, { id: 'expand', label: 'Buy failover', consequences: 'Fixture quote USD 500 per month' }], recommendation: 'retain', quote: 'Fixture supplier quote USD 500', quoteSource: 'Test contract boundary', terms: 'One month', cohorts: [member.id], impact: 'Regional continuity', reversibility: 'Cancellation next month', deadline: new Date(Date.now() + 86400000).toISOString(), uncertainty: 'Future demand unknown' });
  const grantsBefore = await api('/grants');
  const ctx = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const approver = await ctx.newPage();
    await approver.goto(base + '/app');
    await approver.getByLabel('Work email').fill('morgan-approver@example.test');
    await approver.getByLabel('Password', { exact: true }).fill('Browser-proof-approver-2026');
    await approver.getByRole('button', { name: 'Sign in', exact: true }).click();
    await approver.getByRole('heading', { name: 'Make room for good work.' }).waitFor();
    await approver.goto(base + '/app#/decisions/' + decision.id);
    await approver.getByRole('radio').first().check();
    await approver.getByLabel('Reason for your decision').fill('Keep the current coverage while demand is unknown.');
    await approver.getByRole('button', { name: 'Record my choice' }).click();
    await approver.getByText('This decision is recorded.', { exact: false }).waitFor();
    const chosen = await api('/decisions/' + decision.id);
    assert.equal(chosen.data.state, 'chosen');
    assert.equal(chosen.data.history.at(-1).actor, member.id);
    assert.deepEqual(await api('/grants'), grantsBefore, 'Business decision creates no execution authority');
    await captureJourney(approver, { path: `${out}/named-business-approver.png`, fullPage: true });
    await page.goto(base + '/app#/decisions/' + decision.id);
    await page.getByText('Amend the decision packet', { exact: true }).click();
    await page.getByLabel('Updated impact').fill('New regional scope materially changes consequences');
    const amend = page.waitForResponse(r => r.url().endsWith('/decisions/' + decision.id + '/amend') && r.request().method() === 'POST');
    await page.locator('details').filter({ has: page.getByText('Amend the decision packet', { exact: true }) }).getByRole('button', { name: 'Save', exact: true }).click();
    assert.equal((await amend).status(), 200);
    const changed = await api('/decisions/' + decision.id);
    assert.equal(changed.data.state, 'needs-decision');
    assert.equal(changed.data.choice, null);
    assert.deepEqual(await api('/grants'), grantsBefore);
    await approver.reload();
    await approver.getByRole('button', { name: 'Record my choice' }).waitFor();
  } finally { await ctx.close(); }
}

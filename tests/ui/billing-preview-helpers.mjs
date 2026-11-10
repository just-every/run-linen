import assert from 'node:assert/strict';
// COST-001 point 5 in the native screen: the preview is disclosed as preview-only, repeating it changes nothing saved,
// and the page offers and sends no invoice issuance or payment request.
const address = {street: '100 Main Street', city: 'Austin', state: 'TX', postalCode: '78701', rate: '8.25', taxable: '80', jurisdiction: 'Austin, Texas', basis: 'Owner-entered Texas data processing determination: 20 percent exemption and applicable local sales tax.'};
export async function previewOnlyChecks(page, base, api, width, out) {
  const sent = [];
  const record = request => { if (request.url().includes('/api/v1') && request.method() !== 'GET') sent.push(request.method() + ' ' + new URL(request.url()).pathname.replace('/api/v1', '')); };
  const external = [];
  const outside = request => { const url = new URL(request.url()); if (url.origin !== new URL(base).origin && !/^(data|blob):/.test(request.url())) external.push(request.url()); };
  page.on('request', record); page.on('request', outside);
  await page.setViewportSize({width, height: 1000});
  await page.goto(base + '/app#/billing');
  await page.getByRole('heading', {name: 'Pricing & budgets', exact: true}).waitFor();
  const plan = await api('/billing/plan'), budget = await api('/intelligence/budget');
  const notice = page.getByText('this preview does not take payment', {exact: false});
  await notice.waitFor(); assert.ok(await notice.isVisible(), 'The preview-only disclosure is visible before any preview');
  const form = page.getByRole('region', {name: 'Invoice preview'}).locator('form');
  for (const [name, value] of Object.entries(address)) await form.locator(`[name="${name}"]`).fill(value);
  await form.getByLabel('Sales tax applies', {exact: true}).check();
  const estimate = page.getByRole('region', {name: 'Invoice estimate'}), seen = [];
  for (let round = 0; round < 2; round++) {
    const received = page.waitForResponse(r => r.url().endsWith('/billing/invoice-preview') && r.request().method() === 'POST');
    await form.getByRole('button', {name: 'Preview invoice', exact: true}).click();
    const response = await received; assert.equal(response.status(), 200);
    await estimate.getByText('$53.30', {exact: true}).waitFor();
    const text = await estimate.innerText(); seen.push(text);
    assert.match(text, /No payment, invoice issuance or tax filing/, 'The estimate states it is preview-only');
    await estimate.scrollIntoViewIfNeeded();
    assert.ok(await estimate.getByText('No payment, invoice issuance or tax filing.', {exact: false}).isVisible(), 'The disclosure is visible at ' + width);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow at ' + width);
    const fontSize = await estimate.locator('p').last().evaluate(e => parseFloat(getComputedStyle(e).fontSize)); assert.ok(fontSize >= 13, 'Disclosure text is at least 13px');
  }
  assert.equal(seen[1], seen[0], 'Repeating the preview shows the same estimate');
  assert.equal(await page.getByRole('button', {name: /pay|issue|send invoice|charge|checkout/i}).count(), 0, 'The screen offers no payment or invoice issuance control');
  assert.equal(await page.getByRole('link', {name: /pay|checkout/i}).count(), 0);
  process.env.LINEN_CAPTURE && await page.screenshot({path: `${out}/COST-001-preview-only-${width}.png`, fullPage: true});
  page.off('request', record); page.off('request', outside);
  assert.deepEqual(sent, ['POST /billing/invoice-preview', 'POST /billing/invoice-preview'], 'Only the two preview requests were sent');
  assert.deepEqual(external, [], 'No request leaves the app origin');
  assert.deepEqual(await api('/billing/plan'), plan, 'Saved plan is unchanged'); assert.deepEqual(await api('/intelligence/budget'), budget, 'Saved budget is unchanged');
}

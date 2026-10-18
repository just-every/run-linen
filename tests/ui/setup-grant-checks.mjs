import assert from 'node:assert/strict';
import { setupSql } from './setup-fixtures.mjs';
export async function runGrantChecks({ page, api, base, out, checks, payloads, ownerId }) {
  const grantPosts = () => payloads.filter(r => r.url.endsWith('/grants'));
  async function fresh() {
    await page.evaluate(() => { for (const key of Object.keys(sessionStorage)) if (key.startsWith('linen:permission-review:')) sessionStorage.removeItem(key); });
    await page.goto(base + '/app#/grants'); await page.reload();
    await page.getByRole('heading', { name: 'Review a standing permission' }).waitFor();
    await page.getByRole('button', { name: 'Review these permissions', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('select[name=mapping]')?.options.length > 1);
  }
  async function prepare(service = 'Orders access') {
    await page.getByLabel('Service identity', { exact: true }).selectOption({ label: 'Linen service actor' });
    await page.getByLabel('Colleague and reviewed account').selectOption('setup-employee-mapping');
    await page.getByLabel('Catalog service').selectOption({ label: service + (service === 'Orders access' ? ' · Application access' : ' · Software license') });
    await page.getByLabel('Independent verifier', { exact: true }).selectOption({ label: 'Independent work check' });
    await page.getByLabel('Authority begins', { exact: true }).first().fill(new Date(Date.now() - 60000).toISOString().slice(0,16));
    await page.getByLabel('Requested access expiry', { exact: true }).fill(new Date(Date.now() + 3600000).toISOString().slice(0,16));
    await page.getByLabel('Authority ends, after removal').fill(new Date(Date.now() + 7200000).toISOString().slice(0,16));
    const before = grantPosts().length;
    await page.getByRole('button', { name: 'Review these permissions', exact: true }).click();
    await page.getByRole('heading', { name: 'Review before issuing' }).waitFor();
    assert.equal(grantPosts().length, before);
  }
  await fresh();
  assert.equal((await api('/subject-mappings')).status, 200);
  assert.equal((await api('/automation-principals')).status, 200);
  assert.deepEqual((await api('/grants')).body, []);
  assert.equal(await page.locator('select[name=mapping] option[value=setup-owner-mapping]').count(), 0);
  assert.equal(await page.getByLabel('Executing principal ID').isVisible(), false);
  assert.equal(await page.locator('input:visible').evaluateAll(es => es.some(e => /id$/i.test(e.name))), false);
  await prepare();
  await page.screenshot({ path: out + '/setup-permission-review.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: out + '/setup-permission-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Lost HTTP response after the real write: GET reconciliation must discover it, not repeat POST.
  let posts = 0;
  await page.route('**/api/v1/grants', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++;
    if (posts === 1) { await route.fetch(); return route.abort('failed'); }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Issue these two permissions' }).click();
  await page.getByText('Recorded · exact reviewed scope', { exact: false }).first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('p')].filter(p => p.textContent.includes('Recorded · exact reviewed scope')).length === 2);
  await page.unroute('**/api/v1/grants');
  assert.equal(posts, 2);
  const pair = (await api('/grants')).body;
  assert.equal(pair.length, 2);
  assert.deepEqual(pair.map(g => g.action).sort(), ['group.add','group.remove']);
  for (const g of pair) {
    assert.equal(g.beneficiary_id, 'provider-colleague'); assert.equal(g.target, 'orders-group');
    assert.equal(g.connection_revision, 3); assert.equal(g.mapping_revision, 2);
    assert.equal(JSON.parse(g.conditions_json).verifierConnectionRevision, 4);
    assert.equal(g.max_uses, 1); assert.equal(g.version, 1);
  }
  assert.equal(pair[0].valid_until, pair[1].valid_until);
  assert.ok(Date.parse(pair.find(g => g.action === 'group.remove').valid_until) > Date.now() + 3600000, 'removal authority covers the requested one-hour expiry');
  assert.equal(grantPosts().length, 2);
  checks.push('Named review issues exact addition/removal pair through real API; lost response reconciles stored first grant with no duplicate write; scope and mapping/connection pins verified');
  await page.reload();
  await page.getByRole('button', { name: 'Check recorded permissions' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('p')].filter(p => p.textContent.includes('Recorded · exact reviewed scope')).length === 2);
  assert.equal(grantPosts().length, 2);
  checks.push('Reload retains stable issuance identities and reconciles read-only');

  await fresh(); await prepare('Design software');
  let partialPosts = 0;
  await page.route('**/api/v1/grants', route => {
    if (route.request().method() !== 'POST') return route.continue();
    partialPosts++;
    return partialPosts === 2 ? route.abort('failed') : route.continue();
  });
  await page.getByRole('button', { name: 'Issue these two permissions' }).click();
  await page.getByText(/Not observed · outcome unconfirmed/).waitFor();
  await page.getByRole('button', { name: 'Check recorded permissions' }).waitFor();
  assert.equal(partialPosts, 2);
  await page.unroute('**/api/v1/grants');
  const partial = (await api('/grants')).body;
  assert.equal(partial.length, 3); assert.equal(partial.filter(g => g.action === 'license.add').length, 1); assert.equal(partial.filter(g => g.action === 'license.remove').length, 0);
  await page.getByRole('button', { name: 'Check recorded permissions' }).click();
  assert.equal(partialPosts, 2); assert.equal(await page.getByRole('button', { name: 'Issue these two permissions' }).isDisabled(), true);
  checks.push('Partial software pair states exact saved addition and unconfirmed removal; no fake atomicity or blind repeat');

  await fresh(); await prepare();
  let unknownPosts = 0;
  await page.route('**/api/v1/grants', route => {
    if (route.request().method() !== 'POST') return route.continue();
    unknownPosts++; return route.abort('failed');
  });
  await page.getByRole('button', { name: 'Issue these two permissions' }).click();
  await page.getByRole('button', { name: 'Check recorded permissions' }).waitFor();
  await page.unroute('**/api/v1/grants');
  assert.equal(unknownPosts, 1);
  await page.getByText('Group remove: Not submitted', { exact: true }).waitFor();
  assert.equal((await api('/grants')).body.length, 3);
  await page.reload();
  await page.getByRole('button', { name: 'Check recorded permissions' }).click();
  await page.getByText('Group remove: Not submitted', { exact: true }).waitFor();
  checks.push('Unconfirmed first write leaves removal explicitly not submitted, including after reload; no blind retry');

  await fresh(); await prepare();
  const beforeDrift = grantPosts().length;
  await setupSql("UPDATE execution_subject_mappings SET revision=revision+1 WHERE id='setup-employee-mapping';");
  await page.getByRole('button', { name: 'Issue these two permissions' }).click();
  await page.getByText(/Setup changed since this review/).waitFor();
  assert.equal(grantPosts().length, beforeDrift);
  checks.push('Mapping drift after owner review stops before submission');
  const self = await api('/grants', { ...grantPosts()[0].body, id: crypto.randomUUID(), localBeneficiaryId: ownerId, beneficiaryId: 'provider-owner' });
  assert.equal(self.status, 403); assert.equal(self.body.error.code, 'self_approval_denied');
  checks.push('Owner is excluded from colleague choices and direct self-grant remains server denied');

  await fresh();
  const advanced = page.locator('details').filter({ has: page.getByText('Advanced: issue an exact standing grant', { exact: true }) });
  assert.equal(await advanced.getAttribute('open'), null);
  await advanced.locator('summary').click();
  await page.getByLabel('Executing principal ID').fill(ownerId);
  await page.getByLabel('Exact beneficiary ID').fill(ownerId);
  await page.locator('input[name=connectionId]').fill('setup-graph');
  await page.getByLabel('Exact target', { exact: false }).fill('test-target');
  await page.getByLabel('Permitted action').selectOption('group.add');
  await advanced.getByLabel('Authority begins').fill(new Date(Date.now() - 60000).toISOString().slice(0,16));
  await advanced.getByLabel('Authority ends').fill(new Date(Date.now() + 86400000).toISOString().slice(0,16));
  await advanced.getByLabel('Maximum uses').fill('1');
  const beforeAdvanced = grantPosts().length;
  await page.getByRole('button', { name: 'Review exact permission', exact: true }).click();
  await advanced.getByRole('heading', { name: 'Review before issuing' }).waitFor();
  assert.equal(grantPosts().length, beforeAdvanced);
  await page.getByRole('button', { name: 'Issue this exact permission', exact: true }).click();
  await page.getByText(/This form will not retry an uncertain write/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Issue this exact permission', exact: true }).isDisabled(), true);
  assert.equal((await api('/grants')).body.length, 3);
  checks.push('Advanced uncommon action remains collapsed, reviews before write and preserves server self-grant denial/no retry');
  assert.equal((await api('/catalog', { name: 'Studio software', kind: 'software', target: 'studio-license', ownerId })).status, 201);
  await fresh(); await prepare('Studio software');
  await page.getByRole('button', { name: 'Issue these two permissions' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('p')].filter(p => p.textContent.includes('Recorded · exact reviewed scope')).length === 2);
  await page.getByRole('button', { name: 'Check recorded permissions' }).waitFor();
  const software = (await api('/grants')).body.filter(g => g.target === 'studio-license');
  assert.deepEqual(software.map(g => g.action).sort(), ['license.add', 'license.remove']);
  assert.ok(software.every(g => g.mapping_revision === 3 && g.connection_revision === 3 && g.max_uses === 1));
  assert.ok(Date.parse(software.find(g => g.action === 'license.remove').valid_until) > Date.now() + 3600000);
  await page.getByRole('button', { name: 'Review another permission' }).click();
  await page.getByRole('button', { name: 'Review these permissions' }).waitFor();
  checks.push('Software catalogue review also persists separate exact add/removal grants, covers expiry and permits a subsequent fresh owner review');

}

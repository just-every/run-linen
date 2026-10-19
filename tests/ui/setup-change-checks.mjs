import assert from 'node:assert/strict';
import { setupSql } from './setup-fixtures.mjs';
export async function runChangeChecks({ page, api, base, checks }) {
  const service = await api('/services', { name: 'Orders service', description: 'Order workflow', businessImpact: 'Sales interrupted', source: 'isolated test fixture', observedAt: new Date().toISOString() });
  assert.equal(service.status, 201);
  await page.goto(base + '/app#/changes');
  await page.getByText('Add change', { exact: true }).click();
  const form=page.locator('details').filter({has:page.getByText('Add change',{exact:true})});
  await form.getByLabel('Intended change').fill('Release order repair');
  await form.getByLabel('Affected service', { exact: false }).selectOption({ label: 'Orders service' });
  await form.getByLabel('Risk and uncertainty').fill('Canary first');
  await form.getByLabel('Impact on the business').fill('Restore order entry');
  await form.getByLabel('Window starts').fill(new Date(Date.now() - 60000).toISOString().slice(0,16));
  await form.getByLabel('Window ends').fill(new Date(Date.now() + 3600000).toISOString().slice(0,16));
  await form.getByLabel('Affected cohorts').fill('sales');
  await form.getByLabel('Canary cohorts').fill('sales');
  await form.getByLabel('Service beneficiary scope').fill('sales');
  await form.getByLabel('Release to deploy').fill('release-2');
  await form.getByLabel('Release to restore').fill('release-1');
  await form.getByLabel('Deployment connection').selectOption({ label: 'Owned release runner' });
  await form.getByLabel('Deployment target').selectOption('orders');
  await form.getByLabel('Workflow verifier').selectOption({ label: 'Independent work check' });
  assert.equal(await form.getByLabel('Exact versioned implementation').count(), 0);
  await page.getByRole('button', { name: 'Save change draft' }).click();
  await page.getByRole('heading', { name: 'Release order repair' }).waitFor();
  const changes = (await api('/changes')).body.items;
  const change = changes.find(c => c.data.title === 'Release order repair');
  assert.equal(change.data.state, 'draft'); assert.deepEqual(change.data.authorizations, []);
  for (const impl of [change.data.implementation, change.data.compensation]) {
    assert.equal(impl.connectionId, 'setup-deploy'); assert.equal(impl.connectionRevision, 5);
    assert.equal(impl.verifierConnectionId, 'setup-probe'); assert.equal(impl.verifierConnectionRevision, 4);
  }
  assert.deepEqual(change.data.implementation.payload, { release: 'release-2' });
  assert.deepEqual(change.data.compensation.payload, { release: 'release-1' });
  await setupSql("UPDATE connections SET revision=revision+1 WHERE id IN ('setup-deploy','setup-probe');");
  await page.reload(); await page.getByRole('heading', { name: 'Release order repair' }).waitFor();
  const same = (await api('/changes/' + change.id)).body;
  assert.deepEqual(same.data.implementation, change.data.implementation);
  assert.deepEqual(same.data.compensation, change.data.compensation);
  checks.push('Named new change saves real deployment/verifier revision pins before approval; viewing after connection drift never repins implementation or compensation');
}

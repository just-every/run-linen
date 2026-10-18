import { assetLifecycleJourney } from "./asset-custody-journey.mjs";
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { captureJourney } from './viewport-evidence.mjs'

export async function custodyJourney(page, api, personId, ownerId, out) {
  const base = new URL(page.url()).origin
  await page.goto(base + '/app#/assets')
  await page.getByText('Record a device', { exact: true }).click()
  const create = page.locator('details').filter({ has: page.getByText('Record a device', { exact: true }) })
  await create.getByLabel('Unique serial number').fill('BROWSER-CUSTODY-001')
  await create.getByLabel('Authoritative device source').fill('browser physical receipt fixture')
  await create.getByLabel('Current location').fill('Test equipment store')
  const [created] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/v1/assets') && r.request().method() === 'POST'),
    create.getByRole('button', { name: 'Save', exact: true }).click(),
  ])
  assert.equal(created.status(), 201)
  const asset = await created.json()
  async function command(kind) {
    await page.reload()
    await page.getByRole('heading', { name: 'BROWSER-CUSTODY-001' }).waitFor()
    const form = page.locator('details').filter({ has: page.getByText('Record a custody change', { exact: true }) })
    await form.locator('summary').click()
    await form.getByLabel('What happened?').selectOption(kind)
    await form.getByLabel(/^Person/).selectOption(personId)
    await form.getByLabel('Actual evidence and source').fill(`Controlled browser fixture ${kind} receipt, observed in test equipment store`)
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith(`/assets/${asset.id}/commands`) && r.request().method() === 'POST'),
      form.getByRole('button', { name: 'Save', exact: true }).click(),
    ])
    assert.equal(response.status(), 200, await response.text())
    return response.json()
  }
  await command('assign')
  await command('receive')
  const lifecycle = await api('/lifecycle', { personId, kind: 'leave', effectiveAt: new Date().toISOString(),
    timezone: 'UTC', source: 'browser-HR-fixture', sourceRevision: Date.now(), retained: [], added: [], removed: [], deviceIds: [asset.id], ownerId })
  const result = await command('return')
  await captureJourney(page, { path: `${out}/custody-return.png`, fullPage: true })
  await page.goto(base + '/app#/lifecycle/' + lifecycle.lifecycleId)
  await page.getByText('Record the physical handoff', { exact: true }).click()
  const form = page.locator('details').filter({ has: page.getByText('Record the physical handoff', { exact: true }) })
  await form.getByLabel('Recorded receipt or return identity').fill(result.custodyEventId)
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await page.locator('.badge').getByText('verified', { exact: true }).waitFor()
  await page.reload()
  await page.locator('.badge').getByText('verified', { exact: true }).waitFor()
  const after = await api('/lifecycle/' + lifecycle.lifecycleId)
  assert.equal(after.obligations.find(o => o.kind === 'device.return').state, 'verified')
  assert.ok(after.obligations.some(o => o.kind !== 'device.return' && o.state !== 'verified'), 'Physical custody must not certify security duties')
  await captureJourney(page, { path: `${out}/custody-separate-security.png`, fullPage: true })
  await lifecycleEvidenceJourney(page, lifecycle.lifecycleId, out)
  await assetLifecycleJourney(page, personId, out)

}

export async function lifecycleEvidenceJourney(page, lifecycleId, out) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    const downloaded = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Download lifecycle evidence (JSON)' }).click()
    const download = await downloaded
    assert.equal(await download.failure(), null, 'LIFE-007: evidence download completes')
    const pack = JSON.parse(await readFile(await download.path(), 'utf8'))
    assert.equal(pack.lifecycle.id, lifecycleId, 'LIFE-007: exported lifecycle matches the selected record')
    assert.ok(pack.outstandingDuties.length, 'LIFE-007: pending security duties stay in the pack')
    await page.screenshot({ path: `${out}/LIFE-007-evidence-${width}.png`, fullPage: true })
  }
  console.log('PASS LIFE-007: lifecycle evidence download with outstanding duties at 1440 and 390')
}

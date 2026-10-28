import assert from 'node:assert/strict'

// Evidence is captured from the same real page/state at both breakpoints.
export async function captureJourney(page, options) {
  await page.waitForFunction(() => !document.querySelector(".loading"))
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => [...document.images].every(image => image.complete))
  const previous = page.viewportSize()
  try {
    for (const width of process.env.LINEN_CAPTURE ? [1440,390] : [page.viewportSize().width]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 })
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false,
        `${options.path}: ${width}px must not overflow`)
      await page.keyboard.press('Tab')
      assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), 'BODY',
        `${options.path}: keyboard reaches an interactive control`)
      // Keep fixed headers at the top of a full-page capture after the focus probe scrolls.
      await page.evaluate(() => window.scrollTo(0, 0))
      process.env.LINEN_CAPTURE && await page.screenshot({ ...options, path: width === 1440 ? options.path : options.path.replace(/\.png$/, `-${width}px.png`) })
    }
  } finally {
    await page.setViewportSize(previous)
  }
}

export async function lifecycleVariants(page, api, personId, ownerId, out) {
  for (const kind of ['move', 'leave']) {
    await page.goto(new URL('/app#/lifecycle', page.url()).href)
    await page.getByText('Record an authoritative HR change', { exact: true }).click()
    const form = page.locator('details').filter({ has: page.getByText('Record an authoritative HR change', { exact: true }) })
    await form.getByLabel('Person', { exact: false }).selectOption(personId)
    await form.getByLabel('What is changing?').selectOption(kind)
    await form.getByLabel('Effective date and time').fill(new Date(Date.now() + 3600000).toISOString().slice(0, 16))
    await form.getByLabel('Authoritative HR source').fill('browser-test-authorised-HR-fixture')
    await form.getByLabel('HR source revision').fill(String(Date.now()))
    await form.getByLabel('Accountable owner').selectOption(ownerId)
    await form.getByLabel('Access to remove').fill('previous-team-access')
    if (kind === 'move') {
      await form.getByLabel('Access that remains valid').fill('staff-baseline')
      await form.getByLabel('Access to add').fill('new-team-access')
    } else await form.getByLabel('Urgent departure').check()
    await form.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForURL(/#\/lifecycle\/.+/)
    await page.getByText('Outstanding and completed responsibilities', { exact: true }).waitFor()
    const id = page.url().split('/').at(-1)
    const before = await api('/lifecycle/' + id)
    assert.equal(before.lifecycle.kind, kind)
    assert.ok(before.obligations.length > 0)
    assert.ok(before.obligations.some(o => String(o.kind).includes('revoke') || String(o.kind).includes('remove')))
    await page.reload()
    await page.getByText('Outstanding and completed responsibilities', { exact: true }).waitFor()
    assert.deepEqual((await api('/lifecycle/' + id)).obligations, before.obligations)
    await captureJourney(page, { path: `${out}/lifecycle-${kind}.png`, fullPage: true })
  }
}

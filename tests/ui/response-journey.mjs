import assert from 'node:assert/strict';

/** DESK-008: editing and restoring a reply never sends it. */
export async function unsentReplyJourney({ page, api, base, out, width }) {
  await page.setViewportSize({ width, height: 1000 });
  const work = await api('/work', {
    title: 'Denver VPN follow-up', body: 'The VPN is still disconnecting during calls.',
    deduplicationKey: `desk-008-unsent-${width}`,
  });
  await page.goto(`${base}/app#/work/${work.id}`);
  const composer = page.getByLabel('Keep the conversation going', { exact: true });
  const reply = 'I am checking the Denver VPN reports. Please keep this conversation open.';
  await composer.fill(reply);
  assert.equal((await api(`/work/${work.id}`)).messages.length, 1, 'DESK-008 editing a draft does not send it');
  await page.reload();
  await composer.waitFor();
  await page.waitForFunction(expected => document.querySelector('#conversation-message')?.value === expected, reply);
  assert.equal((await api(`/work/${work.id}`)).messages.length, 1, 'DESK-008 restoring a draft does not send it');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${out}/desk-008-unsent-${width}.png`, fullPage: true });
  const sent = page.waitForResponse(r => r.url().endsWith(`/work/${work.id}/messages`) && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  assert.equal((await sent).status(), 201);
  const detail = await api(`/work/${work.id}`);
  assert.equal(detail.messages.filter(message => message.body === reply).length, 1, 'DESK-008 explicit Send posts the draft exactly once');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#conversation-message')?.value === '');
  console.log(`PASS DESK-008 ${width}: unsent reply survives reload; only agent Send posts it, then draft clears.`);
}

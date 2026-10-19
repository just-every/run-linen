import assert from 'node:assert/strict';

/** DESK-008: editing and restoring a reply never sends it. */
export async function unsentReplyJourney({ page, api, base, out, width }) {
  await page.setViewportSize({ width, height: 1000 });
  const work = await api('/work', {
    title: 'Denver VPN follow-up', body: 'The VPN is still disconnecting during calls.',
    deduplicationKey: `desk-008-unsent-${width}`,
  });
  await page.goto(`${base}/app#/work/${work.id}`);
  const composer = page.locator('#conversation-message');
  const reply = 'I am checking the Denver VPN reports. Please keep this conversation open.';
  await composer.fill(reply);
  assert.equal((await api(`/work/${work.id}`)).messages.length, 1, 'DESK-008 editing a draft does not send it');
  await page.reload();
  await composer.waitFor();
  await page.waitForFunction(expected => document.querySelector('#conversation-message')?.value === expected, reply);
  assert.equal((await api(`/work/${work.id}`)).messages.length, 1, 'DESK-008 restoring a draft does not send it');
  const tools = page.getByLabel('Responses and summaries', { exact: true });
  await tools.locator(':scope > summary').click();
  const unavailable = page.waitForResponse(r => r.url().endsWith(`/work/${work.id}/response-assistance`));
  await tools.getByRole('button', { name: 'Summarize ticket', exact: true }).click();
  assert.equal((await unavailable).status(), 503);
  await tools.getByText('Configure a model connection before generating a draft or summary', { exact: true }).waitFor();
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

/** Native emitted Worker; only the external paid model protocol is a fixture. */
export async function responseJourney({ page, api, base, out, width }) {
  await page.setViewportSize({ width, height: 1000 });
  const session = await api('/session');
  const work = await api('/work', { title: 'Denver VPN conversation', body: 'VPN disconnected during call 1.', deduplicationKey: `desk-008-generated-${width}` });
  for (let i = 2; i <= 20; i++) await api(`/work/${work.id}/messages`, { body: `VPN disconnected during call ${i}.`, visibility: 'public', sourceMessageId: `desk-008-browser-${width}-${i}` });
  await api(`/work/${work.id}/messages`, { body: 'PRIVATE service investigation detail', visibility: 'private', sourceMessageId: `desk-008-private-${width}` });
  const article = await api('/knowledge', { title: `VPN client restart ${width}`, body: 'Restart the VPN client. If it fails, keep the ticket open.', scope: 'employees', expiresAt: '2030-01-01T00:00:00Z', review: true });
  await page.goto(`${base}/app#/work/${work.id}`);
  const tools = page.getByLabel('Responses and summaries', { exact: true });
  await tools.locator(':scope > summary').click();
  await tools.locator('summary').filter({ hasText: 'Manage canned responses' }).click();
  await tools.getByLabel('Response title', { exact: true }).fill(`Denver follow-up ${width}`);
  await tools.getByLabel('Response text', { exact: true }).fill('Hello {{requester.name}}, I am following up on {{ticket.title}}.');
  const saved = page.waitForResponse(r => r.url().endsWith('/canned-responses') && r.request().method() === 'POST');
  await tools.getByRole('button', { name: 'Save canned response', exact: true }).click(); assert.equal((await saved).status(), 201);
  const template = (await api('/canned-responses')).items.find(t => t.title === `Denver follow-up ${width}`);
  await tools.getByLabel('Canned response', { exact: true }).selectOption(template.id);
  const inserted = page.waitForResponse(r => r.url().endsWith(`/work/${work.id}/canned-response`));
  await tools.getByRole('button', { name: 'Insert canned response', exact: true }).click(); assert.equal((await inserted).status(), 200);
  const composer = page.locator('#conversation-message');
  await page.waitForFunction(name => document.querySelector('#conversation-message')?.value.includes(name), session.user.name);
  assert.match(await composer.inputValue(), /Denver VPN conversation/);
  assert.equal((await api(`/work/${work.id}`)).messages.length, 21);
  await page.getByLabel('Message visibility', { exact: true }).selectOption('private');
  await tools.getByRole('button', { name: 'Insert canned response', exact: true }).click();
  assert.equal(await page.getByLabel('Message visibility', { exact: true }).inputValue(), 'private', 'DESK-008 insertion never broadens a private draft audience');
  await tools.getByLabel('Knowledge to cite').selectOption(article.id);
  const summarized = page.waitForResponse(r => r.url().endsWith(`/work/${work.id}/response-assistance`));
  await tools.getByRole('button', { name: 'Summarize ticket', exact: true }).click(); assert.equal((await summarized).status(), 200);
  const summary = tools.getByRole('region', { name: 'Ticket summary', exact: true });
  await summary.getByText(/Twenty VPN reports/).waitFor();
  assert.equal(await summary.getByRole('link').count(), 22);
  await summary.getByRole('link', { name: `VPN client restart ${width}`, exact: true }).waitFor();
  assert.equal((await api(`/work/${work.id}`)).messages.length, 21, 'DESK-008 summary never posts');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${out}/desk-008-summary-${width}.png`, fullPage: true });
  await tools.getByRole('button', { name: 'Dismiss generated text', exact: true }).click();
  await composer.fill('');
  const drafted = page.waitForResponse(r => r.url().endsWith(`/work/${work.id}/response-assistance`));
  await tools.getByRole('button', { name: 'Draft shared reply', exact: true }).click(); assert.equal((await drafted).status(), 200);
  const draft = tools.getByRole('region', { name: 'Unsent assistant reply', exact: true });
  await draft.getByRole('button', { name: 'Use reply draft', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#conversation-message')?.value.includes('restart the VPN client'));
  const provider = await (await fetch(base + '/__fixture/evidence')).json();
  const last = provider.calls.filter(c => c.kind === 'response-sources').at(-1);
  assert.equal(last.data.sources.filter(s => s.type === 'message').length, 20);
  assert.equal(JSON.stringify(last).includes('PRIVATE'), false, 'DESK-008 generated public reply excludes private context');
  assert.equal((await api(`/work/${work.id}`)).messages.length, 21);
  assert.equal(await page.getByLabel('Message visibility', { exact: true }).inputValue(), 'private');
  await page.getByLabel('Message visibility', { exact: true }).selectOption('public');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#conversation-message')?.value.includes('restart the VPN client'));
  assert.equal((await api(`/work/${work.id}`)).messages.length, 21, 'DESK-008 restored model draft remains unsent');
  await page.screenshot({ path: `${out}/desk-008-model-draft-${width}.png`, fullPage: true });
  const sent = page.waitForResponse(r => r.url().endsWith(`/work/${work.id}/messages`) && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send message', exact: true }).click(); assert.equal((await sent).status(), 201);
  assert.equal((await api(`/work/${work.id}`)).messages.length, 22);
  await page.locator('.message-body').getByText('Please restart the VPN client using the reviewed guidance and reply here if it still disconnects.', { exact: true }).waitFor();
  await page.screenshot({ path: `${out}/desk-008-sent-${width}.png`, fullPage: true });
  console.log(`PASS DESK-008 native ${width}: canned requester name, twenty-message cited summary with knowledge, private-source isolation and unsent generated reply until agent Send.`);
}

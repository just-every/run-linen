import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { apiFor, createConnection, finishFirstRun, signIn } from './connected-helpers.mjs';
import { rfc822 } from '../work/mail-cases.mjs';
// CHANNEL-003: the owner connects a Gmail mailbox and an Exchange Online forwarding mailbox, then watches one request arrive with its
// attachment and CC watcher, thread by headers, be answered from Linen, suppress an out-of-office loop and hold unknown senders.
const dns = {
  'TXT:example.test': ['v=spf1 include:_spf.google.com include:spf.protection.outlook.com ~all'], 'TXT:_dmarc.example.test': ['v=DMARC1; p=quarantine'],
  'TXT:google._domainkey.example.test': ['v=DKIM1; k=rsa; p=synthetic-linen-9410'], 'CNAME:selector1._domainkey.example.test': ['selector1-example-test._domainkey.example.onmicrosoft.com.'],
  'CNAME:selector2._domainkey.example.test': ['selector2-example-test._domainkey.example.onmicrosoft.com.'],
};
const b64url = text => Buffer.from(text).toString('base64url');
export async function mailboxJourney({ browser, page, api, base, out, errors }) {
  const password = 'synthetic-Connected-browser-2026', gmail = {};
  const publish = async () => assert.equal((await fetch(base + '/__fixture/state', { method: 'POST', body: JSON.stringify({ mailbox: { profile: 'support@example.test', dns, gmail } }) })).status, 200);
  const poll = async (name) => {
    const box = page.getByRole('region', { name: 'Support mailboxes' }).getByRole('article', { name }), done = page.waitForResponse(r => r.url().endsWith('/mail/poll'));
    await box.getByRole('button', { name: 'Check mail now', exact: true }).click(); assert.equal((await done).status(), 200);
  };
  const sent = async () => (await (await fetch(base + '/__fixture/evidence')).json()).calls.filter(c => c.kind === 'mail-send').map(c => Buffer.from(c.data.raw, 'base64url').toString());
  await publish();
  const member = async (name, email, role) => ({ ...await api('/members', { name, email, password, roles: [role] }), name, email });
  const rina = await member('Rina Lee', 'rina.lee@example.test', 'employee'), oscar = await member('Oscar Diaz', 'oscar.diaz@example.test', 'operator'), vera = await member('Vera Ng', 'vera.ng@example.test', 'employee');
  const connection = await createConnection(page, api, base, 'gmail', 'Support Gmail', { mailbox: 'support@example.test', mode: 'oauth', clientId: 'synthetic-linen-9400', clientSecret: 'synthetic-linen-9401', refreshToken: 'synthetic-linen-9402' });
  await createConnection(page, api, base, 'exchange-online', 'Helpdesk Exchange', { mailbox: 'helpdesk@example.test', mode: 'forwarding', tenantId: '00000000-0000-4000-8000-000000009421' });
  for (const [email, user] of [[rina.email, rina.id], [oscar.email, oscar.id]]) await api('/mail/senders', { connectionId: connection.id, email, userId: user });
  for (const width of [1440, 390]) {
    const context = width === 1440 ? null : await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'UTC' }), p = context ? await context.newPage() : page;
    if (context) { p.on('pageerror', e => errors.push(String(e))); await signIn(p, base, 'mail-owner@example.test'); }
    try {
      await p.setViewportSize({ width, height: width === 1440 ? 1000 : 900 });
      await p.goto(base + '/app#/connections');
      const region = p.getByRole('region', { name: 'Support mailboxes' });
      await region.waitFor();
      if (width === 1440) {
        await region.getByRole('article', { name: 'support@example.test' }).getByText('Gmail · Read by sign-in', { exact: false }).waitFor();
        await region.getByText('SPF pass · DKIM pass · DMARC pass', { exact: false }).first().waitFor();
        await region.getByText('Linen replies from this mailbox.', { exact: false }).first().waitFor();
        await region.getByRole('article', { name: 'helpdesk@example.test' }).getByText('Exchange Online · Fed by a forwarding rule', { exact: false }).waitFor();
        assert.equal(await region.getByRole('article', { name: 'helpdesk@example.test' }).getByRole('button', { name: 'Check mail now' }).count(), 0, 'a forwarding mailbox is never polled');
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `CHANNEL-003 mailbox setup fits at ${width}`);
      }
      await p.screenshot({ path: `${out}/CHANNEL-003-mailboxes-${width}.png`, fullPage: true });
      if (width === 1440) {
        // Icon-only controls carry a tooltip: after about 300 ms of hover, at once on keyboard focus.
        const profile = p.locator('button.profile'), opacity = () => profile.evaluate(e => getComputedStyle(e, '::after').opacity);
        await profile.hover(); await p.waitForTimeout(120); assert.equal(await opacity(), '0', 'the tooltip waits for the hover delay');
        await p.waitForTimeout(400); assert.equal(await opacity(), '1'); await p.mouse.move(5, 500);
        await p.keyboard.press('Escape'); for (let i = 0; i < 60 && !(await p.evaluate(() => document.activeElement?.matches('button.profile'))); i++) await p.keyboard.press('Tab');
        await p.waitForTimeout(120); assert.equal(await opacity(), '1', 'the tooltip shows at once on keyboard focus');
      }
    } finally { if (context) await context.close(); }
  }
  // One request: an attachment, a CC the sender is allowed to add, and a CC who cannot read it.
  gmail.m1 = b64url(rfc822({ from: 'Rina Lee <rina.lee@example.test>', to: 'support@example.test', cc: 'oscar.diaz@example.test, vera.ng@example.test, outside@elsewhere.test', subject: 'VPN will not connect', id: '<synthetic-linen-9411@example.test>',
    body: 'My VPN has failed since this morning.', files: [{ name: 'vpn-log.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF synthetic-linen-9412') }] }));
  await publish();
  await page.goto(base + '/app#/connections'); await poll('support@example.test');
  const list = page.getByRole('list', { name: 'Recent mail' });
  await list.getByText('Added to a request', { exact: false }).first().waitFor();
  await list.getByRole('link', { name: 'Open request' }).first().click();
  const thread = page.getByRole('region', { name: 'Email thread' });
  await thread.getByText('Received from rina.lee@example.test', { exact: false }).waitFor();
  await thread.getByText('1 attachment kept on the request', { exact: false }).waitFor();
  await thread.getByText('Watching by CC: Oscar Diaz.', { exact: false }).waitFor();
  await page.locator('.attachments').getByText('vpn-log.pdf', { exact: false }).waitFor();
  const requestPath = new URL(page.url()).hash;
  // A reply from the mail client lands on the same request, without the quoted history.
  gmail.m2 = b64url(rfc822({ from: 'rina.lee@example.test', to: 'support@example.test', subject: 'RE: something else entirely', id: '<synthetic-linen-9413@example.test>', inReplyTo: '<synthetic-linen-9411@example.test>', references: '<synthetic-linen-9411@example.test>',
    body: 'It still fails after a restart.\r\n\r\nOn Mon, 5 Oct 2026, Support wrote:\r\n> synthetic-linen-9414 quoted history' }));
  await publish(); await page.goto(base + '/app#/connections'); await poll('support@example.test');
  await page.goto(base + '/app' + requestPath); await page.reload();
  await page.locator('.message-body').getByText('It still fails after a restart.', { exact: true }).waitFor();
  assert.equal(await page.getByText('synthetic-linen-9414', { exact: false }).count(), 0, 'quoted history is dropped');
  assert.equal(await page.getByRole('region', { name: 'Email thread' }).getByText('Received from', { exact: false }).count(), 2, 'both messages sit on one request');
  // A reply from Linen goes out from the mailbox, threaded to the last message.
  await page.locator('#conversation-message').fill('Please restart the VPN client and try again.');
  const replied = page.waitForResponse(r => r.url().endsWith('/messages') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send message' }).click(); assert.equal((await replied).status(), 201);
  await page.reload();
  await page.getByRole('region', { name: 'Email thread' }).getByText('Reply sent from the mailbox', { exact: false }).waitFor();
  await page.getByRole('region', { name: 'Email thread' }).getByText('accepted', { exact: false }).waitFor();
  const [mime] = await sent(); assert.match(mime, /To: rina\.lee@example\.test/); assert.match(mime, /In-Reply-To: <synthetic-linen-9413@example\.test>/); assert.match(mime, /References: <synthetic-linen-9411@example\.test> <synthetic-linen-9413@example\.test>/);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 900 }); await page.reload();
    await page.getByRole('region', { name: 'Email thread' }).waitFor();
    if (width === 1440) assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `CHANNEL-003 email thread fits at ${width}`);
    await page.screenshot({ path: `${out}/CHANNEL-003-thread-${width}.png`, fullPage: true });
  }
  // An out-of-office loop is ignored; unknown and spoofed senders are held; the owner maps one and dismisses the other.
  gmail.ooo = b64url(rfc822({ from: 'rina.lee@example.test', to: 'support@example.test', subject: 'Automatic reply: Re: VPN will not connect', id: '<synthetic-linen-9415@example.test>', inReplyTo: '<synthetic-linen-9413@example.test>', headers: { 'Auto-Submitted': 'auto-replied' }, body: 'I am away.' }));
  gmail.visitor = b64url(rfc822({ from: 'Visitor <visitor@elsewhere.test>', to: 'support@example.test', subject: 'Free gift cards', id: '<synthetic-linen-9416@elsewhere.test>', body: 'Click here.' }));
  gmail.vera1 = b64url(rfc822({ from: 'vera.ng@example.test', to: 'support@example.test', subject: 'Second monitor', id: '<synthetic-linen-9417@example.test>', body: 'My second monitor is dark.' }));
  await publish(); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(base + '/app#/connections'); await poll('support@example.test');
  await list.getByText('Ignored automatic mail · Automatic reply', { exact: false }).waitFor();
  const held = list.getByRole('listitem').filter({ hasText: 'vera.ng@example.test' });
  await held.getByText('Held for review · Unknown or deactivated sender', { exact: false }).waitFor();
  const visitor = list.getByRole('listitem').filter({ hasText: 'visitor@elsewhere.test' });
  const dismissed = page.waitForResponse(r => r.url().includes('/dismiss')); await visitor.getByRole('button', { name: 'Dismiss and forget sender' }).click(); assert.equal((await dismissed).status(), 200);
  await page.getByText('visitor@elsewhere.test').waitFor({ state: 'detached' }); // a dismissed sender is forgotten
  await held.getByRole('button', { name: 'Map to a colleague' }).click();
  await held.getByLabel('Colleague this address belongs to').selectOption({ label: vera.name });
  const mapped = page.waitForResponse(r => r.url().endsWith('/mail/senders')); await held.getByRole('button', { name: 'Map sender' }).click(); assert.equal((await mapped).status(), 200);
  gmail.vera2 = b64url(rfc822({ from: 'vera.ng@example.test', to: 'support@example.test', subject: 'Second monitor again', id: '<synthetic-linen-9418@example.test>', body: 'Resending: my second monitor is dark.' }));
  await publish(); await poll('support@example.test');
  await list.getByRole('listitem').filter({ hasText: 'Second monitor again' }).getByText('Added to a request', { exact: false }).waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 900 });
    if (width === 1440) assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `CHANNEL-003 mail review fits at ${width}`);
    await page.screenshot({ path: `${out}/CHANNEL-003-review-${width}.png`, fullPage: true });
  }
  console.log('PASS CHANNEL-003 native 1440/390: Gmail and forwarding Exchange mailboxes with read-back domain authentication, one threaded request with its attachment and CC watcher, a Linen reply from the mailbox, suppressed out-of-office, held and mapped senders, tooltip on the icon-only account control.');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.env.LINEN_TEST_URL, out = process.env.LINEN_TEST_OUTPUT;
  if (!base || !out) throw Error('Run through tests/ui/connected-run.mjs');
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.LINEN_CHROMIUM_EXECUTABLE ? { executablePath: process.env.LINEN_CHROMIUM_EXECUTABLE } : {}), args: [...(process.env.LINEN_CHROMIUM_EXECUTABLE ? ['--no-sandbox'] : []), '--use-mock-keychain', '--password-store=basic'] }), errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' }), page = await context.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(base + '/app'); await page.getByLabel('Your name').fill('Morgan Hayes'); await page.getByLabel('Workspace name').fill('Mailbox proof');
    await page.getByLabel('Work email').fill('mail-owner@example.test'); await page.getByLabel('Password', { exact: true }).fill('synthetic-Connected-browser-2026');
    await page.getByRole('button', { name: 'Create workspace' }).click(); await page.getByRole('heading', { name: 'Requests', exact: true }).waitFor();
    await finishFirstRun(page, base);
    await mailboxJourney({ browser, page, api: apiFor(page), base, out, errors }); assert.deepEqual(errors, []);
  } catch (error) {
    for (const [i, c] of browser.contexts().entries()) for (const [j, p] of c.pages().entries()) await p.screenshot({ path: `${out}/CHANNEL-003-failure-${i}-${j}.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
}

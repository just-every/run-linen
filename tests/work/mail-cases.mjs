import assert from 'node:assert/strict';
const b64url = text => Buffer.from(text).toString('base64url');
/** RFC 822 as a mailbox stores it. The topmost Authentication-Results is the receiving provider's own verdict. */
export function rfc822({ from, to, cc, subject, id, inReplyTo, references, body, files = [], headers = {}, dmarc = 'pass', fromDomain }) {
  const domain = fromDomain ?? /@([^<>\s]+)/.exec(from)[1], boundary = 'synthetic-linen-boundary';
  const top = [`Authentication-Results: mx.example.test; spf=pass; dkim=pass header.d=${domain}; dmarc=${dmarc} header.from=${domain}`,
    `From: ${from}`, `To: ${to}`, ...(cc ? [`Cc: ${cc}`] : []), `Subject: ${subject}`, `Message-ID: ${id}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []), ...(references ? [`References: ${references}`] : []), ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`), 'MIME-Version: 1.0'];
  if (!files.length) return [...top, 'Content-Type: text/plain; charset=utf-8', '', body, ''].join('\r\n');
  return [...top, `Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset=utf-8', '', body,
    ...files.flatMap(f => [`--${boundary}`, `Content-Type: ${f.type}; name="${f.name}"`, `Content-Disposition: attachment; filename="${f.name}"`, 'Content-Transfer-Encoding: base64', '', Buffer.from(f.bytes).toString('base64')]), `--${boundary}--`, ''].join('\r\n');
}
export async function mailChannelChecks(api, db) {
  const ok = (r, status = 200) => { assert.equal(r.status, status, 'CHANNEL-003 ' + JSON.stringify(r)); return r.value; };
  const staff = { 'x-user': 'synthetic-linen-9201', 'x-roles': '["operator"]' }, req = { 'x-user': 'synthetic-linen-9202', 'x-roles': '["employee"]' };
  for (const [id, name, role] of [['synthetic-linen-9201', 'Operator Reed', 'operator'], ['synthetic-linen-9202', 'Requester Lee', 'employee'], ['synthetic-linen-9203', 'Outsider Park', 'employee'], ['synthetic-linen-9204', 'Second Requester', 'employee']])
    await db.batch([db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(id, id + '@example.test', name, 'unused', '2026-01-01'), db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a', id, JSON.stringify([role]))]);
  const key = await crypto.subtle.importKey('raw', Buffer.alloc(32), 'AES-GCM', false, ['encrypt']);
  const seal = async value => { const iv = crypto.getRandomValues(new Uint8Array(12)); return Buffer.from(iv).toString('base64') + '.' + Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)))).toString('base64'); };
  const tenant = '00000000-0000-4000-8000-000000009221', at = new Date().toISOString();
  const connections = {
    gmail: ['synthetic-linen-9220', 'gmail', { mailbox: 'support@example.test', mode: 'oauth' }, { clientId: 'synthetic-linen-9230', clientSecret: 'synthetic-linen-9231', refreshToken: 'synthetic-linen-9232' }],
    exchange: ['synthetic-linen-9221', 'exchange-online', { mailbox: 'helpdesk@example.test', mode: 'oauth', tenantId: tenant }, { clientId: 'synthetic-linen-9233', clientSecret: 'synthetic-linen-9234' }],
    forwarding: ['synthetic-linen-9222', 'gmail', { mailbox: 'forward@example.test', mode: 'forwarding' }, null],
    bare: ['synthetic-linen-9223', 'gmail', { mailbox: 'support@bare.test', mode: 'forwarding' }, null],
  };
  for (const [id, provider, config, secret] of Object.values(connections))
    await db.prepare("INSERT INTO connections VALUES(?,'a',?,?,?,?,'unverified',1,?,?)").bind(id, provider, id, JSON.stringify(config), secret ? await seal(secret) : null, at, at).run();
  const mail = (body = {}) => api('/test/mail', body), calls = async kind => (ok(await api('/test/mail')).calls).filter(c => c.kind === kind);
  ok(await mail({ reset: true, profile: 'support@example.test', dns: {
    'TXT:example.test': ['v=spf1 include:_spf.google.com include:spf.protection.outlook.com ~all'], 'TXT:_dmarc.example.test': ['v=DMARC1; p=quarantine; rua=mailto:synthetic-linen-9240@example.test'],
    'TXT:google._domainkey.example.test': ['v=DKIM1; k=rsa; p=synthetic-linen-9241'], 'CNAME:selector1._domainkey.example.test': ['selector1-example-test._domainkey.example.onmicrosoft.com.'], 'CNAME:selector2._domainkey.example.test': ['selector2-example-test._domainkey.example.onmicrosoft.com.'],
    'TXT:bare.test': ['v=spf1 -all'] } }));
  const verify = async id => api(`/connections/${id}/test`, { revision: 1 });
  // (1) Connect a Gmail and an Exchange Online mailbox: the credential reaches exactly that mailbox and the buyer's domain authenticates mail.
  for (const id of [connections.gmail[0], connections.exchange[0]]) {
    const v = ok(await verify(id));
    assert.equal(v.status, 'active'); assert.equal(v.evidence.mailboxRead, true); assert.equal(v.evidence.domainAuthentication.aligned, true);
  }
  assert.equal(ok(await verify(connections.forwarding[0])).evidence.mailboxRead, false, 'a forwarding mailbox holds no credential');
  const bare = ok(await verify(connections.bare[0])); assert.equal(bare.evidence.domainAuthentication.aligned, false); assert.equal(bare.evidence.domainAuthentication.dmarc, 'missing');
  const gmail = connections.gmail[0], exchange = connections.exchange[0];
  ok(await mail({ profile: 'someone-else@example.test' }));
  const mismatch = await api(`/connections/${gmail}/test`, { revision: 2 }); assert.deepEqual([mismatch.status, mismatch.value.error], [422, 'mailbox mismatch'], 'a credential for another mailbox is refused');
  ok(await mail({ profile: 'support@example.test' }));
  for (const id of [gmail, exchange, connections.forwarding[0], connections.bare[0]]) for (const [email, user] of [['requester@example.test', 'synthetic-linen-9202'], ['operator@example.test', 'synthetic-linen-9201'], ['outsider@example.test', 'synthetic-linen-9203']])
    ok(await api('/mail/senders', { connectionId: id, email, userId: user }));
  // (2) A request with an attachment and a CC arrives through the mailbox: one ticket, the file kept, only an existing reader becomes a watcher.
  const pdf = new TextEncoder().encode('%PDF synthetic-linen-9250');
  ok(await mail({ addgmail: { m1: b64url(rfc822({ from: 'Requester Lee <requester@example.test>', to: 'support@example.test', cc: 'operator@example.test, outsider@example.test, unknown@elsewhere.test', subject: 'synthetic-linen-9251 VPN will not connect',
    id: '<synthetic-linen-9252@example.test>', body: 'synthetic-linen-9253 my VPN fails since this morning.', files: [{ name: 'vpn-log.pdf', type: 'application/pdf', bytes: pdf }] })) } }));
  const polled = ok(await api('/mail/poll', { connectionId: gmail }));
  assert.deepEqual(polled.items.map(i => [i.state, i.seen]), [['ok', 1]]);
  const row = await db.prepare("SELECT work_id,state FROM work_intake_events WHERE connection_id=? AND source_message_id='m1'").bind(gmail).first();
  assert.equal(row.state, 'accepted', JSON.stringify(await db.prepare("SELECT * FROM work_intake_events WHERE source_message_id='m1'").first()));
  const work = ok(await api(`/work/${row.work_id}`, undefined, staff));
  assert.equal(work.work.title, 'synthetic-linen-9251 VPN will not connect'); assert.equal(work.work.requester_id, 'synthetic-linen-9202');
  const stored = (await db.prepare('SELECT id,name,size,visibility FROM work_attachments WHERE work_id=?').bind(row.work_id).all()).results;
  assert.deepEqual(stored.map(a => [a.name, a.size, a.visibility]), [['vpn-log.pdf', pdf.length, 'public']], 'CHANNEL-003 the attachment is kept with the request');
  const mailView = ok(await api(`/work/${row.work_id}/mail`, undefined, staff));
  assert.deepEqual(mailView.watchers.map(w => w.id), ['synthetic-linen-9201'], 'CHANNEL-003 the CC watcher is the colleague who already reads the ticket; an outsider and an external address are not added');
  assert.equal(mailView.received.length, 1); ok(await api(`/work/${row.work_id}/mail`, undefined, req), 403);
  assert.equal((await mail()) && (await calls('gmail-list')).length, 1);
  // Replaying a poll creates nothing new.
  assert.equal(ok(await api('/mail/poll', { connectionId: gmail })).items[0].seen, 0);
  // (3) A reply from the sender's mail client threads by headers, however the subject was edited, and its quoted history is dropped.
  ok(await mail({ addgmail: { m2: b64url(rfc822({ from: 'requester@example.test', to: 'support@example.test', subject: 'RE: synthetic-linen-9254 edited subject', id: '<synthetic-linen-9255@example.test>',
    inReplyTo: '<synthetic-linen-9252@example.test>', references: '<synthetic-linen-9252@example.test>', body: 'synthetic-linen-9256 it still fails.\r\n\r\nOn Mon, 1 Jan 2026, Support wrote:\r\n> synthetic-linen-9257 quoted history' })) } }));
  ok(await api('/mail/poll', { connectionId: gmail }));
  const thread = ok(await api(`/work/${row.work_id}`, undefined, staff));
  assert.ok(thread.messages.some(m => m.body === 'synthetic-linen-9256 it still fails.' && m.visibility === 'public'));
  assert.equal((await db.prepare("SELECT count(*) n FROM work_records WHERE title LIKE '%synthetic-linen-9254%'").first()).n, 0, 'CHANNEL-003 the reply is one thread, not a second ticket');
  // (4) A reply from Linen goes to the requester from the mailbox, threaded to the last message.
  const reply = ok(await api(`/work/${row.work_id}/messages`, { body: 'synthetic-linen-9258 please reboot and try again.', visibility: 'public', sourceMessageId: 'synthetic-linen-9259' }, staff), 201);
  ok(await api(`/work/${row.work_id}/messages`, { body: 'synthetic-linen-9258 please reboot and try again.', visibility: 'public', sourceMessageId: 'synthetic-linen-9259' }, staff), 201);
  const sent = await calls('gmail-send'); assert.equal(sent.length, 1, 'CHANNEL-003 a replayed reply is never sent twice');
  const out = Buffer.from(sent[0].raw, 'base64url').toString();
  assert.match(out, /^From: support@example\.test\r\nTo: requester@example\.test\r\nSubject: Re: synthetic-linen-9251 VPN will not connect\r\n/);
  assert.match(out, /In-Reply-To: <synthetic-linen-9255@example\.test>\r\nReferences: <synthetic-linen-9252@example\.test> <synthetic-linen-9255@example\.test>\r\n/);
  assert.match(out, /X-Auto-Response-Suppress: All/); assert.ok(!out.includes('synthetic-linen-9258'), 'the body travels encoded');
  assert.equal(Buffer.from(out.split('\r\n\r\n')[1].replaceAll('\r\n', ''), 'base64').toString(), 'synthetic-linen-9258 please reboot and try again.');
  const delivery = await db.prepare('SELECT * FROM work_mail_deliveries WHERE work_id=?').bind(row.work_id).first();
  assert.equal(delivery.state, 'accepted'); assert.equal(delivery.provider_ref, 'synthetic-linen-9301');
  ok(await api(`/work/${row.work_id}/messages`, { body: 'synthetic-linen-9260 private note', visibility: 'private', sourceMessageId: 'synthetic-linen-9261' }, staff), 201);
  assert.equal((await calls('gmail-send')).length, 1, 'a private note never leaves Linen');
  // The requester answers Linen's own message id: still the same ticket. An echo of Linen's own message is not intake.
  ok(await mail({ addgmail: { m3: b64url(rfc822({ from: 'requester@example.test', to: 'support@example.test', subject: 'Re: x', id: '<synthetic-linen-9262@example.test>', inReplyTo: delivery.mail_message_id, body: 'synthetic-linen-9263 rebooted, works.' })),
    m4: b64url(rfc822({ from: 'operator@example.test', to: 'requester@example.test', subject: 'Re: x', id: delivery.mail_message_id, body: 'synthetic-linen-9264 echo' })) } }));
  ok(await api('/mail/poll', { connectionId: gmail }));
  assert.ok(ok(await api(`/work/${row.work_id}`, undefined, staff)).messages.some(m => m.body === 'synthetic-linen-9263 rebooted, works.'), 'CHANNEL-003 a reply to Linen\'s message threads onto the ticket');
  assert.equal((await db.prepare("SELECT state,error FROM work_intake_events WHERE connection_id=? AND source_message_id='m4'").bind(gmail).first()).error, 'own-message');
  // Linen does not send until the buyer's domain authentication has been read back as aligned for the connection.
  const bareRaw = rfc822({ from: 'requester@example.test', to: 'support@bare.test', subject: 'synthetic-linen-9265 monitor', id: '<synthetic-linen-9270@example.test>', body: 'synthetic-linen-9266' });
  assert.equal(ok(await api('/mail/messages', { connectionId: connections.bare[0], sourceMessageId: 'synthetic-linen-9269', raw: Buffer.from(bareRaw).toString('base64') })).state, 'accepted');
  const bareTicket = await db.prepare('SELECT work_id FROM work_intake_events WHERE source_message_id=?').bind('synthetic-linen-9269').first();
  ok(await api(`/work/${bareTicket.work_id}/messages`, { body: 'synthetic-linen-9271', visibility: 'public', sourceMessageId: 'synthetic-linen-9272' }, staff), 201);
  assert.equal((await db.prepare('SELECT state,error FROM work_mail_deliveries WHERE work_id=?').bind(bareTicket.work_id).first()).error, 'domain_alignment_required');
  assert.equal((await calls('gmail-send')).length, 1);
  // (5) Out-of-office replies, bounces, lists and loops are suppressed and create nothing.
  const before = (await db.prepare('SELECT count(*) n FROM work_records').first()).n, beforeMessages = (await db.prepare('SELECT count(*) n FROM work_messages').first()).n;
  ok(await mail({ addgmail: {
    ooo1: b64url(rfc822({ from: 'requester@example.test', to: 'support@example.test', subject: 'Automatic reply: Re: x', id: '<synthetic-linen-9273@example.test>', inReplyTo: delivery.mail_message_id, headers: { 'Auto-Submitted': 'auto-replied' }, body: 'synthetic-linen-9274 I am out of the office.' })),
    ooo2: b64url(rfc822({ from: 'requester@example.test', to: 'support@example.test', subject: 'Out of Office', id: '<synthetic-linen-9275@example.test>', body: 'synthetic-linen-9276 away until Monday.' })),
    ooo3: b64url(rfc822({ from: 'stranger@elsewhere.test', to: 'support@example.test', subject: 'Re: x', id: '<synthetic-linen-9277@elsewhere.test>', headers: { Precedence: 'bulk' }, body: 'synthetic-linen-9278' })),
    self: b64url(rfc822({ from: 'support@example.test', to: 'support@example.test', subject: 'synthetic-linen-9279', id: '<synthetic-linen-9280@example.test>', body: 'synthetic-linen-9281' })) } }));
  ok(await api('/mail/poll', { connectionId: gmail }));
  const reasons = Object.fromEntries((await db.prepare("SELECT source_message_id id,state,error FROM work_intake_events WHERE connection_id=? AND source_message_id IN ('ooo1','ooo2','ooo3','self')").bind(gmail).all()).results.map(r => [r.id, r.state + ':' + r.error]));
  assert.deepEqual(reasons, { ooo1: 'suppressed:auto-submitted', ooo2: 'suppressed:auto-subject', ooo3: 'suppressed:precedence', self: 'suppressed:own-mailbox' }, 'CHANNEL-003 automatic mail is suppressed, including from an unknown sender');
  assert.equal((await db.prepare('SELECT count(*) n FROM work_records').first()).n, before); assert.equal((await db.prepare('SELECT count(*) n FROM work_messages').first()).n, beforeMessages);
  // A burst from one sender is a loop: ten are taken, the next is suppressed.
  ok(await mail({ addgmail: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`burst${i}`, b64url(rfc822({ from: 'outsider@example.test', to: 'support@example.test', subject: 'synthetic-linen-9282 ' + i, id: `<synthetic-linen-93${10 + i}@example.test>`, body: 'synthetic-linen-9283 ' + i }))])) }));
  ok(await api('/mail/poll', { connectionId: gmail }));
  assert.equal((await db.prepare("SELECT count(*) n FROM work_intake_events WHERE connection_id=? AND source_message_id LIKE 'burst%' AND error='loop-rate'").bind(gmail).first()).n, 2);
  // (6) Unknown and spoofed senders are quarantined, never trusted, and the owner can dismiss them.
  ok(await mail({ addgmail: {
    unk: b64url(rfc822({ from: 'Visitor <visitor@elsewhere.test>', to: 'support@example.test', subject: 'synthetic-linen-9284 free gift cards', id: '<synthetic-linen-9285@elsewhere.test>', body: 'synthetic-linen-9286' })),
    spoof: b64url(rfc822({ from: 'operator@example.test', to: 'support@example.test', subject: 'synthetic-linen-9287 reset the CEO password', id: '<synthetic-linen-9288@example.test>', body: 'synthetic-linen-9289', dmarc: 'fail' })) } }));
  ok(await api('/mail/poll', { connectionId: gmail }));
  const status = ok(await api('/mail/status'));
  const held = status.events.filter(e => e.state === 'quarantined'); assert.deepEqual(held.map(e => e.error).sort(), ['Sender address is not authenticated: DMARC must pass aligned with the From domain', 'Unknown or deactivated sender; accountable identity review required']);
  assert.equal((await db.prepare("SELECT count(*) n FROM work_records WHERE title LIKE '%9284%' OR title LIKE '%9287%'").first()).n, 0, 'CHANNEL-003 quarantined mail opens nothing');
  assert.equal(status.mailboxes.find(m => m.id === gmail).domainAuthentication.aligned, true);
  ok(await api('/mail/status', undefined, staff), 403);
  ok(await api(`/mail/events/${held[0].id}/dismiss`, {})); assert.equal((await db.prepare('SELECT sender,subject FROM work_intake_events WHERE id=?').bind(held[0].id).first()).sender, null);
  ok(await api(`/mail/events/${held[0].id}/dismiss`, {}), 404);
  // A failed token is recorded, not retried into a loop, and recovers.
  ok(await mail({ tokenStatus: 401 })); assert.equal(ok(await api('/mail/poll', { connectionId: gmail })).items[0].error, 'provider_auth_denied');
  assert.equal(ok(await api('/mail/status')).mailboxes.find(m => m.id === gmail).pollState, 'failed');
  ok(await mail({ tokenStatus: 200 })); assert.equal(ok(await api('/mail/poll', { connectionId: gmail })).items[0].state, 'ok');
  // The same flow through Exchange Online: Graph reads the MIME, sends MIME and a CC colleague watches.
  ok(await mail({ addgraph: { g1: rfc822({ from: 'requester@example.test', to: 'helpdesk@example.test', cc: 'operator@example.test', subject: 'synthetic-linen-9290 laptop battery', id: '<synthetic-linen-9291@example.test>', body: 'synthetic-linen-9292 battery swells.', files: [{ name: 'photo.png', type: 'image/png', bytes: [137, 80, 78, 71] }] }) } }));
  ok(await api('/mail/poll', { connectionId: exchange }));
  const graphWork = await db.prepare("SELECT work_id FROM work_intake_events WHERE connection_id=? AND source_message_id='g1'").bind(exchange).first();
  assert.equal(ok(await api(`/work/${graphWork.work_id}/mail`, undefined, staff)).watchers.length, 1);
  ok(await api(`/work/${graphWork.work_id}/messages`, { body: 'synthetic-linen-9293 we will replace it.', visibility: 'public', sourceMessageId: 'synthetic-linen-9294' }, staff), 201);
  const graphSent = await calls('graph-send'); assert.equal(graphSent.length, 1); assert.equal(graphSent[0].contentType, 'text/plain'); assert.ok(graphSent[0].path.includes('/users/helpdesk@example.test/sendMail'));
  assert.match(Buffer.from(graphSent[0].raw, 'base64').toString(), /In-Reply-To: <synthetic-linen-9291@example\.test>/);
  // Forwarding: the original bytes arrive through the authenticated adapter door and are authenticated the same way.
  const forwarded = rfc822({ from: 'requester@example.test', to: 'forward@example.test', subject: 'synthetic-linen-9295 monitor flicker', id: '<synthetic-linen-9296@example.test>', body: 'synthetic-linen-9297' });
  const door = { connectionId: connections.forwarding[0], sourceMessageId: 'synthetic-linen-9298', raw: Buffer.from(forwarded).toString('base64') };
  ok(await api('/mail/messages', door, req), 403);
  assert.equal(ok(await api('/mail/messages', door)).state, 'accepted');
  assert.equal(ok(await api('/mail/messages', door)).state, 'accepted', 'a replayed forward changes nothing');
  assert.equal((await db.prepare("SELECT count(*) n FROM work_records WHERE title LIKE '%9295%'").first()).n, 1);
  assert.equal(ok(await api('/mail/messages', { ...door, sourceMessageId: 'synthetic-linen-9299', raw: Buffer.from('not mail').toString('base64') })).state, 'quarantined', 'unreadable bytes are held, not guessed at');
  assert.deepEqual(ok(await api('/mail/poll', {})).items.filter(i => i.state === 'forwarding').map(i => i.id).sort(), [connections.forwarding[0], connections.bare[0]].sort(), 'forwarding mailboxes are never polled');
  // Erasing the requester clears the stored sender, subject and threading ids of their mail; Linen's own delivery ids are voided.
  ok(await api('/people/synthetic-linen-9202/erase', { revision: 1, reason: 'synthetic-linen-9300 erasure' }));
  const left = (await db.prepare("SELECT sender,subject,rfc_message_id,state FROM work_intake_events WHERE connection_id IN (?,?,?) AND work_id IS NOT NULL").bind(gmail, exchange, connections.forwarding[0]).all()).results.filter(r => r.state !== 'erased' && r.sender === 'requester@example.test');
  assert.deepEqual(left, [], 'CHANNEL-003 erasure leaves no requester address, subject or message id');
  assert.equal((await db.prepare("SELECT count(*) n FROM work_mail_deliveries WHERE error IS NULL OR error<>'erased'").first()).n, (await db.prepare("SELECT count(*) n FROM work_mail_deliveries WHERE work_id NOT IN (SELECT id FROM work_records WHERE requester_id='synthetic-linen-9202')").first()).n);
}

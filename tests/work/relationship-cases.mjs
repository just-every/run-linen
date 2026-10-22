import assert from 'node:assert/strict';
/** DESK-006: merge duplicates with both requesters informed, split with its own SLA and history, and links shown on each record, through public routes. */
export async function relationshipChecks(api) {
  const employee = { 'x-user': 'employee', 'x-roles': '["employee"]' }, requester = { 'x-user': 'stranger', 'x-roles': '["employee"]' };
  const make = async (path, body, headers, status = 201) => { const r = await api(path, body, headers); assert.equal(r.status, status, 'DESK-006 ' + JSON.stringify(r)); return r.value; };
  const classify = async (work, priority) => make(`/work/${work.id}/classification/override`, { type: 'incident', category: 'hardware', subcategory: 'printer', impact: 'low', urgency: 'low', priority, revision: 0, workRevision: (await make(`/work/${work.id}`, undefined, undefined, 200)).work.revision, reason: 'Desk triage' }, undefined, 200);

  // Merge two duplicate printer tickets: the duplicate closes with a pointer and both requesters follow the survivor.
  const survivor = await make('/work', { title: 'Printer jam on 3rd floor', body: 'The 3rd floor printer jams on every job.', deduplicationKey: 'desk006-a' }, employee);
  const duplicate = await make('/work', { title: '3rd floor printer jammed', body: 'Printer on 3 keeps jamming.', deduplicationKey: 'desk006-b' }, requester);
  await make(`/work/${survivor.id}/messages`, { body: 'Internal: toner vendor ticket 4471', visibility: 'private', sourceMessageId: 'desk006-private' });
  await make(`/work/${duplicate.id}/merge`, { intoId: survivor.id, reason: 'Same printer' }, employee, 403);
  const hr = await make('/work', { title: 'Printer for accommodation', body: 'Private', sensitivity: 'hr', deduplicationKey: 'desk006-hr' });
  await make(`/work/${hr.id}/merge`, { intoId: survivor.id, reason: 'Same printer' }, undefined, 422);
  const merged = await make(`/work/${duplicate.id}/merge`, { intoId: survivor.id, reason: 'Same printer, same fault' }, undefined, 200);
  assert.deepEqual(merged.mergedDuplicates.map(w => w.id), [duplicate.id]);
  assert.deepEqual(merged.participants.map(p => p.user_id), ['stranger']);
  await make(`/work/${duplicate.id}/merge`, { intoId: survivor.id, reason: 'again' }, undefined, 409);
  const closed = (await make(`/work/${duplicate.id}`, undefined, requester, 200)).work;
  assert.equal(closed.state, 'closed'); assert.equal(closed.merged_into, survivor.id);
  const shared = await make(`/work/${survivor.id}`, undefined, requester, 200);
  assert.ok(shared.messages.some(m => m.source_key === `merge:${duplicate.id}`), 'DESK-006 the merged requester sees the merge notice on the surviving ticket');
  assert.ok(shared.messages.every(m => m.visibility === 'public') && !shared.messages.some(m => m.body.includes('toner vendor')), 'DESK-006 participants read public messages only');
  assert.ok((await make(`/work/${survivor.id}`, undefined, employee, 200)).messages.some(m => m.source_key === `merge:${duplicate.id}`), 'DESK-006 the surviving requester is notified too');
  assert.ok((await make('/work', undefined, requester, 200)).items.some(w => w.id === survivor.id));
  await make(`/work/${survivor.id}/commands`, { revision: 1, command: 'cancel', reason: 'Not mine' }, requester, 404);

  // Split a ticket carrying two unrelated asks; the new ticket keeps its own SLA and history, linked to the original messages.
  const mixed = await make('/work', { title: 'Laptop slow and need a monitor', body: 'My laptop is slow.', deduplicationKey: 'desk006-split' }, employee);
  const ask = await make(`/work/${mixed.id}/messages`, { body: 'Also, can I get a second monitor?', visibility: 'public', sourceMessageId: 'desk006-monitor' }, employee);
  await classify(mixed, 'P4');
  await make(`/work/${mixed.id}/split`, { title: 'Second monitor', messageIds: ['not-a-message'], reason: 'Separate ask' }, undefined, 422);
  const split = await make(`/work/${mixed.id}/split`, { title: 'Second monitor', messageIds: [ask.id], reason: 'Separate ask' });
  const child = await make(`/work/${split.workId}`, undefined, employee, 200);
  assert.equal(child.work.requester_id, 'employee'); assert.equal(child.work.split_from, mixed.id);
  assert.ok(child.messages.some(m => m.source_key === `split:${ask.id}` && m.body === ask.body), 'DESK-006 the split ticket links back to the original message');
  assert.ok((await make(`/work/${mixed.id}`, undefined, employee, 200)).messages.some(m => m.source_key === `split-to:${split.workId}`));
  assert.ok((await make(`/work/${split.workId}/sla`, undefined, undefined, 200)).policy, 'DESK-006 the split ticket binds its own SLA');
  assert.deepEqual((await make(`/work/${mixed.id}/relationships`, undefined, undefined, 200)).splitInto.map(w => w.id), [split.workId]);
  await make(`/work/${split.workId}/parent`, { parentId: mixed.id }, undefined, 200);
  await make(`/work/${mixed.id}/parent`, { parentId: split.workId }, undefined, 422);
  assert.deepEqual((await make(`/work/${mixed.id}/relationships`, undefined, undefined, 200)).children.map(w => w.id), [split.workId]);

  // Link a ticket to a laptop and a problem and see it on each record.
  const laptop = await make('/assets', { serial: 'DESK006-LAPTOP', source: 'Receiving register', location: 'Denver' });
  const service = await make('/services', { name: 'Printing', description: 'Office printing', businessImpact: 'Printing blocked', source: 'Reviewed CI register', observedAt: new Date().toISOString(), visibility: 'workspace' });
  const incident = await make('/incidents', { title: 'Printing degraded', serviceId: service.id, impact: 'Jobs fail', cohorts: ['Denver'], visibility: 'workspace' });
  const problem = await make('/problems', { title: 'Printer fuser failures', serviceId: service.id, incidentIds: [incident.id], symptoms: 'Repeated jams', visibility: 'operators' });
  await make(`/work/${survivor.id}/links`, { kind: 'asset', targetId: laptop.id }, undefined, 200);
  await make(`/work/${survivor.id}/links`, { kind: 'problem', targetId: problem.id }, undefined, 200);
  await make(`/work/${survivor.id}/links`, { kind: 'engineering_issue', targetId: 'http://tracker.example/1' }, undefined, 422);
  const links = (await make(`/work/${survivor.id}/links`, { kind: 'engineering_issue', targetId: 'https://tracker.example/issues/42' }, undefined, 200)).links;
  assert.deepEqual(links.map(l => l.kind).sort(), ['asset', 'engineering_issue', 'problem']);
  assert.deepEqual((await make(`/work-links?kind=asset&targetId=${laptop.id}`, undefined, undefined, 200)).items.map(w => w.id), [survivor.id], 'DESK-006 the laptop shows the linked ticket');
  assert.deepEqual((await make(`/work-links?kind=problem&targetId=${problem.id}`, undefined, undefined, 200)).items.map(w => w.id), [survivor.id], 'DESK-006 the problem shows the linked ticket');
  await make(`/work-links?kind=asset&targetId=${laptop.id}`, undefined, employee, 403);
  // DESK-017: relationship operations append typed field history on both sides, with no raw audit reasons.
  const history = async (id, headers) => (await make(`/work/${id}/activity`, undefined, headers, 200)).items;
  const expectChange = (items, field, before, after) => {
    const entry = items.find(e => e.changes.some(c => c.field === field && JSON.stringify(c.before) === JSON.stringify(before) && JSON.stringify(c.after) === JSON.stringify(after)));
    assert.ok(entry, `DESK-017 ${field}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    assert.equal(entry.actor, 'Owner', 'DESK-017 relationship actor');
    assert.equal(entry.actorKind, 'person');
    assert.ok(Number.isFinite(Date.parse(entry.at)), 'DESK-017 relationship time');
    return entry;
  };
  const duplicateHistory = await history(duplicate.id), survivorHistory = await history(survivor.id);
  expectChange(duplicateHistory, 'state', 'open', 'closed');
  expectChange(duplicateHistory, 'merged into', null, survivor.id);
  expectChange(survivorHistory, 'merged duplicate', null, duplicate.id);
  expectChange(await history(mixed.id), 'split into', null, split.workId);
  const childHistory = await history(split.workId);
  expectChange(childHistory, 'split from', null, mixed.id);
  expectChange(childHistory, 'parent', null, mixed.id);
  expectChange(survivorHistory, 'asset link', null, laptop.id);
  expectChange(survivorHistory, 'problem link', null, problem.id);
  expectChange(survivorHistory, 'engineering issue link', null, 'https://tracker.example/issues/42');
  assert.ok(!JSON.stringify(duplicateHistory).includes('Same printer, same fault'), 'DESK-017 raw audit reasons stay private to audit');
  await make(`/work/${survivor.id}/links`, { kind: 'asset', targetId: laptop.id }, undefined, 200);
  await make(`/work/${split.workId}/parent`, { parentId: mixed.id }, undefined, 200);
  await make(`/work/${duplicate.id}/merge`, { intoId: survivor.id, reason: 'retry closed duplicate' }, undefined, 409);
  await make(`/work/${survivor.id}/links`, { kind: 'asset', targetId: laptop.id }, employee, 403);
  assert.deepEqual(await history(survivor.id), survivorHistory, 'DESK-017 replayed links and refused changes append nothing');
  assert.deepEqual(await history(split.workId), childHistory, 'DESK-017 assigning the same parent is not a new field change');
  await make(`/work/${split.workId}/parent`, { parentId: null }, undefined, 200);
  const unparented = await history(split.workId);
  expectChange(unparented, 'parent', mixed.id, null);
  assert.deepEqual(unparented.filter(e => childHistory.some(old => old.id === e.id)), childHistory, 'DESK-017 later relationship edits preserve earlier entries');
  for (const [id, who] of [[survivor.id, employee], [survivor.id, requester], [duplicate.id, requester], [split.workId, employee]]) {
    const visible = await history(id, who);
    assert.ok(visible.every(e => e.kind === 'message' && e.visibility === 'public' && e.changes.length === 0), 'DESK-017 requesters and merged participants never receive relationship fields');
  }
  await make(`/work/${survivor.id}/activity`, undefined, { 'x-workspace': 'other' }, 404);
  console.log('PASS DESK-017 relationship history: merge state and both pointers, split on both tickets, parent set/clear, asset/problem/issue links, actor/time/before/after, append-only edits, replay/refusal and public-only requester/participant views');
  console.log('PASS DESK-006 public routes: merged duplicate closes with pointer, both requesters informed, public-only participant, HR merge refused; split with cited messages, own SLA and parent/child (cycle refused); asset/problem/engineering-issue links shown on each record');
}

/** CHANNEL-009: share a request with a colleague (public thread, reply, never private notes; audited and revocable),
 * on-behalf visibility, and "My team's requests" following the current HR-fact manager chain without HR tickets. */
export async function sharingChecks(api, db) {
  const users = ['c9-ana', 'c9-ben', 'c9-cy', 'c9-mia', 'c9-noah', 'c9-dir'];
  for (const u of users) await db.exec(`INSERT INTO users VALUES('${u}','${u}@example.test','${u.slice(3)}','unused','2026-01-01'); INSERT INTO memberships VALUES('a','${u}','["employee"]',1);`);
  await db.exec(`INSERT INTO users VALUES('c9-hrp','c9-hrp@example.test','People partner','unused','2026-01-01'); INSERT INTO memberships VALUES('a','c9-hrp','["hr"]',1);`);
  // Ana and Cy report to Mia, Mia to the director. Bound person records stand in for HRIS facts already received.
  for (const [u, manager] of [['c9-ana', 'c9-mia'], ['c9-cy', 'c9-mia'], ['c9-mia', 'c9-dir'], ['c9-noah', 'c9-dir']])
    await db.exec(`INSERT INTO work_people(id,workspace_id,source,source_id,name,manager_id,active,revision,observed_at,effective_at,member_id,binding_id) VALUES('p-${u}','a','hris-c9','${u}','${u.slice(3)}','${manager}',1,1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','${u}','b-${u}')`);
  const as = (u) => ({ 'x-user': u, 'x-roles': '["employee"]' });
  const call = async (path, body, headers, status = 200) => { const r = await api(path, body, headers); assert.equal(r.status, status, 'CHANNEL-009 ' + path + ' ' + JSON.stringify(r.value)); return r.value; };
  const ticket = await call('/work', { title: 'Laptop fan is loud', body: 'My laptop fan runs all day.', deduplicationKey: 'c9-ana-1' }, as('c9-ana'), 201);
  await call(`/work/${ticket.id}/messages`, { body: 'Internal: warranty case 5521', visibility: 'private', sourceMessageId: 'c9-private' }, undefined, 201);
  await call(`/work/${ticket.id}`, undefined, as('c9-ben'), 404);
  await call(`/work/${ticket.id}/shares`, { email: 'c9-ana@example.test' }, as('c9-ben'), 404);
  await call(`/work/${ticket.id}/shares`, { email: 'nobody@example.test' }, as('c9-ana'), 422);
  const shared = await call(`/work/${ticket.id}/shares`, { email: 'C9-BEN@example.test' }, as('c9-ana'), 201);
  assert.deepEqual(shared.items.map(s => [s.user_id, s.revoked_at]), [['c9-ben', null]], 'CHANNEL-009 the requester shares with a named colleague');
  const seen = await call(`/work/${ticket.id}`, undefined, as('c9-ben'));
  assert.equal(seen.work.access, 'shared');
  assert.ok(seen.messages.some(m => m.body === 'My laptop fan runs all day.'), 'CHANNEL-009 the colleague reads the public thread');
  assert.ok(!seen.messages.some(m => m.visibility === 'private' || m.body.includes('warranty case')), 'CHANNEL-009 the colleague never sees the private note');
  assert.ok((await call('/work', undefined, as('c9-ben'))).items.some(w => w.id === ticket.id), 'CHANNEL-009 a shared request lists for the colleague');
  await call(`/work/${ticket.id}/messages`, { body: 'Mine did this too; a BIOS update fixed it.', visibility: 'public', sourceMessageId: 'c9-ben-reply' }, as('c9-ben'), 201);
  await call(`/work/${ticket.id}/messages`, { body: 'Sneaky note', visibility: 'private', sourceMessageId: 'c9-ben-private' }, as('c9-ben'), 404);
  assert.ok((await call(`/work/${ticket.id}`, undefined, as('c9-ana'))).messages.some(m => m.author_id === 'c9-ben' && m.visibility === 'public'), 'CHANNEL-009 the colleague replies on the public thread');
  await call(`/work/${ticket.id}/shares/c9-ben/revoke`, {}, as('c9-cy'), 404);
  await call(`/work/${ticket.id}/shares/c9-ben/revoke`, {}, as('c9-ana'));
  await call(`/work/${ticket.id}`, undefined, as('c9-ben'), 404);
  await call(`/work/${ticket.id}/messages`, { body: 'After revoke', visibility: 'public', sourceMessageId: 'c9-ben-late' }, as('c9-ben'), 404);
  const history = await call(`/work/${ticket.id}/shares`, undefined, as('c9-ana'));
  assert.ok(history.items[0].revoked_at, 'CHANNEL-009 a revoked share stays on the record');
  const events = (await db.prepare("SELECT action FROM audit_events WHERE workspace_id='a' AND target=? AND action LIKE 'work.share%' ORDER BY created_at,rowid").bind(ticket.id).all()).results.map(e => e.action);
  assert.deepEqual(events, ['work.shared', 'work.share_revoked'], 'CHANNEL-009 every share and revoke is audited');
  const hrTicket = await call('/work', { title: 'Accommodation request', body: 'Private', sensitivity: 'hr', beneficiaryId: 'c9-cy', deduplicationKey: 'c9-hr' }, undefined, 201);
  const restricted = await call('/work', { title: 'Security incident on my account', body: 'Possible phishing', sensitivity: 'restricted', beneficiaryId: 'c9-ana', deduplicationKey: 'c9-restricted' }, undefined, 201);
  await call(`/work/${restricted.id}`, undefined, as('c9-ana'));
  await call(`/work/${restricted.id}/shares`, { email: 'c9-ben@example.test' }, as('c9-ana'), 422);
  // On behalf: a people partner files for Cy (filing for someone else is the service team's or HR's today); both see it.
  const hrp = { 'x-user': 'c9-hrp', 'x-roles': '["hr"]' };
  const behalf = await call('/work', { title: 'Monitor for Cy', body: 'Cy needs a second monitor.', beneficiaryId: 'c9-cy', deduplicationKey: 'c9-behalf' }, hrp, 201);
  for (const who of [hrp, as('c9-cy')]) assert.ok((await call('/work', undefined, who)).items.some(w => w.id === behalf.id), 'CHANNEL-009 an on-behalf request shows to the submitter and the beneficiary');
  await call(`/work/${behalf.id}`, undefined, as('c9-ben'), 404);
  // My team's requests: Mia sees Ana's and Cy's requests, not Cy's HR ticket; the director sees them through Mia.
  const team = (u) => call('/team-requests', undefined, as(u)).then(r => r.items.map(w => w.id).sort());
  assert.deepEqual(await team('c9-mia'), [ticket.id, behalf.id].sort(), 'CHANNEL-009 a manager sees two reports\' requests but not the HR or restricted ticket');
  assert.deepEqual(await team('c9-dir'), [ticket.id, behalf.id].sort(), 'CHANNEL-009 indirect reports follow the reporting line');
  assert.deepEqual(await team('c9-noah'), []);
  const managerView = await call(`/work/${ticket.id}`, undefined, as('c9-mia'));
  assert.deepEqual([managerView.work.access, managerView.work.canReply], ['team', false]);
  assert.ok(!managerView.messages.some(m => m.visibility === 'private'), 'CHANNEL-009 a manager never sees private notes');
  await call(`/work/${hrTicket.id}`, undefined, as('c9-mia'), 404);
  await call(`/work/${restricted.id}`, undefined, as('c9-mia'), 404);
  await call(`/work/${ticket.id}/messages`, { body: 'Manager reply', visibility: 'public', sourceMessageId: 'c9-mia-reply' }, as('c9-mia'), 404);
  // The HRIS moves Ana to Noah: Mia loses her requests at once and Noah gains them.
  await call('/people', { source: 'hris-c9', sourceId: 'c9-ana', name: 'ana', managerId: 'c9-noah', effectiveAt: '2026-06-01T00:00:00Z', observedAt: '2026-06-01T00:00:00Z' }, undefined, 201);
  assert.deepEqual(await team('c9-mia'), [behalf.id], 'CHANNEL-009 after the HRIS change the old manager loses visibility');
  assert.deepEqual(await team('c9-noah'), [ticket.id], 'CHANNEL-009 and the new manager gains it');
  await call(`/work/${ticket.id}`, undefined, as('c9-mia'), 404);
  assert.equal((await call(`/work/${ticket.id}`, undefined, as('c9-noah'))).work.access, 'team');
  console.log('PASS CHANNEL-009 public routes: share by work email, colleague reads and replies without private notes, revoke and audit; on-behalf for both; manager team view over direct and indirect reports without HR tickets; HRIS manager change moves visibility');
}


/** DESK-007 email slice; Slack remains blocked by CHANNEL-001. Paid mail is intercepted only at the network edge. */
export async function collaborationChecks(api,db) {
  const check=(r,status=200)=>{assert.equal(r.status,status,'DESK-007 '+JSON.stringify(r));return r.value;};
  const staff={'x-user':'synthetic-linen-1','x-roles':'["operator"]'},employee={'x-user':'employee','x-roles':'["employee"]'};
  await db.exec(`INSERT INTO users VALUES('synthetic-linen-1','synthetic-linen-1@example.test','synthetic-linen-1','unused','2026-01-01'); INSERT INTO memberships VALUES('a','synthetic-linen-1','["operator"]',1);`);
  const ticket=check(await api('/work',{title:'synthetic-linen-3',body:'synthetic-linen-4',deduplicationKey:'synthetic-linen-5'},employee),201);
  const base='/work/'+ticket.id,consent={consent:true,reason:'synthetic-linen-6'};
  check(await api(base+'/collaboration',undefined,employee),403);
  check(await api(base+'/collaboration',undefined,staff),403);
  const note={...consent,body:'synthetic-linen-7 private diagnosis',mentions:['synthetic-linen-1'],sourceMessageId:'synthetic-linen-8'};
  check(await api(base+'/mentions',{...note,consent:false}),422);
  check(await api(base+'/mentions',{...note,mentions:['employee']}),422);
  const mention=check(await api(base+'/mentions',note),201);
  assert.equal(check(await api(base+'/mentions',note),201).id,mention.id,'DESK-007 replay does not duplicate mention or note');
  check(await api(base+'/mentions',{...note,body:'synthetic-linen-9'}),409);
  assert.ok(check(await api('/collaboration/inbox',undefined,staff)).items.some(n=>n.message_id===mention.id&&n.kind==='mention'),'DESK-007 mentioned colleague is notified');
  assert.ok(check(await api(base,undefined,staff)).messages.some(m=>m.id===mention.id&&m.visibility==='private'));
  assert.ok(!JSON.stringify(check(await api(base,undefined,employee))).includes(note.body),'DESK-007 employee cannot see private mentions');
  check(await api(base+'/watchers',{...consent,userId:'stranger'}),422);
  check(await api(base+'/watchers',{...consent,userId:'employee'}));
  const publicMessage=check(await api(base+'/messages',{body:'synthetic-linen-10',visibility:'public',sourceMessageId:'synthetic-linen-11'}),201);
  const ownInbox=check(await api('/collaboration/inbox',undefined,employee));
  assert.ok(ownInbox.items.some(n=>n.message_id===publicMessage.id&&n.kind==='watch'));
  assert.ok(!JSON.stringify(ownInbox).includes(note.body),'DESK-007 inbox carries identifiers only');
  assert.ok(!ownInbox.items.some(n=>n.kind==='mention'));
  const key=await crypto.subtle.importKey('raw',Buffer.alloc(32),'AES-GCM',false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify({apiKey:'synthetic-linen-12'})));
  const secret=Buffer.from(iv).toString('base64')+'.'+Buffer.from(cipher).toString('base64');
  await db.prepare("INSERT INTO connections VALUES('synthetic-linen-13','a','sendgrid','synthetic-linen-14',?,?,'active',1,?,?)")
    .bind(JSON.stringify({from:'synthetic-linen-15@example.test'}),secret,new Date().toISOString(),new Date().toISOString()).run();
  const mail={...consent,conversationId:'synthetic-linen-16',connectionId:'synthetic-linen-13',vendorEmail:'synthetic-linen-17@example.test',body:'synthetic-linen-18 exact vendor question',sourceMessageId:'synthetic-linen-19'};
  check(await api(base+'/side-conversations',mail,employee),403);
  check(await api(base+'/side-conversations',{...mail,consent:false}),422);
  const sent=check(await api(base+'/side-conversations',mail),201);
  assert.equal(sent.state,'accepted');
  assert.equal(check(await api(base+'/side-conversations',mail),201).id,sent.id,'DESK-007 a lost response cannot resend');
  check(await api(base+'/side-conversations',{...mail,body:'synthetic-linen-20'}),409);
  const calls=check(await api('/test/side-mail')).calls;
  assert.equal(calls.length,1);assert.deepEqual(calls[0].personalizations[0].to,[{email:mail.vendorEmail}]);
  assert.deepEqual(calls[0].content,[{type:'text/plain',value:mail.body}],'DESK-007 only the consented draft leaves Linen');
  assert.ok(!JSON.stringify(calls).includes(note.body));assert.equal(calls[0].attachments,undefined);
  const envelope={connectionId:mail.connectionId,sourceMessageId:'synthetic-linen-21',sender:mail.vendorEmail,subject:'synthetic-linen-22',text:'synthetic-linen-23 vendor diagnosis',inReplyTo:sent.mailMessageId};
  assert.equal(check(await api('/mail/intake',{...envelope,sender:'synthetic-linen-24@example.test'})).state,'quarantined');
  assert.equal(check(await api('/mail/intake',{...envelope,inReplyTo:'synthetic-linen-25'})).state,'quarantined');
  const received=check(await api('/mail/intake',envelope));assert.equal(received.state,'accepted');
  assert.equal(check(await api('/mail/intake',envelope)).messageId,received.messageId);
  check(await api('/mail/intake',{...envelope,text:'synthetic-linen-26'}),409);
  assert.ok(check(await api(base,undefined,staff)).messages.some(m=>m.id===received.messageId&&m.visibility==='private'&&m.body.includes(envelope.text)));
  const employeeView=JSON.stringify(check(await api(base,undefined,employee)));
  for(const text of [note.body,mail.body,mail.vendorEmail,envelope.text])assert.ok(!employeeView.includes(text),'DESK-007 employee sees no private side content');
  check(await api(base+'/side-conversations/'+mail.conversationId+'/messages',{...consent,body:'synthetic-linen-27 follow-up',sourceMessageId:'synthetic-linen-28'}),201);
  assert.equal(check(await api('/test/side-mail')).calls.length,2);
  // Uncertain sends keep their durable state and are never repeated by replay.
  check(await api('/test/side-mail',{mode:'unknown'}));
  const uncertain={...consent,body:'synthetic-linen-29',sourceMessageId:'synthetic-linen-30'};
  assert.equal(check(await api(base+'/side-conversations/'+mail.conversationId+'/messages',uncertain),201).state,'unknown');
  assert.equal(check(await api(base+'/side-conversations/'+mail.conversationId+'/messages',uncertain),201).state,'unknown');
  assert.equal(check(await api('/test/side-mail')).calls.length,3);
  check(await api('/test/side-mail',{mode:'accepted'}));
  // Exact connection revision and current ownership are required for replies and sends.
  await db.prepare('UPDATE connections SET revision=2 WHERE id=?').bind(mail.connectionId).run();
  assert.equal(check(await api('/mail/intake',{...envelope,sourceMessageId:'synthetic-linen-31'})).state,'quarantined');
  check(await api(base+'/side-conversations/'+mail.conversationId+'/messages',{...consent,body:'synthetic-linen-32',sourceMessageId:'synthetic-linen-33'}),409);
  await db.prepare('UPDATE connections SET revision=1 WHERE id=?').bind(mail.connectionId).run();
  check(await api(base+'/side-conversations/'+mail.conversationId+'/close',consent));
  assert.equal(check(await api('/mail/intake',{...envelope,sourceMessageId:'synthetic-linen-34'})).state,'quarantined');
  check(await api(base+'/side-conversations/'+mail.conversationId+'/messages',{...consent,body:'synthetic-linen-35',sourceMessageId:'synthetic-linen-36'}),409);
  await db.prepare('UPDATE memberships SET roles_json=? WHERE workspace_id=? AND user_id=?').bind('["employee"]','a','synthetic-linen-1').run();
  assert.deepEqual(check(await api('/collaboration/inbox',undefined,staff)).items,[],'DESK-007 role withdrawal hides private notifications');
  check(await api(base+'/watchers',{...consent,userId:'employee',remove:true}));
  assert.deepEqual(check(await api('/collaboration/inbox',undefined,employee)).items,[]);
  const restricted=check(await api('/work',{title:'synthetic-linen-37',body:'synthetic-linen-38',sensitivity:'restricted',deduplicationKey:'synthetic-linen-39'}),201);
  check(await api('/work/'+restricted.id+'/side-conversations',{...mail,conversationId:'synthetic-linen-40'}),403);
  const cross=await api(base+'/collaboration',undefined,{'x-workspace':'synthetic-linen-41'});assert.ok([403,404].includes(cross.status));
  const audits=(await db.prepare("SELECT action,detail_json FROM audit_events WHERE workspace_id='a' AND target=? AND action LIKE 'work.collaboration.%'").bind(ticket.id).all()).results;
  assert.ok(audits.some(a=>a.action==='work.collaboration.mentioned'&&JSON.parse(a.detail_json).reason===consent.reason));
  assert.ok(audits.some(a=>a.action==='work.collaboration.email_consented'));
  check(await api(base+'/watchers',{...consent,userId:'employee'}));
  check(await api(base+'/messages',{body:'synthetic-linen-53',visibility:'public',sourceMessageId:'synthetic-linen-54'}),201);
  assert.ok(check(await api('/collaboration/inbox',undefined,employee)).items.some(n=>n.work_id===ticket.id),'DESK-007 live watcher and notice remain for the public erasure flow');
  // Preserve this ticket for the suite's existing public erasure flow, and prove all new personal metadata is gone afterward there.
  return {workId:ticket.id};
}

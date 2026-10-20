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

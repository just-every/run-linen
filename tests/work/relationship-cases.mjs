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

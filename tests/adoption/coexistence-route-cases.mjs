import assert from 'node:assert/strict';

// These are provider payloads, not application records or substitute service results.
function sourceRecord(id, revision, conversations = [], status = 2) {
  return {
    ticket: { id, workspace_id: 1, requester_id: 3601, subject: `Synthetic request ${id}`, description: 'Synthetic source request', status, updated_at: revision },
    conversations,
    approvalGroups: [{ id: 7, approval_status: { id: 1, name: 'Approved' } }],
  };
}

async function rejected(request, path, body, owner, code, status = 409) {
  const response = await request(path, 'POST', body, owner);
  assert.equal(response.status, status, `${path}: ${await response.clone().text()}`);
  assert.equal((await response.json()).error.code, code);
}

/** One public-route journey; the existing adoption registration owns its execution. */
export async function coexistenceRouteChecks(ok, request, auth, owner) {
  // Keep source history and ownership out of other journeys' archive-count assertions.
  const tenant = await ok('/fixtures/tenant', 'POST', {}, owner);
  const session = await auth(await request('/login', 'POST', { email: tenant.email, password: 'destination secure password' }));
  const credential = 'synthetic-linen-3601';
  const base = Date.now() - 60_000;
  const [initialRevision, changedRevision, lateRevision, afterCutoverRevision] = [0, 1000, 2000, 3000].map(offset => new Date(base + offset).toISOString());
  const publicNote = { id: 3602, private: false, body: 'Synthetic public source reply', attachments: [] };
  const privateNote = { id: 3603, private: true, body: 'Synthetic private source diagnosis', attachments: [] };
  const otherTicket = sourceRecord(43, initialRevision, [{ id: 3604, private: false, body: 'Separate source request', attachments: [] }]);
  const initial = sourceRecord(42, initialRevision, [publicNote, privateNote]);
  await ok('/fixtures/freshservice-network', 'POST', { credential, records: [initial, otherTicket] }, session);
  const connection = await ok('/connections', 'POST', {
    provider: 'freshservice', name: 'Synthetic coexistence desk', config: { domain: 'fixture.freshservice.com' }, secret: credential,
  }, session, 201);
  const connections = await ok('/connections', 'GET', undefined, session);
  assert.equal(connections.find(row => row.id === connection.id).has_secret, 1);
  assert.ok(!JSON.stringify(connections).includes(credential), 'Public connection reads never expose the encrypted credential');

  const source = await ok('/adoption/sources', 'POST', { connectionId: connection.id, sourceWorkspace: 1, since: new Date(base - 1000).toISOString() }, session, 201);
  const sourcePath = `/adoption/sources/${source.id}`;
  const readRecords = async () => {
    const result = await ok(`${sourcePath}/records`, 'GET', undefined, session);
    assert.equal(result.cursor, null);
    return result.data;
  };
  const readSource = async () => (await ok('/adoption/sources', 'GET', undefined, session)).find(row => row.id === source.id);
  const setNetwork = record => ok('/fixtures/freshservice-network', 'PUT', { credential, records: [record, otherTicket] }, session);
  const checkpoint = async revision => {
    const state = await readSource();
    assert.equal(state.state, 'current');
    assert.equal(state.checkpoint, revision);
  };
  assert.equal((await ok(`${sourcePath}/poll`, 'POST', {}, session)).count, 2);
  await checkpoint(initialRevision);
  const firstRecords = await readRecords();
  assert.equal(firstRecords.length, 2);
  const first = firstRecords.find(row => row.external_id === '42');
  assert.equal(first.source_id, source.id);
  assert.equal(first.state, 'unresolved');
  assert.deepEqual(JSON.parse(first.payload_json).conversations, [publicNote, privateNote]);
  await ok(`${sourcePath}/poll`, 'POST', {}, session);
  assert.deepEqual((await readRecords()).map(row => row.id).sort(), firstRecords.map(row => row.id).sort(), 'Overlapping delta replays preserve record identity');

  // The existing effect probe uses this resource; sourceTicketId must bind it to 42.
  const scope = { resource: 'target', action: 'fixture.action', sourceId: source.id, sourceTicketId: 42, approvalId: 7, incumbentDisabledEvidence: 'Synthetic incumbent executor has been disabled' };
  const ownership = await ok('/adoption/ownership', 'POST', scope, session);
  assert.equal(ownership.sourceRevision, initialRevision);
  await rejected(request, '/adoption/ownership', scope, session, 'ownership_revision_conflict');
  const ownershipPath = `/adoption/ownership/${ownership.id}`;

  const changedPublic = { id: 3605, private: false, body: 'Synthetic changed public source reply', attachments: [] };
  const changedPrivate = { id: 3606, private: true, body: 'Synthetic changed private source note', attachments: [
    { id: 3607, name: 'synthetic-linen-3607.txt', content_type: 'text/plain', size: 28, attachment_url: 'https://fixture.freshservice.com/attachments/3607' },
  ] };
  const changed = sourceRecord(42, changedRevision, [publicNote, privateNote, changedPublic, changedPrivate], 5);
  await setNetwork(changed);
  await ok(`${sourcePath}/poll`, 'POST', {}, session);
  await checkpoint(changedRevision);
  let records = await readRecords();
  assert.equal(records.length, 3);
  const changedRow = records.find(row => row.external_id === '42' && row.revision === changedRevision);
  const changedPayload = JSON.parse(changedRow.payload_json);
  assert.equal(changedPayload.ticket.id, 42);
  assert.equal(changedPayload.ticket.status, 5, 'Closed source status is retained for reconciliation');
  assert.deepEqual(changedPayload.conversations, changed.conversations);
  assert.equal(changedPayload.attachmentState, 'requires_scoped_attachment_import');
  assert.deepEqual(JSON.parse(records.find(row => row.external_id === '43').payload_json).ticket, otherTicket.ticket);
  await rejected(request, '/fixtures/effect', {}, session, 'executor_not_owned');
  // One changed source record advanced this ownership's optimistic revision.
  const changedOwnershipRevision = ownership.revision + 1;
  await rejected(request, `${ownershipPath}/cutover`, { revision: changedOwnershipRevision, checkpoint: initialRevision }, session, 'delta_checkpoint_changed');
  const held = await ok(`${ownershipPath}/cutover`, 'POST', { revision: changedOwnershipRevision, checkpoint: changedRevision }, session);
  await rejected(request, '/fixtures/effect', {}, session, 'executor_not_owned');
  await rejected(request, `${ownershipPath}/complete-cutover`, { revision: held.revision }, session, 'source_records_require_reconciliation');

  const lateNote = { id: 3608, private: false, body: 'Synthetic arrival while final cutover was held', attachments: [] };
  const late = sourceRecord(42, lateRevision, [...changed.conversations, lateNote], 5);
  await setNetwork(late);
  await ok(`${sourcePath}/poll`, 'POST', {}, session);
  await checkpoint(lateRevision);
  records = await readRecords();
  const lateRow = records.find(row => row.revision === lateRevision);
  assert.equal(lateRow.external_id, '42');
  assert.equal(lateRow.source_id, source.id);
  assert.equal(lateRow.state, 'unresolved');
  assert.deepEqual(JSON.parse(lateRow.payload_json).conversations, late.conversations);
  await rejected(request, `${ownershipPath}/complete-cutover`, { revision: held.revision }, session, 'cutover_not_held');
  await rejected(request, '/fixtures/effect', {}, session, 'executor_not_owned');

  // Owner reconciliation is explicit through the public record-specific command.
  for (const row of records) {
    const result = await ok(`${sourcePath}/records/${row.id}/reconcile`, 'POST', { evidence: `Synthetic review of source ticket ${row.external_id} at ${row.revision}` }, session);
    assert.equal(result.state, 'reconciled');
  }
  assert.ok((await readRecords()).every(row => row.state === 'reconciled'));
  const finalHeld = await ok(`${ownershipPath}/cutover`, 'POST', { revision: held.revision + 1, checkpoint: lateRevision }, session);
  const completed = await ok(`${ownershipPath}/complete-cutover`, 'POST', { revision: finalHeld.revision }, session);
  assert.equal(completed.state, 'active');
  assert.ok(completed.fence > finalHeld.fence);
  assert.equal((await ok('/fixtures/effect', 'POST', {}, session)).permitted, true);

  const postCutoverNote = { id: 3609, private: true, body: 'Synthetic source note after successful cutover', attachments: [] };
  const postCutover = sourceRecord(42, afterCutoverRevision, [...late.conversations, postCutoverNote], 5);
  await setNetwork(postCutover);
  await ok(`${sourcePath}/poll`, 'POST', {}, session);
  records = await readRecords();
  const postCutoverRow = records.find(row => row.revision === afterCutoverRevision);
  assert.equal(postCutoverRow.external_id, '42');
  assert.equal(postCutoverRow.source_id, source.id);
  assert.equal(postCutoverRow.state, 'unresolved');
  assert.deepEqual(JSON.parse(postCutoverRow.payload_json).conversations, postCutover.conversations);
  assert.equal(records.filter(row => row.external_id === '43').length, 1, 'Late source data remains on its original ticket key');
  await ok(`${sourcePath}/poll`, 'POST', {}, session);
  assert.equal((await readRecords()).length, records.length, 'Post-cutover delta replay creates no duplicate reconciliation');
  const network = await ok('/fixtures/freshservice-network', 'POST', { credential, inspect: true }, session);
  assert.ok(network.calls.some(call => call.path === '/api/v2/tickets' && call.since === initialRevision && call.workspace === 1));
  assert.ok(network.calls.some(call => call.ticketId === 42 && call.path.endsWith('/approval-groups')));
  assert.ok(network.calls.every(call => call.method === 'GET'), 'This journey produces no provider writes');
  console.log('PASS public Freshservice coexistence routes: encrypted connection, retained public/private revisions and attachment metadata, replay, duplicate ownership, stale/late cutover fences, explicit reconciliation, completed cutover and correctly keyed post-cutover source arrival (network fixture only)');
}

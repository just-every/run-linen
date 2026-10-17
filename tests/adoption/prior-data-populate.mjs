import assert from 'node:assert/strict';
const password = 'synthetic-Prior-data-proof-2026';
const at = offset => new Date(Date.now() + offset).toISOString();

export async function populatePriorData(h) {
  const setup = await h.request('/setup', { name: 'Prior Owner', workspaceName: 'Prior Linen workspace', email: 'upgrade-owner@example.test', password });
  assert.equal(setup.status, 201, await setup.clone().text());
  const owner = await h.authenticate(setup);
  const create = (path, body, auth = owner) => h.ok(path, body, auth, 'POST', 201);
  const write = (path, body, auth = owner) => h.ok(path, body, auth);
  const read = (path, auth = owner) => h.ok(path, undefined, auth);
  await h.ok('/__fixture/init', {});
  const employeeRecord = await create('/members', { name: 'Prior Employee', email: 'upgrade-employee@example.test', password, roles: ['employee'] });
  const issuerRecord = await create('/members', { name: 'Independent Approver', email: 'upgrade-issuer@example.test', password, roles: ['owner', 'approver'] });
  const employee = await h.login('upgrade-employee@example.test', password);
  const issuer = await h.login('upgrade-issuer@example.test', password);
  const retired = await create('/members', { name: 'Retired Member', email: 'upgrade-retired@example.test', password, roles: ['operator'] });
  const retiredSession = await h.login('upgrade-retired@example.test', password);
  await h.ok('/members/' + retired.id, { roles: ['operator'], active: false }, owner, 'PATCH');
  const work = await create('/work', { title: 'Prior employee conversation', body: 'Public original request', deduplicationKey: 'prior-request' }, employee);
  await create('/work/' + work.id + '/messages', { body: 'Public operator reply', visibility: 'public', sourceMessageId: 'prior-public' });
  await create('/work/' + work.id + '/messages', { body: 'Private operator assessment', visibility: 'private', sourceMessageId: 'prior-private' });
  const attachments = [];
  for (const visibility of ['public', 'private']) {
    const bytes = Buffer.from(`Prior ${visibility} bytes\u0000 retained across migration`);
    const uploaded = await h.request('/work/' + work.id + '/attachments', bytes, owner, 'POST', { 'Content-Type': 'application/octet-stream', 'X-Filename': visibility + '.bin', 'X-Visibility': visibility });
    assert.equal(uploaded.status, 201, await uploaded.clone().text());
    attachments.push({ ...(await uploaded.json()), visibility, bytes });
  }
  const personInput = { source: 'prior-hr', sourceId: 'employee-1', name: 'Prior HR Person', managerId: owner.userId, effectiveAt: at(-60000), observedAt: at(0) };
  const person = await create('/people', personInput);
  const asset = await create('/assets', { serial: 'PRIOR-LAPTOP-001', source: 'Prior device inventory', location: 'Brisbane' });
  await write('/assets/' + asset.id + '/commands', { revision: 1, command: 'assign', personId: person.id, evidence: 'Prior signed assignment receipt' });
  await write('/assets/' + asset.id + '/commands', { revision: 2, command: 'receive', personId: person.id, evidence: 'Prior actual physical receipt' });
  const lifecycle = await create('/lifecycle', { personId: person.id, kind: 'leave', effectiveAt: at(86400000), timezone: 'Australia/Brisbane', source: 'prior-hr', sourceRevision: 1, retained: [], added: [], removed: ['design-group'], deviceIds: [asset.id], ownerId: owner.userId });
  const catalog = await create('/catalog', { name: 'Prior temporary access', kind: 'access', target: 'design-group', ownerId: owner.userId, requiresManager: false });
  await create('/work/' + work.id + '/fulfilment', { catalogId: catalog.id, beneficiaryId: employeeRecord.id, purpose: 'Prior project', expiresAt: at(86400000) }, employee);
  const calendar = await create('/calendars', { name: 'Owner Brisbane hours', timezone: 'Australia/Brisbane', weekdays: [1, 2, 3, 4, 5], startHour: 9, endHour: 17, holidays: ['2026-12-25'] });
  await write('/work/' + work.id + '/commitment', { calendarId: calendar.id, responseMinutes: 30, resolutionMinutes: 240 });
  const knowledge = await create('/knowledge', { title: 'Prior reviewed remedy', body: 'Owner-authored retained instructions', scope: 'employees', review: true, expiresAt: at(86400000) });
  await create('/knowledge', { title: 'Prior private remedy', body: 'Private owner instructions', scope: 'operators', review: true, expiresAt: at(86400000) });
  const escalated = await create('/knowledge/' + knowledge.id + '/escalate', { question: 'This remedy did not restore my work', deduplicationKey: 'prior-escalation' }, employee);
  await h.ok('/settings', { revision: 1, settings: { retentionDays: 91 } }, owner, 'PATCH');
  await h.ok('/adoption/retention', { archiveDays: 14, revision: 0 }, owner, 'PUT');
  const erasedInput = { source: 'prior-hr', sourceId: 'erased-before-update', name: 'Person to erase', effectiveAt: at(-60000), observedAt: at(0) };
  const erasedPerson = await create('/people', erasedInput);
  await write('/people/' + erasedPerson.id + '/erase', { revision: 1, reason: 'Owner-requested prior erasure' });

  // The ordinary connection/grant/plan/dispatch APIs create a true unknown effect.
  const graph = await create('/connections', { provider: 'microsoft-graph', name: 'Prior fixture directory', config: { tenantId: '11111111-1111-1111-1111-111111111111' }, secret: JSON.stringify({ clientId: 'fixture-app', clientSecret: 'fixture-secret' }) });
  await write('/connections/' + graph.id + '/test', { revision: 1 });
  const probe = await create('/connections', { provider: 'workflow-probe', name: 'Prior independent verifier', config: { url: 'https://probe.example.com/observe', allowedHosts: ['probe.example.com'] }, secret: JSON.stringify({ token: 'fixture-probe' }) });
  await write('/connections/' + probe.id + '/test', { revision: 1 });
  await create('/subject-mappings', { connectionId: graph.id, localUserId: employeeRecord.id, providerSubject: 'provider-colleague' });
  const connection = (await read('/connections')).find(c => c.id === graph.id);
  const verification = (await read('/connections')).find(c => c.id === probe.id);
  const grant = await create('/grants', { principalId: owner.userId, beneficiaryId: 'provider-colleague', localBeneficiaryId: employeeRecord.id, action: 'group.add', actionVersion: 1, target: 'prior-unknown-group', connectionId: graph.id, validFrom: at(-60000), validUntil: at(86400000), maxUses: 3, conditions: {}, verifierConnectionId: probe.id }, issuer);
  const step = { action: 'group.add', actionVersion: 1, target: 'prior-unknown-group', beneficiaryId: 'provider-colleague', localBeneficiaryId: employeeRecord.id, connectionId: graph.id, connectionRevision: connection.revision, verifierConnectionId: probe.id, verifierConnectionRevision: verification.revision, grantId: grant.id, grantVersion: grant.version };
  const plan = await create('/plans', { workId: work.id, revision: (await read('/work/' + work.id)).work.revision, steps: [step], idempotencyKey: 'prior-unknown-effect' });
  await write('/plans/' + plan.id + '/dispatch', { expectedRevision: plan.revision });
  await h.ok('/__fixture/state', { lostReceipt: true, probeUnknown: true });
  await write('/execution/process', {});
  const operation = (await read('/operations')).find(o => o.plan_id === plan.id);
  assert.ok(operation && !['verified', 'effect_verified', 'failed', 'queued'].includes(operation.state), 'Lost receipt must create durable uncertainty: ' + JSON.stringify(operation));
  await write('/grants/' + grant.id + '/revoke', { version: grant.version }, issuer);
  await h.ok('/settings', { revision: 2, settings: { retentionDays: 91, executionHeld: true } }, owner, 'PATCH');
  assert.equal((await h.request('/session', undefined, retiredSession)).status, 401);
  return { owner, employee, issuer, retiredSession, issuerRecord, work, attachments, person, personInput, asset, lifecycle, catalog, knowledge, escalated, erasedInput, grant, plan, operation, password };
}

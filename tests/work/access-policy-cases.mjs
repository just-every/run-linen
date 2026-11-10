import assert from 'node:assert/strict';

/** LIFE-003: owner-managed access policies drive join/move/leave baselines through the real routes. */
export async function accessPolicyChecks(api, db) {
  const ok = async (path, body, headers = {}) => { const r = await api(path, body, headers); assert.ok(r.status < 300, `${path}: ${JSON.stringify(r)}`); return r.value; };
  const as = (user, role) => ({ 'x-user': user, 'x-roles': JSON.stringify([role]) });
  for (const [user, role] of [['pol-hr', 'hr'], ['pol-emp', 'employee'], ['pol-bot', 'integration']]) {
    await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(user, user + '@example.test', user, 'unused', '2026-01-01').run();
    await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a', user, JSON.stringify([role])).run();
  }
  const value = (dimension, label) => ok('/catalog-values', { dimension, label });
  const sales = await value('department', 'Sales'), marketing = await value('department', 'Marketing');
  const ae = await value('title', 'Account executive'), austin = await value('location', 'Austin');
  const w2 = await value('employmentType', 'W-2 employee'), contractor = await value('employmentType', '1099 contractor');
  const grants = (...targets) => targets.map(([kind, target]) => ({ kind, target }));
  const policy = (name, match, ...targets) => ok('/access-policies', { name, match, grants: grants(...targets) });

  assert.equal((await api('/access-policies', { name: 'x', match: {}, grants: grants(['group', 'x']) }, as('pol-hr', 'hr'))).status, 403, 'LIFE-003 only the owner writes policies');
  assert.equal((await api('/access-policies', { name: 'x', match: {}, grants: grants(['group', 'x']) }, as('pol-bot', 'integration'))).status, 403, 'LIFE-003 integrations cannot write policies');
  assert.equal((await api('/access-policies', undefined, as('pol-emp', 'employee'))).status, 403, 'LIFE-003 employees cannot read baselines');
  assert.equal((await api('/access-policies', { name: 'x', match: { department: ['not-a-value'] }, grants: grants(['group', 'x']) })).status, 409, 'LIFE-003 policies match defined values only');
  assert.equal((await api('/access-policies', { name: 'x', match: { team: [sales.id] }, grants: grants(['group', 'x']) })).status, 422, 'LIFE-003 known dimensions only');
  assert.equal((await api('/access-policies', { name: 'x', match: {}, grants: [{ kind: 'mailbox', target: 'x' }] })).status, 422, 'LIFE-003 entitlement kinds are group, app or license');

  const everyone = await policy('Everyone', {}, ['group', 'slack']);
  const salesPolicy = await policy('Sales apps', { department: [sales.id] }, ['app', 'salesforce'], ['group', 'sales-all']);
  const marketingPolicy = await policy('Marketing apps', { department: [marketing.id] }, ['app', 'hubspot']);
  await policy('Account executives', { title: [ae.id], department: [sales.id] }, ['license', 'quota-dashboard']);
  await policy('Austin office', { location: [austin.id] }, ['group', 'austin-vpn']);
  await policy('Employee benefits', { employmentType: [w2.id] }, ['app', 'benefits-portal']);
  assert.equal((await api(`/access-policies/${salesPolicy.id}`, { revision: 7, active: true, name: 'Sales apps', match: salesPolicy.match, grants: salesPolicy.grants })).status, 409, 'LIFE-003 stale policy edits refuse');
  const listed = (await ok('/access-policies', undefined, as('pol-hr', 'hr'))).items;
  assert.equal(listed.length, 6, 'LIFE-003 HR reads the baselines it reviews');

  const person = async name => ok('/people', { source: 'policy-hr', sourceId: name, name, effectiveAt: '2026-01-01T00:00:00.000Z', observedAt: '2026-01-01T00:00:00.000Z' });
  const record = (p, kind, source, extra) => api('/lifecycle', { personId: p.id, kind, effectiveAt: '2026-09-01T00:00:00Z', timezone: 'UTC', source, sourceRevision: 1, ownerId: 'owner', identityTarget: p.id, retained: [], added: [], removed: [], deviceIds: [], ...extra });
  const duties = async lifecycleId => (await ok(`/lifecycle/${lifecycleId}`)).obligations.filter(o => o.kind.startsWith('access.')).map(o => `${o.kind}:${o.target}`).sort();
  const context = async result => JSON.parse((await ok(`/work/${result.work.id}`)).work.context_json);
  const salesW2 = { department: sales.id, title: ae.id, location: austin.id, employmentType: w2.id };

  // A join grants every policy that matches the new reviewed values.
  const sam = await person('Sam Sales');
  const join = await record(sam, 'join', 'pol-join', { baseline: { to: salesW2 } });
  assert.equal(join.status, 201, JSON.stringify(join));
  assert.deepEqual(await duties(join.value.lifecycleId), ['access.grant:austin-vpn', 'access.grant:benefits-portal', 'access.grant:quota-dashboard', 'access.grant:sales-all', 'access.grant:salesforce', 'access.grant:slack'],
    'LIFE-003 a join grants the baseline for department, title, location and employment type');
  // A 1099 contractor matches neither the benefits nor the sales title policy.
  const cam = await person('Cam Contractor');
  const contract = await record(cam, 'join', 'pol-contract', { baseline: { to: { department: marketing.id, location: austin.id, employmentType: contractor.id } } });
  assert.deepEqual(await duties(contract.value.lifecycleId), ['access.grant:austin-vpn', 'access.grant:hubspot', 'access.grant:slack'], 'LIFE-003 a 1099 baseline omits benefits');

  // A move computes retained, added and removed access for review.
  const move = await record(sam, 'move', 'pol-move', { sourceRevision: 2, baseline: { from: salesW2, to: { department: marketing.id, location: austin.id, employmentType: w2.id } } });
  assert.equal(move.status, 201, JSON.stringify(move));
  assert.deepEqual(await duties(move.value.lifecycleId), ['access.grant:hubspot', 'access.revoke:quota-dashboard', 'access.revoke:sales-all', 'access.revoke:salesforce'], 'LIFE-003 Sales to Marketing adds HubSpot and removes Salesforce');
  const reviewed = (await context(move.value)).baseline;
  assert.deepEqual([reviewed.retained, reviewed.added, reviewed.removed], [['austin-vpn', 'benefits-portal', 'slack'], ['hubspot'], ['quota-dashboard', 'sales-all', 'salesforce']], 'LIFE-003 the reviewer sees retained, added and removed access, with Slack retained');
  assert.deepEqual(reviewed.policies.map(p => p.name).sort(), ['Account executives', 'Austin office', 'Employee benefits', 'Everyone', 'Marketing apps', 'Sales apps'], 'LIFE-003 the record names the policies behind each difference');

  // LIFE-003 point 7: the record keeps each policy's name and revision, and editing a policy later never rewrites it or its replay.
  const moveBody = { sourceRevision: 2, baseline: { from: salesW2, to: { department: marketing.id, location: austin.id, employmentType: w2.id } } };
  const policyNow = async () => (await ok('/access-policies')).items.map(p => ({ id: p.id, name: p.name, revision: p.revision })).sort((a, b) => a.id < b.id ? -1 : 1);
  const behind = reviewed.policies.map(p => p.id);
  const revisionsRecorded = (await policyNow()).filter(p => behind.includes(p.id));
  assert.deepEqual(reviewed.policies, revisionsRecorded, 'LIFE-003 the record keeps the name and revision of every policy behind it');
  const admission = async lifecycleId => {
    const read = await ok(`/lifecycle/${lifecycleId}`), ticket = await ok(`/work/${read.lifecycle.work_id}`), ticketContext = JSON.parse(ticket.work.context_json);
    const listed = (await ok('/lifecycle')).items.find(l => l.id === lifecycleId);
    return { read: { baseline: read.baseline, row: read.lifecycle, duties: read.obligations.map(o => `${o.state}:${o.kind}:${o.target}`).sort() },
      ticket: { baseline: ticketContext.baseline, added: ticketContext.added, removed: ticketContext.removed, retained: ticketContext.retained }, listed };
  };
  const original = await admission(move.value.lifecycleId);
  assert.deepEqual(original.read.baseline, original.ticket.baseline, 'LIFE-003 the lifecycle read and the linked ticket carry the same reviewed baseline');
  assert.deepEqual(original.read.baseline.policies, revisionsRecorded, 'LIFE-003 the lifecycle read names each policy and its revision');
  assert.ok(original.listed, 'LIFE-003 the admission is listed to HR and the owner');
  const operations = async () => Object.fromEntries(await Promise.all(['execution_operations', 'execution_attempts', 'execution_receipts', 'execution_plans', 'work_execution_bindings'].map(async t => [t, (await db.prepare(`SELECT COUNT(*) n FROM ${t}`).first()).n])));
  const dispatched = await operations();
  await ok(`/access-policies/${marketingPolicy.id}`, { revision: 1, active: true, name: 'Marketing apps', match: marketingPolicy.match, grants: grants(['app', 'hubspot'], ['app', 'canva']) });
  await ok(`/access-policies/${salesPolicy.id}`, { revision: 1, active: true, name: 'Sales apps', match: salesPolicy.match, grants: grants(['app', 'salesforce'], ['group', 'sales-all'], ['app', 'gong']) });
  const edited = (await policyNow()).filter(p => behind.includes(p.id));
  assert.ok(edited.some((p, i) => p.revision > revisionsRecorded[i].revision), 'LIFE-003 the edit raised the live policy revisions');
  assert.deepEqual(await admission(move.value.lifecycleId), original, 'LIFE-003 rereading the admission after a policy edit returns identical retained, added and removed access and policy revisions');
  const replay = await record(sam, 'move', 'pol-move', moveBody);
  assert.equal(replay.status, 201, JSON.stringify(replay));
  assert.equal(replay.value.lifecycleId, move.value.lifecycleId, 'LIFE-003 replaying an admitted move is read-only after a policy edit');
  assert.deepEqual(await admission(move.value.lifecycleId), original, 'LIFE-003 the replay leaves the admission unchanged');
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM work_lifecycle WHERE source='pol-move'").first()).n, 1, 'LIFE-003 the replay writes no second record');
  // A new admission over the same values reads the edited policies, so the old record differs only by being immutable.
  const mo = await person('Mo Mover');
  const later = await record(mo, 'move', 'pol-move-later', { sourceRevision: 1, baseline: moveBody.baseline });
  assert.equal(later.status, 201, JSON.stringify(later));
  const laterBaseline = (await admission(later.value.lifecycleId)).read.baseline;
  assert.deepEqual([laterBaseline.added, laterBaseline.removed], [['canva', 'hubspot'], ['gong', 'quota-dashboard', 'sales-all', 'salesforce']], 'LIFE-003 a new admission after the edit reads the edited policies');
  assert.ok(laterBaseline.policies.every(p => p.revision >= (revisionsRecorded.find(r => r.id === p.id)?.revision ?? 1)) &&
    laterBaseline.policies.some(p => p.revision > (revisionsRecorded.find(r => r.id === p.id)?.revision ?? 0)), 'LIFE-003 the new record carries the edited policy revisions while the original keeps its own');
  assert.deepEqual(original.read.baseline.removed, ['quota-dashboard', 'sales-all', 'salesforce'], 'LIFE-003 the original record still lacks the later policy grants');
  assert.equal((await record(sam, 'move', 'pol-move', { sourceRevision: 2, baseline: { from: salesW2, to: { department: sales.id } } })).status, 409, 'LIFE-003 a changed baseline under the same source revision conflicts');

  // LIFE-003 point 8: access the admission lists explicitly joins the policy result without contradicting it, and dispatches nothing.
  const eli = await person('Eli Explicit');
  const explicitBody = { baseline: { from: salesW2, to: moveBody.baseline.to }, added: ['figma', 'hubspot'], retained: ['okta-sso'], removed: ['legacy-wiki'] };
  const explicit = await record(eli, 'move', 'pol-explicit', explicitBody);
  assert.equal(explicit.status, 201, JSON.stringify(explicit));
  const union = await admission(explicit.value.lifecycleId);
  assert.deepEqual(union.read.duties, ['pending:access.grant:canva', 'pending:access.grant:figma', 'pending:access.grant:hubspot', 'pending:access.revoke:gong', 'pending:access.revoke:legacy-wiki',
    'pending:access.revoke:quota-dashboard', 'pending:access.revoke:sales-all', 'pending:access.revoke:salesforce'], 'LIFE-003 the duties are the union of the policy result and the explicit access, each once');
  assert.deepEqual([union.ticket.added, union.ticket.removed, union.ticket.retained],
    [['canva', 'figma', 'hubspot'], ['gong', 'legacy-wiki', 'quota-dashboard', 'sales-all', 'salesforce'], ['austin-vpn', 'benefits-portal', 'okta-sso', 'slack'].sort()],
    'LIFE-003 the linked ticket lists the union of policy and explicit access');
  assert.deepEqual([union.read.baseline.added, union.read.baseline.removed], [['canva', 'hubspot'], ['gong', 'quota-dashboard', 'sales-all', 'salesforce']], 'LIFE-003 the policy result itself is not rewritten by the explicit access');
  assert.deepEqual(await operations(), dispatched, 'LIFE-003 admission records duties only and dispatches nothing to a provider');
  assert.equal((await record(eli, 'move', 'pol-explicit', { ...explicitBody, added: ['figma'] })).status, 409, 'LIFE-003 the explicit access is part of the immutable admitted facts');
  assert.deepEqual(await admission(explicit.value.lifecycleId), union, 'LIFE-003 a refused change leaves the union untouched');
  assert.equal((await record(eli, 'move', 'pol-explicit-clash', { ...explicitBody, sourceRevision: 2, added: ['figma'], removed: ['canva'] })).status, 422, 'LIFE-003 explicit access cannot contradict the policy result');
  assert.equal((await record(eli, 'move', 'pol-explicit-clash-2', { ...explicitBody, sourceRevision: 2, added: ['figma'], retained: ['salesforce'] })).status, 422, 'LIFE-003 explicit retained access cannot contradict a policy removal');
  const edits = (await db.prepare("SELECT detail_json FROM audit_events WHERE action='access_policy.edited' AND target=?").bind(marketingPolicy.id).all()).results;
  assert.deepEqual(edits.map(e => JSON.parse(e.detail_json)).map(d => [d.before.grants, d.after.grants]), [[['hubspot'], ['hubspot', 'canva']]], 'LIFE-003 policy edits are versioned with before and after');
  // A deactivated policy no longer applies to a new join.
  await ok(`/access-policies/${everyone.id}`, { revision: 1, active: false, name: 'Everyone', match: {}, grants: everyone.grants });
  const dee = await person('Dee Design');
  assert.ok(!(await duties((await record(dee, 'join', 'pol-off', { baseline: { to: { department: marketing.id } } })).value.lifecycleId)).includes('access.grant:slack'), 'LIFE-003 deactivated policies grant nothing');

  // A leave removes the whole earlier baseline; the supplied lists must not contradict the policies.
  const leave = await record(sam, 'leave', 'pol-leave', { sourceRevision: 3, baseline: { from: { department: marketing.id, location: austin.id, employmentType: w2.id } } });
  assert.deepEqual(await duties(leave.value.lifecycleId), ['access.revoke:austin-vpn', 'access.revoke:benefits-portal', 'access.revoke:canva', 'access.revoke:hubspot'], 'LIFE-003 a leave removes the baseline');
  const clash = await record(dee, 'join', 'pol-clash', { baseline: { to: { department: marketing.id } }, removed: ['hubspot'] });
  assert.equal(clash.status, 422, 'LIFE-003 supplied rights cannot contradict the policies');
  for (const [kind, baseline] of [['join', { from: salesW2, to: salesW2 }], ['move', { to: salesW2 }], ['leave', { to: salesW2 }], ['join', { to: { department: 'undefined-value' } }]])
    assert.equal((await record(dee, kind, 'pol-shape-' + kind, { baseline })).status, 422, `LIFE-003 a ${kind} baseline names the right reviewed values`);
  console.log('PASS LIFE-003 access policies: owner-only versioned baselines, join, move and leave differences, replay and deactivation');
}

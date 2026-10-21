import assert from 'node:assert/strict';
/** CHANGE-002: the scored band selects the approval path through public change doors. */
export async function changeRiskChecks({ ok, call, db, implementation, references }) {
  const now = new Date().toISOString();
  await db.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?,?,?)').bind('approver', 'approver@fixture.test', 'approver', 'fixture', now).run();
  await db.prepare('INSERT OR IGNORE INTO memberships VALUES(?,?,?,1)').bind('w', 'approver', '["approver"]').run();
  const ci = (name, environment) => ok('POST', '/services', { name, environment, description: `${name} sign-in`, businessImpact: 'Nobody can sign in', source: 'fixture', observedAt: now });
  const sso = await ci('SSO', 'production'), ssoTest = await ci('SSO test tenant', 'test');
  assert.equal((await call('POST', '/services', { name: 'Bad env', environment: 'staging', description: 'x', businessImpact: 'x', source: 'fixture', observedAt: now })).status, 400);
  const at = (h) => new Date(Date.now() + h * 3600000).toISOString();
  const change = (services, start, extra = {}) => ok('POST', '/changes', { title: 'Rotate SSO signing certificate', risk: 'Certificate rotation', impact: 'Sign-in', services, window: { start: at(start), end: at(start + 1) },
    cohorts: ['a'], canaryCohorts: ['a'], implementation, compensation: { ...implementation, payload: { release: 'r1' } }, ...extra });
  const prior = await change([sso.id], -48);
  await db.prepare("UPDATE svc_records SET data_json=json_set(data_json,'$.state','failed') WHERE id=?").bind(prior.id).run();
  const answers = { userFacingOutage: false, untestedBackout: false, firstOfKind: false, touchesSecurity: true };
  const high = await change([sso.id], 2, { riskAnswers: answers });
  assert.deepEqual(high.data.riskScore.factors.map(f => [f.factor, f.points]), [['touchesSecurity', 2], ['production', 3], ['schedule', 1], ['failedChanges', 3]]);
  assert.equal(high.data.riskScore.score, 9); assert.equal(high.data.riskScore.band, 'high');
  assert.equal(high.data.approvalPath, 'cab', 'CHANGE-002 an SSO change with a prior failed change scores high and requires CAB');
  const low = await change([ssoTest.id], 4, { riskAnswers: answers, participants: ['approver'] });
  assert.equal(low.data.riskScore.score, 3); assert.equal(low.data.riskScore.band, 'low');
  assert.equal(low.data.approvalPath, 'change-manager', 'CHANGE-002 the same change on a test CI scores low');
  const unanswered = await change([ssoTest.id], 6);
  assert.equal(unanswered.data.riskScore.score, 9, 'CHANGE-002 unanswered questions score as yes');
  assert.equal((await call('POST', `/changes/${low.id}/authorize`, { revision: low.revision, reason: 'Own change', grantReferences: references })).status, 403, 'CHANGE-002 low risk is never approved by the change owner');
  const approved = await ok('POST', `/changes/${low.id}/authorize`, { revision: low.revision, reason: 'Independent change manager', grantReferences: references }, 'approver');
  assert.equal(approved.data.authorizations.at(-1).approvalPath, 'change-manager');
  const edited = await ok('PATCH', `/changes/${low.id}`, { revision: approved.revision, services: [sso.id] });
  assert.equal(edited.data.riskScore.band, 'high'); assert.equal(edited.data.approvalPath, 'cab');
  assert.deepEqual(edited.data.authorizations, [], 'CHANGE-002 an edit recomputes the score and withdraws approval');
  assert.equal(edited.data.riskAnswers.touchesSecurity, true, 'CHANGE-002 answers survive an edit');
  console.log('PASS CHANGE-002 public routes: questionnaire, production/test CI, schedule and prior failed change scoring; high -> CAB, low -> independent change manager; unanswered as yes; edits recompute and withdraw');
}

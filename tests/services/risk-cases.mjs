import assert from 'node:assert/strict';
/** CHANGE-002: risk bands select normal review; emergency and catalog paths take precedence. */
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

  const writesBefore = (await ok('POST', '/fixture/state', {})).writes;
  let emergency = await change([ssoTest.id], 8, {
    riskAnswers: answers, changeType: 'emergency', emergencyReason: 'Restore synthetic sign-in', participants: ['approver'],
  });
  emergency = await ok('GET', `/changes/${emergency.id}`);
  assert.equal(emergency.data.riskScore.score, 3);
  assert.equal(emergency.data.riskScore.band, 'low');
  assert.deepEqual(emergency.data.riskScore.factors.map(f => [f.factor, f.points]), [['touchesSecurity', 2], ['schedule', 1]]);
  assert.equal(emergency.data.approvalPath, 'ecab', 'CHANGE-002 low risk cannot downgrade emergency review to change manager');
  emergency = await ok('POST', `/changes/${emergency.id}/authorize`, {
    revision: emergency.revision, reason: 'Independent emergency decision', grantReferences: references,
  }, 'approver');
  const emergencyRead = await ok('GET', `/changes/${emergency.id}`);
  assert.equal(emergencyRead.data.approvalPath, 'ecab');
  assert.equal(emergencyRead.data.authorizations.at(-1).approvalPath, 'ecab');
  assert.equal(emergencyRead.data.authorizations.at(-1).riskScore, 3);
  assert.equal(emergencyRead.data.authorizations.at(-1).actor, 'approver');
  const emergencyAmended = await ok('PATCH', `/changes/${emergency.id}`, {
    revision: emergencyRead.revision, riskAnswers: { ...answers, touchesSecurity: false },
  });
  const emergencyRecomputed = await ok('GET', `/changes/${emergency.id}`);
  assert.equal(emergencyRecomputed.revision, emergencyAmended.revision);
  assert.equal(emergencyRecomputed.data.riskScore.score, 1);
  assert.equal(emergencyRecomputed.data.riskScore.band, 'low');
  assert.deepEqual(emergencyRecomputed.data.riskScore.factors.map(f => [f.factor, f.points]), [['schedule', 1]]);
  assert.equal(emergencyRecomputed.data.approvalPath, 'ecab', 'CHANGE-002 recomputation cannot replace ECAB with low-risk normal review');
  assert.deepEqual(emergencyRecomputed.data.authorizations, [], 'CHANGE-002 emergency edits withdraw the previous decision');
  assert.deepEqual(emergencyRecomputed.data.priorAuthorizations, emergencyRead.data.authorizations);
  await ok('POST', `/changes/${emergency.id}/authorize`, {
    revision: emergencyRecomputed.revision, reason: 'Review recomputed emergency risk', grantReferences: references,
  }, 'approver');
  const emergencyReapproved = await ok('GET', `/changes/${emergency.id}`);
  assert.equal(emergencyReapproved.data.approvalPath, 'ecab');
  assert.equal(emergencyReapproved.data.authorizations.length, 1);
  assert.equal(emergencyReapproved.data.authorizations[0].approvalPath, 'ecab');
  assert.equal(emergencyReapproved.data.authorizations[0].riskScore, 1);
  assert.equal(emergencyReapproved.data.authorizations[0].implementationRevision, emergencyRecomputed.data.implementationRevision);

  let template = await ok('POST', '/change-templates', {
    title: 'Reviewed production certificate rotation', risk: 'Authentication changes', impact: 'Sign-in',
    services: [sso.id], cohorts: ['a'], canaryCohorts: ['a'], implementation,
    compensation: { ...implementation, payload: { release: 'r1' } },
    implementationPlan: 'Apply reviewed certificate', testPlan: 'Verify sign-in independently', backoutPlan: 'Restore prior certificate', active: true,
  });
  template = await ok('POST', `/change-templates/${template.id}/approve`, {
    revision: template.revision, version: template.data.version, reason: 'Owner approves this exact catalog plan',
  });
  const standard = await change([sso.id], 10, {
    changeType: 'standard', templateId: template.id, templateVersion: template.data.version,
  });
  const standardRead = await ok('GET', `/changes/${standard.id}`);
  assert.equal(standardRead.data.riskScore.score, 15);
  assert.deepEqual(standardRead.data.riskScore.factors.map(f => [f.factor, f.points]), [
    ['userFacingOutage', 2], ['untestedBackout', 2], ['firstOfKind', 2], ['touchesSecurity', 2],
    ['production', 3], ['schedule', 1], ['failedChanges', 3],
  ]);
  assert.equal(standardRead.data.riskScore.band, 'high');
  assert.equal(standardRead.data.approvalPath, 'catalog', 'CHANGE-002 high risk cannot replace approved catalog review with CAB');
  assert.equal(standardRead.data.state, 'preapproved');
  assert.deepEqual(standardRead.data.cabBypass, {
    templateId: template.id, version: template.data.version, approvalId: template.data.approval.id,
    implementationRevision: 1, snapshot: template.data.approval.snapshot,
  }, 'CHANGE-002 the high-scored standard retains its exact owner-approved catalog version and snapshot');
  assert.deepEqual(standardRead.data.authorizations, [], 'CHANGE-002 catalog preapproval adds no per-change decision');
  const normalDecision = await call('POST', `/changes/${standard.id}/authorize`, {
    revision: standardRead.revision, reason: 'Attempt ordinary CAB decision', grantReferences: references,
  });
  assert.equal(normalDecision.status, 409);
  assert.equal(normalDecision.body.error.code, 'catalog_approval');
  assert.deepEqual(await ok('GET', `/changes/${standard.id}`), standardRead, 'CHANGE-002 refusing a normal decision preserves the catalog record');
  assert.deepEqual(emergencyReapproved.data.invocations, []);
  assert.deepEqual(standardRead.data.invocations, []);
  const writesAfter = (await ok('POST', '/fixture/state', {})).writes;
  assert.equal(writesAfter, writesBefore, 'CHANGE-002 risk-path proof dispatches no provider effect');
  console.log('PROBE CHANGE-002 8: native change and owner-approved template routes -> ' + JSON.stringify({
    emergency: { score: emergencyRead.data.riskScore.score, band: emergencyRead.data.riskScore.band, path: emergencyRead.data.approvalPath },
    amendedEmergency: { score: emergencyReapproved.data.riskScore.score, path: emergencyReapproved.data.authorizations[0].approvalPath },
    standard: { score: standardRead.data.riskScore.score, band: standardRead.data.riskScore.band, path: standardRead.data.approvalPath, version: standardRead.data.cabBypass.version },
    normalDecision: normalDecision.body.error.code, providerWrites: writesAfter - writesBefore,
  }));
  console.log('PASS CHANGE-002 public routes: scoring and recomputation; low emergency retains ECAB through amendment and fresh decision; high standard retains exact approved catalog snapshot and refuses normal review; no provider dispatch');
}

import assert from 'node:assert/strict';

export async function problemDetectionChecks(api, db) {
  const check = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r)); return r.value; };
  const employee = { 'x-user': 'employee', 'x-roles': '["employee"]' };
  const operator = { 'x-user': 'stranger', 'x-roles': '["operator"]' };
  const otherTenant = { 'x-workspace': 'b' };
  const observedAt = new Date().toISOString();
  const service = check(await api('/services', { name: 'PROB-002 Wi-Fi', description: 'Office wireless', businessImpact: 'Office cannot work', source: 'Network register', observedAt, visibility: 'workspace' }), 201);
  const ticket = async (context, title = 'Wi-Fi disconnects', headers = employee, sensitivity = 'normal') => check(await api('/work', {
    title, body: title, kind: 'incident', sensitivity, context, deduplicationKey: crypto.randomUUID(),
  }, headers), 201);
  const detect = async (headers = {}) => check(await api('/problem-proposals/detect', {}, headers)).items;
  const cluster = (items, facet, scopeValue, facetValue = service.id) => items.find(p => p.data.cluster.facet === facet && p.data.cluster.value === facetValue && p.data.cluster.scopeValue === scopeValue);
  const floor = { serviceId: service.id, cohort: 'Denver floor 4' };
  const eight = [];
  for (let i = 0; i < 8; i++) eight.push(await ticket(floor));
  check(await api('/services/process-due', {}));
  let proposed = cluster(check(await api('/problem-proposals')).items, 'service', 'denver floor 4');
  assert.ok(proposed, 'Eight recorded floor incidents yield a problem proposal');
  assert.deepEqual(proposed.data.evidence.map(e => e.id).sort(), eight.map(t => t.id).sort());
  assert.equal(proposed.sources.length, 8);
  assert.ok(proposed.sources.every(s => s.title === 'Wi-Fi disconnects'));
  assert.ok(proposed.data.evidence.every(e => !('title' in e) && !('body' in e)), 'Evidence stores references rather than copied employee reports');
  const repeated = await Promise.all([detect(), detect()]);
  assert.ok(repeated.every(items => items.filter(p => p.id === proposed.id).length === 1), 'Concurrent scans retain one semantic proposal');
  check(await api(`/problem-proposals/${proposed.id}/reject`, { revision: proposed.revision, reason: 'These tickets describe planned access point maintenance.' }));
  await ticket(floor);
  let rejected = cluster(await detect(), 'service', 'denver floor 4');
  assert.equal(rejected.id, proposed.id);
  assert.equal(rejected.data.state, 'rejected');
  assert.match(rejected.data.decision.reason, /planned access point/);
  assert.equal(cluster(check(await api('/problem-proposals')).items, 'service', 'denver floor 4').data.state, 'rejected', 'A later independent read retains rejection');

  const alternate = [];
  for (let i = 0; i < 3; i++) alternate.push(await ticket({ serviceId: service.id, location: 'Denver floor 5' }));
  let accepted = cluster(await detect(), 'service', 'denver floor 5');
  const staleRevision = accepted.revision;
  const fourth = await ticket({ serviceId: service.id, location: 'Denver floor 5' });
  accepted = cluster(await detect(), 'service', 'denver floor 5');
  check(await api(`/problem-proposals/${accepted.id}/accept`, { revision: staleRevision, reason: 'Investigate the recurring outage' }), 409);
  const races = await Promise.all([1, 2].map(() => api(`/problem-proposals/${accepted.id}/accept`, { revision: accepted.revision, reason: 'Investigate the recurring outage' })));
  assert.deepEqual(races.map(r => r.status).sort(), [200, 409]);
  accepted = check(await api(`/problem-proposals/${accepted.id}`));
  const problem = check(await api(`/problems/${accepted.data.problemId}`));
  assert.equal(problem.data.sourceProposalId, accepted.id);
  assert.equal(problem.data.causeState, 'unknown', 'A recurrence proposal does not establish a root cause');
  assert.deepEqual(problem.data.ticketIds.sort(), [...alternate, fourth].map(t => t.id).sort());
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM svc_records WHERE workspace_id='a' AND kind='problem' AND json_extract(data_json,'$.sourceProposalId')=?").bind(accepted.id).first()).n, 1);
  for (const source of alternate) assert.equal(check(await api(`/work/${source.id}`, undefined, employee)).work.state, 'open');

  const deviceTickets = [];
  for (let i = 0; i < 3; i++) deviceTickets.push(await ticket({ serviceId: service.id, cohort: 'Device pilot', deviceModel: 'Laptop Pro 14', app: 'Design Studio' }));
  let items = await detect();
  assert.equal(cluster(items, 'deviceModel', 'device pilot', 'laptop pro 14').sources.length, 3);
  assert.equal(cluster(items, 'app', 'device pilot', 'design studio').sources.length, 3);
  await ticket({ serviceId: service.id, cohort: 'Only two' });
  await ticket({ serviceId: service.id, cohort: 'Only two' });
  assert.equal(cluster(await detect(), 'service', 'only two'), undefined);
  const old = await ticket({ serviceId: service.id, cohort: 'Only two' });
  await db.prepare("UPDATE work_records SET created_at='2020-01-01T00:00:00.000Z' WHERE id=?").bind(old.id).run();
  assert.equal(cluster(await detect(), 'service', 'only two'), undefined, 'Old incidents are excluded from the observation window');

  // The adapter's monitoring-derived incident is the single counted alert source.
  const alertTickets = [await ticket({ serviceId: service.id, cohort: 'Alert floor',deviceModel:'Wireless Laptop',app:'Corporate Wi-Fi' }), await ticket({ serviceId: service.id, cohort: 'Alert floor',deviceModel:'Wireless Laptop',app:'Corporate Wi-Fi' })];
  const signingSecret = crypto.randomUUID();
  const key = await crypto.subtle.importKey('raw', Buffer.alloc(32), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify({ signingSecret })));
  await db.prepare("INSERT INTO connections(id,workspace_id,provider,name,status,config_json,secret_ciphertext,created_at,updated_at) VALUES(?,'a','monitoring-webhook','Wireless monitoring','inbound-unobserved','{}',?,datetime('now'),datetime('now'))")
    .bind('prob-002-monitor-connection', Buffer.from(iv).toString('base64') + '.' + Buffer.from(ciphertext).toString('base64')).run();
  const monitor = check(await api('/monitors', { name: 'PROB-002 wireless check', serviceId: service.id, connectionId: 'prob-002-monitor-connection', freshnessMs: 60000, cohorts: ['Alert floor'],context:{deviceModel:'Wireless Laptop',app:'Corporate Wi-Fi'} }), 201);
  const event = { id: 'wireless-failure', serviceId: service.id, status: 'failed', observedAt: new Date().toISOString() };
  const timestamp = String(Math.floor(Date.now() / 1000));
  const hmac = await crypto.subtle.importKey('raw', new TextEncoder().encode(signingSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode(timestamp + '.' + JSON.stringify(event)))).toString('hex');
  const signed = { 'X-Linen-Timestamp': timestamp, 'X-Linen-Signature': signature };
  check(await api(`/monitors/${monitor.id}/events`, event, signed));
  assert.equal(check(await api(`/monitors/${monitor.id}/events`, event, signed)).duplicate, true);
  check(await api('/services/process-due', {}));
  const eventKey = monitor.id + ':wireless-failure';
  const alert = check(await api('/incidents')).items.find(i => i.data.monitorEventKey === eventKey);
  assert.ok(alert, 'Signed monitoring failure becomes an incident through public processing');
  const alertProposal = cluster(await detect(), 'service', 'alert floor');
  const alertFacets=await detect();
  assert.equal(cluster(alertFacets,'deviceModel','alert floor','wireless laptop').sources.filter(s=>s.type==='alert').length,1);
  assert.equal(cluster(alertFacets,'app','alert floor','corporate wi-fi').sources.filter(s=>s.type==='alert').length,1);
  assert.equal(alertProposal.sources.length, 3, 'Alert log and monitoring-derived incident count once');
  assert.deepEqual(alertProposal.data.evidence.filter(e => e.type === 'ticket').map(e => e.id).sort(), alertTickets.map(t => t.id).sort());
  assert.equal(alertProposal.data.evidence.find(e => e.type === 'alert').id, alert.id);
  const reviewedAlert = check(await api(`/problem-proposals/${alertProposal.id}/accept`, { revision: alertProposal.revision, reason: 'Investigate monitored recurrence' }));
  assert.deepEqual(check(await api(`/problems/${reviewedAlert.data.problemId}`)).data.alertIncidentIds, [alert.id]);

  check(await api('/problem-proposals/detect', {}, employee), 403);
  check(await api('/problem-proposals', undefined, employee), 403);
  check(await api(`/problem-proposals/${proposed.id}`, undefined, employee), 403);
  check(await api(`/problem-proposals/${proposed.id}/reject`, { revision: proposed.revision, reason: 'Forged owner role' }, { 'x-user': 'employee', 'x-roles': '["owner"]' }), 403);
  check(await api(`/problem-proposals/${accepted.id}`, undefined, otherTenant), 404);
  await db.prepare("UPDATE memberships SET roles_json='[\"operator\"]' WHERE workspace_id='a' AND user_id='stranger'").run();
  try {
    const hiddenService = check(await api('/services', { name: 'Restricted PROB-002', description: 'Confidential service', businessImpact: 'Confidential', source: 'Private register', observedAt, visibility: 'restricted' }), 201);
    for (let i = 0; i < 3; i++) check(await api('/incidents', { title: 'Confidential monitor incident', serviceId: hiddenService.id, impact: 'Private', cohorts: ['Confidential floor'], visibility: 'restricted', monitorEventKey: `private-monitor:${i}` }), 201);
    const privateProposal = cluster(await detect(), 'service', 'confidential floor', hiddenService.id);
    assert.ok(privateProposal);
    assert.equal(privateProposal.visibility, 'restricted');
    await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('second-owner','second-owner@test','Second owner','unused',observedAt).run();
    await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a','second-owner','["owner"]').run();
    const secondOwner={'x-user':'second-owner','x-roles':'["owner"]'};
    check(await api(`/problem-proposals/${privateProposal.id}`,undefined,secondOwner),404);
    check(await api(`/service-history/${privateProposal.id}`,undefined,secondOwner),404);
    const acceptedPrivate=check(await api(`/problem-proposals/${privateProposal.id}/accept`,{revision:privateProposal.revision,reason:'Investigate confidential recurrence'}));
    check(await api(`/problems/${acceptedPrivate.data.problemId}`,undefined,secondOwner),404);
    assert.ok(!check(await api('/problems',undefined,secondOwner)).items.some(p=>p.id===acceptedPrivate.data.problemId),'ct-approved detector-only visibility survives acceptance, even for another owner');

    assert.ok(!(await detect(operator)).some(p => p.id === privateProposal.id));
    check(await api(`/problem-proposals/${privateProposal.id}`, undefined, operator), 404);
    check(await api(`/problem-proposals/${privateProposal.id}/accept`, { revision: privateProposal.revision, reason: 'Cannot see source' }, operator), 404);
    for(let i=0;i<3;i++) await ticket({serviceId:service.id,cohort:'Device pilot',app:'Design Studio'});
    const visibleProposal = cluster(await detect(), 'app', 'device pilot', 'design studio');
    await db.prepare("UPDATE work_records SET sensitivity='restricted',revision=revision+1 WHERE id=?").bind(deviceTickets[0].id).run();
    assert.ok(!check(await api('/problem-proposals', undefined, operator)).items.some(p => p.id === visibleProposal.id), 'One inaccessible source hides the whole proposal, including its count');
    check(await api(`/problem-proposals/${visibleProposal.id}`, undefined, operator), 404);
    check(await api(`/problem-proposals/${visibleProposal.id}/accept`, { revision: visibleProposal.revision, reason: 'Cannot accept partial cluster' }, operator), 404);
    assert.ok(!(await detect(operator)).some(p=>p.id===visibleProposal.id),'A scan with enough remaining visible sources cannot republish a partial inaccessible cluster');
    await db.prepare("UPDATE work_records SET sensitivity='restricted',revision=revision+1 WHERE id=?").bind(alternate[0].id).run();
    check(await api(`/problems/${accepted.data.problemId}`, undefined, operator),404);
    assert.ok(!check(await api('/problems',undefined,operator)).items.some(p=>p.id===accepted.data.problemId),'Accepted problem cannot bypass a changed source boundary');
    check(await api(`/problems/${accepted.data.problemId}/known-error`,{revision:1,cause:'Cannot see all sources',evidenceIds:['probe']},operator),404);
    await db.prepare("UPDATE memberships SET active=0 WHERE workspace_id='a' AND user_id='stranger'").run();
    check(await api('/problem-proposals/detect', {}, operator), 404);
    check(await api(`/problem-proposals/${visibleProposal.id}/reject`, { revision: visibleProposal.revision, reason: 'Inactive membership' }, operator), 404);
    await db.prepare("UPDATE memberships SET active=1 WHERE workspace_id='a' AND user_id='stranger'").run();
    await db.prepare("UPDATE memberships SET roles_json='[\"employee\"]' WHERE workspace_id='a' AND user_id='stranger'").run();
    check(await api('/problem-proposals/detect', {}, operator), 403);
    check(await api(`/problem-proposals/${visibleProposal.id}/accept`, { revision: visibleProposal.revision, reason: 'Revoked authority' }, operator), 403);
  } finally {
    await db.prepare("UPDATE memberships SET active=1,roles_json='[\"employee\"]' WHERE workspace_id='a' AND user_id='stranger'").run();
  }
  console.log('PASS PROB-002 public routes: floor-specific recurrence, evidence, retained rejection and ninth-ticket suppression; acceptance concurrency, source links, alert dedupe, app/model facets, window, tenant/restricted/current-role fences');
  return {rejectedId:rejected.id,acceptedId:accepted.id,problemId:accepted.data.problemId};
}

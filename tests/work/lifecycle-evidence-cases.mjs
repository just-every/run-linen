import assert from 'node:assert/strict';

/** LIFE-007: real public intake/grant/dispatch, with provider evidence at the D1 fixture boundary. */
export async function lifecycleEvidenceChecks(api, db) {
  const time = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('life-pack-issuer','pack-issuer@test','Issuer','unused',time),
    db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a','life-pack-issuer','["owner"]'),
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('life-pack-hr','pack-hr@test','HR','unused',time),
    db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a','life-pack-hr','["hr"]'),
    db.prepare('INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)')
      .bind('life-pack-connection','a','microsoft-graph','Fixture boundary','{}','private-credential-marker','unverified',time,time),
    db.prepare('INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)')
      .bind('life-pack-verifier','a','workflow-probe','Fixture verifier','{}','private-verifier-marker','active',time,time),
  ]);
  const person = await api('/people', { source:'life-pack', sourceId:'person', name:'Evidence person', effectiveAt:time, observedAt:time });
  assert.equal(person.status,201,JSON.stringify(person));
  const base = { personId:person.value.id, effectiveAt:'2026-01-01T00:00:00Z', timezone:'UTC',
    source:'life-pack', sourceRevision:1, retained:[], added:[], removed:['pack-access'],
    deviceIds:['pack-device'], ownerId:'owner', identityTarget:'pack-person@example.test' };
  const records = {};
  for (const kind of ['join','move','leave']) {
    const result = await api('/lifecycle',{...base,kind,source:`life-pack-${kind}`,added:kind==='leave'?[]:['pack-new-access']});
    assert.equal(result.status,201,JSON.stringify(result));
    records[kind] = result.value;
    const pack = await api(`/lifecycle/${result.value.lifecycleId}/evidence`);
    assert.equal(pack.status,200,JSON.stringify(pack));
    assert.equal(pack.value.lifecycle.kind,kind);
    assert.ok(pack.value.duties.some(d=>d.kind==='access.revoke'));
    assert.ok(pack.value.outstandingDuties.some(d=>d.kind.startsWith('device.')));
  }
  const path = `/lifecycle/${records.leave.lifecycleId}/evidence`;
  await api(`/work/${records.leave.work.id}/messages`,{body:'private-conversation-marker',visibility:'private',sourceMessageId:'pack-private'});
  const duties = (await api(`/lifecycle/${records.leave.lifecycleId}`)).value.obligations;
  const actions = { 'identity.disable':'identity.disable','sessions.revoke':'sessions.revoke','access.revoke':'group.remove' };
  const grants = new Map();
  for (const duty of duties.filter(d=>actions[d.kind])) {
    const result = await api('/test/grant',{principalId:'owner',beneficiaryId:base.personId,
      action:actions[duty.kind],actionVersion:1,target:duty.target,connectionId:'life-pack-connection',
      validFrom:'2026-01-01T00:00:00.000Z',validUntil:'2030-01-01T00:00:00.000Z',maxUses:10}, {'x-user':'life-pack-issuer'});
    assert.equal(result.status,200,JSON.stringify(result));
    grants.set(duty.kind,result.value);
    const bound = await api(`/obligations/${duty.id}/execution`,{action:actions[duty.kind],actionVersion:1,
      target:duty.target,beneficiaryId:base.personId,connectionId:'life-pack-connection',verifierConnectionId:'life-pack-verifier',
      grantId:result.value.id,grantVersion:result.value.version,payload:{password:'private-payload-marker'}});
    assert.equal(bound.status,200,JSON.stringify(bound));
  }
  assert.equal((await api('/work/process-due',{})).status,200);
  const dispatched = (await api(path)).value;
  assert.equal(dispatched.effects.length,2,'LIFE-007 public dispatch retains the disable and access effects');
  assert.ok(!dispatched.effects.some(e=>e.action==='sessions.revoke'),'a leave revokes sessions only after its disable is verified (one account fence)');
  assert.ok(dispatched.effects.every(e=>e.created_at && e.grant.id && !e.independentlyVerified));
  const effect = dispatched.effects.find(e=>e.action==='identity.disable');
  const duty = duties.find(d=>d.kind==='identity.disable');
  const observed = new Date().toISOString();
  // Only the test simulates the paid/network boundary. This is not live-provider evidence.
  await db.batch([
    db.prepare("INSERT INTO execution_attempts(id,workspace_id,operation_id,fence,kind,state,started_at,finished_at) VALUES(?,?,?,1,'dispatch','submitted',?,?)")
      .bind('life-pack-attempt','a',effect.id,time,observed),
    db.prepare('INSERT INTO execution_receipts VALUES(?,?,?,?,?,?,?)')
      .bind('life-pack-receipt','a',effect.id,'life-pack-attempt','submitted',204,observed),
    db.prepare('INSERT INTO execution_verifications VALUES(?,?,?,?,?,?,?,?,?,?)')
      .bind('life-pack-readback','a',effect.id,1,1,effect.target,base.personId,'effect_verified',
        JSON.stringify({matches:true,present:true,observedAt:observed,secret:'private-readback-marker'}),observed),
    db.prepare("UPDATE execution_operations SET state='effect_verified' WHERE id=?").bind(effect.id),
  ]);
  let pack = (await api(path)).value;
  assert.equal(pack.effects.find(e=>e.id===effect.id).independentlyVerified,false,'LIFE-007 readback alone never proves independent verification');
  assert.ok(pack.outstandingDuties.some(d=>d.id===duty.id));
  await db.batch([
    db.prepare('INSERT INTO execution_verifications VALUES(?,?,?,?,?,?,?,?,?,?)')
      .bind('life-pack-workflow','a',effect.id,1,1,effect.target,base.personId,'verified',JSON.stringify({
        effect:{matches:true,present:true,observedAt:observed},
        workflow:{observedAt:observed,negativeControl:true,usableWorkflow:true,cohort:['unrelated-private-person'],secret:'private-probe-marker'},
      }),observed),
    db.prepare("UPDATE execution_operations SET state='verified' WHERE id=?").bind(effect.id),
    db.prepare("UPDATE work_obligations SET state='verified' WHERE id=?").bind(duty.id),
    // A different workspace's history referencing the same ID must never join into this export.
    db.prepare('INSERT INTO execution_verifications VALUES(?,?,?,?,?,?,?,?,?,?)')
      .bind('life-pack-other-tenant','other',effect.id,1,1,'other-tenant-target','other-person','verified','{}',observed),
  ]);
  pack = (await api(path)).value;
  const completed = pack.effects.find(e=>e.id===effect.id);
  assert.equal(completed.independentlyVerified,true);
  assert.equal(completed.attempts[0].started_at,time);
  assert.equal(completed.receipts[0].created_at,observed);
  assert.equal(completed.verifications.length,2);
  assert.ok(!pack.outstandingDuties.some(d=>d.id===duty.id));
  assert.ok(pack.outstandingDuties.some(d=>d.kind==='sessions.revoke'));
  assert.ok(pack.outstandingDuties.some(d=>d.kind==='device.return'));
  assert.equal((await api('/work/process-due',{})).status,200);
  assert.equal((await api(path)).value.effects.filter(e=>e.action==='sessions.revoke').length,1,'the verified disable releases the session revocation');
  const grant = grants.get('identity.disable');
  assert.deepEqual(completed.grant,grant);
  const authority = pack.authority.grants.find(g=>g.id===grant.id && g.version===grant.version);
  assert.equal(authority.issuer_id,'life-pack-issuer');
  assert.equal(authority.principal_id,'owner');
  assert.ok(authority.created_at);
  assert.ok(pack.authority.decisions.some(d=>d.grant_id===grant.id && d.allowed===1 && d.created_at));
  const serialized = JSON.stringify(pack);
  for (const marker of ['private-credential-marker','private-verifier-marker','private-conversation-marker',
    'private-payload-marker','private-readback-marker','private-probe-marker','unrelated-private-person','other-tenant-target'])
    assert.ok(!serialized.includes(marker),`LIFE-007 excludes restricted content: ${marker}`);
  assert.equal((await api(path,undefined,{'x-user':'life-pack-hr','x-roles':'["hr"]'})).status,200);
  assert.equal((await api(path,undefined,{'x-user':'employee','x-roles':'["owner"]'})).status,403,'LIFE-007 refreshes asserted owner role');
  assert.equal((await api(path,undefined,{'x-user':'employee','x-roles':'["employee"]'})).status,403);
  assert.equal((await api(path,undefined,{'x-workspace':'other'})).status,404);
  await db.prepare("UPDATE memberships SET roles_json='[\"employee\"]' WHERE workspace_id='a' AND user_id='life-pack-hr'").run();
  assert.equal((await api(path,undefined,{'x-user':'life-pack-hr','x-roles':'["hr"]'})).status,403);
  await db.prepare('INSERT INTO work_erasure VALUES(?,?,?)').bind('a',base.personId,observed).run();
  assert.equal((await api(path)).status,404,'LIFE-007 retained execution records cannot restore erased personal evidence');
  console.log('PASS LIFE-007 join/move/leave export, exact authority, timestamps, fixture verification history, outstanding duties and tenant/privacy');
}

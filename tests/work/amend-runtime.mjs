import assert from 'node:assert/strict';
import {harness} from './amend-harness.mjs';
const h=await harness(),{api,ok}=h;let db=h.db;
const future=ms=>new Date(Date.now()+ms).toISOString();
try {
  await ok('/test/connections',{});
  const actor=await ok('/automation-principals',{name:'Amend fixture',idempotencyKey:'actor'});
  await ok('/subject-mappings',{connectionId:'graph',localUserId:'employee',providerSubject:'provider-employee-distinct'});
  async function journey(key,{expiry=future(3600000),validUntil=future(86400000),removalUntil=validUntil,lost=false}={}) {
    const work=await ok('/work',{title:key,body:'Temporary access',deduplicationKey:key},'employee');
    const catalog=await ok('/catalog',{name:key,kind:'access',target:key,ownerId:'owner'});
    await ok(`/work/${work.id}/fulfilment`,{catalogId:catalog.id,beneficiaryId:'employee',purpose:'Project',expiresAt:expiry},'employee');
    for(const [action,suffix] of [['group.add','add'],['group.remove','remove']])await ok('/grants',{id:key+suffix,principalId:actor.id,
      action,actionVersion:1,target:key,beneficiaryId:'provider-employee-distinct',localBeneficiaryId:'employee',connectionId:'graph',verifierConnectionId:'probe',validFrom:future(-60000),validUntil:suffix==='remove'?removalUntil:validUntil,maxUses:30,conditions:{workId:work.id}});
    const resolved=await ok('/test/standing',{workId:work.id,target:key,beneficiaryId:'employee',kind:'access',expiresAt:expiry},'employee');
    assert.ok(resolved);
    const plan=await ok('/plans/granted',{workId:work.id,revision:work.revision,steps:[resolved.step],idempotencyKey:key},'employee');
    const initial=plan.operations.find(o=>o.parent_id==='initial'),removal=plan.operations.find(o=>o.parent_id===initial.id);
    await ok('/test/link',{workId:work.id,planId:plan.planId,operationIds:plan.operations.map(o=>o.id)},'employee');
    if(lost)await db.prepare('INSERT INTO test_provider VALUES(?,0,0,1)').bind(key).run();
    const run=await ok('/test/run',{operationId:initial.id},actor.id);
    if(!lost)assert.equal((await ok('/test/verify',{operationId:initial.id,verifierVersion:1},actor.id)).state,'verified');
    else assert.equal(run.state,'unknown');
    await ok('/work/process-due',{});
    return {key,work,catalog,initial,removal,expiry};
  }
  const read=j=>ok(`/work/${j.work.id}/fulfilments/${j.catalog.id}`,undefined,'employee');
  async function input(j,expiresAt,event='edit') {const f=await read(j);return {catalogId:j.catalog.id,expectedWorkRevision:f.workRevision,
    expectedFulfilmentRevision:f.revision,idempotencyKey:event,beneficiaryId:f.beneficiaryId,purpose:f.purpose,expiresAt};}
  const amend=(j,i,user='employee')=>ok(`/work/${j.work.id}/fulfilment/amend`,i,user);
  const op=id=>db.prepare('SELECT * FROM execution_operations WHERE id=?').bind(id).first();
  const j=await journey('extension',{expiry:future(12000)});
  const i=await input(j,future(20000));
  assert.equal((await api(`/work/${j.work.id}/fulfilment/amend`,i,'stranger')).status,404);
  assert.equal((await api(`/work/${j.work.id}/fulfilment/amend`,i,'owner','other')).status,404);
  const result=await amend(j,i);assert.equal(result.state,'amended');assert.equal(result.workRevision,2);assert.equal(result.fulfilmentRevision,2);
  assert.equal((await op(j.initial.id)).state,'verified');assert.equal((await op(j.removal.id)).state,'cancelled');
  assert.equal((await ok('/test/inspect',{operationId:j.initial.id},'employee')).state,'verified','historical initial evidence survives correction');
  assert.deepEqual(await amend(j,i),result);
  assert.equal((await api(`/work/${j.work.id}/fulfilment/amend`,{...i,expiresAt:future(30000)},'employee')).status,409);
  assert.equal((await api(`/work/${j.work.id}/fulfilment/amend`,{...i,idempotencyKey:'stale'},'employee')).status,409);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM execution_operations WHERE json_extract(step_json,'$.action')='group.add'").first()).n,1);
  db=await h.restart();assert.deepEqual(await amend(j,i),result,'restart replay is exact');
  assert.equal((await db.prepare('SELECT present,writes FROM test_provider WHERE target=?').bind(j.key).first()).writes,1);
  // Earlier date replaces the first correction while retaining original verification evidence.
  const earlier=future(2500),second=await amend(j,await input(j,earlier,'earlier'));
  assert.equal(second.state,'amended');assert.equal(second.workRevision,3);
  await new Promise(r=>setTimeout(r,Math.max(0,Date.parse(earlier)-Date.now()+30)));
  await ok('/work/process-due',{});
  const duty=(await ok(`/work/${j.work.id}/obligations`,undefined,'employee')).items.find(o=>o.kind==='access.revoke');
  assert.ok(duty.operation_id);assert.notEqual(duty.operation_id,j.removal.id);
  assert.equal((await ok('/test/run',{operationId:duty.operation_id},actor.id)).state,'effect_verified');
  assert.equal((await ok('/test/verify',{operationId:duty.operation_id,verifierVersion:1},actor.id)).state,'verified');
  await ok('/work/process-due',{});
  assert.equal((await db.prepare('SELECT present,writes FROM test_provider WHERE target=?').bind(j.key).first()).present,0,'provider fixture denies after corrected expiry');
  assert.equal((await ok(`/work/${j.work.id}/obligations`,undefined,'employee')).items.find(o=>o.kind==='access.revoke').state,'verified');
  const count=(await db.prepare('SELECT COUNT(*) n FROM execution_operations').first()).n;
  db=await h.restart();await ok('/work/process-due',{});assert.equal((await db.prepare('SELECT COUNT(*) n FROM execution_operations').first()).n,count);
  assert.equal((await db.prepare('SELECT writes FROM test_provider WHERE target=?').bind(j.key).first()).writes,2,'one initial grant and one removal only');
  const missing=await journey('missing-extension',{validUntil:future(7200000)});
  const denied=await amend(missing,await input(missing,future(10800000)));
  assert.equal(denied.state,'pending_decision');assert.match(denied.reason,/authority/);assert.equal(denied.expiresAt,missing.expiry);
  assert.equal((await op(missing.removal.id)).state,'queued');assert.equal((await read(missing)).revision,1);
  const unknown=await journey('unknown-initial',{lost:true});
  const unknownResult=await amend(unknown,await input(unknown,future(7200000)));
  assert.equal(unknownResult.state,'pending_decision');assert.match(unknownResult.reason,/reconcile/);assert.equal((await op(unknown.removal.id)).state,'queued');
  assert.equal((await db.prepare('SELECT writes FROM test_provider WHERE target=?').bind(unknown.key).first()).writes,1);
  const purpose=await journey('purpose');
  const renewal=await amend(purpose,{...await input(purpose,future(7200000)),purpose:'Different business purpose'});
  assert.equal(renewal.state,'pending_decision');assert.match(renewal.reason,/renewal/);assert.equal((await op(purpose.removal.id)).state,'queued');
  const beneficiary=await amend(purpose,{...await input(purpose,future(7200000),'beneficiary'),beneficiaryId:'stranger'});
  assert.equal(beneficiary.state,'pending_decision');assert.match(beneficiary.reason,/renewal/);
  const concurrent=await journey('concurrent'),a=await input(concurrent,future(7200000),'a'),b={...a,idempotencyKey:'b'};
  const races=await Promise.all([api(`/work/${concurrent.work.id}/fulfilment/amend`,a,'employee'),api(`/work/${concurrent.work.id}/fulfilment/amend`,b,'employee')]);
  assert.equal(races.filter(r=>r.status===200).length,1);assert.equal(races.filter(r=>r.status===409).length,1);
  const revoked=await journey('revoked-prepared',{removalUntil:future(7200000)});
  await ok('/grants',{id:'new-removal',principalId:actor.id,action:'group.remove',actionVersion:1,target:revoked.key,
    beneficiaryId:'provider-employee-distinct',localBeneficiaryId:'employee',connectionId:'graph',verifierConnectionId:'probe',
    validFrom:future(-60000),validUntil:future(86400000),maxUses:30,conditions:{workId:revoked.work.id}});
  await db.prepare(`CREATE TRIGGER test_revoke AFTER INSERT ON work_fulfilment_amendments
    WHEN NEW.work_id='${revoked.work.id}' AND NEW.state='prepared' BEGIN
    INSERT INTO execution_grant_revocations VALUES('w','new-removal',1,'owner','${new Date().toISOString()}'); END;`).run();
  const deniedDuringResume=await amend(revoked,await input(revoked,future(10800000),'revoked-event'));
  assert.equal(deniedDuringResume.state,'pending_decision');assert.match(deniedDuringResume.reason,/grant_revoked/);
  assert.equal((await op(revoked.removal.id)).state,'queued');assert.equal((await read(revoked)).expiresAt,revoked.expiry);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM work_fulfilment_amendments WHERE work_id=? AND state='prepared'").bind(revoked.work.id).first()).n,0);
  await db.exec('DROP TRIGGER test_revoke');
  const interrupted=await journey('interrupted',{expiry:future(3600000)});
  const interruptedInput=await input(interrupted,future(2500),'interrupted-event');
  await db.prepare(`CREATE TRIGGER test_interrupt BEFORE UPDATE OF state ON work_fulfilment_amendments
    WHEN NEW.state='amended' BEGIN SELECT RAISE(ABORT,'fixture interruption after cancellation'); END;`).run();
  const interruption=await api(`/work/${interrupted.work.id}/fulfilment/amend`,interruptedInput,'employee');
  assert.equal(interruption.status,409);assert.equal(interruption.value.code,'revision_conflict');
  assert.equal((await op(interrupted.removal.id)).state,'cancelled');
  assert.equal((await db.prepare("SELECT state FROM work_fulfilment_amendments WHERE event_key='interrupted-event'").first()).state,'prepared');
  await db.exec('DROP TRIGGER test_interrupt');
  db=await h.restart();
  // No repeated employee event or model call: scheduled work alone resumes the handoff.
  await ok('/work/process-due',{});
  assert.equal((await db.prepare("SELECT state FROM work_fulfilment_amendments WHERE event_key='interrupted-event'").first()).state,'amended');
  await new Promise(r=>setTimeout(r,Math.max(0,Date.parse(interruptedInput.expiresAt)-Date.now()+25)));
  await ok('/work/process-due',{});
  const recovered=(await ok(`/work/${interrupted.work.id}/obligations`,undefined,'employee')).items.find(o=>o.kind==='access.revoke');
  assert.ok(recovered.operation_id);
  await ok('/test/run',{operationId:recovered.operation_id},actor.id);
  await ok('/test/verify',{operationId:recovered.operation_id,verifierVersion:1},actor.id);
  assert.equal((await db.prepare('SELECT present FROM test_provider WHERE target=?').bind(interrupted.key).first()).present,0);
  console.log('AMEND passed: real D1/workerd; verified initial -> correction -> scoped removal -> provider denial; earlier date; current authority limits; unknown/lost response; purpose/beneficiary renewal; requester/workspace ACL; exact replay/stale/concurrent edit; restart/dedup; automatic scheduled recovery after interrupted cancellation; no duplicate initial effect. Provider traffic is test fixtures only.');
} finally {await h.close();}

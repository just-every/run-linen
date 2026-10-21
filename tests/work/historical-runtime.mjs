import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {harness} from './amend-harness.mjs';
const h=await harness(),{db,ok,api}=h;
try {
  const work=await ok('/work',{title:'Archived private name',body:'Archived personal message',deduplicationKey:'historical'},'employee');
  const other=await api('/work',{title:'Other workspace private',body:'Untouched',deduplicationKey:'other'},'owner','other');
  assert.equal(other.status,201);
  await db.prepare("UPDATE work_records SET requester_id='ghost',beneficiary_id='ghost',context_json=? WHERE id IN (?,?)")
    .bind(JSON.stringify({privateName:'Historical Name'}),work.id,other.value.id).run();
  await db.prepare("UPDATE work_messages SET author_id='ghost' WHERE work_id=?").bind(work.id).run();
  const r2=await h.mf.getR2Bucket('ATTACHMENTS');
  await r2.put('private/ghost','Historical private bytes');await r2.put('private/other','Other workspace bytes');
  for(const [aid,wid,w,key] of [['ghost-attachment',work.id,'w','private/ghost'],['other-attachment',other.value.id,'other','private/other']])
    await db.prepare('INSERT INTO work_attachments(id,workspace_id,work_id,visibility,blob_key,name,content_type,size,sha256,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .bind(aid,w,wid,'private',key,'Historical name.txt','text/plain',24,'fixture','2026-01-01').run();
  assert.equal((await api('/people/ghost/erase',{revision:0,reason:'Historical erasure'})).status,404,'no tombstone is not authority');
  const hash=createHash('sha256').update('ghost').digest('hex');
  await db.prepare('INSERT INTO adoption_tombstones VALUES(?,?,?)').bind('other',hash,'2026-01-01').run();
  assert.equal((await api('/people/ghost/erase',{revision:0,reason:'Historical erasure'})).status,404,'other workspace tombstone is not authority');
  await db.prepare('INSERT INTO adoption_tombstones VALUES(?,?,?)').bind('w',hash,'2026-01-01').run();
  await db.prepare("INSERT INTO execution_plans(id,workspace_id,work_id,work_revision,actor_id,steps_json,idempotency_key,created_at) VALUES('historical-plan','w',?,1,'owner','[]','historical','2026-01-01')").bind(work.id).run();
  await db.prepare("INSERT INTO execution_operations(id,workspace_id,plan_id,step_json,state,resource,actor_id,parent_id,created_at) VALUES('opaque-effect','w','historical-plan',?,'unknown','opaque-resource','owner','initial','2026-01-01')")
    .bind(JSON.stringify({localBeneficiaryId:'ghost'})).run();
  assert.equal((await api('/people/ghost/erase',{revision:0,reason:'Historical erasure'})).value.code,'erasure_pending_remote_reconciliation');
  assert.ok(await r2.get('private/ghost'),'unresolved effect holds erasure');
  // Test fixture represents an already independently settled archived operation.
  await db.prepare("UPDATE execution_operations SET state='verified' WHERE id='opaque-effect'").run();
  const before=await db.prepare("SELECT * FROM execution_operations WHERE id='opaque-effect'").first();
  assert.equal((await api('/people/ghost/erase',{revision:0,reason:'Historical erasure'},'employee')).status,403);
  const erased=await ok('/people/ghost/erase',{revision:0,reason:'Historical erasure'});assert.equal(erased.state,'erased');
  assert.equal((await db.prepare('SELECT title,context_json FROM work_records WHERE id=?').bind(work.id).first()).title,'[erased]');
  assert.equal((await db.prepare('SELECT body FROM work_messages WHERE work_id=?').bind(work.id).first()).body,'[erased]');
  assert.equal(await r2.get('private/ghost'),null);assert.ok(await r2.get('private/other'));
  assert.equal((await db.prepare('SELECT title FROM work_records WHERE id=?').bind(other.value.id).first()).title,'Other workspace private');
  assert.deepEqual(await db.prepare("SELECT * FROM execution_operations WHERE id='opaque-effect'").first(),before,'opaque execution history unchanged');
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM memberships WHERE user_id='ghost'").first()).n,0);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM work_people WHERE id='ghost'").first()).n,0);
  assert.equal((await ok('/people/ghost/erase',{revision:0,reason:'Replay historical erasure'})).state,'erased');
  console.log('HISTORICAL ERASURE passed: native D1/private R2; scoped tombstone required without membership/person; unresolved effect hold; linked private content/blob removal; opaque execution IDs/history and other workspace preserved; replay.');
} finally {await h.close();}

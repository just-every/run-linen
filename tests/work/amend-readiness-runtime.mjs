import assert from 'node:assert/strict';
import {harness} from './amend-harness.mjs';
const h=await harness(),{db,ok,api}=h;
try {
  const work=await ok('/work',{title:'Stock',body:'Needed',deduplicationKey:'stock'},'employee');
  const catalog=await ok('/catalog',{name:'Licensed stock',kind:'software',target:'licensed',ownerId:'owner',capacity:0});
  const input={catalogId:catalog.id,beneficiaryId:'employee',purpose:'Project',expiresAt:new Date(Date.now()+3600000).toISOString()};
  await ok(`/work/${work.id}/fulfilment`,input,'employee');
  const path=`/test/readiness/${work.id}/${catalog.id}`;
  assert.equal((await api(path,undefined,'stranger')).status,404);
  assert.equal((await ok(path,undefined,'employee')).ready,false,'zero capacity is blocked');
  await db.prepare('UPDATE work_catalog SET capacity=1 WHERE id=?').bind(catalog.id).run();
  assert.equal((await ok(path,undefined,'employee')).ready,false,'capacity without reservation is not authority');
  await db.prepare('INSERT INTO work_catalog_reservations VALUES(?,?,?,?,?,NULL)').bind('w',catalog.id,work.id,'employee',new Date().toISOString()).run();
  assert.equal((await ok(path,undefined,'employee')).ready,true);
  const before=(await db.prepare('SELECT COUNT(*) n FROM execution_operations').first()).n;
  await ok(path,undefined,'employee');assert.equal((await db.prepare('SELECT COUNT(*) n FROM execution_operations').first()).n,before,'readiness never dispatches');
  await db.prepare("UPDATE work_obligations SET last_error='Restored held obligation; reconcile source operation' WHERE work_id=?").bind(work.id).run();
  assert.equal((await ok(path,undefined,'employee')).ready,false,'restored hold preserved');
  await db.prepare('UPDATE work_obligations SET last_error=NULL WHERE work_id=?').bind(work.id).run();
  await db.prepare("UPDATE work_records SET state='cancelled' WHERE id=?").bind(work.id).run();
  assert.equal((await ok(path,undefined,'employee')).ready,false);
  console.log('READINESS passed: requester scope, zero-capacity/reservation/current work gate, restored hold, and read-only no dispatch.');
} finally {await h.close();}

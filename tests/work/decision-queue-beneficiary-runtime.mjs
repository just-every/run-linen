import assert from 'node:assert/strict';
import {harness} from './amend-harness.mjs';
const h=await harness(),{db,ok,api}=h;
try {
  await db.exec(`INSERT INTO users VALUES('manager','manager@test','Manager','unused','2026-01-01'); INSERT INTO memberships VALUES('w','manager','["owner"]',1)`);
  for(const id of ['employee','stranger'])await db.exec(`INSERT INTO work_people(id,workspace_id,source,source_id,name,manager_id,active,merged_into,revision,observed_at,effective_at,member_id,binding_id) VALUES('${id}','w','hr','${id}','${id[0].toUpperCase()+id.slice(1)}','manager',1,NULL,1,'2026-01-01','2026-01-01','${id}','binding-${id}')`);
  const catalog=await ok('/catalog',{name:'Managed service',kind:'access',target:'managed',ownerId:'owner',requiresManager:true});
  // The owner raises the request for the employee: requester and beneficiary are different people.
  const onBehalf=await ok('/work',{title:'Raised for the employee',body:'Help',beneficiaryId:'employee',deduplicationKey:'on-behalf'},'owner');
  await ok(`/work/${onBehalf.id}/fulfilment`,{catalogId:catalog.id,beneficiaryId:'employee',purpose:'On behalf'},'owner');
  // A service recorded for a different person than the request is named, not hidden.
  const mismatch=await ok('/work',{title:'Service for someone else',body:'Help',deduplicationKey:'mismatch'},'employee');
  await ok(`/work/${mismatch.id}/fulfilment`,{catalogId:catalog.id,beneficiaryId:'stranger',purpose:'Other person'},'owner');
  const queue=(await ok('/fulfilment-decisions',undefined,'manager')).items;
  const raised=queue.find(item=>item.workId===onBehalf.id),other=queue.find(item=>item.workId===mismatch.id);
  assert.equal(queue.length,2);
  assert.deepEqual([raised.beneficiaryName,raised.requesterName,raised.serviceForOtherPerson],['Employee','Owner',false]);
  assert.deepEqual([other.beneficiaryName,other.requestForName,other.serviceForOtherPerson],['Stranger','Employee',true]);
  await ok(`/work/${onBehalf.id}/fulfilment/approve`,{...raised,expectedHolderId:raised.holderId,idempotencyKey:'on-behalf'},'manager');
  const approval=await db.prepare('SELECT beneficiary_id,holder_id FROM work_fulfilment_approvals WHERE work_id=?').bind(onBehalf.id).first();
  assert.deepEqual([approval.beneficiary_id,approval.holder_id],['employee','manager'],'the decision is recorded for the beneficiary, not the requester');
  assert.deepEqual((await ok('/fulfilment-decisions',undefined,'manager')).items.map(item=>item.workId),[mismatch.id]);
  assert.equal((await ok('/fulfilment-decisions',undefined,'owner')).items.length,0,'the requester does not hold the decision');
} finally { await h.close(); }

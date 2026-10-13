import assert from 'node:assert/strict';
import {runtimeHarness} from '../intelligence/runtime-harness.mjs';
const h=await runtimeHarness('tests/work/person-binding-worker.ts');
const password='isolated binding test passphrase';
async function api(path,body,auth={}) {
 const response=await fetch(h.origin+'/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{Origin:h.origin,'Content-Type':'application/json',...(auth.cookie?{Cookie:auth.cookie}:{}),...(auth.csrf?{'X-Linen-CSRF':auth.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:response.status,value:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function ok(...args){const r=await api(...args);assert.ok(r.status<300,JSON.stringify({path:args[0],...r}));return r;}
async function session(cookie){const auth={cookie};auth.csrf=(await ok('/session',undefined,auth)).value.csrfToken;return auth;}
async function login(email){return session((await ok('/login',{email,password})).cookie);}
try {
 const owner=await session((await ok('/setup',{email:'owner@binding.test',name:'Owner',workspaceName:'Binding proof',password})).cookie);
 const ownerId=(await ok('/session',undefined,owner)).value.principal.userId;
 const add=async(name,roles=['employee'],isPerson=true)=>(await ok('/members',{name,email:name+'@binding.test',roles,password,isPerson},owner)).value;
 const employee=await add('employee'),manager=await add('manager',['approver']);
 assert.notEqual(employee.id,employee.personId);
 const findPerson=async id=>(await ok('/people',undefined,owner)).value.items.find(p=>p.id===id);
 let person=await findPerson(employee.personId);
 assert.equal(person.member_id,employee.id);
 person=(await ok(`/people/${person.id}/binding`,{expectedRevision:person.revision,memberId:employee.id,managerId:manager.id},owner)).value;
 const employeeAuth=await login('employee@binding.test'),managerAuth=await login('manager@binding.test');
 const catalog=(await ok('/catalog',{name:'Project access',kind:'access',target:'project-group',ownerId,requiresManager:true},owner)).value;
 const work=(await ok('/work',{title:'Need project access',body:'Project duties',deduplicationKey:'distinct-member-person'},employeeAuth)).value;
 const request={catalogId:catalog.id,beneficiaryId:employee.id,purpose:'Project duties'};
 const first=await ok(`/work/${work.id}/fulfilment`,request,employeeAuth);
 assert.equal(first.status,201);assert.equal(first.value.state,'blocked');assert.equal(first.value.decisionOwner,manager.id);
 const queue=(await ok('/fulfilment-decisions',undefined,managerAuth)).value.items;
 assert.equal(queue.length,1);assert.equal(queue[0].workId,work.id);assert.equal(queue[0].beneficiaryId,employee.id);
 const approval={...queue[0],expectedHolderId:queue[0].holderId,idempotencyKey:'review'};
 assert.equal(approval.expectedPersonId,person.id);assert.equal(approval.expectedBindingId,person.binding_id);
 const {expectedBindingId,...missingBinding}=approval;
 assert.equal((await api(`/work/${work.id}/fulfilment/approve`,missingBinding,managerAuth)).status,409,'reviewed binding context is required');
 const recorded=await ok(`/work/${work.id}/fulfilment/approve`,approval,managerAuth);
 assert.deepEqual((await ok(`/work/${work.id}/fulfilment/approve`,approval,managerAuth)).value,recorded.value,'exact decision retry is idempotent');
 assert.equal((await ok('/fulfilment-decisions',undefined,managerAuth)).value.items.length,0);
 assert.equal((await ok(`/work/${work.id}/fulfilment`,request,employeeAuth)).value.state,'pending','manager gate passes; provider remains independently unconfigured');
 // A replacement person deliberately reaches the same revision; previous approval must fail.
 await ok(`/people/${person.id}/binding`,{expectedRevision:person.revision,memberId:null},owner);
 const stamp=new Date().toISOString();
 let replacement=(await ok('/people',{source:'reviewed-hr',sourceId:employee.id,name:'Employee',managerId:manager.id,effectiveAt:stamp,observedAt:stamp},owner)).value;
 assert.equal((await ok(`/work/${work.id}/fulfilment`,request,employeeAuth)).value.decisionOwner,null,'source_id is not authority');
 replacement=(await ok(`/people/${replacement.id}/binding`,{expectedRevision:replacement.revision,memberId:employee.id},owner)).value;
 assert.equal(replacement.revision,person.revision);
 assert.equal((await ok(`/work/${work.id}/fulfilment`,request,employeeAuth)).value.state,'blocked');
 assert.equal((await api(`/work/${work.id}/fulfilment/approve`,approval,managerAuth)).status,409);
 assert.equal((await api(`/work/${work.id}/fulfilment/approve`,{...approval,idempotencyKey:'unreviewed-replacement'},managerAuth)).status,409,'fresh event key cannot approve a stale displayed person');
 const refreshed=(await ok('/fulfilment-decisions',undefined,managerAuth)).value.items[0];
 assert.equal(refreshed.expectedWorkRevision,approval.expectedWorkRevision);
 assert.equal(refreshed.expectedFulfilmentRevision,approval.expectedFulfilmentRevision);
 assert.equal(refreshed.expectedPersonRevision,approval.expectedPersonRevision);
 assert.notEqual(refreshed.expectedPersonId,approval.expectedPersonId);
 assert.notEqual(refreshed.expectedBindingId,approval.expectedBindingId);
 const renewed={...refreshed,expectedHolderId:refreshed.holderId,idempotencyKey:'replacement-review'};
 assert.equal((await api(`/work/${work.id}/fulfilment/approve`,{...renewed,idempotencyKey:approval.idempotencyKey},managerAuth)).status,409,'a changed authority context needs a new event key');
 const replaced=await ok(`/work/${work.id}/fulfilment/approve`,renewed,managerAuth);
 assert.deepEqual((await ok(`/work/${work.id}/fulfilment/approve`,renewed,managerAuth)).value,replaced.value);
 assert.equal((await ok(`/work/${work.id}/fulfilment`,request,employeeAuth)).value.state,'pending');
 // Existing person cannot take a member already bound elsewhere, including concurrent review.
 const rival=(await ok('/people',{source:'reviewed-hr',sourceId:'rival',name:'Rival',effectiveAt:stamp,observedAt:stamp},owner)).value;
 assert.equal((await api(`/people/${rival.id}/binding`,{expectedRevision:rival.revision,memberId:employee.id},owner)).status,409);
 const integration=await add('integration',['integration'],false),integrationAuth=await login('integration@binding.test');
 assert.equal((await api(`/people/${rival.id}/binding`,{expectedRevision:1,memberId:integration.id},integrationAuth)).status,403);
 assert.equal((await api('/people',{source:'integration',sourceId:'not-authority',name:'Fact',managerId:manager.id,effectiveAt:stamp,observedAt:stamp},integrationAuth)).status,403);
 assert.equal((await api(`/people/${rival.id}/binding`,{expectedRevision:1,memberId:'unavailable'},owner)).status,409);
 assert.equal((await api(`/people/${rival.id}/binding`,{expectedRevision:1,memberId:integration.id,managerId:manager.personId},owner)).status,409,'manager must be member ID');
 // Two current reviews racing for the same account cannot both succeed.
 const twin=(await ok('/people',{source:'reviewed-hr',sourceId:'twin',name:'Twin',effectiveAt:stamp,observedAt:stamp},owner)).value;
 const races=await Promise.all([rival,twin].map(p=>api(`/people/${p.id}/binding`,{expectedRevision:1,memberId:integration.id},owner)));
 assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
 // A member-beneficiary device request accepts only custody for its reviewed person.
 const asset=(await ok('/assets',{serial:'BOUND-DEVICE',source:'binding-fixture'},owner)).value;
 const assigned=(await ok(`/assets/${asset.id}/commands`,{revision:1,command:'assign',personId:replacement.id,evidence:'Fixture assignment'},owner)).value;
 const received=(await ok(`/assets/${asset.id}/commands`,{revision:2,command:'receive',personId:replacement.id,evidence:'Fixture receipt'},owner)).value;
 const device=(await ok('/catalog',{name:'Device',kind:'device',target:asset.id,ownerId},owner)).value;
 const deviceWork=(await ok('/work',{title:'Device needed',body:'Employee device',deduplicationKey:'bound-device'},employeeAuth)).value;
 await ok(`/work/${deviceWork.id}/fulfilment`,{catalogId:device.id,beneficiaryId:employee.id,purpose:'Device duties'},employeeAuth);
 const physical=(await ok(`/work/${deviceWork.id}/obligations`,undefined,owner)).value.items.find(o=>o.kind==='device.deliver');
 assert.equal((await api(`/obligations/${physical.id}/physical`,{revision:physical.revision,custodyEventId:assigned.custodyEventId},owner)).status,422,'assignment is not a receipt');
 replacement=(await ok(`/people/${replacement.id}/binding`,{expectedRevision:replacement.revision,memberId:null},owner)).value;
 assert.equal((await api(`/obligations/${physical.id}/physical`,{revision:physical.revision,custodyEventId:received.custodyEventId},owner)).status,422,'unbound account cannot use the former person receipt');
 replacement=(await ok(`/people/${replacement.id}/binding`,{expectedRevision:replacement.revision,memberId:employee.id,managerId:manager.id},owner)).value;
 assert.equal((await ok(`/obligations/${physical.id}/physical`,{revision:physical.revision,custodyEventId:received.custodyEventId},owner)).value.state,'verified');
 // Both privacy entry identities reach the other half of a reviewed link.
 const erased=await ok('/adoption/erase',{identity:replacement.id},owner);
 assert.ok(['completed','pending'].includes(erased.value.state),JSON.stringify(erased.value));
 const db=await h.db;
 assert.equal((await db.prepare('SELECT title FROM work_records WHERE id=?').bind(work.id).first()).title,'[erased]');
 assert.equal(await db.prepare('SELECT 1 FROM memberships WHERE user_id=? AND active=1').bind(employee.id).first(),null);
 const second=await add('second');
 await ok(`/people/${second.personId}/commands`,{revision:1,command:'deactivate'},owner);
 const secondErase=await ok('/adoption/erase',{identity:second.id},owner);
 assert.ok(['completed','pending'].includes(secondErase.value.state),JSON.stringify(secondErase.value));
 assert.equal((await findPerson(second.personId)).active,0);
 // Correcting a mistaken relationship never makes two current people one privacy identity.
 for(const entry of ['adoption-person','work-member']) {
  const alice=await add('alice-'+entry),bob=await add('bob-'+entry,['employee'],false);
  let mistaken=await findPerson(alice.personId);
  mistaken=(await ok(`/people/${mistaken.id}/binding`,{expectedRevision:mistaken.revision,memberId:null},owner)).value;
  mistaken=(await ok(`/people/${mistaken.id}/binding`,{expectedRevision:mistaken.revision,memberId:bob.id},owner)).value;
  let corrected=(await ok('/people',{source:'corrected-hr',sourceId:entry,name:'Alice',effectiveAt:stamp,observedAt:stamp},owner)).value;
  corrected=(await ok(`/people/${corrected.id}/binding`,{expectedRevision:corrected.revision,memberId:alice.id},owner)).value;
  const bobWork=(await ok('/work',{title:'Bob retained',body:'Bob private request',beneficiaryId:bob.id,deduplicationKey:'bob-'+entry},owner)).value;
  const aliceWork=(await ok('/work',{title:'Alice private',body:'Alice private request',beneficiaryId:alice.id,deduplicationKey:'alice-'+entry},owner)).value;
  if(entry==='adoption-person')await ok('/adoption/erase',{identity:corrected.id},owner);
  else await ok(`/people/${alice.id}/erase`,{revision:0,reason:'Authorized fixture erasure'},owner);
  assert.equal((await findPerson(corrected.id)).active,0);
  assert.equal((await findPerson(mistaken.id)).active,1);
  assert.equal((await db.prepare('SELECT active FROM memberships WHERE user_id=?').bind(bob.id).first()).active,1);
  assert.equal((await db.prepare('SELECT title FROM work_records WHERE id=?').bind(bobWork.id).first()).title,'Bob retained');
  assert.equal((await db.prepare('SELECT title FROM work_records WHERE id=?').bind(aliceWork.id).first()).title,'[erased]');
  assert.equal((await api('/people',{source:corrected.source,sourceId:corrected.source_id,name:'Replay Alice',effectiveAt:new Date(Date.now()+1000).toISOString(),observedAt:stamp},owner)).status,409);
 }
 console.log('PASS fresh authenticated distinct employee/person: reviewed binding, manager queue and approval, independent provider pending, coincident-revision replacement rejected, source-ID inference denied, unique binding and integration authority denied, bound device receipt and unbound denial, deactivated and bidirectional privacy, corrected relationships preserve unrelated accounts/work and reject source replay.');
} finally {await h.close();}

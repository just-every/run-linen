import assert from 'node:assert/strict';
import { action, local, later } from './connected-helpers.mjs';
import { nativeCreate } from './native-regressions.mjs';
import { captureJourney } from './viewport-evidence.mjs';
export async function connectedLifecycle(env) {
  const {page,api,base,out,issuerApi,graph,probe,tick,until,fixture}=env,uid=(await api('/session')).principal.userId;
  const person=(await api('/people')).items.find(p=>p.source_id==='provider-colleague');assert.ok(person);
  const id=await nativeCreate(page,base,'lifecycle','Record an authoritative HR change',{'Person':person.id,'What is changing?':'leave','Effective date and time':local(-60000),'Employment timezone':'UTC','Authoritative HR source':'Selected fixture HR','HR source revision':1,'Accountable owner':uid,'Immutable provider account or UPN':'provider-colleague','Access that remains valid':'independent-alumni-right','Access to remove':'old-team'});
  let life=await api('/lifecycle/'+id);
  const disable=life.obligations.find(o=>o.kind==='identity.disable');
  async function bind(duty, lifecycleId = id) {
    const grant=await issuerApi('/grants',{principalId:uid,beneficiaryId:person.id,action:duty.kind,actionVersion:1,target:'provider-colleague',connectionId:graph.id,validFrom:later(-60000),validUntil:later(3600000),maxUses:5,conditions:{},verifierConnectionId:probe.id});
    await page.goto(base+'/app#/lifecycle/'+lifecycleId);
    await action(page,'Bind the reviewed security action',{step:{action:duty.kind,actionVersion:1,target:'provider-colleague',beneficiaryId:person.id,connectionId:graph.id,connectionRevision:graph.revision,verifierConnectionId:probe.id,verifierConnectionRevision:probe.revision,grantId:grant.id,grantVersion:grant.version,cohort:[person.id]}},'/obligations/'+duty.id+'/execution');
  }
  await bind(disable);
  await until(async()=> (await api('/lifecycle/'+id)).obligations.find(o=>o.id===disable.id).state==='verified','partial leave security disable');
  life=await api('/lifecycle/'+id);assert.notEqual(life.obligations.find(o=>o.kind==='sessions.revoke').state,'verified');assert.notEqual(life.obligations.find(o=>o.kind==='access.revoke').state,'verified');assert.ok(!life.obligations.some(o=>o.target==='independent-alumni-right'));
  await page.reload();await captureJourney(page,{path:out+'/J3-partial-security.png',fullPage:true});
  await bind(life.obligations.find(o=>o.kind==='sessions.revoke'));
  await until(async()=> (await api('/lifecycle/'+id)).obligations.find(o=>o.kind==='sessions.revoke').state==='verified','irreversible sessions revocation');
  const before=await (await fetch(base+'/__fixture/evidence')).json();assert.ok(before.state.sessionsRevokedAt);
  await page.reload();await action(page,'Cancel this lifecycle change',{},'/amend','Record cancellation');
  const cancelled=await api('/lifecycle/'+id);assert.ok(cancelled.lifecycle.cancelled_at);assert.equal(cancelled.obligations.find(o=>o.kind==='sessions.revoke').state,'verified');assert.equal(cancelled.obligations.find(o=>o.kind==='access.revoke').state,'cancelled');
  await tick();assert.equal((await (await fetch(base+'/__fixture/evidence')).json()).state.sessionsRevokedAt,before.state.sessionsRevokedAt);
  await page.reload();await page.getByText('Existing sessions were invalidated.',{exact:false}).waitFor();
  await captureJourney(page,{path:out+'/J3-cancel-stopped-and-irreversible.png',fullPage:true});
  // LIFE-006: a contractor end date names a sponsor; the 72-hour reminder lets only the sponsor re-attest,
  // and without re-attestation the removal runs and is independently verified at the end instant.
  const contract=(source,expiresAt)=>api('/lifecycle',{personId:person.id,kind:'move',effectiveAt:later(-60000),timezone:'UTC',source,sourceRevision:1,ownerId:uid,
    identityTarget:'provider-colleague',retained:[],added:[],removed:[],deviceIds:[],expiresAt,sponsorId:uid});
  const kept=(await contract('LIFE-006 sponsored contract',later(71*3600000))).lifecycleId;
  await tick();
  const reminder=(await api('/work')).items.find(w=>JSON.parse(w.context_json||'{}').sponsorReminder?.lifecycleId===kept);
  assert.ok(reminder,'LIFE-006 the sponsor is reminded within 72 hours of the end date');
  await page.goto(base+'/app#/work/'+reminder.id);
  await page.getByRole('region',{name:'Sponsor re-attestation'}).waitFor();
  await captureJourney(page,{path:out+'/LIFE-006-sponsor-reminder.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  const extended=await action(page,'Re-attest with a later end date',{expiresAt:local(10*86400000)},`/lifecycle/${kept}/reattest`,'Re-attest');
  await page.setViewportSize({width:1440,height:1000});
  assert.equal((await api('/lifecycle/sponsored')).items.find(i=>i.lifecycleId===kept).expiresAt,extended.expiresAt,'LIFE-006 re-attestation at 390 moves the end date');
  // The contractor's provider account is active again before the contract ends (the J3 leave above disabled it).
  await fixture({disabled:false,sessionsRevokedAt:null});
  const endAt=later(75000),lapsed=(await contract('LIFE-006 lapsed contract',endAt)).lifecycleId;
  const expiry=()=>api('/lifecycle/'+lapsed).then(l=>l.obligations.filter(o=>['identity.disable','sessions.revoke'].includes(o.kind)));
  assert.equal((await expiry()).length,2);
  for(const duty of await expiry())await bind(duty,lapsed);
  await tick();
  assert.ok(Date.now()<Date.parse(endAt),'LIFE-006 bindings completed before the end instant');
  assert.ok((await expiry()).every(o=>o.state==='pending'&&!o.operation_id),'LIFE-006 access remains until the end instant');
  await page.waitForTimeout(Math.max(0,Date.parse(endAt)-Date.now()+500));
  await until(async()=>(await expiry()).every(o=>o.state==='verified'),'LIFE-006 removal verified after the end instant');
  const operations=await api('/operations');
  for(const duty of await expiry()){const op=operations.find(o=>o.id===duty.operation_id);assert.ok(op&&op.created_at>=endAt,'LIFE-006 removal began at or after the end instant')}
  const provider=(await (await fetch(base+'/__fixture/evidence')).json()).state;
  assert.equal(provider.disabled,true);assert.ok(provider.sessionsRevokedAt>=endAt,'LIFE-006 the provider account was disabled and its sessions revoked after the end instant');
  await page.goto(base+'/app#/lifecycle/'+lapsed);await page.reload();
  await page.getByText('Existing sessions were invalidated.',{exact:false}).waitFor();
  await captureJourney(page,{path:out+'/LIFE-006-expired-verified.png',fullPage:true});
  await birthrightBaselineJourney(env);
}

/** Focused entry point shares the exact birthright flow used by the connected CI journey. */
export async function birthrightBaselineJourney(env) {
  const {page,api,base,out,issuerApi,graph,probe,until,fixture}=env,uid=(await api('/session')).principal.userId;
  const person=(await api('/people')).items.find(p=>p.source_id==='provider-colleague');assert.ok(person);
  // LIFE-003: owner access policies compute a Sales-to-Marketing move; standing grants execute it at the provider with independent readback.
  await fixture({disabled:false,sessionsRevokedAt:null});
  const sales=await api('/catalog-values',{dimension:'department',label:'Sales'}),marketing=await api('/catalog-values',{dimension:'department',label:'Marketing'}),legal=await api('/catalog-values',{dimension:'department',label:'Legal'});
  await page.goto(base+'/app#/lifecycle');
  for(const [name,match,target] of [['Everyone',{},'slack-users'],['Sales apps',{department:[sales.id]},'salesforce-users'],['Marketing apps',{department:[marketing.id]},'hubspot-users']])
    await action(page,'Add an access baseline',{name,match,grants:[{kind:'group',target}]},'/access-policies',undefined,201);
  const move=(source,from,to)=>api('/lifecycle',{personId:person.id,kind:'move',effectiveAt:later(-60000),timezone:'UTC',source,sourceRevision:1,ownerId:uid,identityTarget:'provider-colleague',retained:[],added:[],removed:[],deviceIds:[],baseline:{from:{department:from},to:{department:to}}});
  const accessDuties=async lifecycleId=>(await api('/lifecycle/'+lifecycleId)).obligations.filter(o=>o.kind.startsWith('access.'));
  async function standing(duty){
    const step={action:duty.kind==='access.grant'?'group.add':'group.remove',actionVersion:1,target:duty.target,beneficiaryId:person.id,connectionId:graph.id,connectionRevision:graph.revision,verifierConnectionId:probe.id,verifierConnectionRevision:probe.revision,cohort:[person.id]};
    const grant=await issuerApi('/grants',{principalId:uid,beneficiaryId:person.id,action:step.action,actionVersion:1,target:duty.target,connectionId:graph.id,validFrom:later(-60000),validUntil:later(3600000),maxUses:5,conditions:{},verifierConnectionId:probe.id});
    await api('/obligations/'+duty.id+'/execution',{...step,grantId:grant.id,grantVersion:grant.version});
  }
  const settled=async lifecycleId=>until(async()=>(await accessDuties(lifecycleId)).every(o=>o.state==='verified'),'LIFE-003 policy-derived duties verified');
  const first=(await move('LIFE-003 Legal to Sales',legal.id,sales.id)).lifecycleId;
  assert.deepEqual((await accessDuties(first)).map(o=>o.kind+':'+o.target),['access.grant:salesforce-users']);
  for(const duty of await accessDuties(first))await standing(duty);
  await settled(first);
  const second=(await move('LIFE-003 Sales to Marketing',sales.id,marketing.id)).lifecycleId;
  const review=(await api('/lifecycle/'+second)).baseline;
  assert.deepEqual([review.retained,review.added,review.removed],[['slack-users'],['hubspot-users'],['salesforce-users']],'LIFE-003 Salesforce removed, HubSpot added, Slack retained');
  await page.goto(base+'/app#/lifecycle/'+second);await page.getByRole('region',{name:'Access baseline review'}).waitFor();
  await captureJourney(page,{path:out+'/LIFE-003-baseline-review.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.reload();await page.getByRole('region',{name:'Access baseline review'}).waitFor();
  await captureJourney(page,{path:out+'/LIFE-003-baseline-review-390.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  const writesBefore=(await (await fetch(base+'/__fixture/evidence')).json()).calls.filter(c=>c.kind==='entitlement-write').length;
  for(const duty of await accessDuties(second))await standing(duty);
  await settled(second);
  const seen=await (await fetch(base+'/__fixture/evidence')).json(),writes=seen.calls.filter(c=>c.kind==='entitlement-write').slice(writesBefore);
  assert.deepEqual(writes.map(c=>c.data.method+':'+c.data.target).sort(),['DELETE:salesforce-users','POST:hubspot-users'],'LIFE-003 only the added and removed access reach the provider; Slack is retained untouched');
  assert.ok(seen.presence.some(p=>p.target==='hubspot-users')&&!seen.presence.some(p=>p.target==='salesforce-users'),'LIFE-003 provider readback shows HubSpot present and Salesforce removed');
  assert.ok(seen.calls.some(c=>c.kind==='workflow-observation'&&c.data.target==='salesforce-users'&&c.data.desired==='denied'),'LIFE-003 independent negative workflow check after removal');
  const ran=await api('/operations');
  for(const duty of await accessDuties(second))assert.ok(ran.find(o=>o.id===duty.operation_id),'LIFE-003 each duty ran as one operation under its standing grant');
  await page.goto(base+'/app#/lifecycle/'+second);await page.reload();
  for(const kind of ['Access grant','Access revoke'])await page.locator('.connection-record').filter({has:page.getByRole('heading',{name:kind,exact:true})}).locator(':scope > .record-heading .badge-text').filter({hasText:/^verified$/i}).waitFor();
  await captureJourney(page,{path:out+'/LIFE-003-baseline-verified.png',fullPage:true});
}

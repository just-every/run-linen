import assert from 'node:assert/strict';
import { action, local, later } from './connected-helpers.mjs';
import { nativeCreate } from './native-regressions.mjs';
import { captureJourney } from './viewport-evidence.mjs';
export async function connectedLifecycle(env) {
  const {page,api,base,out,issuerApi,graph,probe,tick,until}=env,uid=(await api('/session')).principal.userId;
  const person=(await api('/people')).items.find(p=>p.source_id==='provider-colleague');assert.ok(person);
  const id=await nativeCreate(page,base,'lifecycle','Record an authoritative HR change',{'Person':person.id,'What is changing?':'leave','Effective date and time':local(-60000),'Employment timezone':'UTC','Authoritative HR source':'Selected fixture HR','HR source revision':1,'Accountable owner':uid,'Immutable provider account or UPN':'provider-colleague','Access that remains valid':'independent-alumni-right','Access to remove':'old-team'});
  let life=await api('/lifecycle/'+id);
  const disable=life.obligations.find(o=>o.kind==='identity.disable');
  async function bind(duty) {
    const grant=await issuerApi('/grants',{principalId:uid,beneficiaryId:person.id,action:duty.kind,actionVersion:1,target:'provider-colleague',connectionId:graph.id,validFrom:later(-60000),validUntil:later(3600000),maxUses:5,conditions:{},verifierConnectionId:probe.id});
    await page.goto(base+'/app#/lifecycle/'+id);
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
}

import assert from 'node:assert/strict';
import { apiFor, requestWork, later, signIn } from './connected-helpers.mjs';
import { nativeGrantPair } from './connected-setup.mjs';
import { captureJourney } from './viewport-evidence.mjs';
export async function connectedRequest(env) {
  const {browser,page,api,base,out,fixture,tick,until,employee,actor,probe}=env;
  const ownerId=(await api('/session')).principal.userId;
  const createdCatalog=await api('/catalog',{name:'Fixture design workspace',kind:'access',target:'design-group',ownerId});
  const catalog=(await api('/catalog')).items.find(c=>c.id===createdCatalog.id);
  await fixture({catalogId:catalog.id});
  const ctx=await browser.newContext({timezoneId:'UTC',viewport:{width:1440,height:1000}});
  try{
    const ep=await ctx.newPage();await signIn(ep,base,'avery@example.test');const employeeApi=apiFor(ep);
    const missing=await requestWork(ep,base,'I need help with my project');
    await tick();await ep.reload();await ep.getByText('Which application do you need?',{exact:false}).first().waitFor();
    assert.equal((await api('/operations')).length,0);
    await captureJourney(ep,{path:out+'/J2-missing-fact.png',fullPage:true});
    const workId=await requestWork(ep,base,'Please give me temporary access for a review until '+later(3600000));
    await tick();
    assert.equal((await api('/operations')).length,0,'No standing permission means zero external operations');
    assert.equal((await (await fetch(base+'/__fixture/evidence')).json()).calls.filter(c=>c.kind==='entitlement-write').length,0);
    await ep.reload();await ep.getByText('Keep the conversation going').waitFor();
    await captureJourney(ep,{path:out+'/J2-denied-without-authority.png',fullPage:true});
    await nativeGrantPair({...env,catalog});
    await until(async()=> (await employeeApi('/work/'+workId+'/obligations')).items.some(o=>o.kind==='access.grant'&&o.state==='verified'),'granted usable workflow');
    const added=(await (await fetch(base+'/__fixture/evidence')).json());
    assert.ok(added.presence.some(p=>p.target==='design-group'));
    assert.equal(added.calls.filter(c=>c.kind==='entitlement-write'&&c.data.method==='POST').length,1);
    await ep.reload();await ep.getByText('Keep the conversation going').waitFor();
    await captureJourney(ep,{path:out+'/J2-granted-verified.png',fullPage:true});
    const expiry=later(8000);
    await ep.getByLabel('Keep the conversation going').fill('Correction: the same access is only needed until '+expiry);
    await ep.getByRole('button',{name:'Send message',exact:true}).click();
    await until(async()=> (await employeeApi('/work/'+workId+'/fulfilments/'+catalog.id)).expiresAt===expiry,'same-conversation expiry correction');
    await until(async()=> (await employeeApi('/work/'+workId+'/obligations')).items.some(o=>o.kind==='access.revoke'&&o.state==='verified'),'actual due revocation');
    const removed=await (await fetch(base+'/__fixture/evidence')).json();
    assert.equal(removed.presence.some(p=>p.target==='design-group'),false);
    assert.equal(removed.calls.filter(c=>c.kind==='entitlement-write'&&c.data.method==='DELETE').length,1);
    assert.equal(removed.calls.filter(c=>c.kind==='entitlement-write'&&c.data.method==='POST').length,1);
    assert.ok(removed.calls.some(c=>c.kind==='workflow-observation'&&c.data.desired==='denied'),'Independent negative workflow after removal');
    await ep.reload();await ep.getByText('Keep the conversation going').waitFor();
    await captureJourney(ep,{path:out+'/J2-expiry-provider-denial.png',fullPage:true});
    await keptMembership({...env,ep,employeeApi},catalog.id);
    return {workId,catalog};
  }finally{await ctx.close()}
}
// ACCESS-006 point 2: a member who already held the group keeps it when a distinct temporary fulfilment expires.
async function keptMembership(env,primaryCatalogId) {
  const {ep,employeeApi,api,base,out,fixture,tick,until}=env;
  const evidence=async()=> (await fetch(base+'/__fixture/evidence')).json();
  const writes=(e,target,method)=>e.calls.filter(c=>c.kind==='entitlement-write'&&c.data.target===target&&c.data.method===method).length;
  const ownerId=(await api('/session')).principal.userId;
  const created=await api('/catalog',{name:'Fixture review workspace',kind:'access',target:'review-group',ownerId});
  const catalog=(await api('/catalog')).items.find(c=>c.id===created.id);
  await fixture({catalogId:catalog.id});
  await fetch(base+'/__fixture/presence',{method:'POST',body:JSON.stringify({target:'review-group'})});
  const before=await evidence();
  assert.ok(before.presence.some(p=>p.target==='review-group'),'The provider already lists the member before any Linen action');
  assert.ok(before.presence.every(p=>p.target!=='design-group'),'The newly added control membership stays removed');
  // The first pair is fully recorded: start a fresh review in a fresh page state so the new catalogue item is offered.
  await env.page.evaluate(()=>sessionStorage.clear());await env.page.reload();
  await nativeGrantPair({...env,catalog});
  const expiry=later(30000);
  const workId=await requestWork(ep,base,'Please give me temporary access for a second review until '+expiry);
  const operation=async()=> (await api('/operations')).filter(o=>JSON.parse(o.step_json).target==='review-group');
  await until(async()=> (await operation()).some(o=>o.state==='blocked'&&o.last_error==='target_precondition_changed'),'existing membership is refused as a fresh grant');
  await ep.reload();await ep.getByText('Keep the conversation going').waitFor();
  await captureJourney(ep,{path:out+'/J2-existing-membership-held.png',fullPage:true});
  await new Promise(r=>setTimeout(r,Math.max(0,Date.parse(expiry)-Date.now())+500));
  await until(async()=> (await operation()).some(o=>o.state==='cancelled'),'due removal of an unchanged membership is cancelled');
  const after=await evidence();
  assert.ok(after.presence.some(p=>p.target==='review-group'),'Fresh provider readback still shows the pre-existing membership after expiry');
  assert.equal(writes(after,'review-group','DELETE'),0,'No removal of access the member already had');
  assert.equal(writes(after,'review-group','POST'),0,'No duplicate addition of access the member already had');
  const states=(await employeeApi('/work/'+workId+'/obligations')).items.filter(o=>o.target==='review-group');
  assert.ok(states.every(o=>o.state!=='verified'),'Nothing is reported as granted or removed that Linen did not do');
  assert.equal(after.presence.some(p=>p.target==='design-group'),false,'The newly added membership control stays removed');
  await ep.goto(base+'/app#/work/'+workId);await ep.getByText('Keep the conversation going').waitFor();
  await ep.getByText('0 of 2 verified').waitFor();
  await captureJourney(ep,{path:out+'/J2-existing-membership-kept.png',fullPage:true});
  await fixture({catalogId:primaryCatalogId});
}

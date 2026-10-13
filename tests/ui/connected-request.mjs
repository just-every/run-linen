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
    return {workId,catalog};
  }finally{await ctx.close()}
}

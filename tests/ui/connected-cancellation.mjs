import assert from 'node:assert/strict';
import {action,requestWork,later} from './connected-helpers.mjs';
import {captureJourney} from './viewport-evidence.mjs';
export async function connectedCancellation(env){
 const {page,api,issuerApi,base,out,graph,probe,fixture,tick,until}=env,uid=(await api('/session')).principal.userId;
 for(const unknown of [false,true]){
  const target=unknown?'unknown-cancel-group':'reversible-cancel-group';
  const workId=await requestWork(page,base,'Cancel the reviewed '+target+' access when no longer required');await tick();
  const grants=[];
  for(const actionName of ['group.add','group.remove'])grants.push(await issuerApi('/grants',{principalId:uid,beneficiaryId:uid,action:actionName,actionVersion:1,target,connectionId:graph.id,validFrom:later(-60000),validUntil:later(3600000),maxUses:5,conditions:{},verifierConnectionId:probe.id}));
  const step={action:'group.add',actionVersion:1,target,beneficiaryId:uid,connectionId:graph.id,connectionRevision:graph.revision,verifierConnectionId:probe.id,verifierConnectionRevision:probe.revision,grantId:grants[0].id,grantVersion:grants[0].version,compensationGrantId:grants[1].id};
  const {work}=await api('/work/'+workId);
  const plan=await api('/plans',{workId,revision:work.revision,steps:[step],idempotencyKey:target});
  await page.goto(base+'/app#/plans');await action(page,'Dispatch under current authority',{},'/plans/'+plan.id+'/dispatch','Dispatch plan');
  await fixture({lostReceipt:unknown,probeUnknown:unknown});await tick();
  const original=(await api('/operations')).find(o=>o.plan_id===plan.id&&o.parent_id==='initial');assert.ok(original);
  assert.equal((await (await fetch(base+'/__fixture/evidence')).json()).presence.some(p=>p.target===target),true);
  if(unknown)assert.notEqual(original.state,'verified');else {assert.equal(original.state,'effect_verified');await page.goto(base+'/app#/operations');await action(page,'Verify usable work independently',{},'/operations/'+original.id+'/verify','Run independent verifier');assert.equal((await api('/operations')).find(o=>o.id===original.id).state,'verified');}
  await page.goto(base+'/app#/work/'+workId);await page.getByRole('button',{name:'Cancel this request',exact:true}).click();await page.getByLabel('Reason',{exact:true}).fill('Access no longer needed; reconcile any uncertain effect and use separately granted removal.');
  const response=page.waitForResponse(r=>r.url().endsWith('/work/'+workId+'/commands'));await page.getByRole('button',{name:'Save to this conversation',exact:true}).click();assert.equal((await response).status(),200);
  assert.equal((await api('/work/'+workId)).work.state,'cancelled');
  let operations=(await api('/operations')).filter(o=>o.plan_id===plan.id);assert.ok(operations.find(o=>o.id===original.id).cancel_requested);assert.ok(operations.some(o=>o.parent_id===original.id),'Cancellation creates separately authorised compensation');
  if(unknown){await tick();assert.ok((await api('/operations')).filter(o=>o.plan_id===plan.id).some(o=>o.state!=='verified'));await page.goto(base+'/app#/operations');await captureJourney(page,{path:out+'/J2-unknown-cancellation-retained.png',fullPage:true})}
  await fixture({lostReceipt:false,probeUnknown:false});
  await until(async()=> (await api('/operations')).some(o=>o.parent_id===original.id&&o.state==='effect_verified'),'provider reconciliation of cancellation removal');
  const removal=(await api('/operations')).find(o=>o.parent_id===original.id);await page.goto(base+'/app#/operations');await action(page,'Verify usable work independently',{},'/operations/'+removal.id+'/verify','Run independent verifier');assert.equal((await api('/operations')).find(o=>o.id===removal.id).state,'verified');
  const evidence=await (await fetch(base+'/__fixture/evidence')).json();assert.equal(evidence.presence.some(p=>p.target===target),false);assert.equal(evidence.calls.filter(c=>c.kind==='entitlement-write'&&c.data.target===target&&c.data.method==='POST').length,1,'Unknown effect is never blindly repeated');assert.equal(evidence.calls.filter(c=>c.kind==='entitlement-write'&&c.data.target===target&&c.data.method==='DELETE').length,1);
  await page.goto(base+'/app#/operations');await captureJourney(page,{path:out+'/J2-'+(unknown?'reconciled-unknown':'reversible')+'-cancel.png',fullPage:true});
 }
}

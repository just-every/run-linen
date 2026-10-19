import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { action, fields, local, later, signIn, apiFor, requestWork } from './connected-helpers.mjs';
import { nativeCreate } from './native-regressions.mjs';
import { captureJourney } from './viewport-evidence.mjs';

async function newChange(env,title,person) {
  const {page,base,serviceId,deployment,probe}=env;
  await page.goto(base+'/app#/changes');await page.getByText('Add change',{exact:true}).click();
  const form=page.locator('details').filter({has:page.locator('summary').getByText('Add change',{exact:true})});
  await fields(form,{title,service:serviceId,risk:'Bounded fixture repair; rollback may fail',impact:'Restore the selected renewal cohort',windowStart:local(-60000),windowEnd:local(3600000),cohorts:person,canaryCohorts:person,beneficiary:person,release:'claims-canonical',compensationRelease:'claims-legacy'});
  await form.getByLabel('Deployment connection').selectOption(deployment.id);await form.getByLabel('Deployment target').selectOption('orders');await form.getByLabel('Workflow verifier').selectOption(probe.id);
  const response=page.waitForResponse(r=>r.url().endsWith('/changes')&&r.request().method()==='POST');await form.getByRole('button',{name:'Save change draft'}).click();const r=await response;assert.equal(r.status(),201);const change=await r.json();await page.waitForURL(/#\/changes\/.+/);return change;
}
async function authorize(env,change) {
  const {page,base,issuerApi,deployment,probe}=env,uid=(await env.api('/session')).principal.userId,refs=[];
  for(const phase of ['canary','rollout','compensate']){
    const impl=phase==='compensate'?change.data.compensation:change.data.implementation;
    const payload={...impl.payload,phase,cohorts:change.data.cohorts,implementationRevision:change.data.implementationRevision};
    const g=await issuerApi('/grants',{principalId:uid,beneficiaryId:impl.beneficiaryId,action:'deployment.'+phase,actionVersion:1,target:'orders',connectionId:deployment.id,validFrom:later(-60000),validUntil:later(3600000),maxUses:10,conditions:{payloadHash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')},verifierConnectionId:probe.id});refs.push({...g,phase});
  }
  await page.goto(base+'/app#/changes/'+change.id);return action(page,'Record current change authority',{reason:'Scoped exact fixture release and separate compensation authority',...Object.fromEntries(refs.map(ref=>[ref.phase,ref.id]))},'/authorize');
}
async function phase(env,changeId,name) {
  const {page,base}=env;await page.goto(base+'/app#/changes/'+changeId);
  let r=await action(page,'Run a controlled change phase',{phase:name},'/dispatch');await page.reload();
  const invocation=r.data.invocations.at(-1);assert.ok(invocation.executionId);
  r=await action(page,'Verify an actual invocation',{invocationId:invocation.id},'/verify');return r;
}
export async function connectedChanges(env) {
  const {page,api,base,out,fixture,tick,until,commitmentId,serviceId,employee}=env,uid=(await api('/session')).principal.userId;
  const incidentId=await nativeCreate(page,base,'incidents','Add incident',{'What is happening?':'Renewal orders interrupted in two cohorts','Who may see this?':'workspace','Affected service':serviceId,'Impact on people’s work':'London new sessions and Sydney existing sessions need separate checks','Affected groups':uid+'\n'+employee.id});
  for(const hypothesis of ['Rotated claim regression','Independent route degradation']){await action(page,'Assign a scoped diagnostic',{assignee:uid,scope:'Read declared independent fixture probes only',hypothesis,budget:2},'/diagnostics');await page.reload()}
  await page.getByText('Operator research & scoped diagnostics',{exact:true}).click();
  await page.locator('details').filter({has:page.getByText('Operator research & scoped diagnostics',{exact:true})}).getByText('Rotated claim regression',{exact:true}).waitFor();
  await captureJourney(page,{path:out+'/J4-rival-native-diagnostics.png',fullPage:true});
  await page.goto(base+'/app#/connections');
  const reasoning=page.locator('.connection-record').filter({has:page.getByRole('heading',{name:'Fixture reasoning revised',exact:true})});
  const checked=page.waitForResponse(r=>r.url().endsWith('/connections/'+env.model.id+'/test'));await reasoning.getByRole('button',{name:'Check connection',exact:true}).click();assert.equal((await checked).status(),200);
  await fixture({serviceId});
  const employeeContext=await env.browser.newContext({timezoneId:'UTC'}),employeePage=await employeeContext.newPage();
  await signIn(employeePage,base,'avery@example.test');const employeeApi=apiFor(employeePage);
  const employeeWork=await requestWork(employeePage,base,'My renewal orders fail in the Sydney session');
  await until(async()=> (await employeeApi('/work/'+employeeWork)).work.kind==='incident','native employee service classification');
  assert.ok((await api('/incidents/'+incidentId)).data.links.some(l=>l.employeeIncidentId===employeeWork));
  const first=await newChange(env,'Remove recurring claims bridge for London',uid);
  // CHANGE-002: the change shows its score, band, factors and the path the band selected.
  assert.ok(first.data.riskScore.factors.some(f=>f.factor==='production'));assert.equal(first.data.approvalPath,first.data.riskScore.band==='low'?'change-manager':'cab');
  await page.goto(base+'/app#/changes/'+first.id);await page.reload();
  await page.getByText(`${first.data.riskScore.score} · ${first.data.riskScore.band}`,{exact:true}).waitFor();
  await captureJourney(page,{path:out+'/CHANGE-002-risk-score.png',fullPage:true});
  await authorize(env,first);
  const conflict=await newChange(env,'Conflicting London release window',uid);await authorize(env,conflict);
  await page.goto(base+'/app#/changes/'+first.id);
  const denied=await action(page,'Run a controlled change phase',{phase:'canary'},'/dispatch','Save',409);assert.equal(denied.error.code,'conflicting_change');
  const writesBefore=(await (await fetch(base+'/__fixture/evidence')).json()).calls.filter(c=>c.kind==='deployment-write').length;
  await page.goto(base+'/app#/changes/'+conflict.id);
  const amended=await action(page,'Advanced: amend the implementation',{implementation:conflict.data.implementation,risk:'Defer conflicting repair',impact:'Keep draft pending current scope'},'/changes/'+conflict.id);
  assert.equal(amended.data.state,'draft');assert.equal(amended.data.authorizations.length,0);assert.equal(amended.data.priorAuthorizations.length,1);
  await action(page,'Run a controlled change phase',{phase:'canary'},'/dispatch','Save',409);
  assert.equal((await (await fetch(base+'/__fixture/evidence')).json()).calls.filter(c=>c.kind==='deployment-write').length,writesBefore);
  await captureJourney(page,{path:out+'/J4-conflict-and-invalidated-authority.png',fullPage:true});
  await fixture({repaired:false,healthyCohort:null,engineering:false});
  await page.goto(base+'/app#/commitments/'+commitmentId);await action(page,'Observe this commitment now',{},'/observe','Run scoped observations');
  await page.goto(base+'/app#/simplifications');
  const simplification=await action(page,'Propose a measurable simplification',{commitmentId,changeId:first.id,redesign:'Remove the claims translation bridge and consume canonical claims directly',continuedRepair:'Continue emergency bridge patches after each identity rotation',baselineFrom:local(-3600000)},'/simplifications','Save',201);
  assert.equal(simplification.data.baselineBasis,'machine_observed');
  await until(async()=> (await api('/changes/'+first.id)).data.state==='verified','preauthorised redesign canary and rollout');
  await tick();
  let incident=await api('/incidents/'+incidentId);assert.equal(incident.data.status,'partially-restored');assert.deepEqual(incident.data.unresolvedCohorts,[employee.id]);
  await page.goto(base+'/app#/incidents/'+incidentId);await page.getByText('Avery Colleague',{exact:true}).waitFor();
  await captureJourney(page,{path:out+'/J4-London-recovered-Sydney-unknown.png',fullPage:true});
  await page.goto(base+'/app#/simplifications/'+simplification.id);
  const measured=await action(page,'Measure the resulting service',{},'/measure');assert.equal(measured.state,'measuring');assert.ok(measured.data.machineMeasurement.totals.exposure>0);assert.equal(measured.data.comparison.avoidedCostUsd,null);assert.ok(measured.data.machineMeasurement.coverage.excluded.includes('human effort'));
  await captureJourney(page,{path:out+'/J6-total-work-limits.png',fullPage:true});
  const second=await newChange(env,'Restore Sydney cohort with independent verification',employee.id);await authorize(env,second);
  assert.equal((await phase(env,second.id,'canary')).data.state,'canary-verified');
  assert.equal((await phase(env,second.id,'rollout')).data.state,'verified');
  await tick();incident=await api('/incidents/'+incidentId);assert.equal(incident.data.status,'restored');assert.deepEqual(incident.data.unresolvedCohorts,[]);
  await page.goto(base+'/app#/incidents/'+incidentId);await captureJourney(page,{path:out+'/J4-distinct-cohort-recovery.png',fullPage:true});
  // This tab has shown the conversation since the request was made, so a same-URL goto is a hash no-op
  // and its revision can be up to one 10s poll stale; open the current conversation before acting.
  await employeePage.reload();
  await employeePage.getByRole('button',{name:'Still not working?',exact:true}).click();await employeePage.getByLabel('What is happening?',{exact:true}).fill('The shared checks recovered, but my existing session still cannot submit. Keep this individual incident open.');
  const corrected=employeePage.waitForResponse(r=>r.url().endsWith('/work/'+employeeWork+'/commands'));await employeePage.getByRole('button',{name:'Save to this conversation',exact:true}).click();assert.equal((await corrected).status(),200);
  assert.equal((await employeeApi('/work/'+employeeWork)).work.state,'open');assert.equal((await api('/incidents/'+incidentId)).data.status,'restored');
  await captureJourney(employeePage,{path:out+'/J4-employee-correction-retains-own-incident.png',fullPage:true});await employeeContext.close();
  const problematic=await newChange(env,'Bounded repair with failed rollback',uid);await authorize(env,problematic);
  await fixture({partial:true,repaired:false,probeUnknown:true});
  const uncertain=await phase(env,problematic.id,'canary');assert.equal(uncertain.data.state,'unresolved');assert.ok(uncertain.data.invocations[0].unknownCohorts.includes(uid));
  await fixture({probeUnknown:false,failedRollback:true});
  const rollback=await phase(env,problematic.id,'compensate');assert.equal(rollback.data.state,'compensation-incomplete');
  const operationId=rollback.data.invocations.at(-1).executionId;
  await page.goto(base+'/app#/operations');
  const opCard=page.locator('.connection-record').filter({has:page.locator('.evidence').filter({hasText:operationId})});
  // Locate the operation by the durable evidence identity, then use its actual takeover button.
  const takeover=opCard.locator('details').filter({has:page.locator('summary').getByText('Take over this operation',{exact:true})});
  await takeover.locator('summary').click();await takeover.getByLabel('Reason and accountable next step').fill('Rollback incomplete; named operator retains reconciliation duty.');
  const taken=page.waitForResponse(r=>r.url().endsWith('/operations/'+operationId+'/takeover'));await takeover.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await taken).status(),200);
  const op=(await api('/operations')).find(o=>o.id===operationId);assert.ok(['unknown','cancel_requested','cancelled'].includes(op.state));assert.ok(op.cancel_requested);
  await captureJourney(page,{path:out+'/J4-failed-rollback-takeover.png',fullPage:true});
  // Actual native delivery click now has a submitted provider receipt to reconcile.
  await page.goto(base+'/app#/incidents/'+incidentId);
  await action(page,'Share an audience-scoped update',{message:'Both cohorts verified; the separate rollback obligation remains owned.',recipientIds:uid},'/updates');
  await tick();const notice=(await api('/service-notifications')).items.find(n=>n.record_id===incidentId&&n.state==='submitted');assert.ok(notice);
  await page.goto(base+'/app#/notifications');
  const card=page.locator('.connection-record').filter({has:page.locator('.evidence').filter({hasText:notice.id})});
  const reconcile=card.locator('details').filter({has:page.locator('summary').getByText('Reconcile delivery failure',{exact:true})});await reconcile.locator('summary').click();
  const response=page.waitForResponse(r=>r.url().endsWith('/service-notifications/'+notice.id+'/reconcile'));await reconcile.getByRole('button',{name:'Check actual delivery'}).click();assert.equal((await response).status(),200);
  assert.equal((await api('/service-notifications')).items.find(n=>n.id===notice.id).state,'delivered');
  await captureJourney(page,{path:out+'/J4-native-delivery-readback.png',fullPage:true});
}

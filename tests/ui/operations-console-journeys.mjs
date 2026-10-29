import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {action,apiFor,createConnection,fields,signIn,requestWork} from './connected-helpers.mjs';
import {captureJourney} from './viewport-evidence.mjs';
import {seedOperationsKpis} from '../fixtures/operations-kpis.mjs';

const captureRelease=captureJourney;
export async function releaseConsoleJourney({browser,page,api,base,out,errors}) {
  const owner=(await api('/session')).principal.userId;
  const member=async(name,roles)=>({...await api('/members',{name,email:`release-${name.toLowerCase()}@example.test`,password:'synthetic-Connected-browser-2026',roles}),email:`release-${name.toLowerCase()}@example.test`});
  const sales=await member('Sales',['employee']),other=await member('Engineering',['employee']),approver=await member('Reviewer',['approver']),executor=await member('Executor',['operator']);
  const ec=await browser.newContext(),ep=await ec.newPage();ep.on('pageerror',e=>errors.push(String(e)));
  await signIn(ep,base,executor.email);const execute=apiFor(ep);
  const group=await api('/requester-groups',{name:'MFA pilot',memberIds:[sales.id]});
  const cis=[];for(const name of ['Sign-in','VPN','MFA policy'])cis.push(await api('/services',{name,description:'MFA release surface',businessImpact:'Sign-in interrupted',source:'Reviewed register',observedAt:new Date().toISOString(),visibility:'workspace'}));
  const incident=await api('/incidents',{title:'Legacy MFA prompts',serviceId:cis[0].id,impact:'Repeated prompts',cohorts:[sales.id]});
  const problem=await api('/problems',{title:'Legacy MFA factor',serviceId:cis[0].id,incidentIds:[incident.id],symptoms:'Repeated prompts'});
  const probe=await createConnection(page,api,base,'workflow-probe','Release verifier',{baseUrl:'https://probe.example.com/observe',allowedHosts:'probe.example.com',token:'fixture-probe'});
  const deployment=await createConnection(page,api,base,'controlled-deployment','Release deployment',{baseUrl:'https://deploy.example.com/release',allowedHosts:'deploy.example.com',token:'fixture-release',targets:'orders'});
  const implementation={connectionId:deployment.id,connectionRevision:deployment.revision,verifierConnectionRevision:probe.revision,target:'orders',beneficiaryId:sales.id,verifierConnectionId:probe.id,payload:{release:'mfa-number-matching'}},cohorts=[sales.id];
  const window={start:new Date(Date.now()-60000).toISOString(),end:new Date(Date.now()+3600000).toISOString()},refs=[];
  for(const phase of ['canary','rollout','compensate']) {
    const payload={...(phase==='compensate'?{release:'prior'}:implementation.payload),phase,cohorts,implementationRevision:1};
    const g=await api('/grants',{principalId:executor.id,beneficiaryId:sales.id,action:'deployment.'+phase,actionVersion:1,target:'orders',connectionId:deployment.id,validFrom:window.start,validUntil:window.end,maxUses:10,conditions:{payloadHash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')}});
    refs.push({id:g.id,version:g.version,phase});
  }
  const changes=[];
  for(const [n,ci] of cis.entries()) {
    let c=await api('/changes',{title:`MFA release step ${n+1}`,risk:'Bounded change',impact:'Pilot sign-ins',services:[ci.id],window,cohorts,canaryCohorts:cohorts,implementation,compensation:{...implementation,payload:{release:'prior'}},visibility:'workspace'});
    c=await api(`/changes/${c.id}/authorize`,{revision:c.revision,reason:'Exact candidate with separate execution grants',grantReferences:refs});changes.push(c);
  }
  await page.goto(base+'/app#/releases');await page.getByText('Plan a release',{exact:true}).click();
  const form=page.locator('details[data-action-path="/releases"]');
  const values={title:'Okta MFA rollout',plan:'Build the candidate; test the pilot; canary and roll out each member.',changeIds:changes.map(c=>c.id),approverIds:[owner,approver.id],affectedGroupIds:[group.id],problemIds:[problem.id],visibility:'workspace'};
  await fields(form,values);await captureRelease(page,{path:out+'/CHANGE-007-create.png',fullPage:true});
  let release=await action(page,'Plan a release',values,'/releases','Create release',201);
  await page.waitForURL(new RegExp('#/releases/'+release.id+'$'));
  const linked=page.getByRole('region',{name:'Linked problems and configuration items'});
  await linked.getByRole('link',{name:'Legacy MFA factor',exact:true}).waitFor();
  for(const ci of cis)await linked.getByRole('link',{name:ci.data.name,exact:true}).waitFor();
  await action(page,'Record your go/no-go decision',{decision:'go',reason:'Ready'},'/decisions','Save',409);
  await page.getByText('A go decision needs recorded passed build and test phases',{exact:true}).waitFor();
  for(const phase of ['build','test']){await action(page,'Record a build or test result',{phase,outcome:'passed',reference:`Reviewed ${phase} report`},'/phases');await page.getByText(`passed · Reviewed ${phase} report`,{exact:false}).first().waitFor();}
  const ac=await browser.newContext(),ap=await ac.newPage();ap.on('pageerror',e=>errors.push(String(e)));
  await signIn(ap,base,approver.email);await ap.goto(base+'/app#/releases/'+release.id);
  await action(ap,'Record your go/no-go decision',{decision:'no-go',reason:'Brief the service desk first'},'/decisions');
  await page.reload();await action(page,'Record your go/no-go decision',{decision:'go',reason:'Owner ready'},'/decisions');
  await page.getByText('No-go: deployment held',{exact:true}).waitFor();
  await captureRelease(page,{path:out+'/CHANGE-007-no-go.png',fullPage:true});
  await ap.reload();await action(ap,'Record your go/no-go decision',{decision:'go',reason:'Service desk briefed'},'/decisions');
  await page.reload();await page.getByText('Go from every named approver',{exact:true}).waitFor();
  await page.goto(base+'/app#/changes');
  const calendar=page.getByRole('region',{name:'Change calendar',exact:true});await calendar.getByRole('link',{name:'Okta MFA rollout',exact:true}).waitFor();
  const downloadEvent=page.waitForEvent('download');await calendar.getByRole('link',{name:'Download calendar (ICS)',exact:true}).click();
  const download=await downloadEvent;const {readFile}=await import('node:fs/promises');assert.match(await readFile(await download.path(),'utf8'),/Okta MFA rollout/,'Release appears in actual scoped ICS');
  await captureRelease(page,{path:out+'/CHANGE-007-calendar.png',fullPage:true});
  const workId=await requestWork(page,base,'Track the MFA rollout for my pilot team');
  await page.getByText('Related tickets and records',{exact:true}).click();
  await action(page,'Link a record',{kind:'release',targetId:release.id},'/links','Link',200);
  // Linking refreshes the parent ticket and remounts its disclosures. Read the
  // committed relationship after a reload before opening it, rather than racing
  // that refresh with a summary click.
  await page.reload();
  const related=page.locator('details').filter({has:page.locator('summary').getByText('Related tickets and records',{exact:true})});
  await related.getByRole('link',{name:'Okta MFA rollout',exact:true,includeHidden:true}).waitFor({state:'attached'});
  await related.locator(':scope > summary').click();
  await related.getByRole('link',{name:'Okta MFA rollout',exact:true}).waitFor();
  await captureRelease(page,{path:out+'/CHANGE-007-ticket-link.png',fullPage:true});
  await page.goto(base+'/app#/releases/'+release.id);
  await page.getByRole('region',{name:'Linked tickets'}).getByRole('link').waitFor();
  const notes=`/releases/${release.id}/notices`;
  await action(page,'Publish a service notice',{groupId:group.id,message:'Release notes: MFA pilot uses number matching.',cadenceMinutes:1440},notes,'Publish notice',201);
  const sc=await browser.newContext(),sp=await sc.newPage(),oc=await browser.newContext(),op=await oc.newPage();
  for(const p of [sp,op])p.on('pageerror',e=>errors.push(String(e)));
  await signIn(sp,base,sales.email);await signIn(op,base,other.email);
  await sp.getByRole('region',{name:'Service notices'}).getByText('Release notes: MFA pilot uses number matching.',{exact:true}).waitFor();
  assert.equal((await apiFor(op)('/service-notices')).items.length,0,'The outsider receives no release notes');
  await captureRelease(sp,{path:out+'/CHANGE-007-cohort-notes.png',fullPage:true});
  for(const [n,initial] of changes.entries()) {
    await fetch(base+'/__fixture/state',{method:'POST',body:JSON.stringify({failDeployment:n===2})});
    let c=await execute(`/changes/${initial.id}/dispatch`,{revision:initial.revision,phase:'canary',idempotencyKey:`browser-${n}-canary`});
    c=await execute(`/changes/${c.id}/verify`,{revision:c.revision,invocationId:c.data.invocations.at(-1).id});
    if(n<2) {
      assert.equal(c.data.state,'canary-verified');
      c=await execute(`/changes/${c.id}/dispatch`,{revision:c.revision,phase:'rollout',idempotencyKey:`browser-${n}-rollout`});
      c=await execute(`/changes/${c.id}/verify`,{revision:c.revision,invocationId:c.data.invocations.at(-1).id});assert.equal(c.data.state,'verified');
    } else assert.equal(c.data.state,'failed');
    changes[n]=c;
  }
  await page.reload();await page.getByText('Held by a change that failed or is unresolved',{exact:true}).waitFor();
  await action(page,'Complete this release',{},'/complete','Complete release',409);
  await captureRelease(page,{path:out+'/CHANGE-007-failed-member.png',fullPage:true});
  await fetch(base+'/__fixture/state',{method:'POST',body:JSON.stringify({failDeployment:false})});
  let failed=await execute(`/changes/${changes[2].id}/dispatch`,{revision:changes[2].revision,phase:'compensate',idempotencyKey:'browser-backout'});
  failed=await execute(`/changes/${failed.id}/verify`,{revision:failed.revision,invocationId:failed.data.invocations.at(-1).id});assert.equal(failed.data.state,'compensated');
  await page.reload();release=await action(page,'Complete this release',{},'/complete','Complete release');assert.equal(release.data.state,'completed');assert.equal(release.data.goNoGo,'go','Completion retains the recorded approval instead of asking for another');
  await page.getByText('Every change successful or backed out',{exact:true}).waitFor();
  await captureRelease(page,{path:out+'/CHANGE-007-completed.png',fullPage:true});
 await ac.close();await ec.close();
 console.log('PASS CHANGE-007 native release decisions, phases, calendar, cohort notes, failed member and verified backout');
}

export async function operationsKpiJourney({browser,page,api,base,out}) {
  const operator=await api('/members',{name:'Casey Ng',email:'kpi-agent@example.test',password:'KPI-browser-proof-2026',roles:['operator']});
  const auditor=await api('/members',{name:'Jordan Lee',email:'kpi-auditor@example.test',password:'KPI-browser-proof-2026',roles:['auditor']});
  const employee=await api('/members',{name:'Avery Cole',email:'kpi-employee@example.test',password:'KPI-browser-proof-2026',roles:['employee']});
  const probe=await createConnection(page,api,base,'workflow-probe','Independent orders check',{baseUrl:'https://probe.example.com/observe',allowedHosts:'probe.example.com',token:'fixture-probe'});
  const deployment=await createConnection(page,api,base,'controlled-deployment','Orders release runner',{baseUrl:'https://deploy.example.com/release',allowedHosts:'deploy.example.com',token:'fixture-deployment',targets:'orders'});
  const executorContext=await browser.newContext(),executor=await executorContext.newPage();
  await signIn(executor,base,'kpi-agent@example.test','KPI-browser-proof-2026');
  const executorApi=apiFor(executor);
  const data=await seedOperationsKpis({ok:(method,path,body,user)=>user?executorApi(path,body,method):api(path,body,method),executorId:operator.id,
    implementation:{connectionId:deployment.id,connectionRevision:deployment.revision,verifierConnectionRevision:probe.revision,target:'orders',beneficiaryId:'sales',verifierConnectionId:probe.id,payload:{release:'kpi-proof'}},
    providerState:async body=>{const r=await fetch(base+'/__fixture/state',{method:'POST',body:JSON.stringify(body)});assert.ok(r.ok);}});
  await executorContext.close();
  const month=new Date().toISOString().slice(0,7);
  for(const width of [1440]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(base+'/app#/reports');
    await page.getByLabel('KPI month',{exact:true}).fill(month);
    await page.getByLabel('KPI time zone',{exact:true}).selectOption('America/Denver');
    const response=page.waitForResponse(r=>r.url().includes('/operations-kpis?'));
    await page.getByRole('button',{name:'Read operations KPIs',exact:true}).click();
    const report=await(await response).json();
    const metric=key=>report.metrics.find(m=>m.key===key);
    assert.equal(metric('incident.count').value,40);
    assert.equal(metric('change.success').value,92);
    assert.equal(metric('change.emergency').value,12);
    assert.equal(metric('asset.count').value,300);
    assert.equal(new Date(report.range.start).toLocaleString('en-US',{timeZone:'America/Denver'}).includes('12:00:00 AM'),true,'REPORT-005 Denver month starts at Denver midnight');
    for(const [key,value] of [['incident.count','40'],['change.success','92%'],['change.emergency','12%'],['asset.count','300']])
      await page.locator(`[data-kpi="${key}"]`).getByText(value,{exact:true}).waitFor();
    for(const metric of report.metrics) {
      const card=page.locator(`[data-kpi="${metric.key}"]`);
      await card.getByRole('heading',{name:metric.label,exact:true}).waitFor();
      await card.getByText(metric.definition,{exact:true}).waitFor();
      if(metric.unit==='ms'&&metric.value!==null) await card.getByText(`${(metric.value/60000).toFixed(2)} min`,{exact:true}).waitFor();
      await card.locator('summary').click();
      assert.equal(await card.getByRole('link').count(),metric.records.length,'REPORT-005 every tile exposes all records it counts');
      assert.deepEqual(await card.getByRole('link').evaluateAll(links=>links.map(link=>({label:link.textContent,path:link.getAttribute('href')}))),metric.records.map(({label,path})=>({label,path})), 'REPORT-005 tile labels and destinations match its source population');
      await card.locator('summary').click();
    }
    for(const key of ['change.success','device.noncompliant','license.spend-usd']) {
      await page.locator(`[data-kpi="${key}"]`).scrollIntoViewIfNeeded();
      process.env.LINEN_CAPTURE && await page.screenshot({path:`${out}/REPORT-005-${key}-${width}-viewport.png`});
    }
    await page.evaluate(()=>scrollTo(0,0));
    await captureJourney(page,{path:`${out}/REPORT-005-kpis-${width}.png`,fullPage:true});
    const rate=page.locator('[data-kpi="change.success"]');
    await rate.locator('summary').click();
    await rate.getByRole('link',{name:data.changes[0].data.title,exact:true}).click();
    await page.getByRole('heading',{name:data.changes[0].data.title,exact:true}).waitFor();
    await captureJourney(page,{path:`${out}/REPORT-005-drillthrough-${width}.png`,fullPage:true});
  }
  // Empty month and DST boundaries stay explicit instead of borrowing the active cohort.
  await page.goto(base+'/app#/reports');
  await page.getByLabel('KPI month',{exact:true}).fill('2026-03');
  const marchResponse=page.waitForResponse(r=>r.url().includes('/operations-kpis?'));
  await page.getByRole('button',{name:'Read operations KPIs',exact:true}).click();
  const march=await(await marchResponse).json();
  assert.equal(march.range.start,'2026-03-01T07:00:00.000Z','REPORT-005 Denver DST month starts at local midnight');
  assert.equal(march.range.end,'2026-04-01T06:00:00.000Z','REPORT-005 next midnight follows DST rather than fixed elapsed days');
  assert.equal(march.metrics.find(m=>m.key==='incident.count').value,0);
  assert.equal(march.metrics.find(m=>m.key==='change.success').value,null);
  await captureJourney(page,{path:`${out}/REPORT-005-empty-month.png`,fullPage:true});
  // Incident intake/acknowledgement is the product door behind the timing metrics.
  await page.goto(base+'/app#/incidents');
  await page.getByText('Add incident',{exact:true}).click();
  const incidentForm=page.locator('details[data-action-path="/incidents"]');
  await fields(incidentForm,{title:'Denver printer outage',priority:'P1',major:true,serviceId:data.service.id,impact:'Office printing unavailable',cohorts:'sales'});
  await captureJourney(page,{path:`${out}/REPORT-005-incident-intake.png`,fullPage:true});
  const intake=await action(page,'Add incident',{'title':'Denver printer outage','priority':'P1','major':true,'serviceId':data.service.id,'impact':'Office printing unavailable','cohorts':'sales'},'/incidents','Save',201);
  await page.waitForURL(/#\/incidents\/.+/);
  await action(page,'Acknowledge this incident',{},'/acknowledge','Acknowledge incident');
  assert.ok((await api('/incidents/'+intake.id)).data.acknowledgedAt,'REPORT-005 acknowledgement timestamp persisted');
  await page.getByRole('button',{name:'Acknowledge incident',exact:true}).waitFor({state:'detached'});
  assert.equal(await page.getByRole('button',{name:'Acknowledge incident',exact:true}).count(),0,'REPORT-005 acknowledgement has a stable completed end state');
  await captureJourney(page,{path:`${out}/REPORT-005-incident-acknowledged.png`,fullPage:true});
  // Native physical assets, financial refresh indicators and coverage expiries
  // join the service asset report without broadening the existing auditor door.
  const native=await api('/assets',{serial:'DEN-LAPTOP-4821',source:'Dell purchase order 4821',location:'Denver'});
  const now=new Date(),anniversary=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,2));
  const inService=new Date(anniversary);inService.setUTCFullYear(inService.getUTCFullYear()-1);
  await api(`/assets/${native.id}/financials`,{purchaseCents:240000,inServiceDate:inService.toISOString().slice(0,10),usefulMonths:12,method:'straight-line',costCenter:'Denver IT',revision:0});
  await api(`/assets/${native.id}/contracts`,{vendorId:data.supplier.id,kind:'support',name:'Denver hardware support',reference:'https://documents.example.test/contracts/4821',coverage:'Recorded hardware support',startsAt:inService.toISOString(),expiresAt:anniversary.toISOString()});
  const from=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString();
  const to=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString();
  const path=`/operations-kpis?start=${from}&end=${to}&timezone=America/Denver`;
  const physical=await api(path),metric=key=>physical.metrics.find(m=>m.key===key);
  assert.equal(metric('asset.count').value,301);
  assert.ok(metric('asset.age').records.some(r=>r.id===native.id&&r.ageBasis==='recorded-in-service-date'&&r.ageMs>0));
  assert.equal(metric('asset.state.stock').value,1);
  assert.equal(metric('upcoming.refreshes').value,2);
  assert.equal(metric('upcoming.renewals').value,2);
  assert.ok(metric('upcoming.renewals').records.some(r=>r.id===native.id&&r.kind==='support-expiry'));
  const hiddenService=await api('/services',{name:'Restricted investigation',description:'Owner scope',businessImpact:'Restricted',source:'Owner register',observedAt:new Date().toISOString(),visibility:'restricted'});
  const hidden=await api('/incidents',{title:'Restricted interruption',serviceId:hiddenService.id,impact:'Restricted',cohorts:['private']});
  // Same report door reuses current source visibility for auditors/operators, and denies employees.
  for(const [email,allowed] of [['kpi-auditor@example.test',true],['kpi-agent@example.test',true],['kpi-employee@example.test',false]]) {
    const c=await browser.newContext(),p=await c.newPage();
    await signIn(p,base,email,'KPI-browser-proof-2026');
    const result=await p.evaluate(async path=>{const r=await fetch('/api/v1'+path);return {status:r.status,body:await r.json()};},path);
    assert.equal(result.status,allowed?200:403,'REPORT-005 existing report audience');
    if(allowed) {
      assert.ok(!JSON.stringify(result.body).includes(hidden.id),'REPORT-005 source scope removes both hidden rows and counts');
      assert.equal(result.body.metrics.find(m=>m.key==='incident.count').value,41);
      assert.equal(result.body.metrics.find(m=>m.key==='asset.count').value,email.includes('auditor')?300:301);
      if(email.includes('auditor')) assert.ok(result.body.scope.physicalAssets.startsWith('unavailable'));
    }
    await c.close();
  }
 console.log('PASS REPORT-005 native 40/25/300 month, 92%/12%, all tile records, DST and audience');
}

import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {apiFor,action,fields,createConnection,finishFirstRun,signIn} from './connected-helpers.mjs';
import {captureJourney} from './viewport-evidence.mjs';
import {seedOperationsKpis} from '../fixtures/operations-kpis.mjs';
const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
if(!base||!out) throw Error('Run through tests/ui/connected-run.mjs');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/Denver'}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try {
  await page.goto(base+'/app');
  await page.getByLabel('Your name').fill('Morgan Hayes');
  await page.getByLabel('Workspace name').fill('Denver Service Desk');
  await page.getByLabel('Work email').fill('kpi-owner@example.test');
  await page.getByLabel('Password',{exact:true}).fill('KPI-browser-proof-2026');
  await page.getByRole('button',{name:'Create workspace'}).click();
  await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
  await finishFirstRun(page,base);
  const api=apiFor(page);
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
  for(const width of [1440,390]) {
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
      await page.screenshot({path:`${out}/REPORT-005-${key}-${width}-viewport.png`});
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
  assert.deepEqual(errors,[],'REPORT-005 has no browser application errors');
  console.log('PASS REPORT-005 native 40/25/300 KPI page at 1440/390, Denver month, 92%/12%, every tile drill-through and audience');
} catch(error) {await page.screenshot({path:out+'/REPORT-005-failure.png',fullPage:true});throw error;}
finally {await context.close();await browser.close();}

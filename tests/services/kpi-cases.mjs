import assert from 'node:assert/strict';
import {seedOperationsKpis} from '../fixtures/operations-kpis.mjs';
export async function operationsKpiChecks({ok,call,implementation}) {
  const data=await seedOperationsKpis({ok,implementation,executorId:'operator',cohorts:['a','b'],providerState:body=>ok('POST','/fixture/state',body)});
  const now=new Date(),start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString(),end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString();
  // REPORT-006 point 3: one device-typed record whose operator observation expired three days ago, and a software record with a fresh noncompliant observation.
  const expiredAt=new Date(Date.now()-3*86400000).toISOString(),expiredFor=3600000;
  const expired=await ok('POST',`/software-assets/${data.assets[1].id}/operations-observation`,{revision:data.assets[1].revision,source:'Recorded MDM export, three days old',evidence:'Denver device register row 2',observedAt:expiredAt,freshnessMs:expiredFor,compliance:'noncompliant'});
  const stored=expired.data.operationsObservations.at(-1);
  assert.deepEqual([stored.source,stored.observedAt,stored.freshnessMs,stored.provenance,stored.independentlyVerified],['Recorded MDM export, three days old',expiredAt,expiredFor,'operator-recorded',false],'REPORT-006 admitted observation keeps source, time and expiry window as operator-recorded, never provider-verified');
  assert.ok(stored.recordedBy&&stored.evidence,'REPORT-006 observation is attributed and carries its evidence');
  await ok('POST',`/software-assets/${data.assets[4].id}/operations-observation`,{revision:data.assets[4].revision,source:'Recorded MDM export',evidence:'Not a device',observedAt:new Date().toISOString(),compliance:'noncompliant'});
  assert.equal((await call('POST',`/software-assets/${data.assets[5].id}/operations-observation`,{revision:data.assets[5].revision,source:'Recorded MDM export',evidence:'Future row',observedAt:new Date(Date.now()+3600000).toISOString(),compliance:'noncompliant'})).status,400,'REPORT-006 future observations are refused');
  const query=`?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezone=America/Denver`;
  const report=await ok('GET','/operations-kpis'+query),metric=key=>{const m=report.metrics.find(m=>m.key===key);assert.ok(m,'REPORT-005 '+key);return m;};
  assert.equal(report.range.timezone,'America/Denver');
  assert.equal(metric('incident.count').value,40,'REPORT-005 complete month incident cohort');
  assert.equal(metric('change.success').value,92,'REPORT-005 23 independently verified rollouts / 25 changes');
  assert.equal(metric('change.emergency').value,12,'REPORT-005 3 emergency / 25 changes');
  assert.equal(metric('change.success').unknown,0,'REPORT-005 both failed changes have terminal provider failure evidence');
  assert.equal(metric('asset.count').value,300,'REPORT-005 300 real public-door asset records');
  assert.equal(metric('major.count').value,2);
  assert.ok(metric('major.duration').value>=0);
  assert.equal(metric('incident.mtta').unknown,1,'REPORT-005 missing acknowledgment excluded and disclosed');
  assert.ok(metric('incident.mttr').value>=0);
  for(const priority of ['P1','P2']) {
    assert.ok(metric(`incident.mtta.priority.${priority}`).value>=0);
    assert.ok(metric(`incident.mttr.priority.${priority}`).value>=0);
    assert.equal(metric(`incident.mttr.priority.${priority}`).records.length,20);
  }
  assert.ok(metric(`incident.mttr.service.${data.service.id}`).value>=0);
  assert.equal(metric('change.caused-incidents').value,null,'REPORT-005 no inferred causal assessment');
  assert.equal(metric('change.caused-incidents').unknown,40);
  assert.equal(metric('problem.backlog').value,1);
  assert.ok(metric('problem.age').value>=0);
  assert.equal(metric('problem.known-errors').value,1);
  assert.equal(metric('asset.state.acquired').value,300);
  assert.ok(metric('asset.age').value>=0);
  const noncompliant=metric('device.noncompliant'),snapshot=Date.parse(report.range.snapshotAt);
  assert.equal(noncompliant.value,1,'REPORT-006 only the fresh device observation counts; the expired and non-device ones do not');
  assert.equal(noncompliant.denominator,noncompliant.records.length);
  assert.equal(noncompliant.unknown,1,'REPORT-005 expired device observation remains unknown');
  const fresh=noncompliant.records.find(r=>r.id===data.assets[0].id),lapsed=noncompliant.records.find(r=>r.id===data.assets[1].id);
  assert.ok(!noncompliant.records.some(r=>r.id===data.assets[4].id),'REPORT-006 a software record is not a device');
  assert.equal(fresh.compliance,'noncompliant');
  assert.equal(fresh.observationSource,'Recorded MDM export');
  assert.equal(fresh.observationExpiresAt,new Date(Date.parse(fresh.observationAt)+86400000).toISOString());
  assert.ok(Date.parse(fresh.observationExpiresAt)>snapshot,'REPORT-006 fresh against the disclosed snapshot');
  assert.equal(lapsed.compliance,'unknown','REPORT-006 expired evidence is retained as unknown, not counted');
  assert.equal(lapsed.observationSource,'Recorded MDM export, three days old');
  assert.equal(lapsed.observationAt,expiredAt);
  assert.equal(lapsed.observationExpiresAt,new Date(Date.parse(expiredAt)+expiredFor).toISOString());
  assert.ok(Date.parse(lapsed.observationExpiresAt)<=snapshot,'REPORT-006 expired against the disclosed snapshot');
  for(const r of [fresh,lapsed]) assert.match(r.complianceProvenance,/^operator-recorded; not independently provider-verified$/,'REPORT-006 labelled operator-recorded');
  assert.ok(Math.abs(metric('license.utilization').value-11/15*100)<1e-8,'REPORT-005 recorded usage uses seat denominator');
  assert.equal(metric('license.spend-usd').value,120,'REPORT-005 CAD excluded rather than silently converted');
  assert.ok(metric('license.spend-usd').unknown>0);
  assert.equal(metric('upcoming.renewals').value,1);
  assert.equal(metric('upcoming.refreshes').value,1);
  const seen = new Set(), sources = new Map();
  for(const m of report.metrics) {
    assert.ok(m.definition&&m.unit,'REPORT-005 each tile defines its units and cohort');
    assert.ok(Array.isArray(m.records));
    for(const r of m.records) {
      if(seen.has(r.path)) continue; seen.add(r.path);
      const [section,id]=r.path.replace(/^#\//,'').split('/');
      const record=await ok('GET',`/${section}/${decodeURIComponent(id)}`);
      assert.equal(record.id,r.id,'REPORT-005 every drill-through resolves to its counted public record');
      sources.set(r.id,record);
    }
  }
  for(const m of report.metrics.filter(m=>m.key.startsWith('incident.mtta')||m.key.startsWith('incident.mttr')||m.key==='major.duration')) {
    const field=m.key.startsWith('incident.mtta')?'acknowledgedAt':'restoredAt';
    const elapsed=m.records.map(r=>sources.get(r.id)).filter(r=>r.data[field]).map(r=>Date.parse(r.data[field])-Date.parse(r.createdAt));
    assert.equal(m.value,elapsed.length?elapsed.reduce((sum,n)=>sum+n,0)/elapsed.length:null,'REPORT-005 timing equals the contributing public records, not closure or missing observations');
  }
  const backlog=metric('problem.age');
  assert.equal(backlog.value,Date.parse(report.range.snapshotAt)-Date.parse(sources.get(data.problem.id).createdAt),'REPORT-005 problem age uses the disclosed observation snapshot');
  assert.equal((await call('GET','/operations-kpis?start='+start+'&end='+start+'&timezone=America/Denver')).status,400);
  assert.equal((await call('GET','/operations-kpis'+query.replace('America/Denver','Invalid/Zone'))).status,400);
  const outside=await ok('GET','/operations-kpis?start=2000-01-01T00:00:00.000Z&end=2000-02-01T00:00:00.000Z&timezone=America/Denver');
  assert.equal(outside.metrics.find(m=>m.key==='incident.count').value,0,'REPORT-005 empty creation cohort does not borrow current incidents');
  assert.equal(outside.metrics.find(m=>m.key==='change.success').value,null);
  const ack=data.incidents[0];
  assert.equal((await ok('POST',`/incidents/${ack.id}/acknowledge`,{revision:(await ok('GET',`/incidents/${ack.id}`)).revision})).data.acknowledgedAt,ack.data.acknowledgedAt,'REPORT-005 replay retains first acknowledgement');
  await assetBasisChecks({ok,data,report,query,start,end});
  console.log('PASS REPORT-005: 40 incidents, 25 actual-engine changes (2 failed, 3 emergency), 300 assets, full KPI definitions/unknowns and public drill-throughs');
}

// REPORT-006 points 2, 4 and 6 through the public doors: age bases, records that could share an identity, latest wholly-in-range usage period and the upcoming window edges.
async function assetBasisChecks({ok,data,report,query,start,end}) {
  const E=Date.parse(end),iso=ms=>new Date(ms).toISOString(),day=86400000,S=Date.parse(start);
  const before=key=>report.metrics.find(m=>m.key===key);
  const shared='REPORT6-SHARED-1';
  const native=await ok('POST','/assets',{serial:shared,source:'Dell purchase order 6001',location:'Denver'});
  const twin=await ok('POST','/software-assets',{name:shared,assetType:'laptop',serviceId:data.service.id,externalId:shared,source:'Purchase register',currency:'USD',acquisitionCost:900,observedAt:new Date().toISOString()});
  const inService=iso(E+day).slice(0,10),anniversaryYear=new Date(E+day).getUTCFullYear()-1;
  const financed=await ok('POST','/assets',{serial:'REPORT6-FINANCED-1',source:'Dell purchase order 6002',location:'Denver'});
  const soon=`${anniversaryYear}${inService.slice(4)}`;
  await ok('POST',`/assets/${financed.id}/financials`,{purchaseCents:240000,inServiceDate:soon,usefulMonths:12,method:'straight-line',costCenter:'Denver IT',revision:0});
  const late=await ok('POST','/assets',{serial:'REPORT6-LATE-1',source:'Dell purchase order 6003',location:'Denver'});
  await ok('POST',`/assets/${late.id}/financials`,{purchaseCents:240000,inServiceDate:iso(E+60*day).slice(0,10).replace(/^\d{4}/,String(new Date(E+60*day).getUTCFullYear()-1)),usefulMonths:12,method:'straight-line',costCenter:'Denver IT',revision:0});
  const usageBase={source:'Licence usage statement',observedAt:new Date().toISOString(),cost:10,currency:'USD'};
  let meter=await ok('POST','/software-assets',{name:'REPORT6 meter',assetType:'subscription',serviceId:data.service.id,externalId:'report6-meter',source:'Purchase register',currency:'USD',acquisitionCost:10,observedAt:new Date().toISOString()});
  for(const [from,to,active,seats] of [[S,S+1000,1,10],[S+1000,S+2000,6,7],[S+2000,E+day,7,7],[S-30*day,S+500,10,10]])
    meter=await ok('POST',`/software-assets/${meter.id}/usage`,{...usageBase,revision:meter.revision,periodStart:iso(from),periodEnd:iso(to),activeUsers:active,allocatedSeats:seats});
  meter=await ok('POST',`/software-assets/${meter.id}/charges`,{revision:meter.revision,source:'Supplier invoice',invoice:'R6-USD-1999',amount:19.99,currency:'USD',periodStart:iso(S+1000),periodEnd:iso(S+2000)});
  const edges=[['before',E-1000],['start',E],['last',E+30*day-1000],['after',E+30*day]],renewing={};
  for(const [name,at] of edges) renewing[name]=await ok('POST','/software-assets',{name:`REPORT6 renewal ${name}`,assetType:'software',serviceId:data.service.id,externalId:`report6-renewal-${name}`,source:'Purchase register',currency:'USD',acquisitionCost:1,renewalAt:iso(at),observedAt:new Date().toISOString()});
  const after=await ok('GET','/operations-kpis'+query),metric=key=>after.metrics.find(m=>m.key===key),snapshot=Date.parse(after.range.snapshotAt);
  // Points 2 and 6: each source record counts separately, even when both describe the same serial.
  const counted=metric('asset.count');
  assert.equal(counted.value,before('asset.count').value+9,'REPORT-006 three native records, the twin, the meter and four renewal-edge records each count once');
  const pair=counted.records.filter(r=>[native.id,twin.id].includes(r.id));
  assert.deepEqual(pair.map(r=>r.sourceKind).sort(),['physical','service'],'REPORT-006 same-serial native and service records are both counted, never merged');
  assert.equal(metric('device.noncompliant').denominator,before('device.noncompliant').denominator+4,'REPORT-006 the native twin pair and the financed and late native devices each count as devices');
  // Age bases are disclosed per record and measured to the disclosed snapshot.
  const ages=metric('asset.age').records,row=id=>ages.find(r=>r.id===id);
  const custody=await ok('GET',`/assets/${native.id}/history`);
  assert.equal(row(native.id).ageBasis,'first-custody-record','REPORT-006 a native asset without financials starts at its first custody record');
  assert.equal(row(native.id).ageStartsAt,custody.items[0].created_at,'REPORT-006 age starts at that first custody instant');
  assert.equal(row(native.id).ageMs,snapshot-Date.parse(row(native.id).ageStartsAt));
  assert.equal(row(financed.id).ageBasis,'recorded-in-service-date');
  assert.equal(row(financed.id).ageMs,snapshot-Date.parse(soon),'REPORT-006 the recorded in-service date wins over custody');
  const created=await ok('GET',`/software-assets/${twin.id}`);
  assert.equal(row(twin.id).ageBasis,'asset-record-creation');
  assert.equal(row(twin.id).ageStartsAt,created.createdAt,'REPORT-006 a service asset starts at its own record creation');
  assert.equal(row(twin.id).ageMs,snapshot-Date.parse(created.createdAt));
  // Point 4: the latest period wholly within the range; the open-ended and the prior-month periods are excluded.
  const use=metric('license.utilization'),meterRow=use.records.find(r=>r.id===meter.id);
  assert.deepEqual([meterRow.activeUsers,meterRow.allocatedSeats,meterRow.periodStart,meterRow.periodEnd,meterRow.source],[6,7,iso(S+1000),iso(S+2000),'Licence usage statement'],'REPORT-006 latest wholly-in-range period selected');
  assert.equal(use.numerator,before('license.utilization').numerator+6);
  assert.equal(use.denominator,before('license.utilization').denominator+7);
  assert.equal(use.value,(before('license.utilization').numerator+6)/(before('license.utilization').denominator+7)*100,'REPORT-006 JSON keeps full numeric precision');
  assert.ok(Math.abs(metric('license.spend-usd').value-(before('license.spend-usd').value+19.99))<1e-9,'REPORT-006 recorded USD cents add to known spend');
  // Point 6: [end,end+30d) edges, and the label that separates planning indicators from recorded plans.
  const upcoming=metric('upcoming.renewals'),ids=new Set(upcoming.records.map(r=>r.id));
  assert.equal(upcoming.value,before('upcoming.renewals').value+2,'REPORT-006 only the end instant and the last second before 30 days are upcoming');
  assert.deepEqual([renewing.before.id,renewing.start.id,renewing.last.id,renewing.after.id].map(id=>ids.has(id)),[false,true,true,false],'REPORT-006 window is [end,end+30 elapsed days)');
  const refreshes=metric('upcoming.refreshes');
  const indicator=refreshes.records.find(r=>r.id===financed.id);
  assert.match(indicator.basis,/planning indicator/,'REPORT-006 native useful-life anniversary is a planning indicator');
  assert.equal(indicator.dueAt,iso(Date.parse(inService+'T00:00:00Z')),'REPORT-006 anniversary is in-service date plus useful months');
  assert.ok(!refreshes.records.some(r=>r.id===late.id),'REPORT-006 an anniversary beyond 30 days is not upcoming');
  assert.ok(refreshes.records.filter(r=>r.id!==financed.id).every(r=>!/planning indicator/.test(r.basis)),'REPORT-006 recorded refresh plans are not labelled planning indicators');
  assert.equal(refreshes.value,before('upcoming.refreshes').value+1);
  // The unobserved-device guard (REPORT-005): a device with no compliance observation at all is unknown, never compliant, and never noncompliant.
  const unobserved=await ok('POST','/software-assets',{name:'REPORT6 unobserved device',assetType:'device',serviceId:data.service.id,externalId:'report6-unobserved',source:'Purchase register',currency:'USD',acquisitionCost:1,observedAt:new Date().toISOString()});
  assert.ok(!(unobserved.data.operationsObservations||[]).length,'REPORT-006 the unobserved device has no observation of any kind');
  const bare=await ok('GET','/operations-kpis'+query),bareMetric=bare.metrics.find(m=>m.key==='device.noncompliant'),bareRow=bareMetric.records.find(r=>r.id===unobserved.id);
  assert.ok(bareRow,'REPORT-005 unobserved device is listed among devices');
  assert.equal(bareRow.compliance,'unknown','REPORT-005 unobserved device remains unknown, never compliant');
  assert.equal(bareRow.complianceProvenance,'No observation');
  assert.equal(bareMetric.unknown,metric('device.noncompliant').unknown+1,'REPORT-005 unobserved device is counted as unknown');
  assert.equal(bareMetric.denominator,metric('device.noncompliant').denominator+1);
  assert.equal(bareMetric.value,metric('device.noncompliant').value,'REPORT-005 an unobserved device is not counted noncompliant');
  assert.equal(bareMetric.records.filter(r=>r.compliance==='compliant').length,0,'REPORT-005 no device is reported compliant without an observation');
  console.log('PASS REPORT-006: age bases, same-serial native and service records counted separately, latest in-range usage period, upcoming window edges and planning-indicator label');
}

import assert from 'node:assert/strict';
import {seedOperationsKpis} from '../fixtures/operations-kpis.mjs';
export async function operationsKpiChecks({ok,call,implementation}) {
  const data=await seedOperationsKpis({ok,implementation,executorId:'operator',cohorts:['a','b'],providerState:body=>ok('POST','/fixture/state',body)});
  const now=new Date(),start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString(),end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString();
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
  assert.equal(metric('device.noncompliant').value,1);
  assert.ok(metric('device.noncompliant').unknown>=1,'REPORT-005 unobserved device remains unknown');
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
  console.log('PASS REPORT-005: 40 incidents, 25 actual-engine changes (2 failed, 3 emergency), 300 assets, full KPI definitions/unknowns and public drill-throughs');
}

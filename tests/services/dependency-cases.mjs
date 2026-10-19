import assert from 'node:assert/strict';
export async function dependencyChecks(request) {
  const ok=async(method,path,body,headers)=>{const r=await request(method,path,body,headers);assert.ok(r.status<300,JSON.stringify(r));return r.json;};
  const observedAt=new Date().toISOString();
  async function item(name,ciType,visibility='operators') {return ok('POST','/services',{name,ciType,description:name,businessImpact:'Work unavailable',provenance:'observed',source:'Configuration register',observedAt,freshnessMs:86400000,visibility});}
  const payroll=await item('Payroll','business_service'),gusto=await item('Gusto','saas_app'),sso=await item('SSO','software'),host=await item('SSO host','cloud_resource'),laptop=await item('Denver laptop','hardware');
  assert.equal((await ok('GET','/services')).items.filter(x=>[payroll.id,gusto.id,sso.id,host.id,laptop.id].includes(x.id)).length,5);
  assert.equal(payroll.data.provenance,'observed');assert.equal(payroll.data.source,'Configuration register');assert.ok(Number.isFinite(Date.parse(payroll.data.observedAt)));assert.ok(payroll.data.freshnessMs>0);
  assert.equal((await request('POST','/services',{name:'Invalid type',ciType:'invented'})).status,400);
  const edge=async(from,to,extra={})=>ok('POST','/service-graph/edges',{from:from.id,to:to.id,relationship:'depends_on',provenance:'asserted',source:'Owner service map',sourceRevision:'1',observedAt,effectiveAt:observedAt,freshnessMs:86400000,...extra});
  await edge(payroll,gusto);await edge(payroll,sso);await edge(sso,host);
  await edge(laptop,sso,{observedAt:'2020-01-01',effectiveAt:'2020-01-01',freshnessMs:1});
  const change=await ok('POST','/changes',{title:'Upgrade SSO',risk:'Sign-in interruption',impact:'SSO consumers',services:[sso.id],window:{start:observedAt,end:new Date(Date.now()+3600000).toISOString()},cohorts:['staff'],canaryCohorts:['staff'],implementation:{release:'new'},compensation:{release:'prior'}});
  const impact=await ok('GET',`/changes/${change.id}/impact`);
  assert.ok(impact.downstream.some(n=>n.id===payroll.id&&n.certainty==='recorded'),'ASSET-009: SSO change shows Payroll impacted');
  assert.ok(impact.upstream.some(n=>n.id===host.id),'ASSET-009: change shows upstream cloud dependency');
  assert.ok(impact.downstream.some(n=>n.id===laptop.id&&n.certainty==='uncertain'),'ASSET-009: stale path remains uncertain');
  assert.ok(impact.relationships.some(e=>e.data.from===laptop.id&&!e.fresh),'ASSET-009: stale relationship marked stale');
  const incident=await ok('POST','/incidents',{title:'SSO outage',serviceId:sso.id,impact:'Staff blocked',cohorts:['staff']});
  const incidentImpact=await ok('GET',`/incidents/${incident.id}/impact`);
  assert.ok(incidentImpact.downstream.some(n=>n.id===payroll.id));assert.ok(incidentImpact.upstream.some(n=>n.id===host.id));
  const payrollImpact=await ok('GET',`/services/${payroll.id}/impact`);
  assert.deepEqual(new Set(payrollImpact.upstream.map(n=>n.id)),new Set([gusto.id,sso.id,host.id]));
  await edge(host,sso); // Cycles terminate and roots are never listed as their own impact.
  assert.ok(!(await ok('GET',`/changes/${change.id}/impact`)).upstream.some(n=>n.id===sso.id));
  await edge(payroll,sso,{sourceRevision:'2',value:false});
  assert.equal((await ok('GET',`/changes/${change.id}/impact`)).downstream.find(n=>n.id===payroll.id).certainty,'uncertain','Conflicting assertions cannot establish a certain path');
  const futureItem=await item('Future payroll consumer','business_service');
  await edge(futureItem,sso,{effectiveAt:new Date(Date.now()+86400000).toISOString()});
  assert.equal((await ok('GET',`/changes/${change.id}/impact`)).downstream.find(n=>n.id===futureItem.id).certainty,'uncertain','Not-yet-effective dependencies cannot establish current impact');
  const privateItem=await item('Confidential payroll processor','saas_app','restricted');await edge(privateItem,sso);
  const headers={'x-user':'operator','x-roles':'["operator"]'};
  assert.ok(!(await ok('GET',`/changes/${change.id}/impact`,undefined,headers)).downstream.some(n=>n.id===privateItem.id));
  assert.equal((await request('GET',`/changes/${change.id}/impact`,undefined,{'x-workspace':'other'})).status,404);
  assert.equal((await request('POST','/service-graph/edges',{from:payroll.id,to:sso.id,relationship:'made_up'})).status,400);
  const employee={'x-user':'employee','x-roles':'["employee"]'};
  assert.equal((await request('GET',`/changes/${change.id}/impact`,undefined,employee)).status,404);
  assert.equal((await request('POST','/services',{name:'Unauthorized'},employee)).status,403);
  console.log('PASS ASSET-009 public routes: all five CI types, typed attributed dependencies, Payroll/Gusto/SSO, change and incident upstream/downstream impact, stale/conflicting paths, cycles and existing scope isolation');
}

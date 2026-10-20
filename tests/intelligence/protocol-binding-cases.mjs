import assert from 'node:assert/strict';

/** F5 binding lifecycle via native authenticated doors and a probe faked only at the network edge. */
export async function protocolBindingChecks({api, owner, harness, restart, fixtureConnection, userId, mode}) {
  const ok = async (path, method = 'GET', body, auth = owner) => {
    const r = await api(path, method, body, auth);
    assert.ok(r.status < 300, 'F5 binding setup ' + JSON.stringify(r));
    return r.value;
  };
  const source = await fixtureConnection({name:'F5 binding probe',provider:'workflow-probe',secret:JSON.stringify({token:'fixture-probe'}),
    config:{url:'https://probe.example.test/observe',allowedHosts:['probe.example.test']}});
  const spec = {id:'workflow',description:'Orders usable',step:{action:'group.add',actionVersion:1,connectionId:crypto.randomUUID(),
    verifierConnectionId:source,target:'orders',beneficiaryId:userId,grantId:crypto.randomUUID(),grantVersion:1,cohort:[userId]}};
  const input = {outcome:'F5 scoped workflow assumption',cohort:[userId],observations:[spec],freshnessSeconds:600,dependencies:[],
    participants:[],sensitivity:'restricted',effectiveAt:new Date(Date.now()-1000).toISOString(),intervalSeconds:60};
  const leaf = await ok('/commitments','POST',input);
  let dependency = await ok('/commitments','POST',{...input,dependencies:[leaf.id]});
  const root = await ok('/commitments','POST',{...input,sensitivity:'internal',dependencies:[dependency.id]});
  const observe = id => ok(`/commitments/${id}/observe`,'POST',{});
  const bound = async c => ({id:c.id,revision:c.revision,
    observationIds:[...new Set((await ok(`/commitments/${c.id}/coverage`)).coverage.map(row => row.evidenceId).filter(Boolean))]});
  await observe(leaf.id); await observe(dependency.id); await observe(root.id);
  let binding = {rootCommitmentId:root.id,commitments:[await bound(root),await bound(dependency),await bound(leaf)]};
  const assumptions = {singleAtomicStore:true,monotonicFences:true,independentReadback:true,currentAuthorityAtAdmission:true};
  const events = [{kind:'claim',actor:'coordinator',fence:1},{kind:'dispatch',actor:'coordinator',fence:1},
    {kind:'reconcile',actor:'coordinator',fence:1,effect:'present'},{kind:'admit',actor:'coordinator',fence:1}];
  const check = b => ok('/intelligence/protocol/check','POST',{assumptions,events,binding:b});
  const invalid = async (b,reason) => {
    const r = await check(b);
    assert.equal(r.valid,false,'F5 changed or missing evidence invalidates the bound conclusion');
    assert.equal(r.replayValid,true,'F5 valid model trace cannot mask invalid real assumptions');
    assert.ok(r.invalidations.some(i=>i.reason===reason),'F5 reason '+reason+': '+JSON.stringify(r));
    return r;
  };
  const good = await check(binding);
  assert.equal(good.valid,true,'F5 complete dependency closure binds current independently admitted probe evidence');
  assert.equal(good.evidenceBasis,'persisted-probe-bindings');
  assert.ok(Date.parse(good.expiresAt)>Date.parse(good.checkedAt),'F5 conclusion discloses its evidence expiry');
  const retained = await (await harness.db).prepare('SELECT input_json,result_json FROM intelligence_protocol_runs WHERE id=?').bind(good.id).first();
  assert.deepEqual(JSON.parse(retained.input_json).binding,binding,'F5 exact source references are durably attributed');
  assert.deepEqual(JSON.parse(retained.result_json).binding,binding);
  await invalid({...binding,commitments:[binding.commitments[0]]},'dependency_not_bound');
  await invalid({...binding,commitments:binding.commitments.map(b=>({...b,observationIds:[]}))},'observation_changed');
  const unbound = await ok('/intelligence/protocol/check','POST',{assumptions,events});
  assert.equal(unbound.evidenceBasis,'supplied-trace-only','F5 supplied events do not claim observed provider evidence');
  const operator = await ok('/members','POST',{email:'f5-operator@example.test',name:'F5 Operator',password:'long f5 operator fixture password',roles:['operator']});
  const login = await api('/login','POST',{email:'f5-operator@example.test',password:'long f5 operator fixture password'});
  const reader = {cookie:login.cookie.split(';')[0]};reader.csrf=(await ok('/session','GET',undefined,reader)).csrfToken;
  assert.equal((await api('/intelligence/protocol/check','POST',{assumptions,events,binding},reader)).status,404,
    'F5 an allowed protocol role cannot reveal an inaccessible dependency');
  assert.equal((await api('/intelligence/protocol/check','POST',{assumptions,events,binding:{...binding,commitments:[...binding.commitments,binding.commitments[0]]}},owner)).status,400,
    'F5 duplicate bindings refuse before persistence');
  await restart();
  assert.equal((await check(binding)).valid,true,'F5 persisted binding remains checkable across Worker restart');
  dependency = await ok(`/commitments/${dependency.id}`,'PATCH',{revision:dependency.revision,outcome:'Revised F5 workflow assumptions'});
  await invalid(binding,'commitment_changed');
  await observe(dependency.id);
  binding = {...binding,commitments:[await bound(root),await bound(dependency),await bound(leaf)]};
  assert.equal((await check(binding)).valid,true,'F5 fresh revision and observations re-establish the bound conclusion');
  await mode('probe-failed');await observe(dependency.id);await mode('ok');
  await invalid(binding,'observation_changed');
  const failedBinding = {...binding,commitments:[await bound(root),await bound(dependency),await bound(leaf)]};
  await invalid(failedBinding,'observation_unverified_or_stale');
  await observe(dependency.id);
  binding = {...binding,commitments:[await bound(root),await bound(dependency),await bound(leaf)]};
  assert.equal((await check(binding)).valid,true);
  await ok(`/connections/${source}`,'PATCH',{name:'Edited F5 probe',revision:1,config:{url:'https://probe.example.com/observe',allowedHosts:['probe.example.com']}});
  await invalid(binding,'observation_source_changed');
  await ok(`/connections/${source}`,'DELETE');
  await invalid(binding,'observation_source_changed');
  await ok(`/members/${operator.id}`,'PATCH',{roles:['employee'],active:true});
  assert.ok([401,403].includes((await api('/intelligence/protocol/check','POST',{assumptions,events,binding},reader)).status),
    'F5 current role loss prevents further checks');
  const expirySource = await fixtureConnection({name:'F5 expiring probe',provider:'workflow-probe',secret:JSON.stringify({token:'fixture-probe'}),
    config:{url:'https://probe.example.test/observe',allowedHosts:['probe.example.test']}});
  const expires = await ok('/commitments','POST',{...input,freshnessSeconds:1,observations:[{...spec,step:{...spec.step,verifierConnectionId:expirySource}}]});
  await observe(expires.id);
  const expiryBinding = {rootCommitmentId:expires.id,commitments:[await bound(expires)]};
  assert.equal((await check(expiryBinding)).valid,true);
  await new Promise(resolve=>setTimeout(resolve,1100));
  await invalid(expiryBinding,'observation_unverified_or_stale');
  const inactive = await ok(`/commitments/${expires.id}`,'PATCH',{revision:expires.revision,expiresAt:new Date(Date.now()-1).toISOString()});
  await invalid({rootCommitmentId:inactive.id,commitments:[await bound(inactive)]},'commitment_inactive');
  assert.equal((await (await harness.db).prepare('SELECT result_json FROM intelligence_protocol_runs WHERE id=?').bind(good.id).first()).result_json,
    retained.result_json,'F5 rechecks append evidence without rewriting the original dated conclusion');
  console.log('PASS F5 native source/dependency bindings: scoped transitive closure, fresh provenance, dependency edits, newer failures, connection drift/deletion, expiry, role withdrawal, append-only dated results and restart; fixture probes, no live-effect claim');
}

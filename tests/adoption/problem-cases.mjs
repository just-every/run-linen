import assert from 'node:assert/strict';
/** Native publication records use existing KB/version/service archive paths together. */
export async function problemArchiveChecks(ok,request,auth,sourceAuth) {
  const tenant=await ok('/fixtures/tenant','POST',{},sourceAuth);
  const source=await auth(await request('/login','POST',{email:tenant.email,password:'destination secure password'}));
  const t=new Date().toISOString(),end=new Date(Date.now()+86400000).toISOString();
  const service=await ok('/services','POST',{name:'Portable Claims',description:'Claims intake',businessImpact:'Cannot file',source:'Acceptance register',observedAt:t,visibility:'workspace'},source,201);
  const incidents=[];
  for(let i=0;i<3;i++) incidents.push(await ok('/incidents','POST',{title:'Claims loop '+i,serviceId:service.id,impact:'Cannot sign in',cohorts:['north'],visibility:'workspace'},source,201));
  let problem=await ok('/problems','POST',{title:'Portable recurring Claims problem',serviceId:service.id,incidentIds:incidents.map(i=>i.id),visibility:'operators'},source,201);
  problem=await ok(`/problems/${problem.id}/known-error`,'POST',{revision:problem.revision,cause:'Stale Claims session',evidenceIds:['C-12']},source);
  const member=await ok('/members','POST',{email:'claims-archive-erase@test.invalid',name:'Claims Private Person',password:'claims archive employee password',roles:['employee']},source,201);
  problem=await ok(`/problems/${problem.id}/workarounds`,'POST',{revision:problem.revision,title:'Portable session guidance',text:'Claims Private Person should open a new session.',contraindications:'An upload is in progress',source:'C-12',symptomTerms:['login loop'],cohorts:['north'],scope:'employees',expiresAt:end,review:true},source);
  for (const cohort of ['Portable rejected floor','Portable accepted floor']) for(let i=0;i<3;i++)
    await ok('/work','POST',{title:'Portable Wi-Fi interruption '+i,body:'Office wireless disconnects',kind:'incident',context:{serviceId:service.id,cohort},deduplicationKey:crypto.randomUUID()},source,201);
  const proposals=(await ok('/problem-proposals/detect','POST',{},source)).items;
  const rejected=proposals.find(p=>p.data.cluster.scopeValue==='portable rejected floor');
  const accepted=proposals.find(p=>p.data.cluster.scopeValue==='portable accepted floor');
  await ok(`/problem-proposals/${rejected.id}/reject`,'POST',{revision:rejected.revision,reason:'Planned maintenance'},source);
  await ok(`/problem-proposals/${accepted.id}/accept`,'POST',{revision:accepted.revision,reason:'Investigate repeated wireless failure'},source);
  const exp=await ok('/exports','POST',{idempotencyKey:'problem-native'},source,201);
  let manifest;
  for(let i=0;i<30;i++){const next=await ok(`/exports/${exp.id}/advance`,'POST',{},source);if(next.state==='ready'){manifest=next;break;}}
  assert.ok(manifest);
  const destination=await ok('/fixtures/tenant','POST',{},sourceAuth);
  const dest=await auth(await request('/login','POST',{email:destination.email,password:'destination secure password'}));
  const imported=await ok('/imports','POST',{manifest,idempotencyKey:'problem-native'},dest,201);
  for(const chunk of manifest.chunks){const response=await request(`/exports/${exp.id}/chunks/${chunk.ordinal}`,'GET',undefined,source);assert.equal(response.status,200);await ok(`/imports/${imported.id}/chunks/${chunk.ordinal}`,'PUT',Buffer.from(await response.arrayBuffer()),dest,200,true);}
  const report=await ok(`/imports/${imported.id}/dry-run`,'POST',{},dest);
  assert.equal(report.unresolvedReferences,0,JSON.stringify(report));
  for(let i=0;i<30;i++){const result=await ok(`/imports/${imported.id}/resume`,'POST',{acceptSemanticLoss:true},dest);if(result.state!=='applying'){assert.equal(result.state,'restored');break;}}
  const restored=(await ok('/problems','GET',undefined,dest)).items.find(p=>p.data.title==='Portable recurring Claims problem');
  assert.ok(restored);assert.equal(restored.data.incidentIds.length,3);
  const article=restored.data.workarounds[0];assert.equal(article.usable,true);
  assert.notEqual(article.articleId,problem.data.workarounds[0].articleId,'Article identity remaps with the problem reference');
  assert.equal(article.article.id,article.articleId);assert.ok(article.article.body.includes('Claims Private Person'));
  assert.ok((await ok('/knowledge?q=Portable','GET',undefined,dest)).items.some(a=>a.id===article.articleId));
  const restoredProposals=(await ok('/problem-proposals','GET',undefined,dest)).items;
  assert.equal(restoredProposals.find(p=>p.data.cluster.scopeValue==='portable rejected floor').data.state,'rejected');
  const keptAccepted=restoredProposals.find(p=>p.data.cluster.scopeValue==='portable accepted floor');
  const acceptedProblem=await ok('/problems/'+keptAccepted.data.problemId,'GET',undefined,dest);
  assert.equal(acceptedProblem.data.ticketIds.length,3);
  assert.equal(acceptedProblem.data.sourceProposalId,keptAccepted.id,'PROB-002 source proposal and evidence IDs remap together');
  assert.ok(keptAccepted.sources.every(s=>s.title.startsWith('Portable Wi-Fi')));
  const rescanned=(await ok('/problem-proposals/detect','POST',{},dest)).items;
  assert.equal(rescanned.filter(p=>p.data.cluster.scopeValue==='portable rejected floor').length,1,'PROB-002 restore cannot re-propose a rejected semantic cluster');
  assert.equal(rescanned.find(p=>p.data.cluster.scopeValue==='portable rejected floor').data.state,'rejected');
  console.log('PASS PROB-002 native archive: accepted source links remap and durable rejected cluster stays suppressed after restore');
  const erased=await ok('/adoption/erase','POST',{identity:member.id},source);
  assert.ok(['domain_erasure_pending','blob_cleanup_pending','completed'].includes(erased.state));
  await ok('/fixtures/sweep','POST',{},source);
  assert.equal((await ok('/knowledge?q=Portable','GET',undefined,source)).items.length,0,'Erased published article requires fresh review');
  const readback=await ok('/problems/'+problem.id,'GET',undefined,source);
  assert.equal(readback.data.workarounds[0].usable,false);
  console.log('PASS PROB-001 native archive: KB content, reviewed article version and problem links remap together; public erasure withdraws published personal guidance');
}

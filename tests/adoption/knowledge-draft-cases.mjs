import assert from 'node:assert/strict';
/** Paid-edge generation is covered in work/UI suites. Native archive verifies content-only
 * candidates and durable reviewed rejection, including destination source guards and erasure. */
export async function knowledgeDraftArchiveChecks(ok,request,auth,sourceAuth) {
  const tenant=await ok('/fixtures/tenant','POST',{},sourceAuth);
  const source=await auth(await request('/login','POST',{email:tenant.email,password:'destination secure password'}));
  const member=await ok('/members','POST',{email:'kb004-archive-person@test.invalid',name:'Knowledge Archive Person',password:'knowledge archive employee password',roles:['employee']},source,201);
  const model=await ok('/connections','POST',{provider:'openai',name:'Native knowledge model',secret:JSON.stringify({apiKey:'synthetic-native-knowledge-provider'}),config:{model:'native-knowledge-model',inputUsdPerMillion:1,cachedInputUsdPerMillion:0,outputUsdPerMillion:1,maxOutputTokens:1000,maxAttemptUsd:1,contextCharacters:24000}},source,201);
  const configured=(await ok('/connections','GET',undefined,source)).find(c=>c.id===model.id);
  await ok(`/connections/${model.id}/test`,'POST',{revision:configured.revision},source);
  await ok('/intelligence/budget','PUT',{limitUsd:10},source);
  const tickets=[];
  for(let i=0;i<3;i++) {
    const work=await ok('/work','POST',{title:'Portable knowledge session',body:'Knowledge Archive Person recovered access with a fresh session.',beneficiaryId:member.id,kind:'incident',context:{app:'Portable knowledge app'},deduplicationKey:crypto.randomUUID()},source,201);
    tickets.push(await ok(`/work/${work.id}/commands`,'POST',{revision:work.revision,command:'close',reason:'Fresh session restored the reported access'},source));
  }
  let candidate=(await ok('/knowledge-drafts/detect','POST',{},source)).items.find(d=>d.group.value==='portable knowledge app');assert.ok(candidate);
  candidate=await ok(`/knowledge-drafts/${candidate.id}/generate`,'POST',{revision:candidate.revision,connectionId:model.id,generate:true},source);
  await ok(`/knowledge-drafts/${candidate.id}/reject`,'POST',{revision:candidate.revision,reason:'Retain a reviewed rejection through native transfer'},source);
  const publishedTickets=[];
  for(let i=0;i<3;i++){
    const work=await ok('/work','POST',{title:'Portable published network guidance',body:'Knowledge Archive Person reported a fresh session restored access.',beneficiaryId:member.id,context:{app:'Portable published guidance'},deduplicationKey:crypto.randomUUID()},source,201);
    publishedTickets.push(await ok(`/work/${work.id}/commands`,'POST',{revision:work.revision,command:'close',reason:'Employee reported recovery'},source));
  }
  let published=(await ok('/knowledge-drafts/detect','POST',{},source)).items.find(d=>d.group.value==='portable published guidance');assert.ok(published);
  published=await ok(`/knowledge-drafts/${published.id}/generate`,'POST',{revision:published.revision,connectionId:model.id,generate:true},source);
  published=await ok(`/knowledge-drafts/${published.id}/publish`,'POST',{revision:published.revision,review:true,scope:'operators',expiresAt:new Date(Date.now()+86400000).toISOString()},source);
  assert.ok(published.modelAttemptId);
  const firstArticle=(await ok('/knowledge?q=Network','GET',undefined,source)).items.find(a=>a.id===published.articleId),generatedBody=firstArticle.body;
  await ok('/knowledge','POST',{id:firstArticle.id,revision:firstArticle.revision,title:firstArticle.title,body:firstArticle.body+'\nReviewer follow-up: record whether access returned.',scope:firstArticle.scope,expiresAt:firstArticle.expires_at,review:true},source,201);
  const publishedBody=(await ok('/knowledge?q=Network','GET',undefined,source)).items.find(a=>a.id===published.articleId).body;
  assert.ok((await ok('/fixtures/records','GET',undefined,source)).articleVersions.filter(v=>v.article_id===published.articleId).some(v=>JSON.parse(v.content_json).body===generatedBody),'KB-004 a superseded article version exists before erasure');
  const exp=await ok('/exports','POST',{idempotencyKey:'knowledge-draft-native'},source,201);
  let manifest;
  for(let i=0;i<30;i++){const next=await ok(`/exports/${exp.id}/advance`,'POST',{},source);if(next.state==='ready'){manifest=next;break;}}
  assert.ok(manifest);
  const destination=await ok('/fixtures/tenant','POST',{},sourceAuth);
  const dest=await auth(await request('/login','POST',{email:destination.email,password:'destination secure password'}));
  const imported=await ok('/imports','POST',{manifest,idempotencyKey:'knowledge-draft-native'},dest,201);
  for(const chunk of manifest.chunks){const response=await request(`/exports/${exp.id}/chunks/${chunk.ordinal}`,'GET',undefined,source);assert.equal(response.status,200);await ok(`/imports/${imported.id}/chunks/${chunk.ordinal}`,'PUT',Buffer.from(await response.arrayBuffer()),dest,200,true);}
  const report=await ok(`/imports/${imported.id}/dry-run`,'POST',{},dest);assert.equal(report.unresolvedReferences,0,JSON.stringify(report));
  let restored;
  for(let i=0;i<30;i++){const result=await ok(`/imports/${imported.id}/resume`,'POST',{acceptSemanticLoss:true},dest);if(result.state!=='applying'){
    if(result.state!=='restored') {
      const history=await ok(`/imports/${imported.id}/records`,'GET',undefined,dest);
      console.log('KB-004 restore diagnostic',JSON.stringify(history.data.map(r=>({table:r.table_name,state:r.state,reason:r.reason}))));
    }
    assert.equal(result.state,'restored',JSON.stringify(result.target));restored=true;break;}}
  assert.ok(restored);
  const drafts=(await ok('/knowledge-drafts','GET',undefined,dest)).items;
  const rejected=drafts.find(d=>d.group.value==='portable knowledge app');assert.ok(rejected);assert.equal(rejected.state,'rejected');
  assert.equal(rejected.rejectionReason,'Retain a reviewed rejection through native transfer');
  assert.equal(rejected.sources.length,3);assert.ok(rejected.sources.every(s=>!tickets.some(t=>t.id===s.id)));
  assert.ok(rejected.sources.every(s=>s.content.includes('Knowledge Archive Person')));
  const portablePublished=drafts.find(d=>d.group.value==='portable published guidance');assert.equal(portablePublished.state,'published');assert.equal(portablePublished.modelAttemptId,null);
  const restoredArticle=(await ok('/knowledge?q=Network','GET',undefined,dest)).items.find(a=>a.id===portablePublished.articleId);
  assert.equal(restoredArticle.body,publishedBody);assert.equal(restoredArticle.sources.length,3);
  assert.ok(restoredArticle.sources.every(s=>!publishedTickets.some(t=>s.href.includes(t.id))),'KB-004 published source links remap to destination records');
  assert.equal((await ok('/connections','GET',undefined,dest)).some(c=>c.provider==='openai'),false,'KB-004 restore does not recreate model connection authority');
  const scanned=(await ok('/knowledge-drafts/detect','POST',{},dest)).items;
  assert.equal(scanned.filter(d=>d.group.value==='portable knowledge app').length,1);assert.equal(scanned.find(d=>d.id===rejected.id).state,'rejected');
  let erasure=await ok('/adoption/erase','POST',{identity:member.id},source);
  for(let i=0;i<20&&erasure.state!=='completed';i++){await ok('/fixtures/sweep','POST',{},source);erasure=await ok(`/adoption/erase/${erasure.id}/resume`,'POST',{},source);}
  assert.equal(erasure.state,'completed',JSON.stringify(erasure));
  assert.ok(!(await ok('/knowledge-drafts','GET',undefined,source)).items.some(d=>d.id===candidate.id));
  assert.ok(!(await ok('/knowledge?q=Network','GET',undefined,source)).items.some(a=>a.id===published.articleId));
  // Inspect real D1 custody after the public erasure action, including versions
  // that ordinary search intentionally cannot expose. No storage is faked.
  const custody=await ok('/fixtures/records','GET',undefined,source);
  const derived=[...custody.knowledge.filter(r=>r.id===published.articleId),...custody.articleVersions.filter(r=>r.article_id===published.articleId),...custody.knowledgeDrafts.filter(r=>r.id===published.id)];
  assert.equal(JSON.stringify(derived).includes(publishedBody),false,'KB-004 public erasure removes published prose and every historical article version');
  assert.equal(JSON.stringify(derived).includes(generatedBody),false,'KB-004 public erasure also removes the superseded generated version');
  assert.equal(JSON.stringify(derived).includes('Knowledge Archive Person'),false,'KB-004 erasure removes retained source snapshots');
  const suppressed=custody.knowledgeDrafts.find(r=>r.id===published.id);assert.equal(suppressed.state,'erased');assert.ok(suppressed.semantic_key);
  console.log('PASS KB-004 native archive: generated rejection and reviewed article restore, remapped source links, no model authority, and erased text/snapshots/article versions after public erasure in real D1 custody');
}

import assert from 'node:assert/strict';
/** Paid-edge generation is covered in work/UI suites. Native archive verifies content-only
 * candidates and durable reviewed rejection, including destination source guards and erasure. */
export async function knowledgeDraftArchiveChecks(ok,request,auth,sourceAuth) {
  const tenant=await ok('/fixtures/tenant','POST',{},sourceAuth);
  const source=await auth(await request('/login','POST',{email:tenant.email,password:'destination secure password'}));
  const member=await ok('/members','POST',{email:'kb004-archive-person@test.invalid',name:'Knowledge Archive Person',password:'knowledge archive employee password',roles:['employee']},source,201);
  const tickets=[];
  for(let i=0;i<3;i++) {
    const work=await ok('/work','POST',{title:'Portable knowledge session',body:'Knowledge Archive Person recovered access with a fresh session.',beneficiaryId:member.id,kind:'incident',context:{app:'Portable knowledge app'},deduplicationKey:crypto.randomUUID()},source,201);
    tickets.push(await ok(`/work/${work.id}/commands`,'POST',{revision:work.revision,command:'close',reason:'Fresh session restored the reported access'},source));
  }
  const candidate=(await ok('/knowledge-drafts/detect','POST',{},source)).items.find(d=>d.group.value==='portable knowledge app');assert.ok(candidate);
  await ok(`/knowledge-drafts/${candidate.id}/reject`,'POST',{revision:candidate.revision,reason:'Retain a reviewed rejection through native transfer'},source);
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
  const scanned=(await ok('/knowledge-drafts/detect','POST',{},dest)).items;
  assert.equal(scanned.filter(d=>d.group.value==='portable knowledge app').length,1);assert.equal(scanned.find(d=>d.id===rejected.id).state,'rejected');
  await ok('/adoption/erase','POST',{identity:member.id},source);await ok('/fixtures/sweep','POST',{},source);
  assert.ok(!(await ok('/knowledge-drafts','GET',undefined,source)).items.some(d=>d.id===candidate.id));
  console.log('PASS KB-004 native archive: public-source snapshots remap, rejected grouping remains suppressed, and erasure withdraws derived content');
}

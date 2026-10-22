import assert from 'node:assert/strict';

/** Actual native archive download/upload and replay, with original audit values
 * supplied exclusively by public classification/custom-field commands. */
export async function historyArchiveChecks(ok,request,auth,owner) {
  const password='synthetic-linen-13000';
  const actor=await ok('/members','POST',{email:'synthetic-linen-13001@example.test',name:'Alice',password,roles:['operator']},owner,201);
  const actorAuth=await auth(await request('/login','POST',{email:'synthetic-linen-13001@example.test',password}));
  const subject=await ok('/members','POST',{email:'synthetic-linen-13002@example.test',name:'Bob',password,roles:['employee']},owner,201);
  const subjectAuth=await auth(await request('/login','POST',{email:'synthetic-linen-13002@example.test',password}));
  const work=await ok('/work','POST',{title:'synthetic-linen-13003',body:'synthetic-linen-13004',kind:'incident',deduplicationKey:'synthetic-linen-13005'},subjectAuth,201);
  for(const priority of ['P3','P2']){
    const c=await ok('/work/'+work.id+'/classification','GET',undefined,actorAuth);
    await ok('/work/'+work.id+'/classification/override','POST',{revision:c.revision,workRevision:c.workRevision,type:'incident',category:'hardware',subcategory:'laptop',impact:'low',urgency:'medium',priority,reason:'synthetic-linen-13006'},actorAuth);
  }
  const field=await ok('/desk-fields','POST',{name:'Personal diagnostic',type:'text',kinds:['incident'],requiredOn:[]},owner,201);
  await ok('/work/'+work.id+'/fields','POST',{fieldId:field.id,value:'synthetic-linen-13007 private archive history'},actorAuth);
  const original=(await ok('/work/'+work.id+'/activity','GET',undefined,owner)).items;
  const priority=original.find(e=>e.changes.some(c=>c.field==='priority'&&c.before==='P3'&&c.after==='P2'));
  assert.ok(priority,'original priority event exists before archive');
  const exported=await ok('/exports','POST',{idempotencyKey:'synthetic-linen-13008'},owner,201);
  let manifest;
  for(let n=0;n<200;n++){const progress=await ok('/exports/'+exported.id+'/advance','POST',{},owner);if(progress.state==='ready'){manifest=progress;break;}}
  assert.ok(manifest,'native export reaches ready');
  const chunks=[];
  for(const chunk of manifest.chunks){const r=await request('/exports/'+exported.id+'/chunks/'+chunk.ordinal,'GET',undefined,owner);assert.equal(r.status,200);chunks.push({chunk,bytes:Buffer.from(await r.arrayBuffer())});}
  const receipt=await ok('/adoption/erase','POST',{identity:actor.id},owner);
  assert.ok(receipt.historyCounts&&Object.values(receipt.historyCounts).every(Number.isInteger),'public erasure receipt is count-only');
  const unavailable=await request('/exports/'+exported.id+'/chunks/'+manifest.chunks[0].ordinal,'GET',undefined,owner);
  assert.equal(unavailable.status,409,'old downloadable archive is invalidated');
  const after=(await ok('/work/'+work.id+'/activity','GET',undefined,owner)).items;
  const retained=after.find(e=>e.id===priority.id);
  assert.ok(retained.changes.some(c=>c.field==='priority'&&c.before==='P3'&&c.after==='P2'));
  assert.equal(retained.actor,'Erased person');
  const imported=await ok('/imports','POST',{manifest,idempotencyKey:'synthetic-linen-13009'},owner,201);
  for(const {chunk,bytes} of chunks)await ok('/imports/'+imported.id+'/chunks/'+chunk.ordinal,'PUT',bytes,owner,200,true);
  await ok('/imports/'+imported.id+'/dry-run','POST',{},owner);
  for(let n=0;n<200;n++){const result=await ok('/imports/'+imported.id+'/resume','POST',{acceptSemanticLoss:true},owner);if(result.state==='restored'||result.state==='history_only'&&!result.processedChunks)break;assert.notEqual(n,199,'archive replay finishes');}
  let cursor='';do{
    const history=await ok('/imports/'+imported.id+'/records'+(cursor?'?cursor='+encodeURIComponent(cursor):''),'GET',undefined,owner);
    assert.ok(!JSON.stringify(history).includes('synthetic-linen-13007'),'old source custody does not restore scrubbed history text');cursor=history.cursor;
  }while(cursor);
  const replayed=(await ok('/work/'+work.id+'/activity','GET',undefined,owner)).items;
  assert.deepEqual(replayed.find(e=>e.id===priority.id),retained,'replay preserves the original retained entry and erasure date');
  const privateValue='synthetic-linen-13007 private archive history';
  const search=await ok('/search?q='+encodeURIComponent(privateValue),'GET',undefined,owner);
  assert.equal(search.total,0,'replay does not re-index cleared values');
  const fuzzy=await ok('/search?q=synthetic-linen-13007','GET',undefined,owner);
  assert.ok(!JSON.stringify(fuzzy.items).includes(privateValue),'unrelated typo matches contain no cleared source value');
  console.log('PASS DESK-017 native archive: original history, actor erasure, approved priority retention, count receipt, old archive invalidation and actual upload/replay without resurrection');
}

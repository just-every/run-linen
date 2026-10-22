import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

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
  const refused=await request('/imports/'+imported.id+'/dry-run','POST',{},owner);
  assert.equal(refused.status,409,'A pre-erasure snapshot is refused before normalization, even for typed history');
  assert.equal((await refused.json()).error.code,'erasure_invalidated_snapshot');
  assert.equal((await request('/imports/'+imported.id+'/resume','POST',{acceptSemanticLoss:true},owner)).status,409,'Semantic-loss consent cannot override an erased snapshot');
  async function archive(auth,key){
    const run=await ok('/exports','POST',{idempotencyKey:key},auth,201);let manifest;
    for(let n=0;n<200;n++){const r=await ok('/exports/'+run.id+'/advance','POST',{},auth);if(r.state==='ready'){manifest=r;break;}}
    assert.ok(manifest);const chunks=[],records=[];
    for(const chunk of manifest.chunks){const response=await request('/exports/'+run.id+'/chunks/'+chunk.ordinal,'GET',undefined,auth);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());chunks.push({chunk,bytes});if(chunk.kind==='records')records.push(...JSON.parse(bytes));}
    return {manifest,chunks,records};
  }
  const untypedBytes=Buffer.from(JSON.stringify([{table:'unmapped_incumbent_status',key:'synthetic-linen-13013',row:{id:'synthetic-linen-13013',opaque:JSON.stringify({nested:[actor.id]})}}]));
  const untypedManifest={...manifest,tables:{unmapped_incumbent_status:1},chunks:[{ordinal:100,kind:'records',count:1,size:untypedBytes.length,sha256:createHash('sha256').update(untypedBytes).digest('hex')}]};
  const untyped=await ok('/imports','POST',{manifest:untypedManifest,idempotencyKey:'synthetic-linen-13014'},owner,201);
  await ok('/imports/'+untyped.id+'/chunks/100','PUT',untypedBytes,owner,200,true);
  assert.equal((await request('/imports/'+untyped.id+'/dry-run','POST',{},owner)).status,409,'Unknown nested content has no tombstone exemption');
  const fresh=await archive(owner,'synthetic-linen-13010');
  const serialized=JSON.stringify(fresh.records);
  assert.ok(!serialized.includes(actor.id)&&!serialized.includes('synthetic-linen-13001@example.test')&&!serialized.includes('synthetic-linen-13007'),'Fresh archive removes erased identity and personal history');
  const archivedEvent=fresh.records.find(r=>r.table==='audit_events'&&r.row.id===priority.id);
  assert.ok(archivedEvent);const envelope=JSON.parse(archivedEvent.row.detail_json);
  assert.ok(envelope.changes.some(c=>c.field==='priority'&&c.before==='P3'&&c.after==='P2'),'Typed priority survives fresh export');
  assert.match(archivedEvent.row.actor_id,/^erased-a1-/,'Actor keeps an opaque archive identity');
  assert.ok(fresh.records.filter(r=>['adoption_tombstones','work_erasure','platform_identity_erasures'].includes(r.table)).every(r=>String(r.row.identity_hash??r.row.person_id).startsWith('ak1:')),'Archive removal markers carry keyed digests only');
  const tenant=await ok('/fixtures/tenant','POST',{},owner),destination=await auth(await request('/login','POST',{email:tenant.email,password:'destination secure password'}));
  let restored=await ok('/imports','POST',{manifest:fresh.manifest,idempotencyKey:'synthetic-linen-13011'},destination,201);
  for(const {chunk,bytes}of fresh.chunks)await ok('/imports/'+restored.id+'/chunks/'+chunk.ordinal,'PUT',bytes,destination,200,true);
  const report=await ok('/imports/'+restored.id+'/dry-run','POST',{},destination);assert.equal(report.unresolvedReferences,0,JSON.stringify(report));
  const destOwner=(await ok('/session','GET',undefined,destination)).principal.userId;
  assert.equal((await request('/imports/'+restored.id+'/identities','POST',{sourceUserId:archivedEvent.row.actor_id,targetUserId:destOwner},destination)).status,409,'An erased archive alias cannot bind a current account');
  // Pause the actual stage write at the D1 edge, erase its explicitly mapped
  // raceAuth identity through the public route, then let that write proceed.
  const raceTenant=await ok('/fixtures/tenant','POST',{},owner),raceAuth=await auth(await request('/login','POST',{email:raceTenant.email,password:'destination secure password'}));
  const racePerson=await ok('/members','POST',{email:'synthetic-linen-13018@example.test',name:'Concurrent removal',password,roles:['employee']},raceAuth,201);
  const raced=await ok('/imports','POST',{manifest:fresh.manifest,idempotencyKey:'synthetic-linen-13019'},raceAuth,201);
  for(const {chunk,bytes}of fresh.chunks)await ok('/imports/'+raced.id+'/chunks/'+chunk.ordinal,'PUT',bytes,raceAuth,200,true);
  await ok('/imports/'+raced.id+'/identities','POST',{sourceUserId:subject.id,targetUserId:racePerson.id},raceAuth);
  await ok('/imports/'+raced.id+'/dry-run','POST',{},raceAuth);
  const raceKey='synthetic-linen-13020';
  const applying=request('/imports/'+raced.id+'/resume','POST',{acceptSemanticLoss:true},{...raceAuth,extraHeaders:{'X-Test-Archive-Commit':raceKey}});
  let arrived=false;
  try{
    for(let n=0;n<1000;n++){if((await ok('/fixtures/archive-race/'+raceKey+'/arrived','GET',undefined,raceAuth)).arrived){arrived=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
    assert.ok(arrived,'Import reaches its first real history write');
    await ok('/adoption/erase','POST',{identity:racePerson.id},raceAuth);
  }finally{await ok('/fixtures/archive-race/'+raceKey+'/release','POST',{},raceAuth);}
  const rejected=await applying;
  assert.equal(rejected.status,409,'An erasure concurrent with a stage write atomically refuses that write');
  const raceRecords=await ok('/imports/'+raced.id+'/records','GET',undefined,raceAuth);
  assert.ok(!JSON.stringify(raceRecords).includes('synthetic-linen-13004'),'A held import cannot restore private source content after erasure');
  const late=await ok('/members','POST',{email:'synthetic-linen-13015@example.test',name:'Late removal',password,roles:['employee']},destination,201);
  await ok('/adoption/erase','POST',{identity:late.id},destination);
  assert.equal((await request('/imports/'+restored.id+'/resume','POST',{acceptSemanticLoss:true},destination)).status,409,'An erasure after dry run fences apply');
  assert.equal((await request('/imports/'+restored.id+'/dry-run','POST',{},destination)).status,409,'An invalidated archive cannot be silently reused');
  restored=await ok('/imports','POST',{manifest:fresh.manifest,idempotencyKey:'synthetic-linen-13017'},destination,201);
  for(const {chunk,bytes}of fresh.chunks)await ok('/imports/'+restored.id+'/chunks/'+chunk.ordinal,'PUT',bytes,destination,200,true);
  await ok('/imports/'+restored.id+'/dry-run','POST',{},destination);

  for(let n=0;n<200;n++){const r=await ok('/imports/'+restored.id+'/resume','POST',{acceptSemanticLoss:true},destination);if(r.state==='restored'||r.state==='history_only'&&!r.processedChunks)break;assert.notEqual(n,199);}
  const domain=await ok('/fixtures/records','GET',undefined,destination);assert.equal(domain.grants,0,'Fresh import stays inert');
  assert.ok(domain.work.some(r=>r.title==='synthetic-linen-13003'),'Business work survives with its history');
  const staleForeign=await ok('/imports','POST',{manifest,idempotencyKey:'synthetic-linen-13016'},destination,201);
  for(const {chunk,bytes}of chunks)await ok('/imports/'+staleForeign.id+'/chunks/'+chunk.ordinal,'PUT',bytes,destination,200,true);
  assert.equal((await request('/imports/'+staleForeign.id+'/dry-run','POST',{},destination)).status,409,'A later source import cannot discard its carried removal markers');
  const second=await archive(destination,'synthetic-linen-13012'),secondBytes=JSON.stringify(second.records);
  assert.ok(secondBytes.includes(archivedEvent.row.actor_id),'Second generation preserves the original opaque actor');
  assert.ok(!secondBytes.includes(actor.id)&&!secondBytes.includes('synthetic-linen-13007'),'Second generation never reconstructs erased content');
  const replayed=(await ok('/work/'+work.id+'/activity','GET',undefined,owner)).items;
  assert.deepEqual(replayed.find(e=>e.id===priority.id),retained,'replay preserves the original retained entry and erasure date');
  const privateValue='synthetic-linen-13007 private archive history';
  const search=await ok('/search?q='+encodeURIComponent(privateValue),'GET',undefined,owner);
  assert.equal(search.total,0,'replay does not re-index cleared values');
  const fuzzy=await ok('/search?q=synthetic-linen-13007','GET',undefined,owner);
  assert.ok(!JSON.stringify(fuzzy.items).includes(privateValue),'unrelated typo matches contain no cleared source value');
  console.log('PASS DESK-017 native archive: original history, actor erasure, approved priority retention, count receipt, old archive invalidation and old snapshot refusal and fresh keyed/aliased two-generation restore without resurrection');
}

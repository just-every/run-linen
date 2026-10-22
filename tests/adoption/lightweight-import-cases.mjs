import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const file=(name,text)=>({name,base64:Buffer.from(text).toString('base64')});
const dates='2026-01-02T10:00:00Z,2026-01-03T11:00:00Z';

/** Authenticated native file migration; provider exports are synthetic, the application and D1 are real. */
export async function lightweightImportChecks({ok,request,login,owner,steward,snapshot,db}) {
  const employee=await ok('/members','POST',{name:'Imported history outsider',email:'csv-employee@example.test',password:'synthetic-linen-1',roles:['employee']},owner,201);
  const employeeAuth=await login(employee.email??'csv-employee@example.test','synthetic-linen-1');
  const csvBase='/adoption/csv-imports/tickets',peopleBase='/adoption/csv-imports/people',assetBase='/adoption/csv-imports/assets',zendeskBase='/adoption/zendesk-imports';
  const csvInput={account:'synthetic-linen-1',files:[{...file('tickets.csv',`id,subject,description,type,status,requester,created_at,updated_at\r\nsynthetic-linen-1,"Dock, not detected","Original report\nwith another line",incident,resolved,synthetic-linen-1,${dates}\r\n`),format:'tickets-csv'}]};
  const peopleBody={account:'synthetic-linen-1',file:file('people.csv',`id,name,effective_at,observed_at,email\nsynthetic-linen-1,Avery Morgan,${dates},avery@example.test\nsynthetic-linen-2,Casey Rivera,${dates},casey@example.test\n`)};
  const assetBody={file:file('assets.csv','Asset Tag,Serial,Location,Status,Assigned To\nCSV-1,synthetic-linen-1001,Denver,Deployed,Avery Morgan\n')};
  const zendeskBytes=await readFile('tests/adoption/fixtures/zendesk/synthetic-linen-1.ndjson');
  const zendeskInput={account:'synthetic-linen-1',files:[{name:'tickets.ndjson',format:'tickets-json',base64:zendeskBytes.toString('base64')}]};
  for(const [base,body]of [[csvBase,{input:csvInput}],[peopleBase,peopleBody],[assetBase,assetBody],[zendeskBase,{input:zendeskInput}]]) {
    assert.equal((await request(base+'/dry-run','POST',body,employeeAuth)).status,403,'Only the current owner may review a file import');
    assert.equal((await request(base,'POST',{...body,acceptOmissions:true,reviewedFingerprint:'unreviewed',operationKey:'synthetic-linen-1'},employeeAuth)).status,403);
  }
  const importTickets=async(base,input,key)=>{
    const before=await snapshot(),review=await ok(base+'/dry-run','POST',{input},owner,200,{'X-Test-Read-Only':'1'});
    assert.equal(await snapshot(),before,'A dry run does not write source or native state');
    assert.ok(review.records.every(r=>r.targets.length===1&&!r.rejection));
    const changed=structuredClone(input);changed.account+='-changed';
    assert.equal((await request(base,'POST',{input:changed,reviewedFingerprint:review.fingerprint,acceptOmissions:true,operationKey:key},owner)).status,409);
    assert.equal((await request(base,'POST',{input,reviewedFingerprint:review.fingerprint,operationKey:key},owner)).status,422);
    const body={input,reviewedFingerprint:review.fingerprint,acceptOmissions:true,operationKey:key};
    const job=await ok(base,'POST',body,owner,201);
    assert.equal((await ok(base,'POST',body,owner,201)).id,job.id,'Operation identity prevents duplicate imports');
    let state;for(let n=0;n<6;n++){state=await ok(`${base}/${job.id}/resume`,'POST',{},owner);if(state.state==='completed')break;}assert.equal(state.state,'completed');
    const records=[];for(const record of review.records){const id=record.targets[0].id;records.push(await ok('/work/'+id,'GET',undefined,owner));assert.equal((await request('/work/'+id,'GET',undefined,employeeAuth)).status,404);}
    assert.equal((await request(`${base}/${job.id}/artifacts/0`,'GET',undefined,employeeAuth)).status,404);
    assert.equal((await request('/adoption/freshservice-imports/'+job.id,'GET',undefined,owner)).status,404,'A job is scoped to its source door');
    assert.deepEqual(Buffer.from(await (await request(`${base}/${job.id}/artifacts/0`,'GET',undefined,owner)).arrayBuffer()),Buffer.from(input.files[0].base64,'base64'));
    for(const record of records){assert.equal(record.work.state,'paused');assert.equal(record.work.sensitivity,'restricted');}
    return {review,job,records};
  };
  const csv=await importTickets(csvBase,csvInput,'synthetic-linen-csv');
  assert.equal(csv.records[0].work.created_at,'2026-01-02T10:00:00.000Z');assert.equal(csv.records[0].work.title,'Dock, not detected');assert.ok(csv.records[0].messages.some(m=>m.body==='Original report\nwith another line'));
  assert.equal(JSON.parse(csv.records[0].work.context_json).importedFrom,'csv');
  const duplicate=await ok(csvBase+'/dry-run','POST',{input:csvInput},owner);assert.equal(duplicate.records[0].targets[0].id,csv.review.records[0].targets[0].id,'A repeated source identity keeps the native target');
  console.log('PASS CSV tickets: authenticated read-only review, exact quoted text/timestamps, reviewed checkpoint apply, inert restricted native readback, exact originals, idempotence and source/employee denial');

  const beforePeople=await snapshot(),pr=await ok(peopleBase+'/dry-run','POST',peopleBody,owner,200,{'X-Test-Read-Only':'1'});assert.equal(await snapshot(),beforePeople);
  assert.deepEqual(pr.counts,{rows:2,ready:2,conflicts:0,unresolved:0});assert.ok(pr.omissions.some(o=>o.field==='email'));
  const pb={...peopleBody,reviewedFingerprint:pr.fingerprint,acceptOmissions:true};
  assert.equal((await request(peopleBase,'POST',{...pb,file:file('changed.csv',Buffer.from(peopleBody.file.base64,'base64').toString())},owner)).status,409);
  assert.equal((await request(peopleBase,'POST',{...pb,acceptOmissions:false},owner)).status,422);
  const created=await ok(peopleBase,'POST',pb,owner,201);assert.equal(created.created,2);
  const people=(await ok('/people','GET',undefined,owner)).items.filter(p=>created.people.some(q=>q.id===p.id));
  assert.deepEqual(people.map(p=>p.name).sort(),['Avery Morgan','Casey Rivera']);
  for(const p of people){assert.equal(p.member_id,null);assert.equal(p.manager_id,null);assert.equal(p.source,'csv:synthetic-linen-1');assert.equal(p.effective_at,'2026-01-02T10:00:00.000Z');}
  const existing=await ok(peopleBase+'/dry-run','POST',peopleBody,owner);assert.equal(existing.counts.unresolved,2);
  assert.equal((await request(peopleBase,'POST',{...pb,reviewedFingerprint:existing.fingerprint},owner)).status,409);
  const skip=await ok(peopleBase+'/dry-run','POST',{...peopleBody,skipIds:['synthetic-linen-1','synthetic-linen-2']},owner);assert.equal(skip.counts.unresolved,0);assert.equal(skip.counts.ready,0);
  // A native admission between review and apply prevents partial bulk mutation.
  const concurrent={...peopleBody,account:'synthetic-linen-race'},cr=await ok(peopleBase+'/dry-run','POST',concurrent,owner);
  await ok('/people','POST',{source:'csv:synthetic-linen-race',sourceId:'synthetic-linen-2',name:'Native reviewed person',effectiveAt:'2026-01-01T00:00:00Z',observedAt:'2026-01-01T00:00:00Z'},owner,201);
  assert.equal((await request(peopleBase,'POST',{...concurrent,reviewedFingerprint:cr.fingerprint,acceptOmissions:true},owner)).status,409);
  assert.ok(!(await ok('/people','GET',undefined,owner)).items.some(p=>p.source==='csv:synthetic-linen-race'&&p.source_id==='synthetic-linen-1'));
  console.log('PASS CSV people: review, atomic source facts, no account/manager binding, explicit omissions, no overwrite, skip conflicts and concurrent destination refusal');

  const ar=await ok(assetBase+'/dry-run','POST',assetBody,owner,200,{'X-Test-Read-Only':'1'}),assets=await ok(assetBase,'POST',{...assetBody,reviewedFingerprint:ar.fingerprint,acceptOmissions:true},owner,201);
  const asset=(await ok('/assets','GET',undefined,owner)).items.find(a=>a.id===assets.assets[0].id);assert.deepEqual([asset.serial,asset.state,asset.person_id,asset.location],['synthetic-linen-1001','stock',null,'Denver']);
  const custody=await ok(`/assets/${asset.id}/history`,'GET',undefined,owner);assert.equal(custody.items[0].kind,'record');assert.match(custody.items[0].evidence,/CSV status "Deployed"/);
  assert.equal((await ok(assetBase+'/dry-run','POST',assetBody,owner)).counts.unresolved,1);
  console.log('PASS CSV assets: owner-reviewed atomic stock record and typed custody, preserved source status without invented assignment, duplicate serial conflict');

  const zd=await importTickets(zendeskBase,zendeskInput,'synthetic-linen-zendesk');
  assert.equal(zd.records.length,2);assert.deepEqual(zd.records.map(r=>r.work.created_at),['2026-10-01T09:00:00.000Z','2026-10-02T00:00:00.000Z']);assert.ok(zd.records.flatMap(r=>r.messages).some(m=>m.visibility==='private'&&m.body.includes('PRIVATE')));
  assert.ok(zd.records.flatMap(r=>r.messages).some(m=>m.visibility==='public'&&m.body.includes('Public')));
  assert.ok(zd.records.every(r=>JSON.parse(r.work.context_json).importedFrom==='zendesk'));
  const raw=JSON.parse(zendeskBytes.toString().split('\n')[0]).ticket;
  for(const bad of [{...raw,comments:undefined},{...raw,comments:[{...raw.comments[0],public:undefined}]},{...raw,id:9007199254740992}]){
    const input={...zendeskInput,files:[{...zendeskInput.files[0],base64:Buffer.from(JSON.stringify({ticket:bad})).toString('base64')}]};
    assert.equal((await request(zendeskBase+'/dry-run','POST',{input},owner)).status,422);
  }
  const wrapped={...zendeskInput,account:'synthetic-linen-wrapped',files:[{...zendeskInput.files[0],base64:Buffer.from(JSON.stringify({tickets:zendeskBytes.toString().trim().split('\n').map(JSON.parse)})).toString('base64')}]};
  assert.equal((await ok(zendeskBase+'/dry-run','POST',{input:wrapped},owner)).records.length,2);
  // Related source erasure withdraws retained bytes and prevents unsanitized replay; unrelated CSV stays readable.
  const erased=await ok('/adoption/erase','POST',{identity:'user:'+raw.requester_id},owner);assert.ok(!erased.pendingDomains.includes('freshservice-import'),JSON.stringify(erased));
  assert.equal((await request(`${zendeskBase}/${zd.job.id}/artifacts/0`,'GET',undefined,owner)).status,410);
  assert.ok([409,422].includes((await request(zendeskBase+'/dry-run','POST',{input:zendeskInput},owner)).status));
  assert.equal((await request(`${csvBase}/${csv.job.id}/artifacts/0`,'GET',undefined,owner)).status,200);
  console.log('PASS Zendesk documented NDJSON/wrapped export: exact timestamps/visibility/attribution, inert native records, strict malformed-history refusal, scoped originals, erasure and replay refusal');
  for(const table of ['execution_grants','execution_plans','execution_outbox','work_intake_events','work_obligations'])assert.equal((await db.prepare(`SELECT count(*) n FROM ${table}`).first()).n,0,table+' stays inert');
}

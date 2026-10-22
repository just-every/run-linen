import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {importHarness} from './freshservice-import-harness.mjs';
import {serviceNowImportChecks} from './servicenow-import-cases.mjs';
import {lightweightImportChecks} from './lightweight-import-cases.mjs';
import {snipeitImportChecks} from './snipeit-import-cases.mjs';
const h=await importHarness(),base='/adoption/freshservice-imports',origin='http://localhost';
async function request(path,method='GET',body,auth={},extra={}){return h.fetch(origin+'/api/v1'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...auth,...extra},body:body===undefined?undefined:JSON.stringify(body)});}
async function ok(path,method,body,auth,status=200,extra={}){const r=await request(path,method,body,auth,extra);assert.equal(r.status,status,`${path}: ${await r.clone().text()}`);return r.json();}
async function login(email,password){const r=await request('/login','POST',{email,password});assert.equal(r.status,200,await r.clone().text());return session(r);}
async function session(r){const auth={Cookie:r.headers.get('set-cookie').split(';')[0]};auth['X-Linen-CSRF']=(await ok('/session','GET',undefined,auth)).csrfToken;return auth;}
async function snapshot(){
 const db=await h.db(),tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results;
 const rows=[];
 // D1 reads cross Miniflare's local HTTP bridge; keep full snapshots bounded.
 for(const {name} of tables)rows.push([name,(await db.prepare(`SELECT * FROM "${name}"`).all()).results]);
 return JSON.stringify(rows);
}
async function complete(id,owner){let result;for(let i=0;i<8;i++){result=await ok(`${base}/${id}/resume`,'POST',{},owner);if(result.state==='completed')return result;}assert.fail(JSON.stringify(result));}
try{
 await h.start();
 const setup=await request('/setup','POST',{email:'owner@example.test',name:'Owner',password:'fixture owner password',workspaceName:'Freshservice Test'});assert.equal(setup.status,201,await setup.clone().text());
 let owner=await session(setup);const me=await ok('/session','GET',undefined,owner);
 await ok('/members','POST',{email:'steward@example.test',name:'Steward',password:'fixture steward password',roles:['owner']},owner,201);
 const steward=await login('steward@example.test','fixture steward password');
 const employee=await ok('/members','POST',{email:'alex@example.test',name:'Alex',password:'fixture employee password',roles:['employee']},owner,201);
 const employeeAuth=await login('alex@example.test','fixture employee password');
 const stranger=await ok('/members','POST',{email:'stranger@example.test',name:'Stranger',password:'fixture stranger password',roles:['employee']},owner,201);
 const strangerAuth=await login('stranger@example.test','fixture stranger password');
 const input={account:'documented-fixture',identities:{'alex@example.test':employee.id},files:[{name:'tickets.csv',format:'tickets-csv',base64:(await readFile('tests/adoption/fixtures/freshservice/tickets.csv')).toString('base64')},{name:'conversations-101.json',format:'conversations-json',ticketId:'101',base64:(await readFile('tests/adoption/fixtures/freshservice/conversations-101.json')).toString('base64')}]};
 const before=await snapshot(),review=await ok(`${base}/dry-run`,'POST',{input},owner,200,{'X-Test-Read-Only':'1'});
 assert.equal(await snapshot(),before,'Dry-run changed persistent state');assert.equal(review.counts.input,2);assert.equal(review.counts.effects,2);assert.ok(review.records.every(r=>r.omissions.length>=3));
 assert.equal((await request(`${base}/dry-run`,'POST',{input},employeeAuth)).status,403);
 const changed=structuredClone(input);changed.account='changed-account';
 const rejected=await request(base,'POST',{input:changed,reviewedFingerprint:review.fingerprint,operationKey:'changed',acceptOmissions:true},owner);assert.equal(rejected.status,409,await rejected.clone().text());
 assert.equal(await snapshot(),before,'Changed review persisted a job');
 console.log('PASS SELECT-only dry-run, explicit omissions, current-role denial and changed-review rejection');
 const create={input,reviewedFingerprint:review.fingerprint,operationKey:'first-import',acceptOmissions:true};
 // Keep a real authenticated POST open while another owner revokes its session
 // version, without removing the actor's current owner role.
 const readId=crypto.randomUUID(),body=Buffer.from(JSON.stringify(create));let bodyController;
 const pending=h.fetch(origin+'/api/v1'+base,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...owner,'X-Test-Body-Read':readId},body:new ReadableStream({start(controller){bodyController=controller;controller.enqueue(body.subarray(0,1));}}),duplex:'half'});
 let revokedSnapshot;
 try{
  const reading=await h.fetch(origin+'/__test/body-read/'+readId,{signal:AbortSignal.timeout(10000)});assert.equal(reading.status,204);
  await ok('/members/'+me.principal.userId,'PATCH',{roles:['owner','auditor'],active:true},steward);
  assert.equal((await request('/session','GET',undefined,owner)).status,401);
  revokedSnapshot=await snapshot();
 }finally{bodyController.enqueue(body.subarray(1));bodyController.close();}
 const revoked=await pending;assert.equal(revoked.status,409,await revoked.clone().text());
 assert.equal(await snapshot(),revokedSnapshot,'Revoked in-flight import persisted data');
 owner=await login('owner@example.test','fixture owner password');
 console.log('PASS native session version revocation fences an already authenticated streaming import without persisting data');
 const job=await ok(base,'POST',create,owner,201);assert.equal((await ok(base,'POST',create,owner,201)).id,job.id);
 const partial=await ok(`${base}/${job.id}/apply`,'POST',{},owner);assert.equal(partial.checkpoint,1);assert.equal(partial.state,'applying');
 await h.stop();await h.start();await complete(job.id,owner);await complete(job.id,owner);
 const workId=review.records.find(r=>r.sourceId==='101').targets[0].id;
 const native=await ok('/work/'+workId,'GET',undefined,owner);assert.equal(native.work.state,'paused');assert.equal(native.messages.length,3);assert.ok(native.messages.some(m=>m.visibility==='private'&&m.body.includes('PRIVATE diagnostic')));assert.equal(native.attachments.length,0);
 const employeeRead=await ok('/work/'+workId,'GET',undefined,employeeAuth);assert.equal(employeeRead.messages.length,2);assert.ok(!JSON.stringify(employeeRead).includes('PRIVATE diagnostic'));
 assert.equal((await request('/work/'+workId,'GET',undefined,strangerAuth)).status,404);
 assert.equal((await request(`${base}/${job.id}/artifacts/0`,'GET',undefined,employeeAuth)).status,404);
 const artifacts=await ok(`${base}/${job.id}/artifacts`,'GET',undefined,owner);assert.equal(artifacts.artifacts.length,2);
 for(let i=0;i<2;i++){const artifact=artifacts.artifacts[i],response=await request(`${base}/${job.id}/artifacts/${i}`,'GET',undefined,owner);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(input.files.find(f=>f.name===artifact.name).base64,'base64'));}
 assert.equal((await ok(`${base}/${job.id}/history`,'GET',undefined,owner)).records.length,2);
 const db=await h.db();for(const table of ['execution_grants','execution_plans','execution_outbox','work_intake_events','work_obligations'])assert.equal((await db.prepare(`SELECT count(*) n FROM ${table}`).first()).n,0,table+' must stay inert');
 console.log('PASS durable partial apply/restart/resume, idempotence, native relational readback, private-note fences, exact retained artifacts and inert import');
 // Real native edit has no importer special case; undo must preserve it.
 await ok(`/work/${workId}/messages`,'POST',{body:'Later native private correction',visibility:'private',sourceMessageId:'native-after-import'},owner,201);
 let undo;for(let i=0;i<4;i++){undo=await request(`${base}/${job.id}/undo`,'POST',{},owner);if(undo.status!==200)break;assert.equal((await undo.json()).state,'undoing');}assert.equal(undo.status,409,await undo.clone().text());
 assert.ok((await ok('/work/'+workId,'GET',undefined,owner)).messages.some(m=>m.body==='Later native private correction'));
 const fresh={...input,account:'reversible-fixture'},freshReview=await ok(`${base}/dry-run`,'POST',{input:fresh},owner);
 const undoJob=await ok(base,'POST',{input:fresh,reviewedFingerprint:freshReview.fingerprint,operationKey:'undo-clean',acceptOmissions:true},owner,201);await complete(undoJob.id,owner);
 let undone;for(let i=0;i<5;i++){undone=await ok(`${base}/${undoJob.id}/undo`,'POST',{},owner);if(undone.state==='undone')break;}assert.equal(undone.state,'undone');assert.equal((await request('/work/'+freshReview.records[0].targets[0].id,'GET',undefined,owner)).status,404);
 const rollbackInput={...input,account:'rollback-fixture'},rollbackReview=await ok(`${base}/dry-run`,'POST',{input:rollbackInput},owner);
 const rollbackJob=await ok(base,'POST',{input:rollbackInput,reviewedFingerprint:rollbackReview.fingerprint,operationKey:'rollback-partial',acceptOmissions:true},owner,201);await ok(`${base}/${rollbackJob.id}/apply`,'POST',{},owner);
 assert.equal((await ok(`${base}/${rollbackJob.id}/rollback`,'POST',{},owner)).state,'rolled_back');
 console.log('PASS conflict-safe undo preserves later native edits; unchanged import undo and partial rollback remove only owned data');
 // A foreign tenant is a D1 fixture of existing platform identities, not an application mock.
 const foreignUser=await ok('/members','POST',{email:'foreign@example.test',name:'Foreign owner',password:'fixture foreign password',roles:['owner']},owner,201);
 const foreignWorkspace=crypto.randomUUID();await db.batch([db.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(foreignWorkspace,'Foreign',new Date().toISOString()),db.prepare('UPDATE memberships SET workspace_id=? WHERE user_id=?').bind(foreignWorkspace,foreignUser.id)]);
 const foreign=await login('foreign@example.test','fixture foreign password');assert.equal((await request(`${base}/${job.id}`,'GET',undefined,foreign)).status,404);assert.equal((await request('/work/'+workId,'GET',undefined,foreign)).status,404);
 const invalidMapping={...input,identities:{'alex@example.test':foreignUser.id}};assert.equal((await request(`${base}/dry-run`,'POST',{input:invalidMapping},owner)).status,422);
 const peerBytes=await readFile('tests/adoption/fixtures/freshservice/ticket-103.json');
 const peerInput={account:'unrelated-peer',files:[{name:'ticket-103.json',format:'ticket-json',base64:peerBytes.toString('base64')}]};
 const peerReview=await ok(`${base}/dry-run`,'POST',{input:peerInput},owner),peerJob=await ok(base,'POST',{input:peerInput,reviewedFingerprint:peerReview.fingerprint,operationKey:'peer',acceptOmissions:true},owner,201);
 const erased=await ok('/adoption/erase','POST',{identity:'alex@example.test'},owner);assert.ok(!erased.pendingDomains.includes('freshservice-import'),JSON.stringify(erased));
 assert.equal((await request('/session','GET',undefined,employeeAuth)).status,401);
 const after=await snapshot();assert.ok(!after.includes('PRIVATE diagnostic'),'Private source remains after erasure');assert.ok(!after.includes('Public update: a replacement dock'),'Retained original still contains erased source');
 assert.equal((await request(`${base}/${job.id}/artifacts/0`,'GET',undefined,owner)).status,410);
 const replay=await request(`${base}/dry-run`,'POST',{input},owner);assert.ok([409,422].includes(replay.status),await replay.clone().text());
 // A retained pre-bridge session has no issued version proof and cannot
 // authorize the owner; a fresh sign-in retains access to the same import.
 const legacy=await login('owner@example.test','fixture owner password');
 const legacyHash=createHash('sha256').update(legacy.Cookie.slice('linen_session='.length)).digest('hex');
 await db.prepare('DELETE FROM platform_auth_session_proofs WHERE session_id IN (SELECT id FROM sessions WHERE token_hash=?)').bind(legacyHash).run();
 await ok('/members/'+me.principal.userId,'PATCH',{roles:['owner'],active:true},steward);
 assert.equal((await request('/session','GET',undefined,owner)).status,401);
 assert.equal((await request('/session','GET',undefined,legacy)).status,401);
 owner=await login('owner@example.test','fixture owner password');
 await complete(peerJob.id,owner);const peerRead=await ok('/work/'+peerReview.records[0].targets[0].id,'GET',undefined,owner);assert.equal(peerRead.work.title,'Unrelated printer history');
 const peerArtifact=await request(`${base}/${peerJob.id}/artifacts/0`,'GET',undefined,owner);assert.equal(peerArtifact.status,200);assert.deepEqual(Buffer.from(await peerArtifact.arrayBuffer()),peerBytes);
 assert.equal((await ok(`${base}/${peerJob.id}/undo`,'POST',{},owner)).state,'undone');
 console.log('PASS tenant/mapped-identity denial and native adoption erasure removes retained custody, withdraws originals and rejects unsanitized replay');
 console.log('PASS unrelated saved-ticket JSON job retains exact original through erasure, resumes into native work and remains undoable');
 console.log('PASS unproved legacy session denied; freshly authenticated owner resumes, reads retained bytes and undoes');
 await snipeitImportChecks({ok,request,login,owner,snapshot});
 await serviceNowImportChecks({ok,request,owner,snapshot,db});
 await lightweightImportChecks({ok,request,login,owner,steward,snapshot,db});
}finally{await h.close();}

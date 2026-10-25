import assert from 'node:assert/strict';

// One configuration promotion flow through native sessions and the same HTTP doors as the application.
export async function sandboxChecks({request,owner,other,fixture}) {
 const invoke=async(path,method,body,auth=owner,status=200)=>{
  const r=await request(path,method,body,auth),value=await r.json();assert.equal(r.status,status,JSON.stringify(value));return value;
 };
 const members=await invoke('/members','GET'),first=members.find(m=>JSON.parse(m.roles_json).includes('owner'));
 await invoke('/members','POST',{name:'Editor',email:'synthetic-linen-440@example.test',password:'synthetic-linen-441',roles:['owner']},owner,201);
 await invoke('/members','POST',{name:'Reviewer',email:'synthetic-linen-410@example.test',password:'synthetic-linen-411',roles:['owner']},owner,201);
 const employee=await invoke('/members','POST',{name:'Requester',email:'synthetic-linen-412@example.test',password:'synthetic-linen-413',roles:['employee'],isPerson:true},owner,201);
 const login=async(email,password)=>{
  const r=await request('/login','POST',{email,password});assert.equal(r.status,200);
  const auth={cookie:r.headers.get('set-cookie').split(';')[0]};auth.csrf=(await invoke('/session','GET',undefined,auth)).csrfToken;return auth;
 };
 const editor=await login('synthetic-linen-440@example.test','synthetic-linen-441');
 const reviewer=await login('synthetic-linen-410@example.test','synthetic-linen-411'),requester=await login('synthetic-linen-412@example.test','synthetic-linen-413');
 const catalog=await invoke('/catalog','POST',{name:'Original equipment',kind:'device',target:'equipment',ownerId:first.id},owner,201);
 const catalogId=catalog.id;
 const privateAnswer='synthetic-linen-425';
 const form={fields:[{id:'purpose',label:'Business purpose',type:'text',required:true}],costCents:12500,deliveryHours:24,quoteRequired:false};
 const groups=await invoke('/work-groups','GET');
 const team=groups.groups?.[0]??groups.items?.[0];
 // Create the support team through its own public administration door.
 const group=team??await invoke('/work-groups','POST',{name:'Equipment team'},owner,201);
 const tasks=[{key:'prepare',title:'Prepare equipment',groupId:group.id,after:[],dueHours:24},{key:'label',title:'Label equipment',groupId:group.id,after:[],dueHours:24},{key:'check',title:'Check equipment',groupId:group.id,after:['prepare','label'],dueHours:48}];
 const work=await invoke('/work','POST',{title:'Existing request',body:'Synthetic equipment request',deduplicationKey:'synthetic-linen-423'},requester,201);
 await invoke('/work/'+work.id+'/fulfilment','POST',{catalogId,beneficiaryId:employee.id,purpose:'Synthetic equipment request'},requester,201);
 assert.equal((await fixture({outboundControl:true})).outboundCalls.length,1,'The network-edge observer detects an attempted outbound call');
 const protectedBefore=await fixture({seedSandboxGrant:true,resetOutbound:true});
 assert.equal(protectedBefore.protectedTables.execution_grants.length,1);
 assert.equal(protectedBefore.protectedTables.work_records.length,1);
 assert.equal(protectedBefore.protectedTables.work_fulfilments.length,1);
 await invoke('/sandboxes','POST',{name:'Denied'},requester,403);
 await invoke('/sandboxes','POST',{name:'Denied',copyRecords:true},owner,422);
 for(const field of ['records','payments','messages']){
  const denied=await invoke('/sandboxes','POST',{name:'Data must not copy',[field]:[{body:'synthetic-linen-447'}]},owner,422);
  assert.equal(denied.error.code,'sandbox_config_only');
 }
 let sandbox=await invoke('/sandboxes','POST',{name:'Equipment configuration'},owner,201);
 const path='/sandboxes/'+sandbox.id;
 assert.equal(sandbox.items.length,1);assert.equal(sandbox.items[0].id,catalogId);
 assert.ok(!JSON.stringify(sandbox).includes('secret_ciphertext'));
 assert.ok(!JSON.stringify(sandbox).includes(first.email),'No member profiles are copied');
 assert.equal(sandbox.items[0].owner_id,undefined);assert.equal(sandbox.items[0].target,undefined);
 await invoke(path,'GET',undefined,requester,403);
 await invoke(path,'GET',undefined,other,404);
 assert.deepEqual((await invoke('/sandboxes','GET',undefined,other)).items,[]);
 await invoke(path+'/promote','POST',{revision:sandbox.revision},owner,409);
 await invoke(path+'/catalog/'+catalogId,'PUT',{revision:sandbox.revision,name:'Invalid',form,tasks,secret:'synthetic-linen-414'},owner,422);
 sandbox=await invoke(path+'/catalog/'+catalogId,'PUT',{revision:sandbox.revision,name:'Reviewed equipment',form,tasks},editor);
 await invoke(path+'/catalog/'+catalogId,'PUT',{revision:1,name:'Stale',form,tasks},owner,409);
 assert.equal((await invoke('/catalog','GET')).items.find(i=>i.id===catalogId).name,'Original equipment','Draft edits do not change production');
 await invoke(path+'/test-form','POST',{revision:sandbox.revision,catalogId,answers:{}},owner,422);
 const trial=await invoke(path+'/test-form','POST',{revision:sandbox.revision,catalogId,answers:{purpose:privateAnswer}});
 assert.deepEqual(trial.answers,{purpose:privateAnswer});assert.deepEqual(trial.taskPlan,tasks);assert.equal(trial.executed,false);
 assert.deepEqual((await fixture({})).connections,protectedBefore.connections,'Sandbox testing never changes connections or secrets');
 // Execute the isolated team workflow, including parallel tasks and a dependency join.
 await invoke(path+'/runs','POST',{revision:sandbox.revision,catalogId,answers:{}},owner,422);
 await invoke(path+'/runs','POST',{revision:sandbox.revision,catalogId,answers:{purpose:'Synthetic test'},connectionId:'synthetic-linen-424'},owner,422);
 await invoke(path+'/runs','POST',{revision:sandbox.revision,catalogId,answers:{purpose:'Synthetic test'}},requester,403);
 await invoke(path+'/runs','GET',undefined,other,404);
 let run=await invoke(path+'/runs','POST',{revision:sandbox.revision,catalogId,answers:{purpose:'synthetic-linen-425'}},owner,201);
 const runPath=path+'/runs/'+run.id+'/complete';
 assert.deepEqual(run.tasks.map(t=>t.state),['ready','ready','blocked']);assert.equal(run.externalEffects,false);
 assert.equal(Date.parse(run.tasks[2].dueAt)-Date.parse(run.createdAt),48*3600000);
 for(const door of ['/sandboxes',path,path+'/runs','/catalog','/work'])
  assert.ok(!JSON.stringify(await invoke(door,'GET')).includes(privateAnswer),'Rehearsal answer absent from '+door);
 assert.ok(!JSON.stringify(await fixture({})).includes(privateAnswer),'No stored answer in sandbox rows, audit, production records or credentials');
 await invoke(runPath,'POST',{revision:sandbox.revision,taskKey:'check'},owner,409);
 run=await invoke(runPath,'POST',{revision:sandbox.revision,taskKey:'label'});
 assert.equal(run.tasks[2].state,'blocked');
 run=await invoke(runPath,'POST',{revision:sandbox.revision,taskKey:'prepare'});
 assert.equal(run.tasks[2].state,'ready');
 run=await invoke(runPath,'POST',{revision:sandbox.revision,taskKey:'check'});
 assert.equal(run.state,'completed');
 assert.deepEqual((await invoke(path+'/runs','GET')).items[0].tasks,run.tasks,'Workflow progress is read from durable sandbox state');
 await invoke(runPath,'POST',{revision:sandbox.revision,taskKey:'check'},owner,409);
 const concurrent=await invoke(path+'/runs','POST',{revision:sandbox.revision,catalogId,answers:{purpose:'Synthetic test'}},owner,201);
 const concurrentPath=path+'/runs/'+concurrent.id+'/complete';
 const auditsBeforeConcurrency=(await fixture({})).sandboxAudits.length;
 const attempts=await Promise.all(['prepare','label'].map(async taskKey=>{
  const response=await request(concurrentPath,'POST',{revision:sandbox.revision,taskKey},owner);
  assert.ok([200,409].includes(response.status),await response.clone().text());
  return {taskKey,status:response.status};
 }));
 const saved=(await invoke(path+'/runs','GET')).items.find(item=>item.id===concurrent.id);
 assert.equal((await fixture({})).sandboxAudits.length-auditsBeforeConcurrency,attempts.filter(a=>a.status===200).length,'Only committed completions create audit events');
 assert.deepEqual(saved.completed.slice().sort(),attempts.filter(a=>a.status===200).map(a=>a.taskKey).sort(),'Concurrent completions cannot overwrite a successful task');
 for(const attempt of attempts.filter(a=>a.status===409))await invoke(concurrentPath,'POST',{revision:sandbox.revision,taskKey:attempt.taskKey});
 assert.equal((await invoke(path+'/runs','GET')).items.find(item=>item.id===concurrent.id).tasks[2].state,'ready');
 const staleRun=await invoke(path+'/runs','POST',{revision:sandbox.revision,catalogId,answers:{purpose:'Synthetic test'}},owner,201);
 sandbox=await invoke(path+'/catalog/'+catalogId,'PUT',{revision:sandbox.revision,name:'Reviewed equipment',form,tasks});
 await invoke(path+'/runs/'+staleRun.id+'/complete','POST',{revision:sandbox.revision,taskKey:'prepare'},owner,409);
 assert.equal((await invoke(path+'/runs','GET')).items.find(item=>item.id===staleRun.id).current,false);
 // Refuse unsupported automated prerequisites rather than pretend a connector succeeded.
 sandbox=await invoke(path+'/catalog/'+catalogId,'PUT',{revision:sandbox.revision,name:'Reviewed equipment',form,tasks:[{...tasks[0],after:['automated']}]});
 await invoke(path+'/runs','POST',{revision:sandbox.revision,catalogId,answers:{purpose:'Synthetic test'}},owner,422);
 sandbox=await invoke(path+'/catalog/'+catalogId,'PUT',{revision:sandbox.revision,name:'Reviewed equipment',form,tasks});
 const frozenRun=await invoke(path+'/runs','POST',{revision:sandbox.revision,catalogId,answers:{purpose:'Synthetic test'}},owner,201);
 const afterWorkflow=await fixture({});
 assert.deepEqual(afterWorkflow.protectedTables,protectedBefore.protectedTables,'Rehearsal task completion cannot change production work, grants or in-flight requests');
 assert.deepEqual(afterWorkflow.connections,protectedBefore.connections,'Rehearsals cannot use or modify production connectors');
 assert.deepEqual(afterWorkflow.settings,protectedBefore.settings);
 assert.equal((await invoke('/catalog','GET')).items.find(i=>i.id===catalogId).name,'Original equipment');
 const rejectData=async(endpoint,auth=owner)=>{
  const before=await fixture({});
  const denied=await invoke(endpoint,'POST',{revision:sandbox.revision,records:[{body:'synthetic-linen-442'}]},auth,422);
  assert.equal(denied.error.code,'sandbox_config_only');
  assert.deepEqual(await fixture({}),before,'Data-bearing request changes neither configuration nor audit');
 };
 await rejectData(path+'/test-form');
 await rejectData(path+'/package');
 sandbox=await invoke(path+'/package','POST',{revision:sandbox.revision});
 await invoke(path+'/runs/'+frozenRun.id+'/complete','POST',{revision:sandbox.revision,taskKey:'prepare'},owner,409);
 await invoke(path+'/runs','POST',{revision:sandbox.revision,catalogId,answers:{purpose:'Synthetic test'}},owner,409);
 assert.deepEqual(sandbox.differences.map(d=>d.field),['name','form','tasks']);
 await invoke(path+'/catalog/'+catalogId,'PUT',{revision:sandbox.revision,name:'Late edit',form,tasks},owner,409);
 await invoke(path+'/approve','POST',{revision:sandbox.revision},owner,403);
 await invoke(path+'/approve','POST',{revision:sandbox.revision},editor,403);
 await rejectData(path+'/approve',reviewer);
 await invoke(path+'/approve','POST',{revision:sandbox.revision},requester,403);
 sandbox=await invoke(path+'/approve','POST',{revision:sandbox.revision},reviewer);
 await invoke(path+'/promote','POST',{revision:sandbox.revision},requester,403);
 await rejectData(path+'/promote');
 sandbox=await invoke(path+'/promote','POST',{revision:sandbox.revision});
 const promoted=(await invoke('/catalog','GET')).items.find(i=>i.id===catalogId);
 assert.equal(promoted.name,'Reviewed equipment');assert.equal(promoted.revision,2);assert.deepEqual(promoted.form,form);assert.deepEqual(promoted.tasks,tasks);
 await invoke(path+'/promote','POST',{revision:sandbox.revision},owner,409);
 const protectedAfter=await fixture({});assert.deepEqual(protectedAfter.connections,protectedBefore.connections);assert.deepEqual(protectedAfter.settings,protectedBefore.settings);assert.deepEqual(protectedAfter.protectedTables,protectedBefore.protectedTables,'Existing grants, request snapshots and duties keep their exact versions');assert.equal(protectedAfter.sandboxAudits.filter(a=>a.action==='sandbox.promoted').length,1);assert.equal(JSON.parse(protectedAfter.sandboxAudits.find(a=>a.action==='sandbox.promoted').detail_json).version,sandbox.revision);
 assert.deepEqual(protectedAfter.outboundCalls,[],'No outbound call in sandbox rehearsal or promotion');
 await rejectData(path+'/rollback-package');
 let rollback=await invoke(path+'/rollback-package','POST',{revision:sandbox.revision},owner,201);
 rollback=await invoke('/sandboxes/'+rollback.id+'/approve','POST',{revision:rollback.revision},reviewer);
 rollback=await invoke('/sandboxes/'+rollback.id+'/promote','POST',{revision:rollback.revision});
 const restored=(await invoke('/catalog','GET')).items.find(i=>i.id===catalogId);
 assert.deepEqual((await fixture({})).protectedTables,protectedBefore.protectedTables,'Rollback preserves production authority and existing requests');
 assert.equal(restored.name,'Original equipment');assert.equal(restored.revision,3);assert.deepEqual(restored.tasks,[]);
 // A production edit after review refuses the whole package, including its state transition and audit.
 let stale=await invoke('/sandboxes','POST',{name:'Stale review'},owner,201),stalePath='/sandboxes/'+stale.id;
 stale=await invoke(stalePath+'/catalog/'+catalogId,'PUT',{revision:stale.revision,name:'Must not apply',form,tasks});
 stale=await invoke(stalePath+'/package','POST',{revision:stale.revision});
 stale=await invoke(stalePath+'/approve','POST',{revision:stale.revision},reviewer);
 await invoke('/catalog/'+catalogId+'/form','POST',{revision:3,name:'Concurrent production edit',form});
 const beforeRefusal=await fixture({});
 await invoke(stalePath+'/promote','POST',{revision:stale.revision},owner,409);
 assert.equal((await invoke('/catalog','GET')).items.find(i=>i.id===catalogId).name,'Concurrent production edit');
 assert.equal((await invoke(stalePath,'GET')).state,'approved');assert.deepEqual(await fixture({}),beforeRefusal);
 let withdrawn=await invoke('/sandboxes','POST',{name:'Withdrawn reviewer'},owner,201),withdrawnPath='/sandboxes/'+withdrawn.id;
 withdrawn=await invoke(withdrawnPath+'/catalog/'+catalogId,'PUT',{revision:withdrawn.revision,name:'Must not apply after revocation',form,tasks});
 withdrawn=await invoke(withdrawnPath+'/package','POST',{revision:withdrawn.revision});
 withdrawn=await invoke(withdrawnPath+'/approve','POST',{revision:withdrawn.revision},reviewer);
 const reviewMember=(await invoke('/members','GET')).find(m=>m.email==='synthetic-linen-410@example.test');
 await invoke('/members/'+reviewMember.id,'PATCH',{roles:['employee'],active:true});
 const beforeWithdrawalRefusal=await fixture({});
 await invoke(withdrawnPath+'/promote','POST',{revision:withdrawn.revision},owner,409);
 assert.deepEqual(await fixture({}),beforeWithdrawalRefusal,'Withdrawn reviewer cannot authorize a production change');
 // The portable workspace read door includes audits but excludes sandbox state and answers.
 let exported=await invoke('/exports','POST',{idempotencyKey:'synthetic-linen-443'},owner,201);
 for(let page=0;page<100&&exported.state!=='ready';page++)exported=await invoke('/exports/'+exported.id+'/advance','POST',{});
 assert.equal(exported.state,'ready');
 assert.equal(exported.tables.configuration_sandboxes,undefined);
 const archiveChunks=new Map();
 for(const chunk of exported.chunks){
  const response=await request('/exports/'+exported.exportId+'/chunks/'+chunk.ordinal,'GET',undefined,owner);
  assert.equal(response.status,200);const bytes=new Uint8Array(await response.arrayBuffer());archiveChunks.set(chunk.ordinal,bytes);
  assert.ok(!new TextDecoder().decode(bytes).includes(privateAnswer),'No rehearsal answer in exported records or audit');
 }
 for(const door of ['/sandboxes',path,path+'/runs','/catalog','/work'])
  assert.ok(!JSON.stringify(await invoke(door,'GET')).includes(privateAnswer),'No retained form or rehearsal answer after promotion: '+door);
 assert.ok(!JSON.stringify(await fixture({})).includes(privateAnswer),'No answer retained after workflow completion, review, promotion or rollback');
 // Restore into a separate destination workspace through its public import door.
 const sourceSandboxes=await invoke('/sandboxes','GET');
 const destinationOwner=(await invoke('/members','GET',undefined,other)).find(m=>JSON.parse(m.roles_json).includes('owner'));
 const destinationCatalog=await invoke('/catalog','POST',{name:'Destination equipment',kind:'device',target:'equipment',ownerId:destinationOwner.id},other,201);
 await invoke('/members','POST',{name:'Destination reviewer',email:'synthetic-linen-445@example.test',password:'synthetic-linen-446',roles:['owner']},other,201);
 const destinationReviewer=await login('synthetic-linen-445@example.test','synthetic-linen-446');
 let beforeRestore=await invoke('/sandboxes','POST',{name:'Must expire on workspace restore'},other,201);
 const beforeRestorePath='/sandboxes/'+beforeRestore.id;
 beforeRestore=await invoke(beforeRestorePath+'/catalog/'+destinationCatalog.id,'PUT',{revision:beforeRestore.revision,name:'Must not survive restore',form,tasks:[]},other);
 beforeRestore=await invoke(beforeRestorePath+'/package','POST',{revision:beforeRestore.revision},other);
 beforeRestore=await invoke(beforeRestorePath+'/approve','POST',{revision:beforeRestore.revision},destinationReviewer);
 const imported=await invoke('/imports','POST',{manifest:exported,idempotencyKey:'synthetic-linen-444'},other,201);
 await invoke('/imports/'+imported.id+'/apply','POST',{acceptSemanticLoss:true},other,409);
 assert.equal((await invoke(beforeRestorePath,'GET',undefined,other)).state,'approved','Unvalidated import does not invalidate packages');
 for(const chunk of exported.chunks){
  const upload=await request('/imports/'+imported.id+'/chunks/'+chunk.ordinal,'PUT',archiveChunks.get(chunk.ordinal),other,{'Content-Type':'application/octet-stream'});
  assert.equal(upload.status,200,await upload.clone().text());
 }
 await invoke('/imports/'+imported.id+'/dry-run','POST',{},other);
 let importResult=await invoke('/imports/'+imported.id+'/apply','POST',{acceptSemanticLoss:true},other);
 if(importResult.state==='applying'){
  const held=await invoke('/sandboxes','POST',{name:'During restore'},other,409);assert.equal(held.error.code,'sandbox_restore_in_progress');
  await invoke(beforeRestorePath+'/promote','POST',{revision:beforeRestore.revision},other,409);
 }
 for(let page=0;page<100&&importResult.state==='applying';page++)importResult=await invoke('/imports/'+imported.id+'/resume','POST',{acceptSemanticLoss:true},other);
 assert.ok(['restored','history_only'].includes(importResult.state),JSON.stringify(importResult));
 assert.deepEqual((await invoke('/sandboxes','GET',undefined,other)).items,[],'Workspace restore invalidates every pre-restore package');
 for(const action of ['package','approve','promote'])await invoke(beforeRestorePath+'/'+action,'POST',{revision:beforeRestore.revision},other,404);
 const fresh=await invoke('/sandboxes','POST',{name:'Fresh workspace configuration'},other,201);
 assert.notEqual(fresh.id,beforeRestore.id);assert.equal(fresh.state,'draft');assert.equal(fresh.approvedBy,null);
 assert.deepEqual(await invoke('/sandboxes','GET'),sourceSandboxes,'Restoring another workspace cannot invalidate source packages');
 assert.deepEqual((await fixture({})).outboundCalls,[]);
 console.log('PASS sandbox configuration HTTP: config-only copy, scoped access, isolated edits, durable task workflow execution with dependency and revision fences, form validation, complete field diff, separate owner approval, atomic versioned promotion, reviewed rollback, stale production refusal, connection and secret preservation');
}

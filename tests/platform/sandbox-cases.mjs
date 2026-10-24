import assert from 'node:assert/strict';

// One configuration promotion flow through native sessions and the same HTTP doors as the application.
export async function sandboxChecks({request,owner,other,fixture}) {
 const invoke=async(path,method,body,auth=owner,status=200)=>{
  const r=await request(path,method,body,auth),value=await r.json();assert.equal(r.status,status,JSON.stringify(value));return value;
 };
 const members=await invoke('/members','GET'),first=members.find(m=>JSON.parse(m.roles_json).includes('owner'));
 await invoke('/members','POST',{name:'Reviewer',email:'synthetic-linen-410@example.test',password:'synthetic-linen-411',roles:['owner']},owner,201);
 const employee=await invoke('/members','POST',{name:'Requester',email:'synthetic-linen-412@example.test',password:'synthetic-linen-413',roles:['employee'],isPerson:true},owner,201);
 const login=async(email,password)=>{
  const r=await request('/login','POST',{email,password});assert.equal(r.status,200);
  const auth={cookie:r.headers.get('set-cookie').split(';')[0]};auth.csrf=(await invoke('/session','GET',undefined,auth)).csrfToken;return auth;
 };
 const reviewer=await login('synthetic-linen-410@example.test','synthetic-linen-411'),requester=await login('synthetic-linen-412@example.test','synthetic-linen-413');
 const catalog=await invoke('/catalog','POST',{name:'Original equipment',kind:'device',target:'equipment',ownerId:first.id},owner,201);
 const catalogId=catalog.id;
 const form={fields:[{id:'purpose',label:'Business purpose',type:'text',required:true}],costCents:12500,deliveryHours:24,quoteRequired:false};
 const groups=await invoke('/work-groups','GET');
 const team=groups.groups?.[0]??groups.items?.[0];
 // Create the support team through its own public administration door.
 const group=team??await invoke('/work-groups','POST',{name:'Equipment team'},owner,201);
 const tasks=[{key:'prepare',title:'Prepare equipment',groupId:group.id,after:[],dueHours:24}];
 const work=await invoke('/work','POST',{title:'Existing request',body:'Synthetic equipment request',deduplicationKey:'synthetic-linen-423'},requester,201);
 await invoke('/work/'+work.id+'/fulfilment','POST',{catalogId,beneficiaryId:employee.id,purpose:'Synthetic equipment request'},requester,201);
 const protectedBefore=await fixture({seedSandboxGrant:true});
 assert.equal(protectedBefore.protectedTables.execution_grants.length,1);
 assert.equal(protectedBefore.protectedTables.work_records.length,1);
 assert.equal(protectedBefore.protectedTables.work_fulfilments.length,1);
 await invoke('/sandboxes','POST',{name:'Denied'},requester,403);
 await invoke('/sandboxes','POST',{name:'Denied',copyRecords:true},owner,422);
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
 sandbox=await invoke(path+'/catalog/'+catalogId,'PUT',{revision:sandbox.revision,name:'Reviewed equipment',form,tasks});
 await invoke(path+'/catalog/'+catalogId,'PUT',{revision:1,name:'Stale',form,tasks},owner,409);
 assert.equal((await invoke('/catalog','GET')).items.find(i=>i.id===catalogId).name,'Original equipment','Draft edits do not change production');
 await invoke(path+'/test-form','POST',{revision:sandbox.revision,catalogId,answers:{}},owner,422);
 const trial=await invoke(path+'/test-form','POST',{revision:sandbox.revision,catalogId,answers:{purpose:'Synthetic test'}});
 assert.deepEqual(trial.answers,{purpose:'Synthetic test'});assert.deepEqual(trial.taskPlan,tasks);assert.equal(trial.executed,false);
 assert.deepEqual((await fixture({})).connections,protectedBefore.connections,'Sandbox testing never changes connections or secrets');
 sandbox=await invoke(path+'/package','POST',{revision:sandbox.revision});
 assert.deepEqual(sandbox.differences.map(d=>d.field),['name','form','tasks']);
 await invoke(path+'/catalog/'+catalogId,'PUT',{revision:sandbox.revision,name:'Late edit',form,tasks},owner,409);
 await invoke(path+'/approve','POST',{revision:sandbox.revision},owner,403);
 sandbox=await invoke(path+'/approve','POST',{revision:sandbox.revision},reviewer);
 sandbox=await invoke(path+'/promote','POST',{revision:sandbox.revision});
 const promoted=(await invoke('/catalog','GET')).items.find(i=>i.id===catalogId);
 assert.equal(promoted.name,'Reviewed equipment');assert.equal(promoted.revision,2);assert.deepEqual(promoted.form,form);assert.deepEqual(promoted.tasks,tasks);
 await invoke(path+'/promote','POST',{revision:sandbox.revision},owner,409);
 const protectedAfter=await fixture({});assert.deepEqual(protectedAfter.connections,protectedBefore.connections);assert.deepEqual(protectedAfter.settings,protectedBefore.settings);assert.deepEqual(protectedAfter.protectedTables,protectedBefore.protectedTables,'Existing grants, request snapshots and duties keep their exact versions');assert.equal(protectedAfter.sandboxAudits.filter(a=>a.action==='sandbox.promoted').length,1);assert.equal(JSON.parse(protectedAfter.sandboxAudits.find(a=>a.action==='sandbox.promoted').detail_json).version,sandbox.revision);
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
 console.log('PASS sandbox configuration HTTP: config-only copy, scoped access, isolated edits and form validation, complete field diff, separate owner approval, atomic versioned promotion, reviewed rollback, stale production refusal, connection and secret preservation');
}

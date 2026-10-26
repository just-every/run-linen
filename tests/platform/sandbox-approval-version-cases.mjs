import assert from 'node:assert/strict';

export async function sandboxApprovalVersionChecks({invoke,owner,reviewer,requester,employee,first,calendar,login}) {
 const reviewerMember=(await invoke('/members','GET')).find(member=>member.email==='synthetic-linen-410@example.test');
 await invoke('/people/'+employee.personId+'/binding','POST',{expectedRevision:1,memberId:employee.id,managerId:first.id});
 const catalog=await invoke('/catalog','POST',{name:'synthetic-linen-493',kind:'device',target:'synthetic-linen-494',ownerId:first.id,requiresManager:true,form:{costCents:1000}},owner,201);
 const definitions=[{key:'parallel_one',name:'synthetic-linen-495',mode:'all',approvers:[{type:'member',userId:first.id},{type:'member',userId:reviewerMember.id}],aboveCents:null,remindHours:4,slaHours:8},{key:'parallel_two',name:'synthetic-linen-496',mode:'any',withPrevious:true,approvers:[{type:'member',userId:first.id}],aboveCents:null,remindHours:4,slaHours:8},{key:'release',name:'synthetic-linen-497',mode:'any',approvers:[{type:'member',userId:reviewerMember.id}],aboveCents:null,remindHours:4,slaHours:8},{key:'threshold',name:'synthetic-linen-505',mode:'any',withPrevious:true,approvers:[{type:'member',userId:reviewerMember.id}],aboveCents:2000}];
 await invoke('/catalog/'+catalog.id+'/approvals','POST',{revision:1,calendarId:calendar.id,approvals:definitions,manager:{remindHours:4,slaHours:8}});
 const submit=async number=>{
  const work=await invoke('/work','POST',{title:'synthetic-linen-'+number,body:'synthetic-linen-'+number,deduplicationKey:'synthetic-linen-'+number},requester,201);
  await invoke('/work/'+work.id+'/fulfilment','POST',{catalogId:catalog.id,catalogRevision:2,beneficiaryId:employee.id,purpose:'synthetic-linen-'+number},requester,201);return work;
 };
 const approved=await submit(498),rejected=await submit(499),pending=await submit(500),managerRejected=await submit(504);
 const chain=work=>invoke('/work/'+work.id+'/approvals/'+catalog.id,'GET');
 const managerDecision=async work=>{
  const queued=(await invoke('/fulfilment-decisions','GET')).items.find(item=>item.workId===work.id);assert.ok(queued);
  await invoke('/work/'+work.id+'/fulfilment/approve','POST',{...queued,expectedHolderId:queued.holderId,idempotencyKey:crypto.randomUUID()});
 };
 const stageDecision=async(work,key,auth=owner,decision='approved')=>{
  const queued=(await invoke('/approval-stages','GET',undefined,auth)).items.find(item=>item.workId===work.id&&item.stageKey===key);assert.ok(queued,'Current pending stage '+key);
  await invoke('/work/'+work.id+'/approval-stage','POST',{...queued,decision,idempotencyKey:crypto.randomUUID()},auth);return queued;
 };
 const rejectedManagerQueue=(await invoke('/fulfilment-decisions','GET')).items.find(item=>item.workId===managerRejected.id);
 await invoke('/work/'+managerRejected.id+'/approval-stage','POST',{...rejectedManagerQueue,stageKey:'manager',decision:'rejected',idempotencyKey:crypto.randomUUID()});
 const beforeManagerRejected=await chain(managerRejected);
 const assertManagerRejected=async()=>{const current=(await invoke('/catalog','GET')).items.find(item=>item.id===catalog.id);assert.equal((await invoke('/fulfilment-decisions','GET')).items.some(item=>item.workId===managerRejected.id),false);const refusal=await invoke('/work/'+managerRejected.id+'/fulfilment/approve','POST',{...rejectedManagerQueue,expectedCatalogRevision:current.revision,expectedHolderId:rejectedManagerQueue.holderId,idempotencyKey:crypto.randomUUID()},owner,409);assert.equal(refusal.error.code,'approval_not_open');};
 await assertManagerRejected();
 await managerDecision(approved);await managerDecision(rejected);
 await stageDecision(approved,'parallel_one');await stageDecision(approved,'parallel_one',reviewer);await stageDecision(approved,'parallel_two');
 await stageDecision(rejected,'parallel_one',owner,'rejected');
 assert.deepEqual((await chain(approved)).stages.map(stage=>stage.state),['approved','approved','pending','skipped']);
 const beforeApproved=await chain(approved),beforeRejected=await chain(rejected),beforePending=await chain(pending);
 const staleQueue=(await invoke('/approval-stages','GET',undefined,reviewer)).items.find(item=>item.workId===approved.id&&item.stageKey==='release');
 let sandbox=await invoke('/sandboxes','POST',{name:'synthetic-linen-501'},owner,201),path='/sandboxes/'+sandbox.id;
 const retainedCalendar=sandbox.slaConfiguration.calendar.find(row=>row.id===calendar.id);
 sandbox=await invoke(path+'/sla-configuration/calendar/'+calendar.id,'PUT',{revision:sandbox.revision,start_hour:Number(retainedCalendar.start_hour)+1});
 sandbox=await invoke(path+'/catalog/'+catalog.id+'/approvals','PUT',{revision:sandbox.revision,calendarId:calendar.id,requiresManager:false,approvals:[{...definitions[2],key:'replacement',name:'synthetic-linen-502',remindHours:1,slaHours:2}]});
 sandbox=await invoke(path+'/package','POST',{revision:sandbox.revision});sandbox=await invoke(path+'/approve','POST',{revision:sandbox.revision},reviewer);sandbox=await invoke(path+'/promote','POST',{revision:sandbox.revision});
 assert.deepEqual(await chain(approved),beforeApproved,'Promotion preserves recorded manager and parallel decisions, pending serial timers and holders');assert.deepEqual(await chain(rejected),beforeRejected,'Promotion preserves final rejection');assert.deepEqual(await chain(pending),beforePending,'Promotion preserves pending manager timing');assert.deepEqual(await chain(managerRejected),beforeManagerRejected,'Promotion preserves final manager rejection');await assertManagerRejected();
 await invoke('/work/'+approved.id+'/approval-stage','POST',{...staleQueue,decision:'approved',idempotencyKey:crypto.randomUUID()},reviewer,409);
 await stageDecision(approved,'release',reviewer);assert.equal((await chain(approved)).satisfied,true);
 const completed=await chain(approved);
 let rollback=await invoke(path+'/rollback-package','POST',{revision:sandbox.revision},owner,201),rollbackPath='/sandboxes/'+rollback.id;rollback=await invoke(rollbackPath+'/approve','POST',{revision:rollback.revision},reviewer);await invoke(rollbackPath+'/promote','POST',{revision:rollback.revision});
 assert.deepEqual(await chain(approved),completed,'Rollback retains decisions recorded both before and after promotion');assert.deepEqual(await chain(rejected),beforeRejected);assert.deepEqual(await chain(pending),beforePending);assert.deepEqual(await chain(managerRejected),beforeManagerRejected,'Rollback preserves manager rejection');await assertManagerRejected();
 await invoke('/members/'+reviewerMember.id,'PATCH',{roles:['owner'],active:false});assert.equal((await chain(approved)).satisfied,false,'Preserved decisions still require current active approvers');assert.equal((await chain(rejected)).rejected,true);
 await invoke('/members/'+reviewerMember.id,'PATCH',{roles:['owner'],active:true});Object.assign(reviewer,await login('synthetic-linen-410@example.test','synthetic-linen-411'));assert.equal((await chain(approved)).satisfied,true);
 const work=(await invoke('/work/'+approved.id,'GET')).work;
 await invoke('/work/'+approved.id+'/commands','POST',{command:'assign',revision:work.revision,assigneeId:first.id,reason:'synthetic-linen-503'});
 assert.equal((await chain(approved)).manager.state,'pending');assert.equal((await chain(approved)).satisfied,false,'Work amendment still invalidates preserved authority');
 await invoke('/catalog/'+catalog.id+'/approvals','POST',{revision:4,calendarId:calendar.id,approvals:definitions,manager:{remindHours:4,slaHours:8}});
 assert.equal((await chain(rejected)).rejected,false,'Ordinary production edits do not inherit sandbox revision continuity');
}

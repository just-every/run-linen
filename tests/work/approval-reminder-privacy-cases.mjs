import assert from 'node:assert/strict';

/** Normal reminder tickets must not carry content from the restricted/HR request to ordinary operators or search. */
export async function approvalReminderPrivacyChecks({db,ok,api,employee,delegate,finance,second,calendar,stage}){
 for(const [sensitivity,n] of [['restricted',760],['hr',770]]){
  const markers=[0,1,2,3].map(i=>`synthetic-linen-${n+i}`),catalogName=`synthetic-linen-${n+4}`;
  const catalog=await ok('/catalog',{name:catalogName,kind:'service',target:catalogName,ownerId:'owner',requiresManager:true,form:{costCents:180000}});
  await ok(`/catalog/${catalog.id}/approvals`,{revision:1,calendarId:calendar.id,manager:{remindHours:24,slaHours:24},approvals:[{...stage,approvers:[{type:'member',userId:second}]}]});
  const source=await ok('/work',{title:markers[0],body:markers[1],context:{hrReview:markers[3]},sensitivity,beneficiaryId:employee,deduplicationKey:crypto.randomUUID()});
  await ok(`/work/${source.id}/fulfilment`,{catalogId:catalog.id,catalogRevision:2,beneficiaryId:employee,purpose:markers[2]});
  assert.equal((await api(`/work/${source.id}`,undefined,finance)).status,404,'the ordinary operator cannot read the source');
  let chain=await ok(`/work/${source.id}/approvals/${catalog.id}`);
  await ok('/test/due',{at:chain.manager.timer.remind_at});
  const manager=(await ok('/fulfilment-decisions',undefined,delegate)).items.find(x=>x.workId===source.id);
  assert.ok(manager.approvalTimer.reminded_at);assert.ok(manager.approvalTimer.breached_at);
  await ok(`/work/${source.id}/fulfilment/approve`,{...manager,expectedHolderId:manager.holderId,idempotencyKey:crypto.randomUUID()},delegate);
  chain=await ok(`/work/${source.id}/approvals/${catalog.id}`);
  await ok('/test/due',{at:chain.stages[0].remindAt});
  const notices=(await ok('/work',undefined,finance)).items.filter(row=>{
   const context=JSON.parse(row.context_json||'{}');return context.approvalReminder?.workId===source.id||context.approvalOverdue?.workId===source.id;
  });
  assert.equal(notices.length,4,'named manager and finance reminders and their SLA notices remain available');
  assert.deepEqual(notices.map(row=>row.sensitivity),['normal','normal','normal','normal']);
  for(const notice of notices){
   const read=await ok(`/work/${notice.id}`,undefined,finance);
   assert.ok(read.work.title.includes(catalogName),'the notice retains the configured catalog label');
   assert.ok(read.messages.some(message=>message.body.includes(source.id)),'the notice retains an opaque authenticated decision reference');
   for(const marker of markers)assert.ok(!JSON.stringify(read).includes(marker),'normal reminder content does not copy source title, conversation, purpose or HR context');
  }
  for(const marker of markers){
   const found=await ok(`/search?q=${encodeURIComponent(marker)}&type=ticket`,undefined,finance);
   assert.equal(found.total,0,'ordinary operator search cannot discover private source markers through reminders');
  }
  assert.equal((await api(`/work/${source.id}`,undefined,finance)).status,404,'notices do not grant source readership');
  const mail=(await db.prepare('SELECT payload_json FROM test_approval_mail WHERE payload_json LIKE ?').bind(`%${catalogName}%`).all()).results;
  assert.ok(mail.length>=2,'the configured manager and finance mail packets were sent at the paid edge');
  for(const {payload_json} of mail){
   const packet=JSON.parse(payload_json),content=JSON.stringify({subject:packet.subject,content:packet.content});
   for(const marker of markers)assert.ok(!content.includes(marker),'approval email carries no restricted/HR source content');
   assert.ok(!content.includes(employee),'approval email carries no beneficiary identity');
  }
 }
}

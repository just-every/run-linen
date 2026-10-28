import assert from 'node:assert/strict';

/** Native public rules/templates/preferences/work/connection doors; only the SendGrid network edge is faked. */
export async function notificationRuleChecks({call,db,time}) {
  let n=20100;const key=()=>`synthetic-linen-${n++}`;
  const ok=async(path,body,user='issuer',status=200)=>{const r=await call(path,body,user);assert.equal(r.status,status,path+' '+JSON.stringify(r.body));return r.body;};
  const inbox=async(user='actor')=>(await ok('/notification-inbox',undefined,user)).items;
  const work=async(extra={})=>ok('/work',{title:key(),body:key(),deduplicationKey:key(),...extra},'actor',201);
  const template=async(body='Resolved {{ticket.number}} for {{requester.first_name}}: {{ticket.title}}')=>ok('/notification-templates',{revision:0,name:key(),language:'en-US',subject:'Update {{ticket.number}}',body,reason:key()},'issuer',201);
  const rule=async(t,event='ticket.resolved',extra={})=>ok('/notification-rules',{revision:0,name:key(),event,conditions:{},recipients:[{type:'field',value:'requester'}],templateId:t.id,channel:'portal',mandatory:false,enabled:true,consent:true,reason:key(),...extra},'issuer',201);
  const close=async(w)=>ok(`/work/${w.id}/commands`,{revision:(await ok('/work/'+w.id)).work.revision,command:'close',reason:key()});
  const publish=async(w)=>ok(`/work/${w.id}/messages`,{body:key(),visibility:'public',sourceMessageId:key()},'issuer',201);
  assert.equal((await call('/notification-config')).status,403,'operators cannot configure workspace sends');
  assert.equal((await call('/notification-templates',{revision:0,name:key(),subject:key(),body:key(),reason:key()},'actor')).status,403);
  for(const placeholder of ['catalog.quote','catalog.answers','ticket.context','ticket.private_note']) {
    const r=await call('/notification-templates',{revision:0,name:key(),subject:key(),body:`{{${placeholder}}}`,reason:key()},'issuer');
    assert.equal(r.status,422,'catalog, quote and private payload placeholders are refused');
  }
  const original=await template();
  const changed=await ok('/notification-templates',{...original,body:'The new resolution is {{ticket.number}} / {{requester.first_name}} / {{ticket.title}}.',reason:key()},'issuer',201);
  assert.equal(changed.revision,2);
  assert.equal((await call('/notification-templates',{...original,body:key(),reason:key()},'issuer')).status,409,'stale template writes cannot overwrite a newer version');
  const audit=(await ok('/notification-history')).changes.find(change=>change.action==='notification.template_changed'&&change.target===original.id&&change.after.revision===2);
  assert.equal(audit.before.body,original.body);
  assert.equal(audit.after.body,changed.body);
  const resolved=await rule(changed);
  assert.equal((await call('/notification-rules',{...resolved,enabled:true,consent:false,reason:key()},'issuer')).status,422,'enabling has explicit owner consent');
  const marker=key(),w=await work({context:{catalog:{answers:marker,quote:marker}}});
  await close(w);
  let notices=(await inbox()).filter(i=>i.workId===w.id&&i.event==='ticket.resolved');
  assert.equal(notices.length,1,'the real next resolution fires the enabled rule once');
  assert.ok(notices[0].body.includes(w.id)&&notices[0].body.includes(w.title)&&notices[0].body.includes('actor'));
  assert.ok(!JSON.stringify(notices).includes(marker),'catalog answers and quote references never enter templates');
  const preview=await ok('/notification-templates/'+changed.id+'/preview',{workId:w.id});
  assert.equal(preview.body,notices[0].body);
  assert.equal((await call('/notification-templates/'+changed.id+'/preview',{workId:w.id},'actor')).status,403);

  // A per-event and per-channel preference suppresses optional public updates while mandatory approval still arrives.
  const publicTemplate=await template('Public {{ticket.number}}'),optional=await rule(publicTemplate,'ticket.public_update');
  await ok('/notification-preferences',{event:'ticket.public_update',channel:'portal',enabled:false},'actor');
  await ok('/notification-preferences',{event:'ticket.public_update',channel:'portal',enabled:false},'other');
  const optionalWork=await work();await publish(optionalWork);
  assert.ok(!(await inbox()).some(i=>i.workId===optionalWork.id&&i.event==='ticket.public_update'));
  assert.equal((await call('/notification-preferences',{event:'approval.requested',channel:'portal',enabled:false},'actor')).status,422);
  assert.equal((await call('/notification-rules',{...optional,id:undefined,revision:0,event:'approval.requested',mandatory:false,consent:true,reason:key()},'issuer')).status,422);
  const approvalTemplate=await template('Approval {{ticket.number}}');await rule(approvalTemplate,'approval.requested',{mandatory:true,recipients:[{type:'person',value:'other'}]});
  const calendar=await ok('/calendars',{name:key(),timezone:['America','Chicago'].join('/'),weekdays:[1,2,3,4,5],startHour:9,endHour:17,holidays:[]},'issuer',201);
  const item=await ok('/catalog',{name:key(),kind:'service',target:key(),ownerId:'issuer'},'issuer',201);
  await ok(`/catalog/${item.id}/approvals`,{revision:1,calendarId:calendar.id,approvals:[{key:'review',name:key(),mode:'any',approvers:[{type:'member',userId:'other'}],remindHours:24,slaHours:24}]});
  await db.prepare("UPDATE memberships SET roles_json='[\"approver\"]' WHERE workspace_id='w' AND user_id='other'").run();
  const approvalWork=await work();
  await ok(`/work/${approvalWork.id}/fulfilment`,{catalogId:item.id,catalogRevision:2,beneficiaryId:'actor',purpose:key()},'actor',201);
  assert.ok((await inbox('other')).some(i=>i.workId===approvalWork.id&&i.event==='approval.requested'),'a real pending approval bypasses optional-update opt-out');
  assert.equal((await call('/work/'+approvalWork.id,undefined,'other')).status,404,'An approval notification grants no general ticket read');
  await db.prepare("UPDATE memberships SET roles_json='[\"operator\"]' WHERE workspace_id='w' AND user_id='other'").run();

  // Locale is selected explicitly; English is never silently substituted for Spanish.
  const spanish=await ok('/notification-templates',{revision:0,name:key(),language:'es-US',subject:'Resuelto {{ticket.number}}',body:'Listo, {{requester.first_name}}.',reason:key()},'issuer',201);
  await rule(spanish);
  await ok('/notification-preferences',{event:'ticket.resolved',channel:'portal',language:'es-US',enabled:true},'actor');
  const localized=await work();await close(localized);
  const spanishNotices=(await inbox()).filter(n=>n.workId===localized.id&&n.event==='ticket.resolved');
  assert.equal(spanishNotices.length,1);assert.equal(spanishNotices[0].body,'Listo, actor.');
  await ok('/notification-preferences',{event:'ticket.resolved',channel:'portal',language:'en-US',enabled:true},'actor');
  assert.equal((await call('/notification-preferences',{event:'ticket.waiting_on_you',channel:'portal',enabled:false},'actor')).status,422);
  await rule(await template('Waiting {{ticket.number}}'),'ticket.waiting_on_you',{mandatory:true});
  const waiting=await work();await ok(`/work/${waiting.id}/commands`,{revision:waiting.revision,command:'pause',waitingOn:'requester',reason:key()});
  assert.ok((await inbox()).some(n=>n.workId===waiting.id&&n.event==='ticket.waiting_on_you'),'a real request for employee input remains mandatory');

  // A P1 Facilities condition and current lead recipient are evaluated against the native ticket.
  const department=await ok('/departments',{name:key(),kind:'facilities'},'issuer',201);
  await ok('/departments/'+department.id+'/members',{revision:department.revision,userId:'other',active:true});
  const group=await ok('/work-groups',{name:key(),departmentId:department.id},'issuer',201);
  await ok(`/work-groups/${group.id}/members`,{userId:'other',lead:true});
  const leadTemplate=await template('Facilities {{ticket.number}}');
  await ok('/notification-preferences',{event:'ticket.public_update',channel:'portal',enabled:true},'other');
  const leadRule=await rule(leadTemplate,'ticket.public_update',{conditions:{priority:'P1',departmentId:department.id},recipients:[{type:'group_lead',value:group.id}]});
  const facility=await work({departmentId:department.id});
  await ok(`/work/${facility.id}/classification/override`,{type:'service_request',category:'general',subcategory:'other',impact:'high',urgency:'high',workRevision:facility.revision,revision:0,reason:key()});
  await publish(facility);
  assert.ok((await inbox('other')).some(i=>i.workId===facility.id),'current Facilities lead receives the matched P1 event');
  await ok('/departments/'+department.id+'/members',{revision:(await ok('/departments/admin')).items.find(d=>d.id===department.id).revision,userId:'other',active:false});
  assert.ok(!(await inbox('other')).some(i=>i.workId===facility.id),'revoked department readership removes already-issued inbox access');
  // A role or named selector is a recipient choice, never a readership grant.
  await rule(leadTemplate,'ticket.resolved',{recipients:[{type:'role',value:'operator'},{type:'person',value:'other'}]});
  const restricted=await ok('/work',{title:key(),body:key(),deduplicationKey:key(),sensitivity:'restricted'},'issuer',201);
  await close(restricted);
  assert.ok(!(await inbox('other')).some(i=>i.workId===restricted.id));

  // Real leaver and security responsibilities have mandatory event protection and no replay send.
  for(const event of ['security.task','leaver.task']) {
    assert.equal((await call('/notification-preferences',{event,channel:'portal',enabled:false},'issuer')).status,422);
    await rule(await template('Responsibility {{ticket.number}}'),event,{mandatory:true,recipients:[{type:'role',value:'owner'}]});
  }
  const hrPerson=await ok('/people',{source:key(),sourceId:key(),name:'Riley Contractor',observedAt:new Date().toISOString(),effectiveAt:new Date().toISOString()},'issuer',201);
  const leaveInput={personId:hrPerson.id,kind:'leave',effectiveAt:new Date(Date.now()+3600000).toISOString(),timezone:'UTC',source:key(),sourceRevision:1,ownerId:'issuer',retained:[],added:[],removed:[key()],deviceIds:[],identityTarget:'synthetic-linen-20800@example.test'};
  const leave=await ok('/lifecycle',leaveInput,'issuer',201);
  const duties=(await inbox('issuer')).filter(n=>n.workId===leave.work.id&&['security.task','leaver.task'].includes(n.event));
  assert.deepEqual(new Set(duties.map(n=>n.event)),new Set(['security.task','leaver.task']));
  await ok('/lifecycle',leaveInput,'issuer',201);
  assert.equal((await inbox('issuer')).filter(n=>n.workId===leave.work.id&&['security.task','leaver.task'].includes(n.event)).length,duties.length,'Source replay creates no new responsibility notice');

  // Exact sender validation, escaped branding and real provider acceptance through the existing outbox.
  const connectionId=key(),encrypted=(await ok('/fixture/secret',{apiKey:key()})).secret;
  const baseConfig=JSON.parse((await db.prepare("SELECT config_json FROM connections WHERE id='mail'").first()).config_json);
  await db.prepare('INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)').bind(connectionId,'w','sendgrid',key(),JSON.stringify(baseConfig),encrypted,'active',time,time).run();
  const beforeVerify=await call('/notification-branding',{revision:0,logoUrl:'https://example.test/logo.png',primaryColor:'#113355',textColor:'#223344',senderConnectionId:connectionId,consent:true,reason:key()},'issuer');
  assert.equal(beforeVerify.status,403,'active status alone cannot claim a verified sender domain');
  await ok('/connections/'+connectionId+'/test',{revision:1});
  const branding=await ok('/notification-branding',{revision:0,logoUrl:'https://example.test/logo.png',primaryColor:'#113355',textColor:'#223344',senderConnectionId:connectionId,consent:true,reason:key()});
  assert.equal(branding.branding.senderDomain,'example.test');
  assert.equal((await call('/notification-branding',{...branding.branding,logoUrl:'javascript:alert(1)',consent:true,reason:key()},'issuer')).status,422);
  const mailTemplate=await template('<script>owner text</script> {{ticket.number}}');
  const mailRule=await rule(mailTemplate,'ticket.resolved',{channel:'email',connectionId});
  const mailWork=await work();await close(mailWork);
  await ok('/notifications/process',{});
  const packets=(await ok('/fixture',{notificationPackets:true})).notificationPackets;
  const packet=packets.find(p=>p.content.some(c=>c.value.includes(mailWork.id)));
  assert.ok(packet,'rule produces a real provider submission at the mocked network edge');
  assert.ok(packet.content.find(c=>c.type==='text/html').value.includes('https://example.test/logo.png'));
  assert.ok(packet.content.find(c=>c.type==='text/html').value.includes('#113355'));
  assert.ok(packet.content.find(c=>c.type==='text/html').value.includes('&lt;script&gt;'));
  const sent=(await db.prepare('SELECT o.state FROM execution_outbox o JOIN notification_deliveries d ON d.id=o.id WHERE d.work_id=? AND d.rule_id=?').bind(mailWork.id,mailRule.id).first());
  assert.equal(sent.state,'accepted','provider acceptance is retained, never claimed delivered');
  const test=await ok('/notification-rules/'+mailRule.id+'/test',{workId:mailWork.id,consent:true,reason:key(),idempotencyKey:key()});
  assert.equal(test.deliveries[0].recipientId,'issuer','test sends are self-only');
  assert.equal((await call('/notification-rules/'+mailRule.id+'/test',{workId:mailWork.id,consent:false,reason:key(),idempotencyKey:key()},'issuer')).status,422);
  await ok('/notifications/process',{});
  // Pending optional email is rechecked after opt-out, rather than leaking a queued update.
  await rule(publicTemplate,'ticket.public_update',{channel:'email',connectionId});
  const queued=await work();await publish(queued);
  await ok('/notification-preferences',{event:'ticket.public_update',channel:'email',enabled:false},'actor');
  const countBefore=(await ok('/fixture',{})).mailWrites;
  await ok('/notifications/process',{});
  assert.equal((await ok('/fixture',{})).mailWrites,countBefore,'withdrawn subscription is checked immediately before delivery');
  // Unknown mail outcomes never create an automatic retry.
  const lost=await work();await close(lost);await ok('/fixture',{mailLost:true});await ok('/notifications/process',{});
  const afterLost=(await ok('/fixture',{})).mailWrites;await ok('/notifications/process',{});
  assert.equal((await ok('/fixture',{})).mailWrites,afterLost,'unknown delivery is not resent');
  const unknown=await db.prepare('SELECT o.state FROM execution_outbox o JOIN notification_deliveries d ON d.id=o.id WHERE d.work_id=? AND d.rule_id=?').bind(lost.id,mailRule.id).first();
  assert.equal(unknown.state,'unknown');
  // An explicit disabled version fences future delivery; history retains both versions.
  await ok('/notification-rules',{...resolved,revision:resolved.revision,enabled:false,consent:false,reason:key()},'issuer',201);
  const history=await ok('/notification-history');
  assert.equal(history.rules.filter(r=>r.id===resolved.id).length,2);
  assert.equal(history.templates.filter(t=>t.id===original.id).length,2);
  assert.equal((await call('/notification-config',undefined,'issuer','foreign')).status,404);
  // Leave no enabled rule to interfere with the existing runtime's later authority and restore proof.
  for(const r of (await ok('/notification-config')).rules.filter(r=>r.enabled))await ok('/notification-rules',{...r,enabled:false,consent:false,reason:key()},'issuer',201);
}

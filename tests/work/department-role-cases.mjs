import assert from 'node:assert/strict';

/** ROLE-001: custom capabilities stay inside a current department and never create a global agent. */
export async function departmentRoleChecks(api, db, uploadBytes) {
  const workspace='synthetic-linen-18000',ownerId='synthetic-linen-18001',agentId='synthetic-linen-18002';
  const requesterId='synthetic-linen-18003',approverId='synthetic-linen-18004',botId='synthetic-linen-18005';
  const foreignId='synthetic-linen-18006',foreignWorkspace='synthetic-linen-18007';
  for(const id of [workspace,foreignWorkspace])await db.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(id,id,'2026-01-01').run();
  for(const [id,role,tenant] of [[ownerId,'owner',workspace],[agentId,'employee',workspace],[requesterId,'employee',workspace],[approverId,'approver',workspace],[botId,'integration',workspace],[foreignId,'employee',foreignWorkspace]]) {
    await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(id,id+'@example.test',id,'synthetic-linen-18008','2026-01-01').run();
    await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind(tenant,id,JSON.stringify([role])).run();
  }
  await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind(foreignWorkspace,ownerId,'["owner"]').run();
  const as=(id,role='employee',tenant=workspace)=>({'x-workspace':tenant,'x-user':id,'x-roles':JSON.stringify([role])});
  const owner=as(ownerId,'owner'),agent=as(agentId),requester=as(requesterId),approver=as(approverId,'approver'),bot=as(botId,'integration');
  const call=async(path,body,headers=owner,status=200)=>{
    const result=await api(path,body,headers);
    assert.equal(result.status,status,'ROLE-001 '+path+' '+JSON.stringify(result.value));
    return result.value;
  };
  const facilities=await call('/departments',{name:'synthetic-linen-18010',kind:'facilities'},owner,201);
  const it=await call('/departments',{name:'synthetic-linen-18011',kind:'it'},owner,201);
  const hr=await call('/departments',{name:'synthetic-linen-18012',kind:'hr'},owner,201);
  const foreignDepartment=await call('/departments',{name:'synthetic-linen-18013',kind:'facilities'},as(ownerId,'owner',foreignWorkspace),201);
  const definition={name:'synthetic-linen-18014',departmentId:facilities.id,permissions:['ticket.read']};
  for(const actor of [agent,approver,bot]) {
    await call('/department-roles',undefined,actor,403);
    await call('/department-roles',definition,actor,403);
  }
  await call('/department-roles',undefined,as(agentId,'owner'),403);
  const choices=await call('/department-roles');
  assert.ok(choices.people.some(person=>person.id===agentId));
  assert.ok(!choices.people.some(person=>[botId,foreignId].includes(person.id)));
  assert.ok(choices.departments.some(department=>department.id===facilities.id));
  assert.ok(!choices.departments.some(department=>[hr.id,foreignDepartment.id].includes(department.id)));
  for(const invalid of [
    {departmentId:hr.id},{departmentId:foreignDepartment.id},
    {permissions:['ticket.reply']},{permissions:['ticket.read','synthetic-linen-18015']},
    {permissions:['ticket.read','ticket.private.reply']},
    {permissions:['ticket.read','ticket.reply','ticket.private.reply']},
    {permissions:['ticket.read','ticket.private.read','ticket.private.reply']},
  ])await call('/department-roles',{...definition,...invalid},owner,422);
  await call('/department-roles',{...definition,departmentId:null},owner,400);
  let role=await call('/department-roles',definition,owner,201);
  const rolePath='/department-roles/'+role.id;
  const refresh=async()=>{role=(await call('/department-roles')).items.find(item=>item.id===role.id);assert.ok(role);return role;};
  const auditCount=async()=>Number((await db.prepare('SELECT COUNT(*) n FROM audit_events WHERE workspace_id=? AND actor_id=? AND target=?').bind(workspace,ownerId,role.id).first()).n);
  assert.ok(await auditCount()>0,'Creating a role records its owner and role identity');
  const assign=async(userId=agentId,active=true)=>{
    await refresh();const member=role.members.find(item=>item.userId===userId);
    role=await call(rolePath+'/members',{roleRevision:role.revision,userId,active,revision:member?.revision??0});
    return role;
  };
  const edit=async(permissions,active=true)=>{
    await refresh();const before=role.revision;
    role=await call(rolePath,{revision:before,name:role.name,permissions,active});
    assert.ok(role.revision>before,'A definition edit advances the authority revision');
    return role;
  };
  const countBeforeDenials=await auditCount();
  await call(rolePath,{revision:role.revision,name:role.name,permissions:role.permissions,active:true},agent,403);
  await call(rolePath+'/members',{roleRevision:role.revision,userId:agentId,active:true,revision:0},agent,403);
  await call(rolePath,{revision:role.revision+1,name:role.name,permissions:role.permissions,active:true},owner,409);
  await call(rolePath+'/members',{roleRevision:role.revision+1,userId:agentId,active:true,revision:0},owner,409);
  await call(rolePath,{revision:role.revision,name:role.name,permissions:role.permissions,active:true},as(ownerId,'owner',foreignWorkspace),404);
  await call(rolePath+'/members',{roleRevision:role.revision,userId:foreignId,active:true,revision:0},as(ownerId,'owner',foreignWorkspace),404);
  for(const userId of [foreignId,botId])await call(rolePath+'/members',{roleRevision:role.revision,userId,active:true,revision:0},owner,422);
  assert.equal(await auditCount(),countBeforeDenials,'Rejected authority changes create no successful configuration audit');
  await assign();
  const assignment=role.members.find(member=>member.userId===agentId);
  assert.ok(assignment.active&&assignment.roleRevision===role.revision,'The owner confirms membership for this exact role definition');
  await call(rolePath+'/members',{roleRevision:role.revision,userId:agentId,active:false,revision:0},owner,409);
  const make=(departmentId,key,headers=requester,extra={})=>call('/work',{departmentId,title:key,body:key,deduplicationKey:key,...extra},headers,201);
  const ticket=await make(facilities.id,'synthetic-linen-18020'),path='/work/'+ticket.id;
  const hidden=[await make(it.id,'synthetic-linen-18021'),await make(undefined,'synthetic-linen-18022'),
    await make(facilities.id,'synthetic-linen-18023',owner,{sensitivity:'restricted'}),await make(hr.id,'synthetic-linen-18024')];
  const carried=await make(hr.id,'synthetic-linen-18025');
  await call('/work/'+carried.id+'/department',{revision:carried.revision,departmentId:facilities.id,reason:'synthetic-linen-18026'});
  hidden.push(carried);
  const privateText='synthetic-linen-180270000';
  await call(path+'/messages',{body:privateText,visibility:'private',sourceMessageId:'synthetic-linen-18028'},owner,201);
  const upload=await uploadBytes(path+'/attachments',new TextEncoder().encode('synthetic-linen-18029'),{...owner,'content-type':'text/plain','x-filename':'synthetic-linen-18030.txt','x-visibility':'private'});
  assert.equal(upload.status,201,JSON.stringify(upload.value));
  const attachmentPath='/attachments/'+upload.value.id;
  const read=await call(path,undefined,agent);
  assert.equal(read.work.id,ticket.id,'A base employee receives scoped readership without an operator role');
  assert.ok(read.messages.every(message=>message.visibility==='public'));
  assert.deepEqual(read.attachments,[]);
  await call(attachmentPath,undefined,agent,404);
  assert.ok((await call(path+'/activity',undefined,agent)).items.every(event=>event.visibility!=='private'));
  const listed=(await call('/work',undefined,agent)).items;
  assert.ok(listed.some(item=>item.id===ticket.id));
  for(const work of hidden) {
    await call('/work/'+work.id,undefined,agent,404);
    assert.ok(!listed.some(item=>item.id===work.id),'The custom role cannot list another department or a restricted record');
    assert.equal((await call('/search?q='+work.id,undefined,agent)).total,0);
  }
  assert.ok((await call('/search?q='+ticket.id,undefined,agent)).items.some(item=>item.type==='ticket'&&item.id===ticket.id));
  assert.equal((await call('/search?q='+privateText,undefined,agent)).total,0,'A read-only role cannot match hidden private text');
  assert.equal((await call('/search?q='+requesterId+'&type=person',undefined,agent)).total,0,'Scoped agents acquire no global people discovery');
  await call('/people',undefined,agent,403);
  await call(path+'/messages',{body:'synthetic-linen-18031',visibility:'public',sourceMessageId:'synthetic-linen-18032'},agent,403);
  await call(path+'/messages',{body:'synthetic-linen-18033',visibility:'private',sourceMessageId:'synthetic-linen-18034'},agent,403);
  await call(path+'/commands',{revision:read.work.revision,command:'pause',reason:'synthetic-linen-18035'},agent,403);
  assert.equal((await call(path)).work.revision,read.work.revision,'Denied writes leave the ticket revision unchanged');

  // Editing a role withdraws old confirmations, even when the new definition has more permissions.
  const oldRoleRevision=role.revision;
  await edit(['ticket.read','ticket.private.read']);
  await call(path,undefined,agent,404);
  await call(rolePath+'/members',{roleRevision:oldRoleRevision,userId:agentId,active:true,revision:assignment.revision},owner,409);
  await assign();
  const privateRead=await call(path,undefined,agent);
  assert.ok(privateRead.messages.some(message=>message.body===privateText));
  assert.ok(privateRead.attachments.some(attachment=>attachment.id===upload.value.id));
  await call(attachmentPath,undefined,agent);
  assert.ok((await call('/search?q='+privateText,undefined,agent)).items.some(item=>item.id===ticket.id));
  await call(path+'/messages',{body:'synthetic-linen-18036',visibility:'private',sourceMessageId:'synthetic-linen-18037'},agent,403);
  await call(path+'/messages',{body:'synthetic-linen-18038',visibility:'public',sourceMessageId:'synthetic-linen-18039'},agent,403);

  await edit(['ticket.read','ticket.reply']);await assign();
  await call(path+'/messages',{body:'synthetic-linen-18040',visibility:'public',sourceMessageId:'synthetic-linen-18041'},agent,201);
  await call(path+'/messages',{body:'synthetic-linen-18042',visibility:'private',sourceMessageId:'synthetic-linen-18043'},agent,403);
  await call(path+'/commands',{revision:(await call(path)).work.revision,command:'pause',reason:'synthetic-linen-18044'},agent,403);
  await edit(['ticket.read','ticket.transition']);await assign();
  await call(path+'/messages',{body:'synthetic-linen-18045',visibility:'public',sourceMessageId:'synthetic-linen-18046'},agent,403);
  await call(path+'/commands',{revision:(await call(path)).work.revision,command:'pause',reason:'synthetic-linen-18047'},agent);
  assert.equal((await call(path)).work.state,'paused');
  await edit(['ticket.read','ticket.private.read','ticket.reply','ticket.private.reply','ticket.transition']);await assign();
  await call(path+'/messages',{body:'synthetic-linen-18048',visibility:'private',sourceMessageId:'synthetic-linen-18049'},agent,201);
  await call(path+'/commands',{revision:(await call(path)).work.revision,command:'resume',reason:'synthetic-linen-18050'},agent);
  for(const work of hidden)await call('/work/'+work.id,undefined,agent,404);

  // A scoped ticket grant never inherits the separate catalog audience or quote readership.
  const quoteItem=await call('/catalog',{name:'synthetic-linen-18070',kind:'service',target:'synthetic-linen-18071',ownerId,form:{quoteRequired:true}},owner,201);
  const quote=await uploadBytes(path+'/catalog-quote',new TextEncoder().encode('%PDF-1.7\nsynthetic-linen-18072\n%%EOF'),{...requester,'content-type':'application/pdf','x-filename':'synthetic-linen-18073.pdf','x-catalog-id':quoteItem.id});
  assert.equal(quote.status,201,JSON.stringify(quote.value));
  const quoteDefinition=(await call('/catalog')).items.find(item=>item.id===quoteItem.id);
  await call(path+'/fulfilment',{catalogId:quoteItem.id,catalogRevision:quoteDefinition.revision,beneficiaryId:requesterId,purpose:'synthetic-linen-18074'},requester,201);
  await call('/catalog-quotes/'+quote.value.id,undefined,agent,404);
  await call('/attachments/'+quote.value.id,undefined,agent,404);
  assert.deepEqual((await call(path,undefined,agent)).quotes,[],'Private ticket notes do not include vendor quotes');
  await call(path+'/fulfilment',{catalogId:quoteItem.id,catalogRevision:quoteDefinition.revision,beneficiaryId:agentId,purpose:'synthetic-linen-18075'},agent,403);
  const audience=await call('/catalog-values',{dimension:'department',label:'synthetic-linen-18076'},owner,201);
  const limited=await call('/catalog',{name:'synthetic-linen-18077',kind:'service',target:'synthetic-linen-18078',ownerId,audience:{department:[audience.id]}},owner,201);
  assert.ok(!(await call('/catalog',undefined,agent)).items.some(item=>item.id===limited.id),'Custom ticket roles do not bypass the catalog audience');

  // Requester authority survives role withdrawal and remains a public conversation in another department.
  const own=await make(it.id,'synthetic-linen-18051',agent),ownPath='/work/'+own.id;
  await call(ownPath+'/messages',{body:'synthetic-linen-18052',visibility:'private',sourceMessageId:'synthetic-linen-18053'},owner,201);
  await assign(agentId,false);
  await call(path,undefined,agent,404);
  await call(attachmentPath,undefined,agent,404);
  assert.ok(!(await call('/work',undefined,agent)).items.some(item=>item.id===ticket.id));
  assert.ok((await call(ownPath,undefined,agent)).messages.every(message=>message.visibility==='public'));
  await call(ownPath+'/messages',{body:'synthetic-linen-18054',visibility:'public',sourceMessageId:'synthetic-linen-18055'},agent,201);
  await call(ownPath+'/commands',{revision:(await call(ownPath)).work.revision,command:'pause',reason:'synthetic-linen-18056'},agent,403);
  await assign();
  await db.prepare('UPDATE memberships SET roles_json=? WHERE workspace_id=? AND user_id=?').bind('["approver"]',workspace,agentId).run();
  assert.equal((await call(path,undefined,as(agentId,'approver'))).work.id,ticket.id,'A human base-role change does not silently withdraw an independent custom grant');
  await db.prepare('UPDATE memberships SET roles_json=? WHERE workspace_id=? AND user_id=?').bind('["employee"]',workspace,agentId).run();
  await db.prepare('UPDATE memberships SET active=0 WHERE workspace_id=? AND user_id=?').bind(workspace,agentId).run();
  await call(path,undefined,agent,404);
  await db.prepare('UPDATE memberships SET active=1,roles_json=? WHERE workspace_id=? AND user_id=?').bind('["integration"]',workspace,agentId).run();
  await call(path,undefined,as(agentId,'integration'),404);
  await db.prepare('UPDATE memberships SET roles_json=? WHERE workspace_id=? AND user_id=?').bind('["employee"]',workspace,agentId).run();
  await assign();
  await edit(role.permissions,false);
  await call(path,undefined,agent,404);
  await edit(role.permissions,true);await assign();
  const currentFacilities=(await call('/departments/admin')).items.find(item=>item.id===facilities.id);
  await call('/departments/'+facilities.id,{revision:currentFacilities.revision,name:currentFacilities.name,active:false});
  await call(path,undefined,agent,404);
  await call(attachmentPath,undefined,agent,404);
  assert.ok(!(await call('/work',undefined,agent)).items.some(item=>item.id===ticket.id));

  // A named approver decides through their own queue without receiving any agent readership.
  const calendar=await call('/calendars',{name:'synthetic-linen-18060',timezone:'America/New_York',weekdays:[1,2,3,4,5],startHour:9,endHour:17,holidays:[]},owner,201);
  const catalog=await call('/catalog',{name:'synthetic-linen-18061',kind:'service',target:'synthetic-linen-18062',ownerId,departmentId:it.id},owner,201);
  const catalogRow=(await call('/catalog')).items.find(item=>item.id===catalog.id);
  const configured=await call('/catalog/'+catalog.id+'/approvals',{revision:catalogRow.revision,calendarId:calendar.id,approvals:[{key:'approval',name:'synthetic-linen-18063',mode:'any',approvers:[{type:'member',userId:approverId}]}]});
  const approvalWork=await make(it.id,'synthetic-linen-18064');
  await call('/work/'+approvalWork.id+'/fulfilment',{catalogId:catalog.id,catalogRevision:configured.revision,beneficiaryId:requesterId,purpose:'synthetic-linen-18065'},requester,201);
  await call('/work/'+approvalWork.id,undefined,approver,404);
  const queued=(await call('/approval-stages',undefined,approver)).items.find(item=>item.workId===approvalWork.id);
  assert.ok(queued,'An approver without a custom or fixed agent role receives the independent decision');
  await call('/work/'+approvalWork.id+'/approval-stage',{...queued,decision:'approved',idempotencyKey:'synthetic-linen-18066'},approver);
  assert.equal((await call('/work/'+approvalWork.id+'/approvals/'+catalog.id,undefined,requester)).stages.find(stage=>stage.key==='approval').state,'approved');
  await call('/work/'+approvalWork.id,undefined,approver,404);
  assert.ok(!(await call('/work',undefined,approver)).items.some(item=>item.id===approvalWork.id));
  assert.ok(await auditCount()>countBeforeDenials,'Confirmed role changes retain an owner audit trail');
}

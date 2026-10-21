import assert from 'node:assert/strict'

// Public native sessions create the fixtures; SQL supplies a foreign workspace,
// commit races and storage postconditions, never replacement application paths.
export async function mcpToolCases({ownerApi,rpc,sql,bot,credential,grant,session,request}) {
 const check=(value,message)=>assert.ok(value,'API-003 '+message)
 const equal=(actual,expected,message)=>assert.deepEqual(actual,expected,'API-003 '+message)
 const quoted=value=>"'"+String(value).replaceAll("'","''")+"'"
 const value=async(promise,status=200)=>{const r=await promise;equal(r.status,status,'native route status');return r.value}
 const call=(secret,name,args={})=>rpc(secret,'tools/call',{name,arguments:args})
 const tool=async(secret,name,args={})=>{
  const r=await call(secret,name,args);equal(r.status,200,'authenticated tool transport')
  equal(r.value.error,undefined,name+' succeeds');equal(r.value.result.isError,false,name+' has a usable result')
  return r.value.result.structuredContent
 }
 const refused=async(secret,name,args,code)=>{
  const r=await call(secret,name,args);equal(r.status,200,'tool refusal uses protocol response')
  equal(r.value.error?.data?.code,code,name+' refuses '+code);return r.value.error
 }
 const mint=async(patch={},api=ownerApi)=>value(api('/mcp-credentials',{...grant,...patch}),201)
 const discover=async secret=>(await rpc(secret)).value.result.tools.map(t=>t.name).sort()
 const nativeSession=async(email,password)=>{
  const login=await request('/api/v1/login',{method:'POST',body:{email,password}})
  equal(login.status,200,'native fixture login')
  const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')
  const response=await request('/api/v1/session',{cookie});equal(response.status,200,'native fixture session')
  const ownSession=await response.json()
  const raw=(path,{method='GET',body,headers={}}={})=>request('/api/v1'+path,{method,body,cookie,headers:{'X-Linen-CSRF':ownSession.csrfToken,...headers}})
  const api=async(path,body,method=body===undefined?'GET':'POST')=>{
   const r=await raw(path,{method,body});return {status:r.status,value:await r.json()}
  }
  return {api,raw}
 }
 const hardware=grant.groupIds[0]
 check(hardware,'main credential has an explicit Hardware queue grant')
 const network=await value(ownerApi('/work-groups',{name:'Network'}),201)
 const password='synthetic-API-003-native-fixture-password'
 const employee=await value(ownerApi('/members',{email:'mcp-queue-employee@example.test',name:'Hardware employee',password,roles:['employee']}),201)
 const employeeSession=await nativeSession('mcp-queue-employee@example.test',password)
 const issuer=await value(ownerApi('/members',{email:'mcp-issuing-owner@example.test',name:'Issuing owner',password,roles:['owner']}),201)
 const issuerSession=await nativeSession('mcp-issuing-owner@example.test',password)
 const groups=await value(ownerApi('/work-groups'))
 check(groups.items.every(g=>g.members.every(m=>m.userId!==bot.id)),'queue grant adds no group member or lead')
 equal((await ownerApi('/work-groups/'+hardware+'/members',{userId:bot.id,lead:true})).status,422,'integration cannot become group member or lead')

 sql(`INSERT INTO workspaces VALUES('mcp-tools-foreign','Foreign queue fixture','2026-01-01');
 INSERT INTO work_groups(id,workspace_id,name,created_by,created_at) VALUES('mcp-tools-foreign-group','mcp-tools-foreign','Foreign Hardware',${quoted(session.principal.userId)},'2026-01-01')`)
 for(const groupIds of [undefined,[],['mcp-tools-unknown'],['mcp-tools-foreign-group']])
  equal((await ownerApi('/mcp-credentials',{...grant,groupIds})).status,400,'mint refuses missing, unknown or foreign queue grants')

 const route=async(workId,groupId)=>{
  const current=await value(ownerApi('/work/'+workId))
  return value(ownerApi('/work/'+workId+'/group',{groupId,revision:current.work.revision,assigneeId:null}))
 }
 const file=async(key,title,groupId,sensitivity='normal',api=employeeSession.api)=>{
  const work=await value(api('/work',{title,body:'The external monitor is flickering during ordinary work.',kind:'incident',sensitivity,deduplicationKey:'API-003-'+key,
   ...(api===ownerApi?{beneficiaryId:employee.id}:{}),context:{email:'mcp-context-private@example.test',phone:'202-555-0199',manager:'MCP-HIDDEN-MANAGER',hrFact:'MCP-HIDDEN-HR'}}),201)
  await route(work.id,groupId);return work
 }
 const [normal,other,restricted,hr]=await Promise.all([
  file('hardware','Monitor flickers at the desk',hardware),
  file('network','Network queue confidential marker',network.id),
  file('restricted','Restricted investigation marker',hardware,'restricted'),
  file('hr','HR accommodation marker',hardware,'hr',ownerApi),
 ])
 equal((await ownerApi('/work/'+normal.id+'/group',{groupId:hardware,revision:(await value(ownerApi('/work/'+normal.id))).work.revision,assigneeId:bot.id})).status,422,'queue grant never permits assigning the bot')
 equal((await ownerApi('/work/'+normal.id+'/commands',{command:'assign',assigneeId:bot.id,revision:(await value(ownerApi('/work/'+normal.id))).work.revision,reason:'Try assigning integration'})).status,422,'native assign refuses integration principal')

 const hidden='MCP-HIDDEN-PRIVATE-NOTE',publicBody='A replacement display cable is being checked.',ownBody='MCP-INTERNAL-COMMENT cable test recorded'
 await value(ownerApi('/work/'+normal.id+'/messages',{body:hidden,visibility:'private',sourceMessageId:'API-003-hidden'}),201)
 await value(ownerApi('/work/'+normal.id+'/messages',{body:publicBody,visibility:'public',sourceMessageId:'API-003-public'}),201)
 for(const visibility of ['public','private']) {
  const upload=await issuerSession.raw('/work/'+normal.id+'/attachments',{method:'POST',body:'MCP-HIDDEN-ATTACHMENT-CONTENT',headers:{'Content-Type':'text/plain','X-Filename':'MCP-HIDDEN-'+visibility+'-attachment.txt','X-Visibility':visibility}})
  equal(upload.status,201,'real '+visibility+' attachment fixture')
 }
 // CATALOG-001: a submitted catalog request and its vendor quote are not ticket-tool payloads.
 const quoteItem=await value(ownerApi('/catalog',{name:'MCP quote item',kind:'service',target:'mcp-quote-item',ownerId:session.principal.userId,form:{quoteRequired:true}}),201)
 const quoteUpload=await employeeSession.raw('/work/'+normal.id+'/catalog-quote',{method:'POST',body:'%PDF-1.7 MCP-HIDDEN-QUOTE-BODY',headers:{'Content-Type':'application/pdf','X-Filename':'MCP-HIDDEN-QUOTE-NAME.pdf','X-Catalog-Id':quoteItem.id}})
 equal(quoteUpload.status,201,'real catalog quote fixture')
 await value(employeeSession.api('/work/'+normal.id+'/fulfilment',{catalogId:quoteItem.id,catalogRevision:1,beneficiaryId:employee.id,purpose:'MCP-HIDDEN-SUBMISSION-PURPOSE'}),201)
 const field=async(name,type,options=[])=>value(ownerApi('/desk-fields',{name,type,options,kinds:['incident']}),201)
 const [safeField,textField,personalField]=await Promise.all([
  field('Display connector','dropdown',['USB-C','DisplayPort']),field('priority','text'),field('Contact preference','dropdown',['mcp-private-contact@example.test']),
 ])
 for(const [fieldId,fieldValue] of [[safeField.id,'USB-C'],[textField.id,'P1'],[personalField.id,'mcp-private-contact@example.test']])
  await value(ownerApi('/work/'+normal.id+'/fields',{fieldId,value:fieldValue}))
 let projected=await tool(credential.secret,'work.get',{workId:normal.id})
 check(!projected.custom_fields.some(f=>f.id===safeField.id),'dropdown defaults to personal until owner classification')
 equal((await employeeSession.api('/mcp-fields/'+safeField.id+'/classification',{nonpersonal:true})).status,403,'employee cannot classify nonpersonal fields')
 equal((await ownerApi('/mcp-fields/'+textField.id+'/classification',{nonpersonal:true})).status,422,'free text cannot be classified nonpersonal')
 await value(ownerApi('/mcp-fields/'+safeField.id+'/classification',{nonpersonal:true}))
 await value(ownerApi('/work/'+normal.id+'/fields',{fieldId:safeField.id,value:'DisplayPort'}))
 const classification=await value(ownerApi('/work/'+normal.id+'/classification'))
 await value(ownerApi('/work/'+normal.id+'/classification/override',{revision:classification.revision,workRevision:classification.workRevision,type:'incident',category:'hardware',subcategory:'other',impact:'low',urgency:'medium',priority:'P4',reason:'MCP-HIDDEN-CLASSIFICATION-REASON'}))

 equal(await discover(credential.secret),[...grant.tools].sort(),'discovery exactly intersects selected scopes and tools')
 const readonly=await mint({name:'Read only queue',scopes:['work.read'],tools:['work.list','work.get']})
 equal(await discover(readonly.secret),['work.get','work.list'],'readonly discovery excludes writes and unselected reads')
 await refused(readonly.secret,'work.comment',{workId:normal.id,revision:1,body:'MCP-REFUSED-READONLY',deduplicationKey:'API-003-readonly'},'tool_unavailable')
 await refused(readonly.secret,'work.search',{query:'monitor'},'tool_unavailable')
 await refused(credential.secret,'work.create',{title:'MCP-REFUSED-CREATE',body:'MCP-REFUSED-CREATE-BODY',deduplicationKey:'API-003-no-create'},'tool_unavailable')
 const allTools=['work.list','work.get','work.search','work.history','work.create','work.comment']
 const full=await mint({name:'Bounded complete ticket tools',scopes:['work.read','work.create','work.comment'],tools:allTools})
 equal(await discover(full.secret),allTools.slice().sort(),'separate credential discovers six selected tools')
 const listed=await tool(credential.secret,'work.list')
 equal(listed.items.map(w=>w.id),[normal.id],'Hardware queue lists another employee normal work only')
 projected=await tool(credential.secret,'work.get',{workId:normal.id})
 equal(projected.requester,{id:employee.id,name:'Hardware employee'},'requester exposes display identity only')
 equal(projected.beneficiary,{id:employee.id,name:'Hardware employee'},'beneficiary exposes display identity only')
 equal(projected.group.id,hardware,'current group is visible')
 check(projected.messages.some(m=>m.body===publicBody),'public operator reply is readable')
 equal(projected.custom_fields.map(f=>({id:f.id,type:f.type,value:f.value})),[{id:safeField.id,type:'dropdown',value:'DisplayPort'}],'only owner-classified typed nonpersonal field is readable')
 const history=await tool(full.secret,'work.history',{workId:normal.id})
 check(history.items.some(e=>e.changes.some(c=>c.field==='custom_field'&&c.field_id===safeField.id&&c.before==='USB-C'&&c.after==='DisplayPort')),'history retains typed nonpersonal before/after')
 check(history.items.some(e=>e.changes.some(c=>c.field==='priority'&&c.after==='P4')),'history retains bounded native classification changes')
 check(!history.items.some(e=>e.changes.some(c=>c.after==='P1'||c.field_id===textField.id||c.field_id===personalField.id)),'personal field named priority cannot impersonate core history')
 const hiddenValues=[hidden,'MCP-HIDDEN-ATTACHMENT','MCP-HIDDEN-QUOTE','MCP-HIDDEN-SUBMISSION-PURPOSE','mcp-context-private@example.test','mcp-private-contact@example.test','MCP-HIDDEN-MANAGER','MCP-HIDDEN-HR','MCP-HIDDEN-CLASSIFICATION-REASON']
 for(const payload of [listed,projected,history])for(const secret of hiddenValues)
  check(!JSON.stringify(payload).includes(secret),'reads and history exclude private notes, attachment metadata, personal and HR facts')
 check(!Object.hasOwn(projected,'attachments')&&!Object.hasOwn(projected,'context_json')&&!Object.hasOwn(projected,'quotes')&&!Object.hasOwn(projected,'catalogSnapshot'),'attachment counts, quotes, catalog submissions and native context are excluded')
 for(const query of [...hiddenValues,'mcp-queue-employee@example.test','Network queue confidential marker','Restricted investigation marker','HR accommodation marker'])
  equal((await tool(full.secret,'work.search',{query})).items,[],'search never matches excluded content')
 check((await tool(full.secret,'work.search',{query:'Monitor flickers'})).items.some(w=>w.id===normal.id),'search matches permitted normal ticket text')
 const missing=await refused(credential.secret,'work.get',{workId:'mcp-tools-absent'},'not_found')
 for(const work of [other,restricted,hr])for(const name of ['work.get','work.history','work.comment']) {
  const denied=await refused(name==='work.get'?credential.secret:full.secret,name,{workId:work.id,...(name==='work.comment'?{revision:1,body:'MCP-REFUSED-HIDDEN',deduplicationKey:'API-003-hidden-'+work.id}:{})},'not_found')
  equal(denied,missing,'absent, HR, restricted and other queue share the same not_found response')
 }
 await value(ownerApi('/mcp-fields/'+safeField.id+'/classification',{nonpersonal:false}))
 check(!(await tool(full.secret,'work.get',{workId:normal.id})).custom_fields.some(f=>f.id===safeField.id),'reclassification removes field on next read')
 check(!(await tool(full.secret,'work.history',{workId:normal.id})).items.some(e=>e.changes.some(c=>c.field_id===safeField.id)),'reclassification removes historical field values immediately')

 // No work-intake, mail/notification or provider/model attempt is part of a comment.
 const effectTables=['work_intake_events','execution_outbox','execution_operations','execution_provider_attempts','intelligence_attempts']
 const effects=()=>Object.fromEntries(sql(effectTables.map(table=>`SELECT '${table}' table_name,count(*) n FROM ${table} WHERE workspace_id=${quoted(session.principal.workspaceId)}`).join(' UNION ALL ')).map(row=>[row.table_name,row.n]))
 const beforeEffects=effects(),beforeComment=await tool(credential.secret,'work.get',{workId:normal.id})
 const commented=await tool(credential.secret,'work.comment',{workId:normal.id,revision:beforeComment.revision,body:ownBody,deduplicationKey:'API-003-own-comment'})
 equal(commented.revision,beforeComment.revision+1,'comment advances the revision read')
 equal(effects(),beforeEffects,'internal comment creates no notification, provider or intake work')
 await refused(credential.secret,'work.comment',{workId:normal.id,revision:beforeComment.revision,body:'MCP-STALE-COMMENT',deduplicationKey:'API-003-stale'},'revision_conflict')
 const ownerView=await value(ownerApi('/work/'+normal.id))
 const ownMessage=ownerView.messages.find(m=>m.body===ownBody)
 check(ownMessage,'native conversation contains committed MCP comment')
 const nativeActivity=await value(ownerApi('/work/'+normal.id+'/activity'))
 check(nativeActivity.items.some(e=>e.body===ownBody&&e.actorKind==='automation'&&e.actor==='Desk bot'),'native activity labels the actual automation author independently of comment text')
 equal({author:ownMessage.author_id,visibility:ownMessage.visibility},{author:bot.id,visibility:'private'},'comment is internal and attributed to integration principal')
 check(!(await value(employeeSession.api('/work/'+normal.id))).messages.some(m=>m.body===ownBody),'employee receives no requester reply from MCP internal comment')
 check((await tool(full.secret,'work.get',{workId:normal.id})).messages.some(m=>m.body===ownBody),'principal reads its own internal comment')
 check((await tool(full.secret,'work.history',{workId:normal.id})).items.some(e=>e.body===ownBody&&e.actor===bot.id&&e.actorKind==='automation'),'filtered history retains own comment with principal identity')
 equal((await tool(full.secret,'work.search',{query:ownBody})).items.map(w=>w.id),[normal.id],'search includes only the principal own private comment')

 const own=await tool(full.secret,'work.create',{title:'Desk bot diagnostic cable request',body:'Please obtain a spare display cable.',kind:'request',deduplicationKey:'API-003-own-create'})
 equal({requester:own.requester.id,beneficiary:own.beneficiary.id,group:own.group},{requester:bot.id,beneficiary:bot.id,group:null},'create files normal own work without chosen queue placement')
 equal((await tool(full.secret,'work.get',{workId:own.id})).id,own.id,'own-created normal ticket is get-readable')
 check((await tool(full.secret,'work.search',{query:'Desk bot diagnostic cable request'})).items.some(w=>w.id===own.id),'own-created normal ticket is search-readable')
 check(!(await tool(full.secret,'work.list')).items.some(w=>w.id===own.id),'own-created unplaced ticket is absent from queue list')
 await refused(full.secret,'work.history',{workId:own.id},'not_found')
 await refused(full.secret,'work.comment',{workId:own.id,revision:own.revision,body:'MCP-REFUSED-OWN-UNPLACED',deduplicationKey:'API-003-own-unplaced'},'not_found')

 equal((await tool(full.secret,'work.create',{title:'Desk bot diagnostic cable request',body:'Please obtain a spare display cable.',kind:'request',deduplicationKey:'API-003-own-create'})).id,own.id,'stable create replay returns the original ticket')
 await refused(full.secret,'work.create',{title:'Desk bot changed material request',body:'Please obtain a spare display cable.',kind:'request',deduplicationKey:'API-003-own-create'},'idempotency_conflict')
 const refusalKey=crypto.randomUUID();
 const dangerous=[{groupId:hardware},{beneficiaryId:employee.id},{requesterId:employee.id},{sensitivity:'hr'},{assigneeId:bot.id},{state:'closed'},{priority:'P1'},{context:{grant:'owner'}},{kind:'lifecycle'}]
 for(const patch of dangerous)await refused(full.secret,'work.create',{title:'MCP-REFUSED-DANGEROUS',body:'MCP-REFUSED-DANGEROUS-BODY',deduplicationKey:refusalKey,...patch},'invalid_arguments')
 check(!(await value(ownerApi('/work'))).items.some(w=>w.title==='MCP-REFUSED-DANGEROUS'),'invalid create arguments commit no ticket')
 await route(own.id,hardware)
 check((await tool(full.secret,'work.list')).items.some(w=>w.id===own.id),'own work joins list only after native owner grants current queue placement')

 await route(normal.id,network.id)
 check(!(await tool(credential.secret,'work.list')).items.some(w=>w.id===normal.id),'moving out removes ticket on the next list')
 await refused(credential.secret,'work.get',{workId:normal.id},'not_found')
 await route(normal.id,hardware)
 const beforeRace=await value(ownerApi('/work/'+normal.id))
 sql(`CREATE TRIGGER test_mcp_comment_move AFTER INSERT ON work_messages
 WHEN NEW.work_id=${quoted(normal.id)} AND NEW.source_key LIKE 'mcp:%'
 BEGIN UPDATE work_records SET group_id=${quoted(network.id)},revision=revision+1 WHERE id=NEW.work_id; END`)
 try {
  await refused(credential.secret,'work.comment',{workId:normal.id,revision:beforeRace.work.revision,body:'MCP-ROLLBACK-COMMENT',deduplicationKey:'API-003-race'},'mcp_commit_conflict')
 } finally {sql('DROP TRIGGER test_mcp_comment_move')}
 const afterRace=await value(ownerApi('/work/'+normal.id))
 equal({group:afterRace.work.group_id,revision:afterRace.work.revision,messages:afterRace.messages.map(m=>m.id).sort()},
  {group:beforeRace.work.group_id,revision:beforeRace.work.revision,messages:beforeRace.messages.map(m=>m.id).sort()},'mid-comment movement rolls back message, revision and fixture movement atomically')

 // Recheck each live authority component after the internal message insert,
 // within the same transaction; refusal must roll the attempted comment back.
 const authorityRaces=[
  `UPDATE mcp_credentials SET queue_groups_json='[]',grant_version=grant_version+1,grant_updated_by=${quoted(session.principal.userId)} WHERE id=${quoted(credential.id)}`,
  `UPDATE mcp_credentials SET scopes_json='["work.read"]' WHERE id=${quoted(credential.id)}`,
  `UPDATE mcp_credentials SET tools_json='["work.get"]' WHERE id=${quoted(credential.id)}`,
  `UPDATE mcp_credentials SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=${quoted(credential.id)}`,
  `UPDATE mcp_credentials SET state='revoked',secret_hash=NULL WHERE id=${quoted(credential.id)}`,
  `UPDATE memberships SET active=0 WHERE workspace_id=${quoted(session.principal.workspaceId)} AND user_id=${quoted(bot.id)}`,
  `UPDATE memberships SET roles_json='["integration","owner"]' WHERE workspace_id=${quoted(session.principal.workspaceId)} AND user_id=${quoted(bot.id)}`,
  `UPDATE execution_automation_principals SET revoked_at='2026-01-01' WHERE workspace_id=${quoted(session.principal.workspaceId)} AND user_id=${quoted(bot.id)}`,
  `UPDATE memberships SET roles_json='["employee"]' WHERE workspace_id=${quoted(session.principal.workspaceId)} AND user_id=${quoted(session.principal.userId)}`,
 ]
 for(const [i,mutation] of authorityRaces.entries()) {
  sql(`CREATE TRIGGER test_mcp_comment_authority AFTER INSERT ON work_messages WHEN NEW.work_id=${quoted(normal.id)} AND NEW.source_key LIKE 'mcp:%' BEGIN ${mutation}; END`)
  try {await refused(credential.secret,'work.comment',{workId:normal.id,revision:beforeRace.work.revision,body:'MCP-AUTHORITY-ROLLBACK-'+i,deduplicationKey:'API-003-authority-race-'+i},'mcp_commit_conflict')}
  finally {sql('DROP TRIGGER test_mcp_comment_authority')}
  const current=await value(ownerApi('/work/'+normal.id))
  equal(current.messages.map(m=>m.id).sort(),beforeRace.messages.map(m=>m.id).sort(),'commit authority loss rolls back the internal comment')
  equal((await rpc(credential.secret)).status,200,'transaction rollback preserves the original live authority')
 }
 sql(`CREATE TRIGGER test_mcp_comment_audit BEFORE INSERT ON audit_events WHEN NEW.action='mcp.call' BEGIN SELECT RAISE(ABORT,'test_mcp_audit_unavailable'); END`)
 try {equal((await call(credential.secret,'work.comment',{workId:normal.id,revision:beforeRace.work.revision,body:'MCP-AUDIT-ROLLBACK',deduplicationKey:'API-003-audit-failure'})).status,500,'failed call audit rolls back comment')}
 finally {sql('DROP TRIGGER test_mcp_comment_audit')}
 equal((await value(ownerApi('/work/'+normal.id))).messages.map(m=>m.id).sort(),beforeRace.messages.map(m=>m.id).sort(),'failed audit leaves no internal comment')
 equal(effects(),beforeEffects,'refused comments and creation do not dispatch effects or intake')

 const narrowed=await mint({name:'Narrowing proof'})
 const narrow=await value(ownerApi('/mcp-credentials/'+narrowed.id+'/narrow',{revision:narrowed.grantVersion,groupIds:[]}))
 equal(narrow.grant_version,narrowed.grantVersion+1,'narrowing advances grant version')
 equal(JSON.parse(narrow.queue_groups_json),[],'narrowing removes Hardware immediately')
 equal(await discover(narrowed.secret),['work.get'],'discovery keeps only own-created get when the queue grant is empty')
 await refused(narrowed.secret,'work.get',{workId:normal.id},'not_found')
 equal((await ownerApi('/mcp-credentials/'+narrowed.id+'/narrow',{revision:narrow.grant_version,groupIds:[hardware]})).value.error?.code,'mcp_grant_widening_requires_remint','widening requires a new credential')
 equal((await ownerApi('/mcp-credentials/'+narrowed.id+'/narrow',{revision:narrowed.grantVersion,groupIds:[]})).status,409,'stale grant revision refuses narrowing')
 const reminted=await mint({name:'New queue authority'})
 equal((await tool(reminted.secret,'work.get',{workId:normal.id})).id,normal.id,'new owner mint restores explicitly selected queue access')
 const issued=await mint({name:'Second owner issuer proof'},issuerSession.api)
 equal((await tool(issued.secret,'work.get',{workId:normal.id})).id,normal.id,'second owner issued credential starts usable')
 await value(ownerApi('/members/'+issuer.id,{roles:['employee'],active:true},'PATCH'))
 const lost=await rpc(issued.secret)
 equal(lost.status,401,'issuer owner loss refuses next call')
 equal(lost.value.error.message,'mcp_issuer_inactive','issuer loss reports explicit refusal')
 const managed=(await value(ownerApi('/mcp-credentials'))).items
 equal(managed.find(c=>c.id===issued.id).state,'revoked','issuer loss durably revokes its credential')
 check(!JSON.stringify(managed).includes(issued.secret),'management never re-exposes secret')
 equal((await rpc(credential.secret)).status,200,'main issuing owner and credential remain active')

 const audits=sql("SELECT * FROM audit_events WHERE action LIKE 'mcp.%'")
 const audit=(action,target)=>audits.filter(a=>a.action===action&&a.target===target)
 equal(JSON.parse(audit('mcp.credential_minted',credential.id)[0].detail_json).groupIds,[hardware],'mint audit records selected queue ids')
 const narrowedAudit=JSON.parse(audit('mcp.queue_grant_narrowed',narrowed.id)[0].detail_json)
 equal({groupIds:narrowedAudit.groupIds,version:narrowedAudit.grantVersion},{groupIds:[],version:narrow.grant_version},'narrow audit records ids and new version')
 const issuerAudit=JSON.parse(audit('mcp.credential_revoked',issued.id)[0].detail_json)
 equal({issuerId:issuerAudit.issuerId,reason:issuerAudit.reason},{issuerId:issuer.id,reason:'mcp_issuer_inactive'},'issuer loss audit identifies responsible owner and refusal')
 const calls=audits.filter(a=>a.action==='mcp.call').map(a=>({...a,detail:JSON.parse(a.detail_json)}))
 check(calls.some(a=>a.detail.tool==='work.comment'&&a.detail.outcome==='success'&&a.detail.targetIds.includes(normal.id)),'successful internal comment audits tool and target id')
 check(calls.some(a=>a.detail.outcome==='mcp_commit_conflict'&&a.detail.targetIds.includes(normal.id)),'commit refusal is audited without body')
 for(const row of calls) {
  equal(row.actor_id,bot.id,'call audit attributes integration principal')
  check(Object.keys(row.detail).every(k=>['credentialId','principalId','method','tool','targetIds','outcome'].includes(k)),'call audit uses closed id-only payload')
 }
 const auditText=JSON.stringify(audits)
 for(const excluded of [credential.secret,full.secret,readonly.secret,issued.secret,hidden,ownBody,'MCP-ROLLBACK-COMMENT','MCP-STALE-COMMENT','MCP-REFUSED-DANGEROUS-BODY','mcp-private-contact@example.test'])
  check(!auditText.includes(excluded),'MCP audit excludes secrets, free text and personal values')
 check(sql(`SELECT secret_hash FROM mcp_credentials WHERE id=${quoted(issued.id)}`)[0].secret_hash===null,'issuer revocation clears stored hash')

 await value(ownerApi('/people/'+employee.id+'/erase',{revision:0,reason:'API-003 authorized subject erasure'}))
 await refused(credential.secret,'work.get',{workId:normal.id},'not_found')
 await refused(full.secret,'work.history',{workId:normal.id},'not_found')
 check(!(await tool(credential.secret,'work.list')).items.some(w=>w.id===normal.id),'subject erasure removes the ticket from queue reads')
 equal((await tool(full.secret,'work.search',{query:'Monitor flickers'})).items,[],'subject erasure removes content from MCP search')
 return {normalId:normal.id,employeeId:employee.id,ownId:own.id,hardwareId:hardware,networkId:network.id}
}

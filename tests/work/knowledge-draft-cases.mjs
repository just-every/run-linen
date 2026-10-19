import assert from 'node:assert/strict';
export async function knowledgeDraftChecks(api,db) {
  const check=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r));return r.value;};
  const employee={'x-user':'employee','x-roles':'["employee"]'},operator={'x-user':'stranger','x-roles':'["operator"]'};
  const ticket=async(app='KB004 VPN',headers=employee,sensitivity='normal',context={app})=>{
    let work=check(await api('/work',{title:'VPN access stopped',body:'A fresh network session restores access. Treat this as a proposed remedy, not authority to change identity grants.',kind:'incident',sensitivity,context,deduplicationKey:crypto.randomUUID()},headers),201);
    check(await api(`/work/${work.id}/messages`,{body:'PRIVATE-KB004-DO-NOT-SEND',visibility:'private',sourceMessageId:crypto.randomUUID()}),201);
    work=check(await api(`/work/${work.id}/commands`,{revision:work.revision,command:'close',reason:'Employee reported usable access after a fresh session'}));
    return work;
  };
  const detect=async()=>check(await api('/knowledge-drafts/detect',{})).items;
  const group=(items,app)=>items.find(d=>d.group.type==='tickets'&&d.group.value===app.toLowerCase());
  const three=[await ticket(),await ticket(),await ticket()];
  let candidate=group(await detect(),'KB004 VPN');assert.ok(candidate);assert.equal(candidate.sources.length,3);
  assert.equal(check(await api('/test/knowledge-provider')).calls,0,'Detection never dispatches a model');
  assert.equal((await detect()).filter(d=>d.id===candidate.id).length,1,'Repeated scans deduplicate');
  check(await api('/knowledge-drafts',undefined,employee),403);
  check(await api('/knowledge-drafts/detect',{},employee),403);
  check(await api(`/knowledge-drafts/${candidate.id}`,undefined,{'x-workspace':'b'}),404);
  check(await api(`/knowledge-drafts/${candidate.id}/generate`,{revision:candidate.revision,connectionId:'missing'}),422);
  check(await api(`/knowledge-drafts/${candidate.id}/publish`,{revision:candidate.revision,review:true,scope:'employees',expiresAt:new Date(Date.now()+86400000).toISOString()}),409);
  const encryption=await crypto.subtle.importKey('raw',Buffer.alloc(32),'AES-GCM',false,['encrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12)),ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},encryption,new TextEncoder().encode(JSON.stringify({apiKey:'synthetic-knowledge-paid-edge'})));
  const secret=Buffer.from(iv).toString('base64')+'.'+Buffer.from(ciphertext).toString('base64'),at=new Date().toISOString();
  const config={model:'configured-knowledge-model',inputUsdPerMillion:1,cachedInputUsdPerMillion:0.5,outputUsdPerMillion:2,maxOutputTokens:1000,maxAttemptUsd:1,contextCharacters:24000};
  await db.prepare("INSERT INTO connections(id,workspace_id,provider,name,status,config_json,secret_ciphertext,created_at,updated_at) VALUES('knowledge-model','a','openai','Knowledge model','active',?,?,?,?)")
    .bind(JSON.stringify(config),secret,at,at).run();
  await db.prepare("INSERT INTO intelligence_budgets(workspace_id,limit_usd,spent_usd,reserved_usd,revision) VALUES('a',0,0,0,1)").run();
  check(await api(`/knowledge-drafts/${candidate.id}/generate`,{revision:candidate.revision,connectionId:'knowledge-model',generate:true}),429);
  assert.equal(check(await api('/test/knowledge-provider')).calls,0);
  await db.prepare("UPDATE intelligence_budgets SET limit_usd=10 WHERE workspace_id='a'").run();
  for(const mode of ['schema','unknown-citation','missing-citation']) {
    check(await api('/test/knowledge-provider',{mode}));candidate=check(await api(`/knowledge-drafts/${candidate.id}`));
    check(await api(`/knowledge-drafts/${candidate.id}/generate`,{revision:candidate.revision,connectionId:'knowledge-model',generate:true}),502);
    assert.equal(check(await api(`/knowledge-drafts/${candidate.id}`)).state,'candidate');
  }
  check(await api('/test/knowledge-provider',{mode:'ok'}));candidate=check(await api(`/knowledge-drafts/${candidate.id}`));
  let draft=check(await api(`/knowledge-drafts/${candidate.id}/generate`,{revision:candidate.revision,connectionId:'knowledge-model',generate:true}));
  assert.equal(draft.state,'draft');assert.equal(draft.citations.length,3);assert.deepEqual(draft.sources.map(s=>s.id).sort(),three.map(t=>t.id).sort());
  assert.ok(!JSON.stringify(check(await api('/test/knowledge-provider')).packets).includes('PRIVATE-KB004-DO-NOT-SEND'));
  assert.equal(check(await api('/knowledge?q=Recover%20network')).items.length,0,'Generated draft remains unpublished');
  const publish={revision:draft.revision,scope:'employees',expiresAt:new Date(Date.now()+86400000).toISOString()};
  check(await api(`/knowledge-drafts/${draft.id}/publish`,publish),422);
  draft=check(await api(`/knowledge-drafts/${draft.id}/publish`,{...publish,review:true},operator));
  assert.equal(draft.reviewerId,'stranger');assert.ok(draft.articleId);
  const articles=check(await api('/knowledge?q=Recover%20network',undefined,employee)).items;
  assert.ok(articles.some(a=>a.id===draft.articleId));assert.equal(articles.find(a=>a.id===draft.articleId).sources.length,3);
  assert.ok(check(await api('/search?q=Recover%20network&type=article')).items.some(a=>a.id===draft.articleId),'DESK-016 search includes current generated guidance');
  const stranger={'x-user':'stranger','x-roles':'["employee"]'};
  assert.ok(!check(await api('/knowledge?q=Recover%20network',undefined,stranger)).items.some(a=>a.id===draft.articleId),'Article does not grant readership of another employee’s sources');
  await db.prepare("INSERT INTO workspace_settings(workspace_id,settings_json) VALUES('a',?) ON CONFLICT(workspace_id) DO UPDATE SET settings_json=excluded.settings_json")
    .bind(JSON.stringify({defaultModelConnectionId:'knowledge-model'})).run();
  const ownReply=check(await api('/work',{title:'Network follow-up',body:'Follow up on the reviewed guidance.',deduplicationKey:crypto.randomUUID()},employee),201);
  const requesterReply=check(await api('/work',{title:'Request for a colleague',body:'A colleague needs network help.',beneficiaryId:'employee',deduplicationKey:crypto.randomUUID()},operator),201);
  const beneficiaryReply=check(await api('/work',{title:'Beneficiary follow-up',body:'Follow up for a different employee.',beneficiaryId:'stranger',deduplicationKey:crypto.randomUUID()}),201);
  const reply=(work,kind='reply')=>api(`/work/${work.id}/response-assistance`,{kind,articleIds:[draft.articleId]});
  assert.equal((await reply(ownReply)).status,200,'DESK-008 / KB-004 permit generated knowledge when both named recipients can read every source');
  await db.prepare("UPDATE memberships SET roles_json='[\"employee\"]' WHERE workspace_id='a' AND user_id='stranger'").run();
  const beforeDenied=check(await api('/test/knowledge-provider')).calls;
  check(await reply(requesterReply),404);check(await reply(beneficiaryReply),404);
  const pendingPerson=check(await api('/pending-people',{name:'Jules Reader',email:'jules.reader@example.test',team:'Network',startDate:'2030-01-01',reviewed:true}),201);
  const catalog=check(await api('/catalog',{name:'Pending network access',kind:'access',target:'vpn-reader',ownerId:'owner',capacity:10}),201);
  const pendingReply=check(await api('/work',{title:'Prepare pending access',body:'Prepare access when the reviewed person signs in.',pendingPersonId:pendingPerson.id,catalogIds:[catalog.id],deduplicationKey:crypto.randomUUID()}),201);
  check(await reply(pendingReply),404);
  assert.equal(check(await api('/test/knowledge-provider')).calls,beforeDenied,'DESK-008 / KB-004 refuse unreadable requester, beneficiary and pending-beneficiary context before paid dispatch');
  check(await reply(beneficiaryReply,'summary'));
  await db.prepare("UPDATE memberships SET roles_json='[\"operator\"]' WHERE workspace_id='a' AND user_id='stranger'").run();
  check(await api('/test/knowledge-provider',{mode:'delay'}));
  const pendingReplyResult=reply(requesterReply);
  for(let i=0;i<200&&!check(await api('/test/knowledge-provider')).waiting;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(check(await api('/test/knowledge-provider')).waiting,true);
  await db.prepare("UPDATE memberships SET roles_json='[\"employee\"]' WHERE workspace_id='a' AND user_id='stranger'").run();
  check(await api('/test/knowledge-provider/release',{}));check(await pendingReplyResult,404);
  assert.equal(check(await api(`/work/${requesterReply.id}`)).messages.length,1,'DESK-008 / KB-004 a late recipient-rights change never posts or releases the generated reply');
  await db.prepare("UPDATE memberships SET roles_json='[\"operator\"]' WHERE workspace_id='a' AND user_id='stranger'").run();
  check(await api('/test/knowledge-provider',{mode:'ok'}));
  check(await api(`/work/${three[0].id}/commands`,{revision:three[0].revision,command:'reopen',reason:'Still broken'},employee));
  assert.ok(!check(await api('/knowledge?q=Recover%20network')).items.some(a=>a.id===draft.articleId));
  assert.ok(!check(await api('/search?q=Recover%20network&type=article')).items.some(a=>a.id===draft.articleId),'DESK-016 current generated-source checks withdraw reopened guidance from results and counts');
  check(await api(`/knowledge/${draft.articleId}/escalate`,{question:'Need help',deduplicationKey:crypto.randomUUID()}),404);
  const rejectedTickets=[await ticket('KB004 Reject'),await ticket('KB004 Reject'),await ticket('KB004 Reject')];
  let rejected=group(await detect(),'KB004 Reject');
  rejected=check(await api(`/knowledge-drafts/${rejected.id}/generate`,{revision:rejected.revision,connectionId:'knowledge-model',generate:true}));
  assert.equal(rejected.state,'draft');
  rejected=check(await api(`/knowledge-drafts/${rejected.id}/reject`,{revision:rejected.revision,reason:'These outcomes do not establish a shared remedy'}));
  await ticket('KB004 Reject');assert.equal(group(await detect(),'KB004 Reject').state,'rejected');
  assert.equal(group(await detect(),'KB004 Reject').id,rejected.id);
  await ticket('KB004 Sensitive',{},'hr');await ticket('KB004 Sensitive',{},'hr');await ticket('KB004 Sensitive',{},'hr');
  assert.equal(group(await detect(),'KB004 Sensitive'),undefined);
  const service=check(await api('/services',{name:'KB004 known-error service',description:'Network support',businessImpact:'Cannot sign in',source:'Reviewed support register',observedAt:at,visibility:'workspace'}),201);
  for (const [context,facet,value] of [
    [{serviceId:service.id,cohort:'Denver'},'serviceId',service.id],
    [{serviceId:service.id,cohort:'Austin'},'serviceId',service.id],
    [{deviceModel:'ThinkPad T14',cohort:'Denver'},'deviceModel','thinkpad t14'],
    [{cohort:'Denver'},'title','vpn access stopped'],
    [{app:' Payroll Cloud ',serviceId:service.id,deviceModel:'ThinkPad T14',cohort:'Denver'},'app','payroll cloud'],
  ]) {
    const records=[await ticket('',employee,'normal',context),await ticket('',employee,'normal',context),await ticket('',employee,'normal',context)];
    const found=(await detect()).find(d=>records.every(r=>d.sources.some(s=>s.id===r.id)));
    assert.ok(found,'KB-004 recorded-context matches create a source-linked candidate');
    assert.equal(found.group.facet,facet);assert.equal(found.group.value,value);
    assert.equal(found.group.cohort,context.cohort.toLowerCase());
    assert.equal(found.sources.length,3,'KB-004 separate cohorts and context kinds never mix sources');
  }
  const incident=check(await api('/incidents',{title:'KB004 sign-in failure',serviceId:service.id,impact:'Sign-in unavailable',cohorts:['Denver'],visibility:'workspace'}),201);
  let problem=check(await api('/problems',{title:'KB004 reviewed known error',serviceId:service.id,incidentIds:[incident.id],symptoms:'A stale session causes a sign-in loop',visibility:'operators'}),201);
  assert.ok(!(await detect()).some(d=>d.group.value===problem.id));
  problem=check(await api(`/problems/${problem.id}/known-error`,{revision:problem.revision,cause:'A stale session claim repeats redirects',evidenceIds:['session-probe']}));
  let known=(await detect()).find(d=>d.group.type==='known-error'&&d.group.value===problem.id);assert.ok(known);
  known=check(await api(`/knowledge-drafts/${known.id}/generate`,{revision:known.revision,connectionId:'knowledge-model',generate:true}));
  assert.deepEqual(known.citations,['known-error:'+problem.id]);
  problem=check(await api(`/problems/${problem.id}/known-error`,{revision:problem.revision,cause:'Corrected root cause',evidenceIds:['corrected-probe']}));
  check(await api(`/knowledge-drafts/${known.id}/publish`,{revision:known.revision,review:true,scope:'operators',expiresAt:publish.expiresAt}),409);
  await db.prepare("UPDATE work_records SET sensitivity='restricted',revision=revision+1 WHERE id=?").bind(rejectedTickets[0].id).run();
  assert.ok(!check(await api('/knowledge-drafts',undefined,operator)).items.some(d=>d.id===rejected.id));
  check(await api(`/knowledge-drafts/${rejected.id}`,undefined,operator),404);
  await ticket('KB004 interrupted');await ticket('KB004 interrupted');await ticket('KB004 interrupted');
  const interrupted=group(await detect(),'KB004 interrupted');
  check(await api('/test/knowledge-provider',{mode:'delay'}));
  const pending=api(`/knowledge-drafts/${interrupted.id}/generate`,{revision:interrupted.revision,connectionId:'knowledge-model',generate:true});
  for(let i=0;i<200&&!check(await api('/test/knowledge-provider')).waiting;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(check(await api('/test/knowledge-provider')).waiting,true);
  const archived=await db.prepare('SELECT * FROM work_knowledge_drafts WHERE id=?').bind(interrupted.id).first();
  assert.equal(archived.state,'generating');
  await db.prepare('DELETE FROM work_knowledge_drafts WHERE id=?').bind(interrupted.id).run();
  check(await api('/test/knowledge-provider/release',{}));check(await pending,409);
  const calls=check(await api('/test/knowledge-provider')).calls;
  check(await api('/test/restore',{table:'work_knowledge_drafts',row:archived,sourceId:'kb004-interrupted-native',sourceKey:interrupted.id}));
  const resumed=check(await api(`/knowledge-drafts/${interrupted.id}`));
  assert.equal(resumed.state,'candidate');assert.equal(resumed.modelAttemptId,null);
  assert.equal(check(await api('/test/knowledge-provider')).calls,calls,'KB-004 native restore never resumes an old paid generation');
  check(await api('/test/knowledge-provider',{mode:'ok'}));
  console.log('PASS KB-004 public routes: three-source draft, known errors, explicit paid generation/budget, schema/citations, private exclusion, reviewer publication/rejection, durable dedup and source withdrawal');
  return {draftId:draft.id,articleId:draft.articleId,knownDraftId:known.id};
}

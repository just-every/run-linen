import assert from 'node:assert/strict';
const operator = {'x-user':'search-agent','x-roles':'["operator"]'};
const hr = {'x-user':'search-hr','x-roles':'["hr"]'};
const types = ['ticket','person','asset','ci','change','problem','catalog','article'];
export async function searchChecks(api, db) {
  await db.exec(`INSERT INTO users VALUES('search-agent','search-agent@test','Network Agent','unused','2026-01-01'); INSERT INTO memberships VALUES('a','search-agent','["operator"]',1); INSERT INTO users VALUES('search-hr','search-hr@test','HR Agent','unused','2026-01-01'); INSERT INTO memberships VALUES('a','search-hr','["hr"]',1);`);
  const make = async (path,body,headers) => {const r=await api(path,body,headers);assert.ok(r.status<300,JSON.stringify(r));return r.value;};
  const search = async (q,type,headers=operator,offset=0) => make(`/search?q=${encodeURIComponent(q)}${type?'&type='+type:''}&offset=${offset}`,undefined,headers);
  const person=await make('/people',{source:'search-register',sourceId:'rivera',name:'Jordan Rivera',effectiveAt:'2026-01-01T00:00:00Z',observedAt:'2026-01-01T00:00:00Z'});
  const device=await make('/assets',{serial:'DEN-C02XL93',assetTag:'DEN-IT-042',source:'Receiving register',location:'Denver'});
  await make('/assets/'+device.id+'/commands',{revision:1,command:'assign',personId:person.id,evidence:'Jordan signed the Denver pickup receipt'});
  const ticket=await make('/work',{title:'Laptop loses network connection',body:'The assigned device needs its network adapter checked.',context:{assetId:device.id},deduplicationKey:crypto.randomUUID()}, {'x-user':'employee','x-roles':'["employee"]'});
  await make('/work/'+ticket.id+'/messages',{body:'InternalOnlySearchSignal',visibility:'private',sourceMessageId:'search-private'});
  const ordinaryHR=await make('/work',{title:'HR agent ordinary printer request',body:'A printer problem',deduplicationKey:crypto.randomUUID()},hr);
  await make('/work/'+ordinaryHR.id+'/messages',{body:'InternalOnlySearchSignal',visibility:'private',sourceMessageId:'hr-private'});
  const confidential=await make('/work',{title:'ConfidentialSearchNeedle',body:'ConfidentialSearchNeedle',sensitivity:'hr',deduplicationKey:crypto.randomUUID()});
  const service=await make('/services',{name:'Denver networking',description:'Network connectivity',businessImpact:'Office work blocked',source:'Reviewed CI register',observedAt:new Date().toISOString(),visibility:'workspace'});
  const incident=await make('/incidents',{title:'Denver network outage',serviceId:service.id,impact:'Work blocked',cohorts:['Denver'],visibility:'workspace'});
  const problem=await make('/problems',{title:'Denver network adapter problem',serviceId:service.id,incidentIds:[incident.id],symptoms:'Repeated network drops',visibility:'operators'});
  const change=await make('/changes',{title:'Denver network adapter update',services:[service.id],risk:'low',impact:'A single office',cohorts:['Denver'],canaryCohorts:['Denver'],window:{start:'2030-01-01T01:00:00Z',end:'2030-01-01T02:00:00Z'},implementation:{action:'review-driver'},compensation:{action:'restore-driver'}});
  const catalog=await make('/catalog',{name:'Denver network access',kind:'access',target:'denver-network',ownerId:'owner'});
  const article=await make('/knowledge',{title:'Denver network guidance',body:'Reconnect the adapter after checking active work.',scope:'employees',expiresAt:'2030-01-01T00:00:00Z',review:true});
  assert.ok((await search('Network Agent','person')).items.some(r=>r.id==='search-agent'&&r.identityKind==='member'),'DESK-016 active member names are searchable without email or roles');
  await make('/people/'+person.id+'/binding',{expectedRevision:person.revision,memberId:'employee'});
  assert.equal((await search('Employee','person')).items.filter(r=>r.id==='employee'&&r.identityKind==='member').length,0,'DESK-016 only a current explicit reviewed binding deduplicates member and person results');
  assert.ok((await search('Employee','person')).items.some(r=>r.id===person.id&&r.identityKind==='person'),'DESK-016 deduplication retains the current member name as a search term');
  assert.equal(JSON.stringify(await search('Network Agent','person')).includes('search-agent@test'),false,'DESK-016 directory projection contains no email');
  const bySerial=await search('DEN-C02XL93');
  for (const [type,id] of [['asset',device.id],['ticket',ticket.id],['person',person.id]])
    assert.ok(bySerial.items.some(r=>r.type===type&&r.id===id),'DESK-016 serial finds asset, explicitly linked ticket and assigned person');
  assert.ok((await search('DEN-IT-042','asset')).items.some(r=>r.id===device.id),'DESK-016 recorded asset tags are searchable');
  const requested=await search('Employee','ticket');
  assert.ok(requested.items.some(r=>r.id===ticket.id),'DESK-016 requester name finds their ticket');
  assert.ok((await search(ticket.id,'ticket')).items.some(r=>r.id===ticket.id),'DESK-016 native ticket identity is searchable');
  for (const [type,id] of [['ci',service.id],['problem',problem.id],['change',change.id],['catalog',catalog.id],['article',article.id]]) {
    const result=await search('Denver',type);
    assert.ok(result.items.some(r=>r.id===id),'DESK-016 searches '+type);
    assert.ok(result.items.every(r=>r.type===type));
    assert.equal(result.total,result.counts[type],'DESK-016 type filter and visible count agree');
  }
  assert.ok((await search('netwrok','ticket')).items.some(r=>r.id===ticket.id),'DESK-016 adjacent typo tolerance');
  assert.ok((await search('netwok','ci')).items.some(r=>r.id===service.id),'DESK-016 omitted-character typo tolerance');
  await make('/work',{title:'synthetic-linen-9707 laptop slow',body:'Linen: We will reply by 3:20 PM.',deduplicationKey:crypto.randomUUID()});
  const numbered=await make('/work',{title:'synthetic-linen-20',body:'The requested numbered record',deduplicationKey:crypto.randomUUID()});
  assert.deepEqual((await search('synthetic-linen-20','ticket')).items.map(r=>r.id),[numbered.id],
    'A numeric identifier finds its record without combining another identifier with a conversation deadline');
  assert.equal((await search('ConfidentialSearchNeedle')).total,0,'DESK-016 IT agent sees no HR hit or count');
  assert.equal(JSON.stringify(await search('ConfidentialSearchNeedle')).includes(confidential.id),false);
  assert.ok((await search('ConfidentialSearchNeedle','ticket',hr)).items.some(r=>r.id===confidential.id),'DESK-016 HR reader keeps current HR access');
  assert.equal((await search('InternalOnlySearchSignal','ticket',hr)).total,0,'DESK-016 HR requester cannot match private notes in an ordinary ticket');
  assert.ok((await search('InternalOnlySearchSignal','ticket')).items.some(r=>r.id===ticket.id));
  assert.equal((await api('/search?q=Denver',undefined,{'x-user':'employee','x-roles':'["employee"]'})).status,403,'DESK-016 global agent door never grants employee directory access');
  assert.equal((await api('/search?q=Denver&type=unknown')).status,422);
  assert.equal((await api('/search?q=Denver&offset=-1')).status,422);
  assert.equal((await api('/search?q='+encodeURIComponent('a'.repeat(201)))).status,422);
  assert.equal((await search('%')).total,0,'DESK-016 SQL wildcards remain literal');
  assert.equal((await search('NoSuchSearchResult')).total,0);
  const cross=await api('/search?q=Denver',undefined,{'x-workspace':'b'});assert.equal(cross.status,404,'DESK-016 no membership in another workspace');
  await db.prepare('UPDATE memberships SET active=0 WHERE workspace_id=? AND user_id=?').bind('a','search-agent').run();
  assert.equal((await api('/search?q=Denver',undefined,operator)).status,404,'DESK-016 revoked membership is rechecked');
  await db.prepare('UPDATE memberships SET active=1,roles_json=? WHERE workspace_id=? AND user_id=?').bind('["employee"]','a','search-agent').run();
  assert.equal((await api('/search?q=Denver',undefined,operator)).status,403,'DESK-016 stale claimed role never widens current access');
  await db.prepare('UPDATE memberships SET roles_json=? WHERE workspace_id=? AND user_id=?').bind('["operator"]','a','search-agent').run();
  const hiddenService=await make('/services',{name:'HiddenCISearchNeedle',description:'Restricted CI',businessImpact:'Private service',source:'Reviewed CI register',observedAt:new Date().toISOString(),visibility:'restricted'});
  assert.equal((await search('HiddenCISearchNeedle')).total,0,'DESK-016 restricted CI does not leak a hit or count');
  assert.ok((await search('HiddenCISearchNeedle','ci',{})).items.some(r=>r.id===hiddenService.id));
  await make('/knowledge',{title:'HiddenArticleSearchNeedle',body:'HR guidance',scope:'hr',expiresAt:'2030-01-01T00:00:00Z',review:true});
  await make('/knowledge',{title:'DraftArticleSearchNeedle',body:'Unreviewed guidance',scope:'employees',expiresAt:'2030-01-01T00:00:00Z',review:false});
  assert.equal((await search('HiddenArticleSearchNeedle')).total,0,'DESK-016 article audience applies before matching and counts');
  assert.equal((await search('DraftArticleSearchNeedle')).total,0,'DESK-016 unreviewed guidance is absent');
  const employee={'x-user':'employee','x-roles':'["employee"]'};
  const knowledgeQuery='synthetic-linen-61 knowledge';
  const guidance=await make('/knowledge',{title:knowledgeQuery+' employee guidance',body:'Reconnect the adapter using the reviewed employee instructions.',scope:'employees',expiresAt:'2030-01-01T00:00:00Z',review:true});
  const hrGuidance=await make('/knowledge',{title:knowledgeQuery+' HR guidance',body:'Confidential HR instructions.',scope:'hr',expiresAt:'2030-01-01T00:00:00Z',review:true});
  const draftGuidance=await make('/knowledge',{title:knowledgeQuery+' draft guidance',body:'Employee instructions awaiting review.',scope:'employees',expiresAt:'2030-01-01T00:00:00Z',review:false});
  const knowledgePath='/knowledge?q='+encodeURIComponent(knowledgeQuery);
  const employeeKnowledge=await make(knowledgePath,undefined,employee);
  assert.deepEqual(employeeKnowledge.items.map(r=>r.id),[guidance.id],'DESK-016 employees find reviewed guidance but no matching HR or unreviewed article');
  assert.equal(employeeKnowledge.items[0].body,'Reconnect the adapter using the reviewed employee instructions.','DESK-016 the employee receives the actual reviewed guidance');
  const hrKnowledge=await make(knowledgePath,undefined,hr);
  assert.deepEqual(hrKnowledge.items.map(r=>r.id).sort(),[guidance.id,hrGuidance.id].sort(),'DESK-016 matching HR guidance exists and remains available to its authorized reader');
  for (const hidden of [hrGuidance.id,draftGuidance.id,'Confidential HR instructions.','Employee instructions awaiting review.'])
    assert.equal(JSON.stringify(employeeKnowledge).includes(hidden),false,'DESK-016 employee knowledge responses expose neither hidden article identity nor content');
  assert.equal(hrKnowledge.items.find(r=>r.id===hrGuidance.id).body,'Confidential HR instructions.','DESK-016 the HR exclusion is tested against real readable content');
  assert.equal(hrKnowledge.items.some(r=>r.id===draftGuidance.id),false,'DESK-016 even HR readership cannot bypass article review');
  assert.equal((await api('/search?q='+encodeURIComponent(knowledgeQuery),undefined,employee)).status,403,'DESK-016 employee knowledge access never unlocks global agent search');
  assert.equal((await api('/search?q='+encodeURIComponent(knowledgeQuery)+'&type=article',undefined,employee)).status,403,'DESK-016 an article filter never bypasses the global agent restriction');
  for (let i=0;i<51;i++) await make('/knowledge',{title:'PaginationSearchCorpus '+String(i).padStart(2,'0'),body:'Reviewed paged guidance',scope:'employees',expiresAt:'2030-01-01T00:00:00Z',review:true});
  const firstPage=await search('PaginationSearchCorpus','article'),secondPage=await search('PaginationSearchCorpus','article',operator,50);
  assert.equal(firstPage.total,51,'DESK-016 search never inherits the old article list truncation');
  assert.equal(firstPage.items.length,50);assert.equal(secondPage.items.length,1);assert.equal(secondPage.total,51);
  assert.equal(new Set([...firstPage.items,...secondPage.items].map(r=>r.id)).size,51,'DESK-016 stable pages have no duplicate or omitted visible match');
  const all=await search('Denver');assert.ok(types.every(t=>Number.isInteger(all.counts[t])));
  assert.ok(await db.prepare("SELECT 1 FROM audit_events WHERE workspace_id='a' AND actor_id='search-agent' AND action='search.privileged_read'").first(),'DESK-016 privileged search reads retain the A1 audit obligation');
  assert.equal(all.total,Object.values(all.counts).reduce((a,b)=>a+b,0),'DESK-016 visible-only counts sum to total');
  for (const [actor,headers] of [['owner',{}],['search-agent',operator],['search-hr',hr]]) {
    const marker='synthetic-linen-66-unretained-'+actor;
    for (const [query,matched] of [[knowledgeQuery,true],[marker+' private query + & details',false]]) {
      const before=new Set((await db.prepare('SELECT id FROM audit_events').all()).results.map(r=>r.id));
      const result=await search(query,matched?'article':undefined,headers);
      assert.equal(result.query,query,'DESK-016 each privileged role completes the submitted search');
      assert.equal(result.items.some(r=>r.id===guidance.id),matched,'DESK-016 audit privacy covers both real results and an unmatched query');
      assert.equal(result.total>0,matched);
      assert.equal(result.items.some(r=>r.id===hrGuidance.id),matched&&actor!=='search-agent','DESK-016 successful privileged searches still apply the current article audience');
      assert.equal(result.items.some(r=>r.id===draftGuidance.id),false,'DESK-016 privileged searches never include unreviewed guidance');
      const written=(await db.prepare('SELECT * FROM audit_events').all()).results.filter(r=>!before.has(r.id));
      const reads=written.filter(r=>r.action==='search.privileged_read');
      assert.equal(reads.length,1,'DESK-016 the specific privileged search creates an audit record');
      assert.equal(reads[0].workspace_id,'a');
      assert.equal(reads[0].actor_id,actor,'DESK-016 search audit identifies the authenticated current actor');
      assert.equal(reads[0].target,'global-search');
      assert.ok(Number.isFinite(Date.parse(reads[0].created_at)));
      const detail=JSON.parse(reads[0].detail_json);
      assert.ok(detail&&typeof detail==='object'&&!Array.isArray(detail),'DESK-016 inspect the persisted audit payload');
      const retained=JSON.stringify(written).toLowerCase();
      for (const value of [query,encodeURIComponent(query),Buffer.from(query).toString('base64'),...(matched?[]:[marker])])
        assert.equal(retained.includes(value.toLowerCase()),false,'DESK-016 attributed search auditing retains no submitted query content');
    }
  }
  console.log('PROBE DESK-016 5: owner, operator and HR searches with real article matches and unmatched queries create attributed audit rows without raw, encoded or base64 query content');
  console.log('PROBE DESK-016 6: employee knowledge search returns reviewed employee guidance, omits HR and draft identities and content, and both global search variants return 403');
  console.log('PASS DESK-016 public routes: existing scoped search, attributed query-free audits for owner, operator and HR, employee reviewed knowledge with HR and draft exclusions, and forbidden employee global search');
  return {ticketId:ticket.id,deviceId:device.id,personId:person.id};
}

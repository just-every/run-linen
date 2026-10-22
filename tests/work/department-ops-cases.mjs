import assert from 'node:assert/strict';

/** Department ownership narrows existing public service doors without turning employee facts into staff grants. */
export async function departmentOpsChecks(workspaceApi, db) {
  const workspace='synthetic-linen-901', agentId='synthetic-linen-902', hrId='synthetic-linen-903';
  const api=(path,body,headers={})=>workspaceApi(path,body,{'x-workspace':workspace,...headers});
  const employee={'x-user':'employee','x-roles':'["employee"]'}, agent={'x-user':agentId,'x-roles':'["operator"]'}, hr={'x-user':hrId,'x-roles':'["hr"]'};
  const check=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.value));return r.value;};
  const get=async(path,headers)=>check(await api(path,undefined,headers));
  const post=async(path,body,headers,status=201)=>check(await api(path,body,headers),status);
  await db.exec(`INSERT INTO workspaces VALUES('synthetic-linen-901','synthetic-linen-901','2026-01-01');
    INSERT INTO users VALUES('synthetic-linen-902','synthetic-linen-902@example.test','synthetic-linen-902','unused','2026-01-01');
    INSERT INTO users VALUES('synthetic-linen-903','synthetic-linen-903@example.test','synthetic-linen-903','unused','2026-01-01');
    INSERT INTO memberships VALUES('synthetic-linen-901','owner','["owner"]',1);
    INSERT INTO memberships VALUES('synthetic-linen-901','employee','["employee"]',1);
    INSERT INTO memberships VALUES('synthetic-linen-901','synthetic-linen-902','["operator"]',1);
    INSERT INTO memberships VALUES('synthetic-linen-901','synthetic-linen-903','["hr"]',1);`);
  const it=await post('/departments',{name:'synthetic-linen-904',kind:'it'});
  const facilities=await post('/departments',{name:'synthetic-linen-905',kind:'facilities'});
  const people=await post('/departments',{name:'synthetic-linen-906',kind:'hr'});
  const membership=async(departmentId,userId,active)=>{
    const current=(await get('/departments/admin')).items.find(d=>d.id===departmentId);
    return post(`/departments/${departmentId}/members`,{revision:current.revision,userId,active},undefined,200);
  };
  await membership(it.id,agentId,true); await membership(people.id,hrId,true);
  const group=await post('/work-groups',{name:'synthetic-linen-907',departmentId:it.id});
  const otherGroup=await post('/work-groups',{name:'synthetic-linen-907',departmentId:facilities.id});
  await post(`/work-groups/${group.id}/members`,{userId:agentId,lead:true},undefined,200);
  assert.equal((await api(`/work-groups/${otherGroup.id}/members`,{userId:agentId})).status,422);
  assert.ok((await get('/work-groups',agent)).items.some(g=>g.id===group.id));
  assert.ok(!(await get('/work-groups',agent)).items.some(g=>g.id===otherGroup.id));
  assert.equal((await api('/work-groups',{name:'synthetic-linen-908',departmentId:it.id},agent)).status,403);

  const item=async(name,departmentId)=>post('/catalog',{name,kind:'service',target:name,ownerId:'owner',departmentId});
  const itItem=await item('synthetic-linen-909',it.id), facilitiesItem=await item('synthetic-linen-910',facilities.id);
  const portal=(await get('/catalog',employee)).items;
  assert.ok(portal.some(c=>c.id===itItem.id&&c.departmentId===it.id));
  assert.ok(portal.some(c=>c.id===facilitiesItem.id&&c.departmentId===facilities.id));
  const work=await post('/work',{title:'synthetic-linen-911',body:'synthetic-linen-911',departmentId:it.id,deduplicationKey:'synthetic-linen-911'},employee);
  await post(`/work/${work.id}/fulfilment`,{catalogId:itItem.id,beneficiaryId:'employee',purpose:'synthetic-linen-912'},employee);
  assert.equal((await api(`/work/${work.id}/fulfilment`,{catalogId:facilitiesItem.id,beneficiaryId:'employee',purpose:'synthetic-linen-913'},employee)).status,409);
  const snapshot=(await get(`/work/${work.id}/catalog-requests`,employee)).items.find(f=>f.catalogSnapshot.catalogId===itItem.id).catalogSnapshot;
  assert.equal(snapshot.departmentId,it.id);
  const mixed=await post('/catalog-bundles',{name:'synthetic-linen-914',catalogIds:[itItem.id,facilitiesItem.id]});
  const refused=await api(`/catalog-bundles/${mixed.id}/request`,{expectedRevision:mixed.revision,departmentId:it.id,purpose:'synthetic-linen-915',deduplicationKey:'synthetic-linen-915'},employee);
  assert.equal(refused.status,422); assert.match(JSON.stringify(refused.value),/department/i);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_records WHERE workspace_id=? AND dedup_key=?').bind(workspace,'synthetic-linen-915').first()).n,0);
  const second=await item('synthetic-linen-916',it.id);
  const same=await post('/catalog-bundles',{name:'synthetic-linen-917',catalogIds:[itItem.id,second.id]});
  const accepted=await post(`/catalog-bundles/${same.id}/request`,{expectedRevision:same.revision,departmentId:it.id,purpose:'synthetic-linen-918',deduplicationKey:'synthetic-linen-918'},employee);
  assert.ok(accepted);
  const movable=portal.find(c=>c.id===facilitiesItem.id);
  await post(`/catalog/${facilitiesItem.id}/form`,{name:movable.name,form:movable.form,revision:movable.revision,departmentId:it.id},undefined,200);
  assert.equal((await api(`/work/${work.id}/fulfilment`,{catalogId:facilitiesItem.id,catalogRevision:movable.revision,beneficiaryId:'employee',purpose:'synthetic-linen-919'},employee)).status,409);

  const article=await post('/knowledge',{title:'synthetic-linen-920',body:'synthetic-linen-920',scope:'operators',review:true,expiresAt:'2030-01-01T00:00:00Z',departmentId:facilities.id});
  assert.ok(!(await get('/knowledge?q=synthetic-linen-920',agent)).items.some(a=>a.id===article.id));
  assert.equal((await api('/knowledge',{id:article.id,revision:1,title:'synthetic-linen-921',body:'synthetic-linen-921',scope:'operators',review:true,expiresAt:'2030-01-01T00:00:00Z'},agent)).status,404);
  const publicArticle=await post('/knowledge',{title:'synthetic-linen-922',body:'synthetic-linen-922',scope:'employees',review:true,expiresAt:'2030-01-01T00:00:00Z',departmentId:facilities.id});
  assert.ok((await get('/knowledge?q=synthetic-linen-922',employee)).items.some(a=>a.id===publicArticle.id));
  assert.equal((await get(`/knowledge?departmentId=${it.id}`,employee)).items.some(a=>a.id===publicArticle.id),false);

  const staffArticle=await post('/knowledge',{title:'synthetic-linen-932',body:'synthetic-linen-932',scope:'hr',review:true,expiresAt:'2030-01-01T00:00:00Z',departmentId:people.id});
  assert.ok((await get('/knowledge?q=synthetic-linen-932',hr)).items.some(a=>a.id===staffArticle.id));
  assert.ok(!(await get('/knowledge?q=synthetic-linen-932',agent)).items.some(a=>a.id===staffArticle.id));
  // Identical resolved sources in another department remain unavailable through detection and direct draft reads.
  for(let i=0;i<3;i++) {
    const source=await post('/work',{title:'synthetic-linen-933',body:'synthetic-linen-933',departmentId:facilities.id,deduplicationKey:`synthetic-linen-${934+i}`},employee);
    const current=(await get(`/work/${source.id}`)).work;
    await post(`/work/${source.id}/commands`,{revision:current.revision,command:'close',resolutionCode:'Solved (workaround)',reason:'synthetic-linen-937'},undefined,200);
  }
  const detected=await post('/knowledge-drafts/detect',{},undefined,200);
  const candidate=detected.items.find(d=>d.title.includes('synthetic-linen-933'));
  assert.ok(candidate);
  assert.ok(!(await post('/knowledge-drafts/detect',{},agent,200)).items.some(d=>d.id===candidate.id));
  assert.equal((await api(`/knowledge-drafts/${candidate.id}`,undefined,agent)).status,404);

  const policy=async(name,departmentId,minutes)=>post('/sla-policies',{name,departmentId,position:1,firstResponseMinutes:minutes,nextResponseMinutes:minutes*2,resolutionMinutes:minutes*4});
  const itPolicy=await policy('synthetic-linen-923',it.id,60); await policy('synthetic-linen-924',facilities.id,120);
  assert.ok((await get('/sla-policies',agent)).items.some(p=>p.id===itPolicy.id));
  assert.ok((await get('/sla-policies',agent)).items.every(p=>p.departmentId===it.id));
  await post('/work-routing/rules',{name:'synthetic-linen-925',position:1,departmentId:it.id,groupId:group.id});
  await post('/work-routing/rules',{name:'synthetic-linen-926',position:1,departmentId:facilities.id,groupId:otherGroup.id});
  assert.equal((await api('/work-routing/rules',{name:'synthetic-linen-927',position:2,departmentId:it.id,groupId:otherGroup.id})).status,422);
  assert.ok((await get('/work-routing',agent)).rules.every(r=>r.departmentId===it.id));
  const view=await post('/work-views',{name:'synthetic-linen-928',shared:true,departmentId:facilities.id,filters:{},sort:'updated'});
  assert.equal((await api(`/work-views/${view.id}/work`,undefined,agent)).status,404);
  const routed=await post('/work',{title:'synthetic-linen-929',body:'synthetic-linen-929',departmentId:it.id,deduplicationKey:'synthetic-linen-929'},employee);
  assert.equal((await get(`/work/${routed.id}`)).work.group_id,group.id);
  const classify=async id=>{
    const current=(await get(`/work/${id}`)).work;
    const c=await db.prepare('SELECT revision FROM work_classifications WHERE workspace_id=? AND work_id=?').bind(workspace,id).first();
    await post(`/work/${id}/classification/override`,{type:'incident',category:'hardware',subcategory:'printer',impact:'medium',urgency:'high',priority:'P2',revision:c?.revision??0,workRevision:current.revision,reason:'synthetic-linen-930'},undefined,200);
  };
  await classify(routed.id);
  const before=await get(`/work/${routed.id}/sla`);
  assert.equal(before.policy.id,itPolicy.id);
  const current=(await get(`/work/${routed.id}`)).work;
  await post(`/work/${routed.id}/department`,{revision:current.revision,departmentId:facilities.id,reason:'synthetic-linen-931'},undefined,200);
  await classify(routed.id);
  const after=await get(`/work/${routed.id}/sla`);
  assert.equal(after.policy.id,before.policy.id); assert.equal(after.resolution.dueAt,before.resolution.dueAt);
  assert.equal((await api(`/work/${routed.id}/sla`,undefined,agent)).status,404);
  const report=await get('/reports/work?from=2026-01-01T00:00:00Z&to=2030-01-01T00:00:00Z&timezone=Australia/Brisbane',agent);
  assert.ok(!report.rows.some(r=>r.id===routed.id)); assert.ok(!report.sla.rows.some(r=>r.workId===routed.id));
  await membership(it.id,agentId,false);
  assert.equal((await get('/work-groups',agent)).items.some(g=>g.id===group.id),false);
  assert.equal((await get('/work-routing',agent)).rules.some(r=>r.departmentId===it.id),false);
  assert.equal((await api(`/work-groups/${group.id}/queue`,undefined,agent)).status,404);
  console.log('PASS DESK-011 department operations: catalog admission and atomic bundles, versioned moves, staff knowledge, routing/groups/views, scoped SLA and frozen handoff clock, live membership withdrawal');
}

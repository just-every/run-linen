import assert from 'node:assert/strict';
export async function assetContractChecks(api,db) {
  const check=(response,status=200)=>{assert.equal(response.status,status,JSON.stringify(response));return response.value;};
  const service=check(await api('/services',{name:'Managed laptops',description:'Employee laptop care',businessImpact:'Work availability',source:'IT service register',observedAt:new Date().toISOString()}),201);
  const vendor=check(await api('/suppliers',{name:'Apple enterprise support',services:[service.id],contract:'AppleCare purchase PO-1042',currency:'USD',cost:249,costPeriod:'annual',renewalAt:new Date(Date.now()+86400000*20).toISOString()}),201);
  const device=check(await api('/assets',{serial:'APPLE-DEN-1042',source:'PO-1042'}),201);
  const path=`/assets/${device.id}/contracts`,start=new Date(Date.now()-86400000*30).toISOString(),end=new Date(Date.now()+86400000*10).toISOString();
  const terms={kind:'warranty',name:'AppleCare for MacBook',vendorId:vendor.id,reference:'https://records.example.test/PO-1042/applecare.pdf',coverage:'Hardware repairs and battery; accidental damage fee applies',startsAt:start,expiresAt:end,alertDays:30,manufacturer:'apple'};
  check(await api(path,terms),201);
  for (const kind of ['purchase','lease','support']) check(await api(path,{...terms,kind,name:`MacBook ${kind}`,expiresAt:kind==='purchase'?undefined:end}),201);
  check(await api(path,{...terms,reference:'javascript:alert(1)'}),422);
  check(await api(path,{...terms,expiresAt:start}),422);
  check(await api(path,{...terms,expiresAt:undefined}),422);
  check(await api(path,{...terms,vendorId:service.id}),404);
  check(await api(path,terms,{'x-workspace':'b'}),404);
  const employee={'x-user':'employee','x-roles':'["employee"]'};
  check(await api(path,undefined,employee),403);
  check(await api(path,terms,employee),403);
  const contracts=check(await api(path));
  assert.equal(contracts.items.length,4,'ASSET-007: all four contract kinds persist');
  const warranty=contracts.items.find(c=>c.kind==='warranty');
  assert.equal(warranty.vendor.id,vendor.id);
  assert.equal(warranty.coverage,terms.coverage);
  assert.equal(warranty.status,'active');assert.equal(warranty.alert,'expiring');
  assert.equal(new URL(warranty.manufacturerLookup).hostname,'checkcoverage.apple.com');
  assert.ok(warranty.recorded_by&&warranty.recorded_at);
  const work=check(await api('/work',{title:'MacBook repair',body:'Battery replacement',deduplicationKey:'ASSET-007-repair'}),201);
  const repairs=`/work/${work.id}/repair-assets`;
  check(await api(repairs,{assetId:device.id}));
  check(await api(repairs,{assetId:device.id}));
  const readback=check(await api(repairs));
  assert.equal(readback.items.length,1,'ASSET-007 repair link is idempotent');
  const events=check(await api(`/assets/${device.id}/history`)).events;
  assert.equal(events.filter(e=>e.action==='asset_contract_recorded').length,4);
  assert.equal(events.filter(e=>e.action==='asset_repair_linked').length,1,'DESK-017 repeated repair link adds no history');
  assert.deepEqual(events.find(e=>e.action==='asset_repair_linked').changes.find(c=>c.field==='link'),{field:'link',before:null,after:{kind:'ticket',id:work.id}});
  assert.equal(events.find(e=>e.action==='asset_contract_recorded').changes.find(c=>c.field==='coverage').after,terms.coverage,'DESK-017 contract history retains its original coverage');
  const restrictedWork=check(await api('/work',{title:'synthetic-linen-706',body:'synthetic-linen-707',sensitivity:'restricted',deduplicationKey:'synthetic-linen-708'}),201);
  check(await api(`/work/${restrictedWork.id}/repair-assets`,{assetId:device.id}));
  const ownerEvents=check(await api(`/assets/${device.id}/history`)).events;
  const privateEvent=ownerEvents.find(e=>e.changes.some(c=>c.field==='link'&&c.after?.id===restrictedWork.id));
  assert.ok(privateEvent);
  await db.prepare('UPDATE memberships SET roles_json=? WHERE workspace_id=? AND user_id=?').bind('["operator"]','a','stranger').run();
  try {
    const scoped=check(await api(`/assets/${device.id}/history`,undefined,{'x-user':'stranger','x-roles':'["operator"]'})).events;
    assert.ok(scoped.some(e=>e.changes.some(c=>c.field==='link'&&c.after?.id===work.id)),'DESK-017 current staff can see a normal ticket asset link');
    assert.ok(!scoped.some(e=>e.id===privateEvent.id),'DESK-017 asset history hides the entire out-of-scope source event, including actor/time');
    assert.ok(!JSON.stringify(scoped).includes(restrictedWork.id));
    const project=check(await api('/projects',{name:'synthetic-linen-821',ownerId:'owner'}),201).project;
    const task=check(await api(`/projects/${project.id}/tasks`,{title:'synthetic-linen-822',ownerId:'owner',dueDate:'2030-10-20'}),201);
    const link={kind:'asset',targetId:device.id,taskId:task.id};
    check(await api(`/projects/${project.id}/links`,{items:[link]}));
    const taskEvents=()=>api(`/assets/${device.id}/history`,undefined,{'x-user':'stranger','x-roles':'["operator"]'});
    const before=check(await taskEvents()).events.find(e=>e.changes.some(c=>c.field==='link'&&c.after?.kind==='task'&&c.after.id===task.id));
    assert.ok(before,'Current project staff read the original reverse task link');
    assert.deepEqual(before.changes,[{field:'link',before:null,after:{kind:'task',id:task.id}}]);
    assert.ok(!JSON.stringify(before).includes('synthetic-linen-821')&&!JSON.stringify(before).includes('synthetic-linen-822'),'No project or task title is copied');
    check(await api(`/projects/${project.id}/links`,{items:[link]}));
    check(await api(`/projects/${project.id}/links`,{items:[{...link,taskId:'synthetic-linen-823'}]}),422);
    assert.deepEqual(check(await taskEvents()).events.filter(e=>e.id===before.id),[before],'Replay and refusal add no event');
    const taskHistory=check(await api(`/projects/${project.id}/tasks/${task.id}/activity`)).items;
    assert.equal(taskHistory.filter(e=>e.action==='Task linked').length,1,'Both timeline sides append once');
    // A cleared historical event has no source proof even while a current project link exists.
    await db.prepare("INSERT INTO audit_events VALUES(?, 'a','owner','work.asset_linked',?,?,?)").bind('synthetic-linen-824',device.id,JSON.stringify({redacted:'erasure',redactedAt:new Date().toISOString()}),new Date().toISOString()).run();
    assert.ok(!check(await taskEvents()).events.some(e=>e.id==='synthetic-linen-824'),'Current links never reconstruct a cleared source');
    await db.prepare('UPDATE memberships SET roles_json=? WHERE workspace_id=? AND user_id=?').bind('["employee"]','a','stranger').run();
    check(await taskEvents(),403);
    check(await api(`/projects/${project.id}/tasks/${task.id}/activity`,undefined,{'x-user':'stranger','x-roles':'["operator"]'}),403);
    await db.prepare('UPDATE memberships SET roles_json=? WHERE workspace_id=? AND user_id=?').bind('["operator"]','a','stranger').run();
    // Source removal is a persisted fixture transition; all assertions use the public history door.
    await db.prepare('DELETE FROM work_project_tasks WHERE workspace_id=? AND id=?').bind('a',task.id).run();
    assert.ok(!check(await taskEvents()).events.some(e=>e.id===before.id),'A missing current task withdraws the entire reverse event, actor and time included');
    assert.ok(!check(await api(`/assets/${device.id}/history`)).events.some(e=>e.id===before.id),'Known missing sources remain unavailable to owners too');

  } finally {
    await db.prepare('UPDATE memberships SET roles_json=? WHERE workspace_id=? AND user_id=?').bind('["employee"]','a','stranger').run();
  }


  assert.equal(readback.items[0].asset.serial,'APPLE-DEN-1042');
  assert.equal(readback.items[0].items.find(c=>c.kind==='warranty').alert,'expiring');
  check(await api(repairs,undefined,employee),403);
  check(await api(repairs,undefined,{'x-workspace':'b'}),404);
  check(await api(path,{...terms,name:'Expired support',kind:'support',startsAt:new Date(Date.now()-86400000*60).toISOString(),expiresAt:new Date(Date.now()-86400000).toISOString()}),201);
  const expired=check(await api(repairs)).items[0].items.find(c=>c.name==='Expired support');
  assert.equal(expired.status,'expired');assert.equal(expired.alert,'expired');
  console.log('PASS ASSET-007: asset/vendor purchase, lease, warranty and support records, manufacturer check door, repair coverage, current expiry alerts and scoped access');
}

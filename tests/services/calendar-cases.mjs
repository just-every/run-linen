import assert from 'node:assert/strict';
export async function calendarChecks(request,db) {
  const owner={},agent={'x-user':'operator','x-roles':'["operator"]'},employee={'x-user':'employee','x-roles':'["employee"]'};
  const ok=async(method,path,body,headers=owner)=>{const r=await request(method,path,body,headers);assert.ok(r.status<300,JSON.stringify(r));return r.json;};
  const auditRows=async()=> (await db.prepare('SELECT id,workspace_id,actor_id,action,target FROM audit_events').all()).results;
  const auditedRead=async(path,headers,workspaceId,actorId)=>{
    const before=new Set((await auditRows()).map(row=>row.id));
    const response=await request('GET',path,undefined,headers);
    assert.equal(response.status,200,JSON.stringify(response));
    const added=(await auditRows()).filter(row=>!before.has(row.id)).map(({id,...row})=>row);
    assert.deepEqual(added,[{workspace_id:workspaceId,actor_id:actorId,
      action:path.startsWith('/change-calendar.ics')?'change-calendar.export':'change-calendar.read',target:'global-calendar'}],
    'CHANGE-009 each calendar read or export records its current workspace, actor, action and target');
    return response;
  };
  const service=await ok('POST','/services',{name:'Calendar payroll CI',description:'Payroll workflow',businessImpact:'Payroll blocked',source:'Reviewed CI register',observedAt:new Date().toISOString(),visibility:'workspace'});
  const otherCI=await ok('POST','/services',{name:'Calendar test CI',description:'Test workflow',businessImpact:'Test cohort only',source:'Reviewed CI register',observedAt:new Date().toISOString(),visibility:'workspace'});
  const body={title:'Year-end payroll upgrade',risk:'Reviewed upgrade',impact:'Payroll downtime',services:[service.id],window:{start:'2030-12-27T01:00:00.000Z',end:'2030-12-27T02:00:00.000Z'},cohorts:['Denver'],canaryCohorts:['Denver'],implementation:{release:'2031'},compensation:{release:'2030'}};
  const freezeBody={title:'Year-end freeze',kind:'freeze',window:{start:'2030-12-24T00:00:00.000Z',end:'2031-01-02T00:00:00.000Z'},services:[service.id],active:true};
  assert.equal((await request('POST','/change-windows',freezeBody,agent)).status,403,'CHANGE-004 only owner manages freeze/maintenance policy');
  const freeze=await ok('POST','/change-windows',freezeBody);
  const refused=await request('POST','/changes',body);assert.equal(refused.status,409);assert.equal(refused.json.error.code,'calendar_frozen','CHANGE-004 year-end freeze refuses scheduling without emergency authority');
  assert.equal((await request('POST','/changes',{...body,emergency:true,emergencyReason:'Operator self-assertion'},agent)).status,409,'CHANGE-004 emergency flag is not scheduling authority');
  assert.equal((await request('POST','/changes',{...body,emergencySchedulingActor:'owner'},agent)).status,409,'CHANGE-004 submitted actor identity cannot mint an override');
  const emergency=await ok('POST','/changes',{...body,emergency:true,emergencyReason:'Current owner authorizes the urgent payroll repair'});
  assert.equal(emergency.data.emergencySchedulingActor,'owner');
  assert.equal((await request('PATCH','/changes/'+emergency.id,{revision:emergency.revision,title:'Edit without an explicit emergency decision'})).status,409,'CHANGE-004 an edit cannot silently carry prior emergency scheduling authority');
  const outside=await ok('POST','/changes',{...body,title:'After-freeze payroll upgrade',window:{start:freezeBody.window.end,end:'2031-01-02T01:00:00.000Z'}});
  assert.equal((await request('PATCH','/changes/'+outside.id,{revision:outside.revision,window:body.window},agent)).status,409,'CHANGE-004 edit cannot enter freeze');
  assert.equal((await ok('GET','/changes/'+outside.id)).revision,outside.revision,'CHANGE-004 refused edit applies nothing');
  const unrelated=await ok('POST','/changes',{...body,title:'Unrelated CI upgrade',services:[otherCI.id]});
  const calendar=(await auditedRead('/change-calendar?from=2030-12-01T00:00:00Z&to=2031-02-01T00:00:00Z&timezone=America%2FDenver',owner,'w1','owner')).json;
  assert.equal(calendar.timezone,'America/Denver');assert.ok(calendar.windows.some(r=>r.id===freeze.id));
  assert.ok(calendar.conflicts.some(c=>c.changeId===emergency.id&&c.otherId===freeze.id&&c.kind==='freeze'),'CHANGE-004 calendar shows an emergency overlap with the freeze');
  assert.ok(!calendar.conflicts.some(c=>c.changeId===unrelated.id&&c.otherId===freeze.id),'CHANGE-004 CI-specific freezes do not block unrelated CIs');
  const conflictA=await ok('POST','/changes',{...body,title:'Calendar overlap A',window:{start:'2031-02-01T01:00:00.000Z',end:'2031-02-01T03:00:00.000Z'}});
  const conflictB=await ok('POST','/changes',{...body,title:'Calendar overlap B',window:{start:'2031-02-01T02:00:00.000Z',end:'2031-02-01T04:00:00.000Z'}});
  const maintenance=await ok('POST','/change-windows',{title:'Payroll maintenance',kind:'maintenance',window:conflictA.data.window,services:[service.id],active:true});
  const collisions=await ok('GET','/change-calendar?from=2031-02-01T00:00:00Z&to=2031-02-02T00:00:00Z&timezone=UTC');
  assert.ok(collisions.conflicts.some(c=>c.changeId===conflictA.id&&c.otherId===conflictB.id&&c.kind==='change'),'CHANGE-004 overlapping changes on the same CI conflict, including drafts');
  assert.ok(collisions.windows.some(r=>r.id===maintenance.id),'CHANGE-004 maintenance appears in the same calendar');
  const hidden=await ok('POST','/changes',{...body,title:'Secret competing change',window:conflictA.data.window,visibility:'restricted'});
  const scoped=await ok('GET','/change-calendar?from=2031-02-01T00:00:00Z&to=2031-02-02T00:00:00Z&timezone=UTC',undefined,agent);
  assert.ok(!JSON.stringify(scoped).includes(hidden.id));assert.ok(!JSON.stringify(scoped).includes(hidden.data.title),'CHANGE-004 hidden conflict never reveals its title, ID or count');
  assert.equal(scoped.warnings.filter(w=>w.changeId===conflictA.id).length,1,'CHANGE-004 one generic warning per affected visible change');
  const injection=await ok('POST','/changes',{...body,title:'Payroll; review, driver\nBEGIN:VEVENT '+ '界'.repeat(80),window:conflictA.data.window});
  const feedPath='/change-calendar.ics?from=2031-02-01T00:00:00Z&to=2031-02-02T00:00:00Z&timezone=America%2FDenver';
  const feed=await auditedRead(feedPath,agent,'w1','operator');assert.equal(feed.status,200);
  assert.ok(feed.headers['content-type'].startsWith('text/calendar'),'CHANGE-004 real ICS response');
  const unfolded=feed.json.replace(/\r\n /g,'');
  assert.ok(unfolded.includes('SUMMARY:Payroll\\; review\\, driver\\nBEGIN:VEVENT '),'CHANGE-004 feed text escapes properties and newlines');
  assert.ok(unfolded.includes('STATUS:TENTATIVE'),'CHANGE-004 planned ICS entries never assert provider completion');
  assert.ok(unfolded.includes('SEQUENCE:1'),'CHANGE-004 ICS records retain revision sequence');
  assert.ok(unfolded.includes('DTSTART:20310201T010000Z'),'CHANGE-004 calendar feed uses UTC instants');
  for(const line of feed.json.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75,'CHANGE-004 UTF-8 folding never breaks the ICS octet limit');
  assert.ok(!feed.json.includes(hidden.data.title),'CHANGE-004 ICS shares current source privacy');
  assert.equal(feed.headers['cache-control'],'private, no-store');
  assert.equal((await request('GET',feedPath,undefined,employee)).json.includes('BEGIN:VEVENT'),false,'CHANGE-004 employee feed omits operator changes');
  for(const [headers,workspaceId,actorId] of [[owner,'w1','owner'],[agent,'w1','operator'],[{'x-workspace':'w2'},'w2','owner']]){
    const view=await auditedRead(feedPath.replace('.ics',''),headers,workspaceId,actorId);
    const exported=await auditedRead(feedPath,headers,workspaceId,actorId);
    assert.ok(Array.isArray(view.json.windows));
    assert.ok(exported.json.startsWith('BEGIN:VCALENDAR'));
  }
  const events=ics=>new Map(ics.replace(/\r\n /g,'').split('BEGIN:VEVENT\r\n').slice(1).map(block=>{
    const event=block.split('END:VEVENT')[0];
    return [event.match(/^UID:(.+)$/m)[1].trim(),event];
  }));
  const activeEvents=events((await auditedRead(feedPath,agent,'w1','operator')).json);
  const maintenanceEntry=[...activeEvents].find(([,event])=>event.includes('SUMMARY:'+maintenance.data.title+'\r\n'));
  assert.ok(maintenanceEntry,'CHANGE-009 the real active maintenance window appears in the feed');
  const [maintenanceUid]=maintenanceEntry;
  const unrelatedEvents=new Map([...activeEvents].filter(([uid])=>uid!==maintenanceUid));
  assert.ok(unrelatedEvents.size>=2,'CHANGE-009 lifecycle proof retains real unrelated calendar entries');
  const windowEvents=async()=> (await db.prepare('SELECT * FROM svc_events WHERE record_id=?').bind(maintenance.id).all()).results;
  const historyBeforeRefusal=await windowEvents();
  assert.equal((await request('POST','/change-windows/'+maintenance.id,{...maintenance.data,revision:maintenance.revision,active:false},agent)).status,403,
    'CHANGE-009 an operator cannot deactivate an owner-managed window');
  assert.deepEqual(await windowEvents(),historyBeforeRefusal,'CHANGE-009 refused window update adds no successful event');
  assert.deepEqual(events((await auditedRead(feedPath,agent,'w1','operator')).json),activeEvents,
    'CHANGE-009 refused window update preserves the complete feed');
  const inactive=await ok('POST','/change-windows/'+maintenance.id,{...maintenance.data,revision:maintenance.revision,active:false});
  assert.equal(inactive.data.active,false);
  const inactiveView=(await auditedRead(feedPath.replace('.ics',''),owner,'w1','owner')).json;
  assert.equal(inactiveView.windows.find(row=>row.id===maintenance.id).data.active,false,
    'CHANGE-009 deactivation retains the window as inactive policy');
  const inactiveEvents=events((await auditedRead(feedPath,agent,'w1','operator')).json);
  assert.equal(inactiveEvents.has(maintenanceUid),false,'CHANGE-009 inactive windows do not enter the feed');
  assert.deepEqual(inactiveEvents,unrelatedEvents,'CHANGE-009 deactivation preserves every unrelated event');
  const reactivated=await ok('POST','/change-windows/'+maintenance.id,{...inactive.data,revision:inactive.revision,active:true});
  assert.equal(reactivated.data.active,true);
  const reactivatedEvents=events((await auditedRead(feedPath,agent,'w1','operator')).json);
  assert.ok(reactivatedEvents.get(maintenanceUid)?.includes('SUMMARY:'+maintenance.data.title+'\r\n'),
    'CHANGE-009 explicit current-owner reactivation restores the same window UID');
  assert.ok(reactivatedEvents.get(maintenanceUid).includes('SEQUENCE:'+reactivated.revision+'\r\n'));
  assert.deepEqual(new Map([...reactivatedEvents].filter(([uid])=>uid!==maintenanceUid)),unrelatedEvents,
    'CHANGE-009 reactivation preserves every unrelated event');
  console.log('PASS CHANGE-009 calendarChecks: attributed privileged reads and exports; active, inactive and explicitly reactivated stable window UID with unrelated entries preserved');
  const before=await ok('GET',feedPath,undefined,agent),after=await ok('GET',feedPath,undefined,agent);
  assert.deepEqual(before.match(/UID:[^\r\n]+/g),after.match(/UID:[^\r\n]+/g),'CHANGE-004 event identities survive feed refresh');
  const employeeView=await ok('GET','/change-calendar?from=2030-12-01T00:00:00Z&to=2031-02-02T00:00:00Z&timezone=UTC',undefined,employee);
  assert.equal(employeeView.changes.length,0);assert.equal(employeeView.windows.length,0,'CHANGE-004 calendar inherits existing source readership');
  assert.equal((await request('GET','/change-calendar?from=2030-02-30T00:00:00Z&to=2031-01-01T00:00:00Z&timezone=UTC')).status,400);
  assert.equal((await request('GET','/change-calendar?from=2030-01-01T00:00:00Z&to=2031-01-01T00:00:00Z&timezone=Invalid')).status,400);
  const updated=await ok('POST','/change-windows/'+freeze.id,{...freezeBody,revision:freeze.revision,active:false});
  assert.equal((await request('POST','/change-windows/'+freeze.id,{...freezeBody,revision:freeze.revision})).status,409,'CHANGE-004 stale policy edits are refused');
  await ok('POST','/change-windows/'+freeze.id,{...freezeBody,revision:updated.revision,active:true});
  // A grant holder who loses the owner role no longer supplies emergency scheduling authority.
  await db.prepare("UPDATE memberships SET roles_json='[\"operator\"]' WHERE workspace_id='w1' AND user_id='owner'").run();
  assert.equal((await request('POST','/changes',{...body,emergency:true,emergencyReason:'Stale owner'},owner)).status,409,'CHANGE-004 current membership, not claimed owner role, controls override');
  await db.prepare("UPDATE memberships SET roles_json='[\"owner\"]' WHERE workspace_id='w1' AND user_id='owner'").run();
  console.log('PASS CHANGE-004 public calendar: year-end freeze/emergency scheduling, edits, CI scope, half-open bounds, maintenance, draft overlaps, scoped/generic conflicts, CAS and current roles');
  return {freezeId:freeze.id,emergencyId:emergency.id};
}

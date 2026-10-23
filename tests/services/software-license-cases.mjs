import assert from 'node:assert/strict';

export async function softwareLicenseChecks(request,db) {
  const headers=user=>({'x-user':user,'x-roles':JSON.stringify([user==='owner'?'owner':user==='operator'?'operator':'employee'])});
  const api=async(method,path,body,user='owner',status=200)=>{const r=await request(method,path,body,headers(user));assert.equal(r.status,status,`ASSET-006 ${method} ${path} ${JSON.stringify(r.json)}`);return r.json;};
  const fixture=body=>api('POST','/fixture/software-license',body);
  await fixture({});
  const service=await api('POST','/services',{name:'Software estate',description:'Software subscriptions and desktop applications',businessImpact:'Employee software',source:'owner',observedAt:new Date().toISOString(),visibility:'operators'},'owner',201);
  const contract=(seats,days=89)=>({seats,currency:'USD',renewalAt:new Date(Date.now()+days*86400000).toISOString(),annualCostUsd:12000,trueUpUnitUsd:100,reference:'Synthetic purchase agreement'});
  const connect=(provider,config)=>api('POST','/software-license-connections',{provider,name:provider+' software',config,secret:{clientId:'synthetic-linen-18006',clientSecret:'synthetic-linen-18007'},consent:true,reason:'Read software inventory and execute separately granted changes'},'owner',201);
  await api('POST','/software-license-connections',{provider:'jamf',name:'Denied',config:{origin:'https://localhost'},secret:{clientId:'synthetic-linen-18008',clientSecret:'synthetic-linen-18009'},consent:true,reason:'No'},'owner',422);
  await api('POST','/software-license-connections',{},'operator',403);
  const zoom=await connect('zoom',{accountId:'synthetic-linen-18002'}),graph=await connect('microsoft-graph',{tenantId:'00000000-0000-0000-0000-000000000001'}),jamf=await connect('jamf',{origin:'https://synthetic-linen.jamfcloud.com'});
  const create=(name,publisher,metric,seats,sources,policy='managed')=>api('POST','/software-licenses',{name,publisher,ownerId:'owner',serviceId:service.id,metric,policy,contract:contract(seats),sourceBindings:sources},'owner',201);
  const get=key=>api('GET','/software-licenses/'+key);
  const sync=async key=>api('POST',`/software-licenses/${key}/sync`,{revision:(await get(key)).revision});
  const grant=async(key,action,targets,overrides={})=>api('POST',`/software-licenses/${key}/grants`,{revision:(await get(key)).revision,action,targets,principalId:'owner',expiresAt:new Date(Date.now()+3600000).toISOString(),confirmed:true,reason:'Owner approved these exact software targets',...overrides});
  let license=await create('Zoom','Zoom','per-user',120,[{connectionId:zoom.id,kind:'zoom'},{connectionId:graph.id,kind:'entra-signins',appId:'00000000-0000-0000-0000-000000000002'}]);
  assert.equal(license.summary.consumed,null,'Contract alone never invents consumption');
  await api('GET','/software-licenses/'+license.id,undefined,'employee',403);
  const foreign=await request('GET','/software-licenses/'+license.id,undefined,{'x-workspace':'w2'});assert.equal(foreign.status,404);
  license=await sync(license.id);
  assert.equal(license.summary.entitled,120);assert.equal(license.summary.consumed,120);assert.equal(license.summary.activeUsers,95);assert.equal(license.summary.reclaimable,25);
  assert.ok((await fixture({})).calls.some(c=>c.path==='/v1.0/auditLogs/signIns'),'Real IdP reader reached network boundary');
  await api('POST',`/software-licenses/${license.id}/reclaim`,{revision:license.revision,grantVersion:1,userIds:['zoom-96']},'owner',403);
  await api('POST',`/software-licenses/${license.id}/grants`,{revision:license.revision,action:'reclaim',targets:['zoom-1'],principalId:'owner',expiresAt:new Date(Date.now()+60000).toISOString(),reason:'Active user cannot be reclaimed',confirmed:true},'owner',409);
  const selected=Array.from({length:10},(_,i)=>`zoom-${i+96}`);
  let approved=await grant(license.id,'reclaim',selected);
  const submitted=await api('POST',`/software-licenses/${license.id}/reclaim`,{revision:approved.revision,grantVersion:approved.data.grant.version,userIds:selected});
  assert.equal(submitted.operationIds.length,10);
  let current=await get(license.id);assert.equal(current.summary.consumed,120,'Submission does not invent updated provider counts');
  for(const operationId of submitted.operationIds){current=await get(license.id);await api('POST',`/software-licenses/${license.id}/effects/${operationId}/reconcile`,{revision:current.revision});}
  current=await get(license.id);assert.equal(current.summary.consumed,110);assert.equal(current.summary.reclaimable,15);assert.ok(current.effects.every(e=>e.state==='verified'));
  const reminded=await api('POST',`/software-licenses/${license.id}/renewal-reminders`,{revision:current.revision});assert.equal(reminded.queued,1);
  const reminder=await db.prepare('SELECT * FROM svc_outbox WHERE workspace_id=? AND id=?').bind('w1',reminded.data.reminders[0].notificationId).first();assert.equal(reminder.kind,'software-renewal');assert.equal(reminder.state,'pending');
  assert.equal((await api('POST',`/software-licenses/${license.id}/renewal-reminders`,{revision:reminded.revision})).queued,0,'Renewal replay never duplicates reminder');
  for(const days of [59,29]){current=await get(license.id);await api('PATCH',`/software-licenses/${license.id}`,{revision:current.revision,contract:contract(120,days)});current=await get(license.id);const result=await api('POST',`/software-licenses/${license.id}/renewal-reminders`,{revision:current.revision});assert.ok(result.data.reminders.some(r=>r.days===(days===59?60:30)));}

  // A lost response after a real network write is reconciled without replay.
  approved=await grant(license.id,'reclaim',['zoom-106']);await fixture({patchLost:'after-effect'});
  const unknown=await api('POST',`/software-licenses/${license.id}/reclaim`,{revision:approved.revision,grantVersion:approved.data.grant.version,userIds:['zoom-106']});
  current=await get(license.id);assert.equal(current.effects.find(e=>e.id===unknown.operationIds[0]).state,'unknown');
  const patchCount=(await fixture({})).calls.filter(c=>c.method==='PATCH').length;
  await api('POST',`/software-licenses/${license.id}/reclaim`,{revision:current.revision,grantVersion:approved.data.grant.version,userIds:['zoom-106']},'owner',409);
  assert.equal((await fixture({})).calls.filter(c=>c.method==='PATCH').length,patchCount);
  await api('POST',`/software-licenses/${license.id}/revoke-grant`,{revision:current.revision});
  current=await get(license.id);assert.equal((await api('POST',`/software-licenses/${license.id}/effects/${unknown.operationIds[0]}/reconcile`,{revision:current.revision})).state,'verified','Revocation stops effects while read-only reconciliation remains possible');
  await fixture({patchLost:null});

  // Same production routes: current connection/grant/hold/principal checks.
  approved=await grant(license.id,'reclaim',['zoom-107']);
  await db.prepare('UPDATE connections SET revision=revision+1 WHERE id=?').bind(zoom.id).run();
  await api('POST',`/software-licenses/${license.id}/reclaim`,{revision:approved.revision,grantVersion:approved.data.grant.version,userIds:['zoom-107']},'owner',409);
  await sync(license.id);approved=await grant(license.id,'reclaim',['zoom-107']);
  await db.prepare("INSERT INTO workspace_settings(workspace_id,settings_json) VALUES('w1','{\"executionHeld\":true}') ON CONFLICT(workspace_id) DO UPDATE SET settings_json=json_set(settings_json,'$.executionHeld',json('true'))").run();
  await api('POST',`/software-licenses/${license.id}/reclaim`,{revision:approved.revision,grantVersion:approved.data.grant.version,userIds:['zoom-107']},'owner',409);
  await db.prepare("UPDATE workspace_settings SET settings_json=json_set(settings_json,'$.executionHeld',json('false')) WHERE workspace_id='w1'").run();
  await fixture({revokeOwnerOnToken:true});
  await api('POST',`/software-licenses/${license.id}/reclaim`,{revision:approved.revision,grantVersion:approved.data.grant.version,userIds:['zoom-107']},'owner',403);
  await db.prepare("UPDATE memberships SET roles_json='[\"owner\"]' WHERE workspace_id='w1' AND user_id='owner'").run();
  assert.equal((await fixture({})).calls.filter(c=>c.method==='PATCH').length,patchCount,'Owner role loss during token request prevents the provider write');

  const jamfBinding={connectionId:jamf.id,kind:'jamf',aliases:[{title:'Adobe Acrobat Pro.app',publisher:'Adobe',productId:'com.adobe.Acrobat.Pro'}]};
  let acrobat=await create('Adobe Acrobat Pro','Adobe','per-device',25,[jamfBinding,{connectionId:graph.id,kind:'intune'}]);
  acrobat=await sync(acrobat.id);assert.equal(acrobat.summary.consumed,30,JSON.stringify(acrobat.summary));assert.equal(acrobat.summary.overLicensed,5);assert.equal(acrobat.summary.trueUpUsd,500);
  assert.equal(acrobat.data.complianceWork.length,5);assert.ok(acrobat.data.complianceWork.every(w=>w.personId==='employee'&&w.ownerId==='owner'));
  const obligation=await db.prepare('SELECT owner_id,state FROM work_obligations WHERE work_id=?').bind(acrobat.data.complianceWork[0].workId).first();assert.equal(obligation.owner_id,'owner');assert.equal(obligation.state,'pending');
  await fixture({staleInventory:true});acrobat=await sync(acrobat.id);assert.equal(acrobat.summary.consumed,null);assert.equal(acrobat.summary.fresh,false);
  await fixture({staleInventory:false});
  let perUser=await create('Acrobat user metric','Adobe','per-user',2,[{...jamfBinding,aliases:[{title:'Adobe Acrobat Pro.app',publisher:'Adobe',productId:'com.adobe.Acrobat.Pro'}]}]);
  perUser=await sync(perUser.id);assert.equal(perUser.summary.consumed,1);assert.equal(perUser.summary.underLicensed,1,'Per-user deduplicates the mapped user across devices');
  let ignored=await create('Ignored application','Adobe','per-device',0,[jamfBinding],'ignored');ignored=await sync(ignored.id);assert.equal(ignored.data.complianceWork.length,0);
  let concurrent=await create('Concurrent application','Adobe','concurrent',5,[jamfBinding]);concurrent=await sync(concurrent.id);assert.equal(concurrent.summary.consumed,null);
  concurrent=await api('POST',`/software-licenses/${concurrent.id}/concurrency-observations`,{revision:concurrent.revision,peak:7,source:'License server peak report',evidence:'Signed reporting period record',observedAt:new Date().toISOString()});assert.equal(concurrent.summary.overLicensed,2);assert.match(concurrent.summary.basis,/Owner-recorded/);

  let prohibited=await create('Unapproved Tool','Synthetic Publisher','per-device',0,[{connectionId:jamf.id,kind:'jamf',aliases:[{title:'Unapproved Tool.app',publisher:'Synthetic Publisher',productId:'com.synthetic-linen.unapproved'}],removalGroupId:'20',removalPolicyId:'21',removalPackageId:'22'}],'prohibited');
  prohibited=await sync(prohibited.id);assert.equal(prohibited.data.complianceWork.length,1);
  const notice=(await api('GET','/software-license-notices',undefined,'employee')).items.find(n=>n.workId===prohibited.data.complianceWork[0].workId);assert.ok(notice);assert.equal(notice.reason,'prohibited');assert.equal(Object.hasOwn(notice,'contract'),false);
  assert.equal((await api('GET','/software-license-notices',undefined,'operator')).items.length,0,'Other employees do not see another member’s notices');
  const installationId=prohibited.data.observation.installations[0].id;
  approved=await grant(prohibited.id,'remove-app',[installationId]);
  const removal=await api('POST',`/software-licenses/${prohibited.id}/removals`,{revision:approved.revision,grantVersion:approved.data.grant.version,installationId});
  current=await get(prohibited.id);assert.equal((await api('POST',`/software-licenses/${prohibited.id}/effects/${removal.operationIds[0]}/reconcile`,{revision:current.revision})).state,'unverified');
  await fixture({advanceInventory:true,missingDevice:true});current=await get(prohibited.id);assert.equal((await api('POST',`/software-licenses/${prohibited.id}/effects/${removal.operationIds[0]}/reconcile`,{revision:current.revision})).state,'unverified','Missing device cannot establish absence');
  await fixture({missingDevice:false});current=await get(prohibited.id);assert.equal((await api('POST',`/software-licenses/${prohibited.id}/effects/${removal.operationIds[0]}/reconcile`,{revision:current.revision})).state,'verified');
  assert.equal((await get(prohibited.id)).data.observation.installations.length,0);
  assert.equal((await fixture({})).calls.filter(c=>c.method==='PUT').length,1,'Only the original Jamf request was sent');
  await fixture({hostileCursor:true});await api('POST',`/software-licenses/${acrobat.id}/sync`,{revision:(await get(acrobat.id)).revision},'owner',502);await fixture({hostileCursor:false});
  assert.equal((await get(acrobat.id)).summary.fresh,false,'A failed complete snapshot is visible as unknown');
  const privateProviderId=prohibited.data.observation.installations[0].id;
  const erasure=await api('POST','/adoption/erase',{identity:'employee'});assert.ok(erasure.completedDomains.includes('services'),'Actual product erasure completes the software domain');
  const erased=await get(prohibited.id);assert.equal(erased.data.observation,null);assert.equal(erased.data.grant,null);assert.deepEqual(erased.data.effectTargets,[]);assert.deepEqual(erased.data.complianceWork,[]);assert.equal(erased.data.executionHeld,true);
  const originalValues=(await db.prepare('SELECT data_json FROM svc_events WHERE workspace_id=? AND record_id=?').bind('w1',prohibited.id).all()).results;
  assert.ok(originalValues.every(row=>!row.data_json.includes(privateProviderId)),'Provider opaque identity is erased from typed original history');
  await api('POST',`/software-licenses/${prohibited.id}/sync`,{revision:erased.revision},'owner',409);
  assert.ok((await request('GET','/software-license-notices',undefined,headers('employee'))).status>=400,'Erased identity cannot read retained notices');
  assert.equal((await db.prepare('SELECT count(*) n FROM svc_software_guards').first()).n,0,'All CAS guards are transaction local');
}

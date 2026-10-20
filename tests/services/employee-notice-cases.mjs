import assert from 'node:assert/strict';

/** CHANNEL-008 public-route assertions: approved cohorts, live scope, lifecycle and honest email outcomes. */
export async function employeeNoticeChecks(request, db) {
  const as = user => ({ 'x-user': user, 'x-roles': JSON.stringify([user === 'owner' ? 'owner' : user === 'operator' ? 'operator' : 'employee']) });
  const check = (r, status = 200) => { assert.equal(r.status, status, 'CHANNEL-008 ' + JSON.stringify(r)); return r.json; };
  const api = async (method, path, body, user = 'owner', status = 200) => check(await request(method, path, body, as(user)), status);
  for (const [user,name] of [['employee','Sales teammate'],['outsider','Engineering teammate'],['owner','Owner'],['operator','Operator']]) {
    await db.prepare('INSERT INTO users VALUES(?,?,?)').bind(user, user+'@example.test', name).run();
  }
  await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('w1','outsider','["employee"]').run();
  await db.prepare('INSERT INTO work_requester_groups VALUES(?,?,?,?,?)').bind('sales','w1','Sales','["employee"]',new Date().toISOString()).run();
  const service = await api('POST','/services',{name:'Sales Console',description:'Order entry',businessImpact:'Sales interrupted',source:'owner',observedAt:new Date().toISOString(),visibility:'workspace'},'owner',201);
  let incident = await api('POST','/incidents',{title:'Order entry unavailable',serviceId:service.id,impact:'Sales cannot enter orders',cohorts:['sales'],visibility:'workspace'},'owner',201);
  const base = `/incidents/${incident.id}/notices`;
  const read = () => api('GET',base);
  const publish = async (body = {}, user = 'owner', status = 201) => api('POST',base,{revision:(await read()).revision,groupId:'sales',message:'Sales Console new sessions are failing. We are investigating.',cadenceMinutes:30,...body},user,status);
  await publish({},'employee',403);
  await publish({cadenceMinutes:0},'owner',422);
  await publish({cadenceMinutes:1.5},'owner',422);
  await publish({groupId:'missing'},'owner',404);
  await api('POST',`/incidents/${incident.id}/notices`,{revision:0,groupId:'sales'},'owner',409);
  const mailSecret = (await api('POST','/fixture/secret',{apiKey:'test-only-notice-key'})).secret;
  await db.prepare('INSERT INTO connections(id,workspace_id,provider,status,config_json,secret_ciphertext) VALUES(?,?,?,?,?,?)')
    .bind('notice-mail','w1','sendgrid','active',JSON.stringify({from:'linen@example.test'}),mailSecret).run();
  let published = await publish({emailConnectionId:'notice-mail'}), n=published.items[0];
  assert.equal(n.state,'open');assert.equal(n.publishedBy,'owner');assert.ok(n.nextUpdateAt>n.publishedAt);
  assert.equal((await api('GET','/service-notices',undefined,'employee')).items[0].message,n.message);
  assert.equal((await api('GET','/service-notices',undefined,'outsider')).items.length,0,'CHANNEL-008 outside cohort sees no notice or count');
  assert.equal((await api('GET','/service-notices',undefined,'owner')).items.length,0,'CHANNEL-008 owner not in cohort has no employee banner');
  const employeeSource=await api('GET','/incidents/'+incident.id,undefined,'outsider');
  assert.equal(employeeSource.data.employeeNotices,undefined,'CHANNEL-008 generic source read cannot leak cohort notices');
  const sameWorkspace=await request('GET','/service-notices',undefined,{'x-user':'employee','x-workspace':'w2','x-roles':'["employee"]'});check(sameWorkspace,404);
  assert.equal((await api('POST','/service-notices/suggestions',{question:'My SALES CONSOLE is broken'},'employee')).items[0].id,n.id);
  assert.equal((await api('POST','/service-notices/suggestions',{question:'The laptop fan is loud'},'employee')).items.length,0);
  assert.equal((await api('POST','/service-notices/suggestions',{question:'Sales Console2 fails'},'employee')).items.length,0,'CHANNEL-008 whole service phrase, not a substring');
  assert.equal((await api('POST','/service-notices/suggestions',{question:'Sales Console fails'},'outsider')).items.length,0);
  await api('POST','/service-notices/suggestions',{question:'x'.repeat(50001)},'employee',422);
  await api('POST',`${base}/${n.id}/all-clear`,{revision:published.revision,message:'All-clear',verification:'Unsupported claim'},'owner',422);
  await api('POST','/services/process-due',{});
  let calls=(await api('GET','/fixture/notice-mail')).calls;
  assert.equal(calls.length,1);assert.equal(calls[0].personalizations[0].to[0].email,'employee@example.test');
  const bytes=JSON.stringify(calls[0]);assert.ok(bytes.includes('https://linen.example.test/app#/work?notice='));
  assert.ok(!bytes.includes('Sales Console')&&!bytes.includes('investigating'),'CHANNEL-008 email contains no incident/cohort message');
  let jobs=(await api('GET','/service-notifications')).items.filter(j=>j.kind==='employee-notice');
  assert.equal(jobs[0].state,'accepted','CHANNEL-008 202 is acceptance, never delivery');
  await api('POST',`/service-notifications/${jobs[0].id}/reconcile`,{},'owner',409);
  await api('POST','/services/process-due',{});assert.equal((await api('GET','/fixture/notice-mail')).calls.length,1,'CHANNEL-008 no duplicate send');
  // A due cadence produces only one generic reminder, retaining the last human progress time.
  let row=await api('GET','/incidents/'+incident.id);const humanUpdate=n.updatedAt;
  const raw=await db.prepare('SELECT data_json FROM svc_records WHERE id=?').bind(incident.id).first();
  let data=JSON.parse(raw.data_json);data.employeeNotices[0].nextUpdateAt='2020-01-01T00:00:00.000Z';
  await db.prepare('UPDATE svc_records SET data_json=? WHERE id=?').bind(JSON.stringify(data),incident.id).run();
  await api('POST','/services/process-due',{});await api('POST','/services/process-due',{});
  assert.equal((await api('GET','/fixture/notice-mail')).calls.length,2,'CHANNEL-008 one cadence reminder');
  n=(await read()).items[0];assert.equal(n.updatedAt,humanUpdate,'CHANNEL-008 cadence never pretends a human updated progress');
  // Current group membership and source access gate both reads and pending sends.
  const update=async(message,user='owner')=>api('POST',`${base}/${n.id}/update`,{revision:(await read()).revision,message},user);
  await update('New scoped progress');
  await db.prepare("UPDATE work_requester_groups SET members_json='[]' WHERE id='sales'").run();
  assert.equal((await api('GET','/service-notices',undefined,'employee')).items.length,0);
  await api('POST','/services/process-due',{});assert.equal((await api('GET','/fixture/notice-mail')).calls.length,2);
  await db.prepare("UPDATE work_requester_groups SET members_json='[\"employee\"]' WHERE id='sales'").run();
  await update('Still investigating');
  await db.prepare("UPDATE svc_records SET visibility='operators' WHERE id=?").bind(service.id).run();
  assert.equal((await api('GET','/service-notices',undefined,'employee')).items.length,0);
  await api('POST','/services/process-due',{});assert.equal((await api('GET','/fixture/notice-mail')).calls.length,2);
  await publish({},'owner',403,'CHANNEL-008 a publisher cannot send a source outside cohort scope');
  await db.prepare("UPDATE svc_records SET visibility='workspace' WHERE id=?").bind(service.id).run();
  await update('Before member deactivation');
  await db.prepare("UPDATE memberships SET active=0 WHERE user_id='employee' AND workspace_id='w1'").run();
  await api('GET','/service-notices',undefined,'employee',404);
  await api('POST','/services/process-due',{});assert.equal((await api('GET','/fixture/notice-mail')).calls.length,2);
  await db.prepare("UPDATE memberships SET active=1 WHERE user_id='employee' AND workspace_id='w1'").run();
  // Revoking the original publisher also fences queued sends even when another operator runs the scheduler.
  await update('Before publisher revocation','operator');
  await db.prepare("UPDATE memberships SET roles_json='[\"employee\"]' WHERE user_id='operator' AND workspace_id='w1'").run();
  await api('POST','/services/process-due',{});assert.equal((await api('GET','/fixture/notice-mail')).calls.length,2);
  await db.prepare("UPDATE memberships SET roles_json='[\"operator\"]' WHERE user_id='operator' AND workspace_id='w1'").run();
  // New versions supersede old pending mail, and ambiguous provider responses never retry.
  await update('Superseded version');await update('Current version');
  await api('POST','/fixture/notice-mail',{status:503});
  await api('POST','/services/process-due',{});await api('POST','/services/process-due',{});
  assert.equal((await api('GET','/fixture/notice-mail')).calls.length,1,'CHANNEL-008 uncertain write is never retried');
  assert.ok((await api('GET','/service-notifications')).items.some(j=>j.kind==='employee-notice'&&j.state==='unknown'));
  await api('POST','/fixture/notice-mail',{status:202});
  // Independent recovery admission is still the existing incident public door.
  incident=await api('GET','/incidents/'+incident.id);
  const t=Date.now(),proof={evidenceId:'independent-notice',incidentId:incident.id,serviceId:service.id,cohort:'sales',observedAt:new Date(t).toISOString(),expiresAt:new Date(t+60000).toISOString(),verifierVersion:'1',independent:true,usable:true,negativeChecksPassed:true,executionId:'notice-proof',source:'probe'};
  incident=await api('POST',`/incidents/${incident.id}/recovery`,{revision:incident.revision,evidence:[proof]});assert.equal(incident.data.status,'restored');
  // A stale stored restored status cannot manufacture a new recovery attestation.
  await db.prepare("UPDATE svc_records SET data_json=json_set(data_json,'$.recoveries[0].expiresAt','2020-01-01T00:00:00Z') WHERE id=?").bind(incident.id).run();
  await api('POST',`${base}/${n.id}/all-clear`,{revision:(await read()).revision,message:'Stale recovery',verification:'Expired observation'},'operator',422);
  await db.prepare("UPDATE svc_records SET data_json=json_set(data_json,'$.recoveries[0].expiresAt',?) WHERE id=?").bind(proof.expiresAt,incident.id).run();
  published=await api('POST',`${base}/${n.id}/all-clear`,{revision:(await read()).revision,message:'Sales Console new sessions independently verified.',verification:'Recovery probe notice-proof'},'operator');
  n=published.items[0];assert.equal(n.verifiedBy,'operator');assert.equal(n.state,'all-clear');assert.equal(n.nextUpdateAt,null);
  const shown=(await api('GET','/service-notices',undefined,'employee')).items[0];assert.equal(shown.verifiedBy,'Operator');assert.equal(shown.state,'all-clear');
  assert.equal((await api('POST','/service-notices/suggestions',{question:'Sales Console still fails'},'employee')).items.length,0,'CHANNEL-008 an all-clear is no open-incident suggestion');
  await api('POST',`${base}/${n.id}/withdraw`,{revision:published.revision},'owner',403);
  await db.prepare("UPDATE svc_records SET data_json=json_set(data_json,'$.recoveries[0].expiresAt','2020-01-01T00:00:00Z') WHERE id=?").bind(incident.id).run();
  assert.equal((await api('GET','/service-notices',undefined,'employee')).items[0].state,'all-clear','CHANNEL-008 recorded all-clear retained until named verifier withdraws');
  await api('POST',`${base}/${n.id}/update`,{revision:published.revision,message:'Replace retained recovery'},'operator',409);
  await api('POST',`${base}/${n.id}/withdraw`,{revision:published.revision},'operator');
  assert.equal((await api('GET','/service-notices',undefined,'employee')).items.length,0);
  // Concurrent publication through the same source revision has one winner and no losing mail intent.
  const revision=(await read()).revision, body={revision,groupId:'sales',message:'Another interruption',cadenceMinutes:30};
  const race=await Promise.all([request('POST',base,body),request('POST',base,body)]);
  assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
  console.log('PASS CHANNEL-008: public-route cohort-only notices, exact service suggestions, source/member/publisher rechecks, cadence, email acceptance/unknown/no repeat, named verified all-clear, retained recovery, withdrawal and concurrent CAS. Slack/Teams remain unimplemented.');
}

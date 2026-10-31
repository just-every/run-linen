import assert from 'node:assert/strict';
const check=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r));return r.value;};
const token='synthetic-linen-31';
const credentials={accessToken:token};
const configurations=[
  {provider:'gcs',bucket:'synthetic-linen-1',prefix:'reports',...credentials},
  {provider:'azure',account:'syntheticlinen1',container:'synthetic-linen-1',prefix:'reports',authMode:'sas',sasToken:'sv=2023-11-03&sr=c&spr=https&sp=rcw&se=2099-01-01T00%3A00%3A00Z&sig=synthetic-linen-30'},
  {provider:'azure',account:'syntheticlinen2',container:'synthetic-linen-1',prefix:'reports',authMode:'oauth',...credentials},
  {provider:'snowflake',account:'synthetic-linen-1',database:'LINEN',schema:'PUBLIC',table:'TICKETS',warehouse:'LINEN',role:'LINEN',...credentials},
  {provider:'bigquery',project:'synthetic-linen-1',dataset:'linen',table:'tickets',location:'US',...credentials},
];
const ageRun=(db,id)=>db.prepare('UPDATE work_bi_runs SET created_at=? WHERE id=?').bind('2020-01-01T00:00:00Z',id).run();
const mode=(api,provider,value)=>api('/test/bi-providers',{provider,mode:value});
const providerCalls=async(api,provider)=>(check(await api('/test/bi-providers')).calls).filter(c=>c.provider===provider);
const checkpoint=async(db,key)=>(await db.prepare('SELECT row_id,row_sha256 FROM work_bi_checkpoints WHERE export_id=? ORDER BY row_id').bind(key).all()).results;
const pause=async(api,key)=>{const row=check(await api(`/bi/exports/${key}`));check(await api(`/bi/exports/${key}`,{revision:row.revision,active:false}));};

/** Actual public export routes and real D1 checkpoints; only provider HTTP is intercepted. */
export async function biAdapterChecks(api,db,{tickets}) {
  const jobs=[];
  for(const [i,config] of configurations.entries()) {
    check(await api('/bi/exports',{name:'Synthetic destination',...config,consent:false}),422);
    const job=check(await api('/bi/exports',{name:`Synthetic destination ${i}`,...config,consent:true}),201);jobs.push(job);
    assert.equal(job.destination.provider,config.provider);
    const stored=await db.prepare('SELECT credential_cipher,destination_json FROM work_bi_exports WHERE id=?').bind(job.id).first();
    for(const secret of [token,config.sasToken].filter(Boolean)) {
      assert.ok(!JSON.stringify(job).includes(secret));assert.ok(!stored.credential_cipher.includes(secret));assert.ok(!stored.destination_json.includes(secret));
    }
    const first=check(await api(`/bi/exports/${job.id}/run`,{}));assert.equal(first.state,'delivered');assert.ok(first.provider_ref);
    const call=(await providerCalls(api,config.provider)).at(-1);
    const rows=config.provider==='snowflake'?JSON.parse(JSON.parse(call.body).bindings['1'].value):config.provider==='bigquery'?JSON.parse(JSON.parse(call.body).configuration.query.queryParameters[0].parameterValue.value):null;
    const payload=rows?JSON.stringify(rows):call.body;
    assert.ok(payload.includes(tickets[0].id));for(const excluded of tickets.slice(1))assert.ok(!payload.includes(excluded.id),'Every destination excludes restricted, HR and retained-HR tickets');
    if(rows) {
      const remote=check(await api('/test/bi-providers')).rows[config.provider];
      assert.deepEqual(remote.find(r=>r.id===tickets[0].id),rows.find(r=>r.id===tickets[0].id),'Warehouse receives full typed scoped ticket projection');
      assert.equal(typeof rows.find(r=>r.id===tickets[0].id).revision,'number');
    } else {assert.equal(call.conditional,true);assert.equal(call.auth,config.authMode==='sas'?'sas':'bearer');}
    // A changed row is loaded by id, while a second unchanged run has no changed rows.
    check(await api(`/work/${tickets[0].id}/messages`,{body:`Warehouse source update ${i}`,visibility:'public',sourceMessageId:`synthetic-linen-bi-${i}`}),201);
    const second=check(await api(`/bi/exports/${job.id}/run`,{}));assert.equal(second.state,'delivered');assert.equal(second.row_count,1);
    const unchanged=check(await api(`/bi/exports/${job.id}/run`,{}));assert.equal(unchanged.row_count,0);assert.equal(unchanged.state,'delivered');
    const audits=await db.prepare("SELECT detail_json FROM audit_events WHERE action='bi.destination_consented' AND target=?").bind(job.id).all();assert.equal(audits.results.length,1);
    assert.ok(!JSON.stringify(audits.results).includes(token));if(config.sasToken)assert.ok(!JSON.stringify(audits.results).includes(config.sasToken));
    await pause(api,job.id);
  }
  await uncertainStorageChecks(api,db);
  await uncertainWarehouseChecks(api,db);
  await googleCredentialChecks(api,db);
  await authorityChecks(api,db,jobs[0]);
  await effectBoundaryChecks(api,db,tickets[0]);
  // User-supplied endpoints, SQL identifiers, unsupported providers or formats and unscoped SAS are refused before HTTP.
  const before=check(await api('/test/bi-providers')).calls.length;
  for(const bad of [
    {...configurations[0],bucket:'https://example.test'},
    {...configurations[1],account:'example.test/path'},
    {...configurations[1],sasToken:'https://example.test/?sig=synthetic-linen-31'},
    {...configurations[1],sasToken:'sv=2023-11-03&sr=c&sp=w&spr=https&se=2099-01-01&sig=synthetic-linen-31'},
    {...configurations[3],account:'example.test/redirect'},
    {...configurations[3],table:'TICKETS; DELETE FROM TICKETS'},
    {...configurations[4],project:'example.test'},
    {...configurations[0],provider:'unsupported'},
    {...configurations[0],format:'parquet'},
  ])check(await api('/bi/exports',{...bad,name:'Invalid destination',consent:true}),422);
  assert.equal(check(await api('/test/bi-providers')).calls.length,before);
}

async function uncertainStorageChecks(api,db) {
  for(const config of configurations.slice(0,2)) {
    const job=check(await api('/bi/exports',{...config,name:'Uncertain object',consent:true}),201);
    await mode(api,config.provider,'unknown');
    const unknown=check(await api(`/bi/exports/${job.id}/run`,{}));assert.equal(unknown.state,'unknown');assert.equal((await checkpoint(db,job.id)).length,0);
    const before=(await providerCalls(api,config.provider)).length;
    check(await api(`/bi/exports/${job.id}/run`,{}),409);assert.equal((await providerCalls(api,config.provider)).length,before,'Lost upload responses never cause blind resends');
    check(await api(`/bi/exports/${job.id}/reconcile`,{}),409);await ageRun(db,unknown.id);
    await mode(api,config.provider,'mismatch');
    const mismatched=check(await api(`/bi/exports/${job.id}/reconcile`,{}));assert.equal(mismatched.runs.find(r=>r.id===unknown.id).state,'unknown');assert.equal((await checkpoint(db,job.id)).length,0,'Different object bytes do not acknowledge the delivery');
    await mode(api,config.provider,'accepted');
    const receipt=check(await api(`/bi/exports/${job.id}/reconcile`,{}));assert.equal(receipt.runs.find(r=>r.id===unknown.id).state,'delivered');assert.ok((await checkpoint(db,job.id)).length>0);
    assert.equal((await providerCalls(api,config.provider)).at(-1).method,'GET');
    assert.equal(check(await api(`/bi/exports/${job.id}/run`,{})).row_count,0,'Verified object readback advances changed-only checkpoint');
    await pause(api,job.id);
    const absent=check(await api('/bi/exports',{...config,name:'Absent object',consent:true}),201);await mode(api,config.provider,'absent');
    const lost=check(await api(`/bi/exports/${absent.id}/run`,{}));await ageRun(db,lost.id);await mode(api,config.provider,'accepted');
    const absentReceipt=check(await api(`/bi/exports/${absent.id}/reconcile`,{}));assert.equal(absentReceipt.runs.find(r=>r.id===lost.id).state,'not_delivered');assert.equal((await checkpoint(db,absent.id)).length,0);
    await pause(api,absent.id);
  }
}

async function uncertainWarehouseChecks(api,db) {
  for(const config of configurations.slice(3)) {
    const job=check(await api('/bi/exports',{...config,name:'Asynchronous warehouse',consent:true}),201);
    await mode(api,config.provider,'pending');
    const pending=check(await api(`/bi/exports/${job.id}/run`,{}));assert.equal(pending.state,'unknown');assert.ok(pending.provider_ref);assert.equal((await checkpoint(db,job.id)).length,0,'Provider acceptance is not warehouse completion');
    const count=(await providerCalls(api,config.provider)).length;check(await api(`/bi/exports/${job.id}/run`,{}),409);assert.equal((await providerCalls(api,config.provider)).length,count);
    await ageRun(db,pending.id);
    const still=check(await api(`/bi/exports/${job.id}/reconcile`,{}));assert.equal(still.runs.find(r=>r.id===pending.id).state,'unknown');
    await mode(api,config.provider,'mismatch');
    const mismatch=check(await api(`/bi/exports/${job.id}/reconcile`,{}));assert.equal(mismatch.runs.find(r=>r.id===pending.id).state,'unknown');assert.equal((await checkpoint(db,job.id)).length,0,'Receipt identity and payload must match');
    await mode(api,config.provider,'accepted');
    const complete=check(await api(`/bi/exports/${job.id}/reconcile`,{}));assert.equal(complete.runs.find(r=>r.id===pending.id).state,'delivered');assert.ok((await checkpoint(db,job.id)).length>0);
    assert.ok((await providerCalls(api,config.provider)).slice(count).every(c=>c.method==='GET'),'Reconciliation only polls provider status');
    await pause(api,job.id);
    const lostJob=check(await api('/bi/exports',{...config,name:'Lost warehouse response',consent:true}),201);await mode(api,config.provider,'unknown');
    const lost=check(await api(`/bi/exports/${lostJob.id}/run`,{}));assert.equal(lost.state,'unknown');await ageRun(db,lost.id);await mode(api,config.provider,'accepted');
    if(config.provider==='bigquery')assert.equal(check(await api(`/bi/exports/${lostJob.id}/reconcile`,{})).runs.find(r=>r.id===lost.id).state,'delivered','Deterministic BigQuery job id recovers a lost submission receipt');
    else {check(await api(`/bi/exports/${lostJob.id}/reconcile`,{}),409);check(await api(`/bi/exports/${lostJob.id}/run`,{}),409);assert.equal((await checkpoint(db,lostJob.id)).length,0,'Lost Snowflake handle stays uncertain');}
    await pause(api,lostJob.id);
    const rejected=check(await api('/bi/exports',{...config,name:'Rejected warehouse',consent:true}),201);await mode(api,config.provider,'rejected');
    assert.equal(check(await api(`/bi/exports/${rejected.id}/run`,{})).state,'rejected');assert.equal((await checkpoint(db,rejected.id)).length,0);
    await pause(api,rejected.id);await mode(api,config.provider,'accepted');
  }
}

async function googleCredentialChecks(api,db) {
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  check(await api('/test/bi-google-key',await crypto.subtle.exportKey('jwk',pair.publicKey)));
  const der=Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64'),privateKey=`-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  for(const config of [configurations[0],configurations[4]]) {
    const job=check(await api('/bi/exports',{...config,credentialMode:'service_account',clientEmail:'synthetic-linen-40@synthetic-linen-1.iam.gserviceaccount.com',privateKey,name:'Renewable Google credential',consent:true}),201);
    const before=(await providerCalls(api,'google')).length;
    assert.equal(check(await api(`/bi/exports/${job.id}/run`,{})).state,'delivered');assert.equal(check(await api(`/bi/exports/${job.id}/run`,{})).state,'delivered');
    assert.equal((await providerCalls(api,'google')).length,before+2,'Each scheduled dispatch obtains a fresh signed Google token');
    assert.ok(!JSON.stringify(check(await api(`/bi/exports/${job.id}`))).includes(der.slice(0,40)));
    await mode(api,'google','rejected');const count=(await providerCalls(api,config.provider)).length;
    check(await api(`/bi/exports/${job.id}/run`,{}),409);assert.equal((await providerCalls(api,config.provider)).length,count,'Failed token exchange never calls destination');
    await mode(api,'google','accepted');await pause(api,job.id);
  }
}

async function authorityChecks(api,db,paused) {
  let job=check(await api(`/bi/exports/${paused.id}`));job=check(await api(`/bi/exports/${job.id}`,{revision:job.revision,active:true}));
  const before=check(await api('/test/bi-providers')).calls.length;
  const prior=await db.prepare("SELECT settings_json FROM workspace_settings WHERE workspace_id='a'").first();
  await db.prepare("INSERT INTO workspace_settings(workspace_id,settings_json) VALUES('a','{\"executionHeld\":true}') ON CONFLICT(workspace_id) DO UPDATE SET settings_json=excluded.settings_json").run();
  check(await api(`/bi/exports/${job.id}/run`,{}),409);assert.equal(check(await api('/test/bi-providers')).calls.length,before,'Restore hold blocks the destination network edge');
  if(prior)await db.prepare("UPDATE workspace_settings SET settings_json=? WHERE workspace_id='a'").bind(prior.settings_json).run();else await db.prepare("DELETE FROM workspace_settings WHERE workspace_id='a'").run();
  await db.prepare("UPDATE memberships SET roles_json='[\"auditor\"]' WHERE workspace_id='a' AND user_id='owner'").run();
  check(await api(`/bi/exports/${job.id}/run`,{}),403);assert.equal(check(await api('/test/bi-providers')).calls.length,before,'Scheduler owner hint cannot survive current owner revocation');
  await db.prepare("UPDATE memberships SET roles_json='[\"owner\"]' WHERE workspace_id='a' AND user_id='owner'").run();
  await pause(api,job.id);
  await db.prepare("UPDATE work_bi_exports SET credential_cipher='' WHERE id=?").bind(job.id).run();
  const restored=check(await api(`/bi/exports/${job.id}`));check(await api(`/bi/exports/${job.id}`,{revision:restored.revision,active:true}),409);
  assert.equal(check(await api('/test/bi-providers')).calls.length,before,'Restored destination cannot activate without new credentials and consent');
}

async function effectBoundaryChecks(api,db,ticket) {
  const prior=await db.prepare("SELECT settings_json FROM workspace_settings WHERE workspace_id='a'").first();
  for(const race of ['authority','scope','hold']) {
    const job=check(await api('/bi/exports',{...configurations[0],name:`Boundary ${race}`,consent:true}),201),before=check(await api('/test/bi-providers')).calls.length;
    check(await api(`/bi/exports/${job.id}/run`,{}, {'x-bi-race':race,'x-bi-target':ticket.id}),race==='authority'?404:409);
    assert.equal(check(await api('/test/bi-providers')).calls.length,before,`A changed ${race} after durable claim is rechecked before delivery`);
    assert.equal((await checkpoint(db,job.id)).length,0);
    await db.prepare("UPDATE memberships SET active=1 WHERE workspace_id='a' AND user_id='owner'").run();
    if(race==='scope')await db.prepare("UPDATE work_records SET sensitivity='normal' WHERE workspace_id='a' AND id=?").bind(ticket.id).run();
    if(prior)await db.prepare("UPDATE workspace_settings SET settings_json=? WHERE workspace_id='a'").bind(prior.settings_json).run();else await db.prepare("DELETE FROM workspace_settings WHERE workspace_id='a'").run();
    await pause(api,job.id);
  }
  // Native person erasure withdraws a request from every future destination snapshot.
  await db.batch([db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('synthetic-linen-41','synthetic-linen-41@example.test','Synthetic BI person','synthetic-linen-42','2026-10-23'),db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a','synthetic-linen-41','["employee"]')]);
  const source=check(await api('/work',{title:'Synthetic erased BI work',body:'Scoped personal work',deduplicationKey:'synthetic-linen-43'},{'x-user':'synthetic-linen-41','x-roles':'["employee"]'}),201);
  check(await api('/people/synthetic-linen-41/erase',{revision:0,reason:'Synthetic BI erasure evidence'}));
  assert.ok(!check(await api('/bi/tickets')).rows.some(r=>r.id===source.id));
  const job=check(await api('/bi/exports',{...configurations[0],name:'Erasure boundary',consent:true}),201);
  assert.equal(check(await api(`/bi/exports/${job.id}/run`,{})).state,'delivered');
  assert.ok(!(await providerCalls(api,'gcs')).at(-1).body.includes(source.id));await pause(api,job.id);
}

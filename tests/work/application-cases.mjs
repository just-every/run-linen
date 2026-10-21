import assert from 'node:assert/strict';

export async function applicationChecks(api, db) {
  const ok = async (path, body, headers, status = body === undefined ? 200 : 201) => {
    const result = await api(path, body, headers);
    assert.equal(result.status, status, `ACCESS-008 ${path}: ${JSON.stringify(result.value)}`);
    return result.value;
  };
  const employee={'x-user':'employee','x-roles':'["employee"]'};
  assert.equal((await api('/applications',undefined,employee)).status,403,'ACCESS-008 employees cannot read registry metadata');
  assert.equal((await api('/applications',{name:'No authority'},employee)).status,403,'ACCESS-008 only current owners manage the registry');
  await db.exec(`INSERT INTO users VALUES('app-steward','steward@example.test','Application steward','unused','2026-01-01'); INSERT INTO memberships VALUES('a','app-steward','["employee"]',1);`);
  const registered = await ok('/applications', {
    name: 'Salesforce', ownerId: 'owner', approverIds: ['owner'], connector: 'Salesforce (not connected)', sensitivity: 'confidential',
    entitlements: [
      {name: 'Sales user', target: 'salesforce-sales', costCents: 8000, billingPeriod: 'month'},
      {name: 'Salesforce administrator', target: 'salesforce-admin', costCents: 16500, billingPeriod: 'month'},
    ],
  });
  assert.equal(registered.data.name, 'Salesforce', 'ACCESS-008 register an application');
  assert.equal(registered.ownerId, 'owner', 'ACCESS-008 recorded application owner');
  assert.deepEqual(registered.data.approverIds, ['owner'], 'ACCESS-008 recorded approvers');
  assert.equal(registered.data.connector, 'Salesforce (not connected)', 'ACCESS-008 connector is descriptive metadata');
  assert.equal(registered.data.sensitivity, 'confidential', 'ACCESS-008 application data sensitivity');
  assert.equal(registered.data.entitlements.length, 2, 'ACCESS-008 two permission sets');
  for(const [costCents,billingPeriod] of [[-1,'month'],[1.5,'month'],[100,'fortnight']]) {
    assert.equal((await api('/applications',{...registered.data,ownerId:'owner',entitlements:[{name:'Invalid price',target:'bad-price',costCents,billingPeriod}]})).status,422,'ACCESS-008 requires nonnegative integer USD cents and an explicit supported period');
  }
  assert.equal((await api('/applications',{...registered.data,ownerId:'foreign-member',entitlements:[{name:'User',target:'other-target',costCents:0,billingPeriod:'one-time'}]})).status,422,'ACCESS-008 only current workspace members can own the application');
  const admin = registered.data.entitlements.find(e => e.target === 'salesforce-admin');
  const catalog = await ok('/catalog', {name: 'Salesforce administrator access', kind: 'access', applicationId: registered.id, entitlementId: admin.id});
  const work = await ok('/work', {title: 'Salesforce administration', body: 'Maintain our Salesforce settings', deduplicationKey: 'ACCESS-008-admin'}, {'x-user':'employee','x-roles':'["employee"]'});
  const request = await ok(`/work/${work.id}/fulfilment`, {catalogId:catalog.id,beneficiaryId:'employee',purpose:'Maintain Salesforce settings',expiresAt:'2030-01-01T00:00:00Z'}, {'x-user':'employee','x-roles':'["employee"]'});
  assert.equal(request.ownerId, 'owner', 'ACCESS-008 administrator request routes to the application owner');
  assert.equal(request.application.costCents, 16500, 'ACCESS-008 request shows exact USD cost per seat');
  assert.equal(request.application.billingPeriod, 'month', 'ACCESS-008 seat cost has an explicit period');
  const duties = await ok(`/work/${work.id}/obligations`, undefined, {'x-user':'employee','x-roles':'["employee"]'});
  assert.ok(duties.items.some(d => d.target === 'salesforce-admin' && d.owner_id === 'owner'), 'ACCESS-008 public duty names the correct target and owner');
  assert.equal((await db.prepare('SELECT COUNT(*) count FROM execution_grants WHERE target=?').bind('salesforce-admin').first()).count, 0, 'ACCESS-008 registry and routing do not issue a provider grant');
  const projection=(await ok('/catalog',undefined,employee)).items.find(i=>i.id===catalog.id).application;
  assert.deepEqual(Object.keys(projection).sort(),['billingPeriod','costCents','entitlementName'],'ACCESS-008 employee catalog projection contains only entitlement and seat cost');
  assert.deepEqual(Object.keys((await ok(`/work/${work.id}/application-services`,undefined,employee)).items[0]).sort(),Object.keys(projection).sort(),'ACCESS-008 request snapshot has the same safe employee projection');
  assert.equal((await api('/catalog',{name:'Forged target',kind:'access',applicationId:registered.id,entitlementId:admin.id,target:'wrong'})).status,422,'ACCESS-008 linked catalog target cannot be forged');
  assert.equal((await api('/catalog',{name:'Foreign app',kind:'access',applicationId:'foreign-app',entitlementId:admin.id})).status,404,'ACCESS-008 application links stay in the current workspace');
  const changedInput={...registered.data,ownerId:'app-steward',revision:registered.revision,entitlements:registered.data.entitlements.map(e=>({...e,costCents:19900}))};
  const changed=await ok(`/applications/${registered.id}`,changedInput,undefined,200);
  assert.equal((await api(`/applications/${registered.id}`,changedInput)).status,409,'ACCESS-008 stale registry edits are refused');
  assert.equal((await ok(`/work/${work.id}/application-services`,undefined,employee)).items[0].costCents,16500,'ACCESS-008 existing request cost is not rewritten by registry edits');
  const nextWork=await ok('/work',{title:'Second admin request',body:'Admin configuration',deduplicationKey:'ACCESS-008-next'},employee);
  const nextRequest=await ok(`/work/${nextWork.id}/fulfilment`,{catalogId:catalog.id,beneficiaryId:'employee',purpose:'Configuration'},employee);
  assert.equal(nextRequest.ownerId,'app-steward','ACCESS-008 new requests use the current application owner');
  assert.equal(nextRequest.application.costCents,19900,'ACCESS-008 new requests use the current seat cost');
  const repeated=await ok(`/work/${work.id}/fulfilment`,{catalogId:catalog.id,beneficiaryId:'employee',purpose:'Maintain Salesforce settings',expiresAt:'2030-01-01T00:00:00Z'},employee);
  assert.equal(repeated.ownerId,'owner','ACCESS-008 retry retains the request routing snapshot');
  assert.equal(repeated.application.costCents,16500,'ACCESS-008 retry retains the request cost snapshot');
  const managerItem=await ok('/catalog',{name:'Managed Salesforce access',kind:'access',applicationId:registered.id,entitlementId:admin.id,requiresManager:true});
  const managed=await ok(`/work/${nextWork.id}/fulfilment`,{catalogId:managerItem.id,beneficiaryId:'employee',purpose:'Configuration'},employee);
  assert.equal(managed.state,'blocked','ACCESS-008 app registration never substitutes for required manager approval');
  assert.match(managed.reason,/manager/i);
  await ok('/people/app-steward/erase',{revision:0,reason:'Registry actor erasure'},undefined,200);
  const erasedSnapshot=(await ok(`/work/${nextWork.id}/application-services`,undefined)).items[0];
  assert.ok(erasedSnapshot.ownerId.startsWith('erased-'),'ACCESS-008 authorized actor erasure anonymizes retained request snapshots');
  const erasedApp=(await ok('/applications',undefined)).items.find(a=>a.id===registered.id);
  assert.ok(erasedApp.ownerId.startsWith('erased-'),'ACCESS-008 direct work erasure also anonymizes registry ownership');
  const unavailable=await api(`/work/${nextWork.id}/fulfilment`,{catalogId:managerItem.id,beneficiaryId:'employee',purpose:'Configuration'});
  assert.equal(unavailable.status,201,'ACCESS-008 existing snapshot remains readable as request history');
  assert.equal(unavailable.value.state,'blocked','ACCESS-008 erased ownership never bypasses the existing manager gate');
  assert.equal((await api('/catalog',{name:'Erased owner service',kind:'access',applicationId:registered.id,entitlementId:admin.id})).status,409,'ACCESS-008 erased owner cannot receive a new catalog request');
  // CATALOG-001: typed conditional forms through the same catalog/fulfilment routes.
  for(const user of ['catalog-user','catalog-outsider']) {
    await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(user,user+'@example.test',user,'unused','2026-01-01').run();
    await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a',user,'["employee"]').run();
  }
  const formEmployee={'x-user':'catalog-user','x-roles':'["employee"]'};
  const form={costCents:25000,deliveryHours:48,fields:[
    {id:'mount',label:'Monitor mounting',type:'select',required:true,options:['Desk','Wall']},
    {id:'wall',label:'Wall type',type:'text',required:true,when:{fieldId:'mount',equals:'Wall'}},
    {id:'count',label:'Quantity',type:'number',required:true},
    {id:'returning',label:'Returning old monitor',type:'checkbox',required:true},
    {id:'needed',label:'Needed date',type:'date',required:true},
    {id:'notes',label:'Delivery notes',type:'textarea',required:false},
  ]};
  const monitor=await ok('/catalog',{name:'New monitor',kind:'device',target:'monitor-form',ownerId:'owner',form});
  const formItem=(await ok('/catalog')).items.find(i=>i.id===monitor.id);
  assert.equal(formItem.form.costCents,25000,'CATALOG-001 recorded USD request cost');
  assert.equal(formItem.form.deliveryHours,48,'CATALOG-001 recorded delivery estimate');
  const monitorWork=await ok('/work',{title:'Monitor for desk',body:'Replace our old monitor',deduplicationKey:'catalog-monitor'},formEmployee);
  const answers={mount:'Desk',count:1,returning:false,needed:'2028-02-29',notes:'Deliver by reception'};
  const submission={catalogId:monitor.id,catalogRevision:formItem.revision,beneficiaryId:'catalog-user',purpose:'Desk setup',answers};
  for(const patch of [{catalogRevision:0},{answers:{...answers,wall:'Concrete'}},{answers:{...answers,mount:'Wall'}},{answers:{...answers,count:'1'}},{answers:{...answers,needed:'2027-02-29'}},{answers:{...answers,unexpected:'discard me'}}])
    assert.ok((await api(`/work/${monitorWork.id}/fulfilment`,{...submission,...patch},formEmployee)).status>=400,'CATALOG-001 stale form, hidden/unknown fields, missing conditional answers and wrong types refuse');
  assert.equal((await db.prepare('SELECT count(*) n FROM work_fulfilments WHERE work_id=?').bind(monitorWork.id).first()).n,0,'CATALOG-001 invalid answers store no fulfilment');
  const requested=await ok(`/work/${monitorWork.id}/fulfilment`,submission,formEmployee);
  assert.equal(requested.catalogSnapshot.answers.returning,false,'CATALOG-001 a required no answer is valid');
  assert.deepEqual(requested.catalogSnapshot.answers,answers,'CATALOG-001 normalized answers are preserved');
  assert.equal((await api(`/catalog/${monitor.id}/form`,{name:'No authority',revision:1,form},formEmployee)).status,403,'CATALOG-001 employees cannot edit forms');
  const revised=await ok(`/catalog/${monitor.id}/form`,{name:'New display',revision:formItem.revision,form:{...form,costCents:30000,deliveryHours:72}},undefined,200);
  assert.equal((await db.prepare("SELECT count(*) n FROM audit_events WHERE action='catalog.form_edited' AND target=?").bind(monitor.id).first()).n,1,'CATALOG-001 versioned configuration edits are audited');
  assert.equal((await api(`/catalog/${monitor.id}/form`,{name:'Stale overwrite',revision:formItem.revision,form})).status,409,'CATALOG-001 stale owner edits refuse');
  const persisted=(await ok(`/work/${monitorWork.id}/catalog-requests`,undefined,formEmployee)).items[0].catalogSnapshot;
  assert.deepEqual(persisted,requested.catalogSnapshot,'CATALOG-001 in-flight questions, cost, delivery and answers retain their submitted revision');
  assert.deepEqual((await ok(`/work/${monitorWork.id}/fulfilment`,submission,formEmployee)).catalogSnapshot,persisted,'CATALOG-001 retry after item edit retains the original snapshot');
  const nextMonitor=await ok('/work',{title:'Monitor for wall',body:'Wall mounted monitor',deduplicationKey:'catalog-wall'},formEmployee);
  assert.equal((await api(`/work/${nextMonitor.id}/fulfilment`,submission,formEmployee)).status,409,'CATALOG-001 old revision cannot start another request');
  const wall=await ok(`/work/${nextMonitor.id}/fulfilment`,{...submission,catalogRevision:revised.revision,answers:{...answers,mount:'Wall',wall:'Concrete'}},formEmployee);
  assert.equal(wall.catalogSnapshot.form.costCents,30000,'CATALOG-001 new submissions use revised cost');
  assert.equal(wall.catalogSnapshot.answers.wall,'Concrete','CATALOG-001 visible conditional answer is required and retained');
  const unrelated={'x-user':'catalog-outsider','x-roles':'["employee"]'};
  assert.equal((await api(`/work/${monitorWork.id}/catalog-requests`,undefined,unrelated)).status,404,'CATALOG-001 answers inherit the ticket readership boundary');
  await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('catalog-staff','staff@example.test','Catalog staff','unused','2026-01-01').run();
  await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a','catalog-staff','["operator"]').run();
  const staffWork=await ok('/work',{title:'Staff-filed monitor request',body:'For the training room',beneficiaryId:'catalog-user',deduplicationKey:'catalog-staff-filed'});
  await ok(`/work/${staffWork.id}/fulfilment`,{...submission,catalogRevision:revised.revision,answers}, {'x-user':'catalog-staff','x-roles':'["operator"]'});
  await ok('/people/catalog-staff/erase',{revision:0,reason:'CATALOG-001 erase the staff author of form content'},undefined,200);
  assert.equal((await db.prepare('SELECT catalog_snapshot_json FROM work_fulfilments WHERE work_id=?').bind(staffWork.id).first()).catalog_snapshot_json,null,'CATALOG-001 erasing a staff filer clears their form content on another person’s request');
  assert.equal((await db.prepare('SELECT purpose FROM work_fulfilments WHERE work_id=?').bind(staffWork.id).first()).purpose,'[erased]','CATALOG-001 staff filer purpose is removed with their form content');
  await ok('/people/catalog-user/erase',{revision:0,reason:'CATALOG-001 erase submitted personal answers'},undefined,200);
  assert.equal((await db.prepare('SELECT catalog_snapshot_json FROM work_fulfilments WHERE work_id=?').bind(monitorWork.id).first()).catalog_snapshot_json,null,'CATALOG-001 authorized subject erasure clears form content');
  console.log('PASS CATALOG-001 public typed/conditional forms, strict answers, cost/delivery, item edits, immutable submitted snapshots, existing ticket access and erasure');
  await db.prepare("UPDATE memberships SET roles_json='[\"employee\"]' WHERE workspace_id='a' AND user_id='owner'").run();
  assert.equal((await api('/applications',{name:'Stale owner attempt'})).status,403,'ACCESS-008 claimed stale owner role cannot write registry');
  await db.prepare("UPDATE memberships SET roles_json='[\"owner\"]' WHERE workspace_id='a' AND user_id='owner'").run();
  assert.ok((await db.prepare("SELECT COUNT(*) n FROM audit_events WHERE workspace_id='a' AND action='work.applications_read'").first()).n>0,'ACCESS-008 privileged registry reads are audited');
  console.log('PASS ACCESS-008 public application registry, two entitlements, linked catalog, owner/cost snapshots, permissions, manager gate and erasure');
  return { applicationId: registered.id, catalogId: catalog.id, workId: work.id };
}

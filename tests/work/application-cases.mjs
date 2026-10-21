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

/** CATALOG-001 approved audience semantics, through actual catalog and people routes. */
export async function catalogAudienceChecks(api,db) {
  const ok=async(path,body,headers={})=>{const r=await api(path,body,headers);assert.ok(r.status<300,`${path}: ${JSON.stringify(r)}`);return r.value;};
  const as=(user,role='employee')=>({'x-user':user,'x-roles':JSON.stringify([role])});
  for(const [user,role] of [['aud-sales','employee'],['aud-support','employee'],['aud-out','employee'],['aud-hr','hr'],['aud-bot','integration'],['aud-staff','operator']]){
    await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(user,user+'@example.test',user,'unused','2026-01-01').run();
    await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a',user,JSON.stringify([role])).run();
  }
  const value=async(dimension,label)=>ok('/catalog-values',{dimension,label});
  const sales=await value('department','Sales'),support=await value('department','Support'),legal=await value('department','Legal');
  const austin=await value('location','Austin'),denver=await value('location','Denver');
  const employee=await value('employmentType','W-2 employee'),contractor=await value('employmentType','1099 contractor');
  assert.equal((await api('/catalog-values',{dimension:'department',label:'No'},as('aud-hr','hr'))).status,403,'CATALOG-001 only owner maintains value lists');
  assert.equal((await api('/catalog-values',undefined,as('aud-out'))).status,403,'CATALOG-001 employees cannot read value-list facts');
  const source='catalog-reviewed';
  const facts=async(user,attributes,headers={},extra={})=>ok('/people',{source,sourceId:user,name:user,effectiveAt:'2026-01-01T00:00:00.000Z',observedAt:'2026-01-01T00:00:00.000Z',attributes,...extra},headers);
  const bind=async(person,user)=>ok(`/people/${person.id}/binding`,{expectedRevision:person.revision,memberId:user});
  const attributes={department:sales.id,location:austin.id,employmentType:employee.id};
  const alice=await bind(await facts('aud-sales',attributes),'aud-sales');
  const bob=await bind(await facts('aud-support',{...attributes,department:support.id},as('aud-hr','hr')),'aud-support');
  const outsider=await bind(await facts('aud-out',{department:legal.id,location:denver.id,employmentType:contractor.id}),'aud-out');
  assert.equal((await api('/people',{source,sourceId:'bot-review',name:'Bot review',effectiveAt:'2026-01-01',observedAt:'2026-01-01',attributes},as('aud-bot','integration'))).status,403,'CATALOG-001 integrations cannot review person audience attributes');
  assert.equal((await api('/people',{source,sourceId:'wrong-dimension',name:'Wrong',effectiveAt:'2026-01-01',observedAt:'2026-01-01',attributes:{department:austin.id}})).status,422,'CATALOG-001 attribute values belong to the dimension');
  assert.equal((await api('/people',{source,sourceId:'wrong-shape',name:'Wrong',effectiveAt:'2026-01-01',observedAt:'2026-01-01',attributes:{department:[sales.id]}})).status,422,'CATALOG-001 one value per dimension');
  const audience={department:[sales.id,support.id].sort(),location:[austin.id],employmentType:[employee.id]};
  const config=await ok('/catalog',{name:'Config audience',kind:'access',target:'aud-config',ownerId:'owner'});
  assert.equal((await api(`/catalog/${config.id}/audience`,{revision:1,audience},as('aud-sales'))).status,403,'CATALOG-001 employees cannot edit item audience');
  assert.equal((await api(`/catalog/${config.id}/audience`,{revision:1,audience:{department:[austin.id]}})).status,422,'CATALOG-001 audience rejects wrong-dimension values');
  assert.equal((await api(`/catalog/${config.id}/audience`,{revision:1,audience:{department:['other-workspace']}})).status,422,'CATALOG-001 audience rejects unknown/foreign values');
  const versioned=await ok(`/catalog/${config.id}/audience`,{revision:1,audience});
  assert.equal(versioned.revision,2,'CATALOG-001 audience edit versions the same catalog item');
  assert.equal((await api(`/catalog/${config.id}/audience`,{revision:1,audience})).status,409,'CATALOG-001 stale audience edits refuse');
  const item=await ok('/catalog',{name:'Audience monitor',kind:'device',target:'aud-monitor',ownerId:'owner',capacity:20,audience,
    form:{costCents:25000,deliveryHours:48,fields:[]}});
  const request=async(user,key='aud-'+crypto.randomUUID())=>ok('/work',{title:'Audience monitor request',body:'A replacement monitor',deduplicationKey:key},as(user));
  const submit=(work,user,patch={},headers=as(user))=>api(`/work/${work.id}/fulfilment`,{catalogId:item.id,catalogRevision:1,beneficiaryId:user,purpose:'Desk setup',...patch},headers);
  for(const user of ['aud-sales','aud-support'])assert.ok((await ok('/catalog',undefined,as(user))).items.some(i=>i.id===item.id),'CATALOG-001 OR within department admits each approved department');
  assert.ok(!(await ok('/catalog',undefined,as('aud-out'))).items.some(i=>i.id===item.id),'CATALOG-001 mismatched dimensions hide the item');
  const denied=await request('aud-out');const deniedResult=await submit(denied,'aud-out');assert.equal(deniedResult.status,403,'CATALOG-001 AND across dimensions refuses direct submission');
  assert.ok(!JSON.stringify(deniedResult).includes('Legal'),'CATALOG-001 refusal never exposes attribute values');
  const ownerWork=await request('owner');assert.equal((await submit(ownerWork,'owner')).status,403,'CATALOG-001 owner has no beneficiary audience bypass');
  const staff=await request('aud-staff');assert.equal((await submit(staff,'aud-sales',{},as('aud-staff','operator'))).status,201,'CATALOG-001 staff on behalf does not apply staff requester audience');
  const work=await request('aud-sales');const first=await submit(work,'aud-sales');assert.equal(first.status,201,'CATALOG-001 eligible employee submits the $250 item');
  assert.deepEqual(first.value.catalogSnapshot.audience,audience,'CATALOG-001 freezes item audience');
  assert.deepEqual(first.value.catalogSnapshot.audiencePeople,[{id:alice.id,revision:alice.revision}],'CATALOG-001 freezes evaluated person revision');
  const unknown=await request('aud-bot');assert.equal((await submit(unknown,'aud-bot',{},as('aud-bot','integration'))).status,403,'CATALOG-001 unbound/unknown attributes fail restrictions');
  const unrestricted=await ok('/catalog',{name:'Unrestricted service',kind:'access',target:'aud-any',ownerId:'owner'});
  assert.ok((await ok('/catalog',undefined,as('aud-bot','integration'))).items.some(i=>i.id===unrestricted.id),'CATALOG-001 empty dimensions are unrestricted');
  const pending=await ok('/pending-people',{name:'Pending',email:'pending-aud@example.test',startDate:'2028-01-03',team:'Sales',reviewed:true});
  const before=(await db.prepare('SELECT count(*) n FROM work_records').first()).n;
  assert.equal((await api('/work',{title:'No partial hold',body:'Needs review',pendingPersonId:pending.id,catalogIds:[item.id],deduplicationKey:'aud-pending-refused'})).status,422,'CATALOG-001 restricted pending holds refuse before opening work');
  const second=await ok('/catalog',{name:'Second restricted service',kind:'access',target:'aud-second',ownerId:'owner',audience});
  const bundle=await ok('/catalog-bundles',{name:'Audience bundle',catalogIds:[item.id,second.id,unrestricted.id]});
  const refusedBundle=await api(`/catalog-bundles/${bundle.id}/request`,{expectedRevision:bundle.revision,purpose:'Kit',deduplicationKey:'aud-bundle-refused'},as('aud-sales'));
  assert.equal(refusedBundle.status,422,'CATALOG-001 multi-item unsupported audience submission refuses all-or-nothing');
  assert.match(JSON.stringify(refusedBundle),/Audience monitor/);assert.match(JSON.stringify(refusedBundle),/Second restricted service/);
  assert.ok(!(await ok('/catalog-bundles',undefined,as('aud-out'))).items.some(b=>b.id===bundle.id),'CATALOG-001 bundles do not reveal ineligible child items in discovery');
  const hiddenBundle=await api(`/catalog-bundles/${bundle.id}/request`,{expectedRevision:bundle.revision,purpose:'Hidden kit',deduplicationKey:'aud-hidden-bundle'},as('aud-out'));
  assert.ok(!JSON.stringify(hiddenBundle).includes('Audience monitor')&&!JSON.stringify(hiddenBundle).includes('Second restricted service'),'CATALOG-001 direct bundle refusal contains no hidden child names');
  assert.equal((await db.prepare('SELECT count(*) n FROM work_records').first()).n,before,'CATALOG-001 refused multi-item doors open no partial work');
  for(const kind of ['person','catalog','member']) {
    const raceUser='aud-race-'+kind;
    await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(raceUser,raceUser+'@example.test',raceUser,'unused','2026-01-01').run();
    await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a',raceUser,'["employee"]').run();
    const rp=await bind(await facts(raceUser,attributes),raceUser);
    const ri=await ok('/catalog',{name:'Race '+kind,kind:'device',target:'race-'+kind,ownerId:'owner',capacity:2,audience});
    const rw=await request(raceUser);
    const result=await api(`/work/${rw.id}/fulfilment`,{catalogId:ri.id,catalogRevision:1,beneficiaryId:raceUser,purpose:'Race test'},
      {...as(raceUser),'x-catalog-race':kind,'x-catalog-target':kind==='person'?rp.id:kind==='catalog'?ri.id:raceUser});
    assert.equal(result.status,409,`CATALOG-001 ${kind} drift at commit refuses`);
    for(const table of ['work_fulfilments','work_catalog_reservations','work_obligations'])
      assert.equal((await db.prepare(`SELECT count(*) n FROM ${table} WHERE work_id=?`).bind(rw.id).first()).n,0,`CATALOG-001 ${kind} drift rolls back ${table}`);
  }
  await ok('/people',{source,sourceId:'aud-sales',name:'Alice',effectiveAt:'2026-02-01T00:00:00.000Z',observedAt:'2026-02-01T00:00:00.000Z',expectedRevision:alice.revision,attributes:{...attributes,department:legal.id}});
  assert.ok(!(await ok('/catalog',undefined,as('aud-sales'))).items.some(i=>i.id===item.id),'CATALOG-001 current review changes discovery immediately');
  const next=await request('aud-sales');assert.equal((await submit(next,'aud-sales')).status,403,'CATALOG-001 submission rechecks reviewed facts');
  assert.deepEqual((await submit(work,'aud-sales')).value.catalogSnapshot,first.value.catalogSnapshot,'CATALOG-001 audience gates new submission, not in-flight retries');
  await ok(`/catalog-values/${support.id}`,{label:'Support',revision:1,active:false});
  assert.ok((await ok('/catalog',undefined,as('aud-support'))).items.some(i=>i.id===item.id),'CATALOG-001 retiring a referenced value preserves existing matches');
  assert.equal((await api('/people',{source,sourceId:'retired',name:'Retired',effectiveAt:'2026-01-01',observedAt:'2026-01-01',attributes:{department:support.id}})).status,422,'CATALOG-001 new reviews cannot select retired values');
  const snapshot=JSON.parse((await db.prepare('SELECT catalog_snapshot_json FROM work_fulfilments WHERE work_id=?').bind(work.id).first()).catalog_snapshot_json);
  assert.deepEqual(snapshot,first.value.catalogSnapshot,'CATALOG-001 item and person changes never rewrite submitted facts');
  assert.equal((await db.prepare('SELECT count(*) n FROM work_fulfilments WHERE work_id=?').bind(denied.id).first()).n,0,'CATALOG-001 refusal leaves no fulfilment');
  assert.equal((await db.prepare('SELECT count(*) n FROM work_catalog_reservations WHERE work_id=?').bind(denied.id).first()).n,0,'CATALOG-001 refusal leaves no stock reservation');
  const audits=(await db.prepare("SELECT detail_json FROM audit_events WHERE action='work.person_source_reviewed' AND target=?").bind(alice.id).all()).results;
  assert.ok(audits.length);assert.ok(audits.every(a=>!a.detail_json.includes(sales.id)&&!a.detail_json.includes(legal.id)),'CATALOG-001 attribute review audits name dimensions only');
  await ok(`/people/${bob.id}/binding`,{expectedRevision:bob.revision,memberId:null});
  assert.ok(!(await ok('/catalog',undefined,as('aud-support'))).items.some(i=>i.id===item.id),'CATALOG-001 unbinding makes reviewed attributes unknown');
  for(const boundary of ['future','inactive','merged']) {
    const user='aud-'+boundary;
    await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(user,user+'@example.test',user,'unused','2026-01-01').run();
    await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a',user,'["employee"]').run();
    const p=await bind(await facts(user,attributes,{},boundary==='future'?{effectiveAt:'2099-01-01T00:00:00.000Z'}:{}),user);
    if(boundary!=='future')await ok(`/people/${p.id}/commands`,{revision:p.revision,command:boundary==='merged'?'merge':'deactivate',...(boundary==='merged'?{target:alice.id}:{})});
    assert.ok(!(await ok('/catalog',undefined,as(user))).items.some(c=>c.id===item.id),`CATALOG-001 ${boundary} person facts count as unknown`);
  }
  const current=await db.prepare('SELECT revision FROM work_people WHERE id=?').bind(outsider.id).first();
  await ok(`/people/${outsider.id}/erase`,{revision:current.revision,reason:'CATALOG-001 erase reviewed audience facts'});
  assert.equal((await db.prepare('SELECT attributes_json FROM work_people WHERE id=?').bind(outsider.id).first()).attributes_json,'{}','CATALOG-001 erasure removes reviewed attribute facts');
  console.log('PASS CATALOG-001 stable lists, owner/HR dated reviews, OR/AND/unknown audience, no owner bypass, staff filing, revisions, snapshots, fail-closed multi-item doors and erasure');
}

import { employeeNoticeChecks } from './employee-notice-cases.mjs';
import { templateChecks } from './template-cases.mjs';
import { calendarChecks } from './calendar-cases.mjs';
import { dependencyChecks } from './dependency-cases.mjs';
import { applyMigrations } from '../sql-migrations.mjs';
import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {Miniflare,convertV4MiniflareOptions}=require('../../node_modules/.pnpm/miniflare@5.20260907.0-alpha/node_modules/miniflare')
const {build}=require('../../node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild')
const dir=await mkdtemp(path.join(tmpdir(),'linen-services-'))
await build({entryPoints:[new URL('./worker.ts',import.meta.url).pathname],outfile:path.join(dir,'worker.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022'})
const mf=new Miniflare(convertV4MiniflareOptions({ port: Number(process.env.LINEN_TEST_WORKER_PORT || 0), modules:true,script:await readFile(path.join(dir,'worker.mjs'),'utf8'),compatibilityDate:'2026-09-01',d1Databases:{DB:'services-test'},bindings:{SESSION_SECRET:'test-only',APP_ORIGIN:'https://linen.example.test',ENCRYPTION_KEY:btoa('a'.repeat(32))}}))
try{
 const db=await mf.getD1Database('DB')
 await applyMigrations(db);
 const fixtureAt=new Date().toISOString();
 for(const workspace of ['w1','w2'])await db.prepare('INSERT INTO workspaces(id,name,created_at) VALUES(?,?,?)').bind(workspace,'synthetic-linen-14001',fixtureAt).run();
 for(const user of ['owner','employee','operator','approver'])await db.prepare('INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,?,?)').bind(user,user+'@example.test',user,'synthetic-linen-14002',fixtureAt).run();
 for(const [w,u,roles] of [['w1','owner',['owner']],['w1','employee',['employee']],['w1','operator',['operator']],['w1','approver',['approver']],['w2','owner',['owner']]])await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind(w,u,JSON.stringify(roles)).run();
 await db.prepare("INSERT INTO work_records(id,workspace_id,requester_id,beneficiary_id,sensitivity,kind,title,created_at,updated_at,dedup_key) VALUES('work-1','w1','employee','employee','normal','incident','synthetic-linen-14003',?,?,'synthetic-linen-14004')").bind(fixtureAt,fixtureAt).run();
 async function request(method,url,body,headers={}){const response=await mf.dispatchFetch('http://localhost'+url,{method,headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});const json=response.headers.get('content-type')?.includes('text/calendar')?await response.text():await response.json();return {status:response.status,json,headers:Object.fromEntries(response.headers)}}
 async function ok(method,url,body,headers){const r=await request(method,url,body,headers);assert.ok(r.status<300,JSON.stringify(r));return r.json}
 const service=await ok('POST','/services',{name:'Orders',description:'Order entry',businessImpact:'Sales cannot work',source:'owner',observedAt:new Date().toISOString(),visibility:'workspace'})
 const privateService=await ok('POST','/services',{name:'Private',description:'Restricted',businessImpact:'Restricted',source:'owner',observedAt:new Date().toISOString(),visibility:'restricted'})
 assert.deepEqual((await ok('GET',`/service-history/${service.id}`,undefined,{'x-user':'employee','x-roles':'["employee"]'})).items,[],'DESK-017 readable public service does not expose internal field history');
 assert.equal((await request('GET','/services/'+privateService.id,null,{'x-user':'employee','x-roles':'["employee"]'})).status,404)
 assert.equal((await request('GET','/services/'+service.id,null,{'x-workspace':'w2'})).status,404)
 const edge={from:service.id,to:privateService.id,relationship:'depends_on',provenance:'observed',source:'monitor',sourceRevision:'1',observedAt:'2020-01-01T00:00:00Z',effectiveAt:'2020-01-01T00:00:00Z',freshnessMs:1000,value:true}
 await ok('POST','/service-graph/edges',edge);await ok('POST','/service-graph/edges',{...edge,sourceRevision:'2',value:false})
 const graph=await ok('GET','/service-graph');assert.equal(graph.edges.length,2);assert.equal(graph.edges[0].fresh,false);assert.equal(graph.edges[0].conflicts.length,1)
 const employeeGraph=await ok('GET','/service-graph',null,{'x-user':'employee','x-roles':'["employee"]'});assert.equal(employeeGraph.edges.length,0)
 let incident=await ok('POST','/incidents',{title:'Orders unavailable',serviceId:service.id,impact:'All sales',cohorts:['a','b'],visibility:'restricted'})
 assert.equal((await request('POST',`/incidents/${incident.id}/updates`,{revision:incident.revision,message:'private',recipientIds:['employee']})).status,403)
 const proof={evidenceId:'independent-a',incidentId:incident.id,serviceId:service.id,cohort:'a',observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),verifierVersion:'1',independent:true,usable:true,negativeChecksPassed:true,executionId:'op',source:'probe'}
 assert.equal((await request('POST',`/incidents/${incident.id}/recovery`,{revision:incident.revision,evidence:[{...proof,evidenceId:'self-report'}]})).status,422)
 incident=await ok('POST',`/incidents/${incident.id}/recovery`,{revision:incident.revision,evidence:[proof]});assert.equal(incident.data.status,'partially-restored');assert.deepEqual(incident.data.unresolvedCohorts,['b'])
 incident=await ok('POST',`/incidents/${incident.id}/link`,{revision:incident.revision,employeeIncidentId:'work-1'});assert.equal(incident.data.links[0].recovery,'unverified')
 incident=await ok('POST',`/incidents/${incident.id}/link`,{revision:incident.revision,employeeIncidentId:'work-1',correction:true});assert.equal(incident.data.links.length,0)
 const changeBody={title:'Repair integration',risk:'Bounded sales outage',impact:'Sales',services:[service.id],window:{start:new Date(Date.now()-60000).toISOString(),end:new Date(Date.now()+3600000).toISOString()},cohorts:['a','b'],canaryCohorts:['a'],implementation:{target:'orders',payload:{version:'2'}},compensation:{target:'orders',payload:{version:'1'}}}
 let change=await ok('POST','/changes',changeBody)
 change=await ok('POST',`/changes/${change.id}/authorize`,{revision:change.revision,reason:'Approved bounded repair',grantReferences:[{id:'g',version:1}]})
 const revision=change.revision
 change=await ok('PATCH',`/changes/${change.id}`,{revision,title:'Amended repair'})
 assert.equal(change.data.authorizations.length,0);assert.equal(change.data.priorAuthorizations.length,1)
 const originalHistory=(await ok('GET',`/service-history/${change.id}`)).items;
 const amendment=originalHistory.find(e=>e.action==='implementation-amended');
 assert.deepEqual(amendment.changes.find(c=>c.field==='title'),{field:'title',before:changeBody.title,after:change.data.title},'DESK-017 service amendment retains original field values');
 assert.ok(amendment.actor&&amendment.at);
 assert.ok(originalHistory.every(e=>!Object.hasOwn(e,'data_json')),'DESK-017 no raw service payload door');
 assert.equal((await request('GET',`/service-history/${change.id}`,undefined,{'x-user':'employee','x-roles':'["employee"]'})).status,404);
 const beforeFailed=await ok('GET',`/changes/${change.id}`);
 await db.prepare(`CREATE TRIGGER synthetic_linen_history_failure BEFORE INSERT ON svc_events WHEN NEW.record_id='${change.id}' BEGIN SELECT RAISE(ABORT,'synthetic-linen-701'); END`).run();
 assert.equal((await request('PATCH',`/changes/${change.id}`,{revision:change.revision,title:'synthetic-linen-702'})).status,500);
 await db.exec('DROP TRIGGER synthetic_linen_history_failure');
 assert.deepEqual(await ok('GET',`/changes/${change.id}`),beforeFailed,'DESK-017 history append failure rolls back service mutation');
 assert.deepEqual((await ok('GET',`/service-history/${change.id}`)).items,originalHistory);
 change=await ok('PATCH',`/changes/${change.id}`,{revision:change.revision,title:change.data.title});
 assert.deepEqual((await ok('GET',`/service-history/${change.id}`)).items,originalHistory,'DESK-017 unchanged change edit preserves authority and adds no event');

 assert.equal((await request('POST',`/changes/${change.id}/dispatch`,{revision:change.revision,phase:'canary',idempotencyKey:'first'})).status,409)
 change=await ok('POST',`/changes/${change.id}/authorize`,{revision:change.revision,reason:'Approve amended plan',grantReferences:[{id:'g',version:2}]})
 let conflict=await ok('POST','/changes',changeBody);conflict=await ok('POST',`/changes/${conflict.id}/authorize`,{revision:conflict.revision,reason:'Conflicting plan',grantReferences:[{id:'g',version:1}]})
 assert.equal((await request('POST',`/changes/${change.id}/dispatch`,{revision:change.revision,phase:'canary',idempotencyKey:'first'})).json.error.code,'conflicting_change','CHANGE-004 admitted same-CI overlapping changes cannot dispatch')
 await db.prepare("UPDATE svc_records SET data_json=json_set(data_json,'$.state','cancelled') WHERE id=?").bind(conflict.id).run()
 change=await ok('POST',`/changes/${change.id}/dispatch`,{revision:change.revision,phase:'canary',idempotencyKey:'first'})
 change=await ok('POST',`/changes/${change.id}/verify`,{revision:change.revision,invocationId:change.data.invocations[0].id});assert.equal(change.data.state,'canary-verified')
 change=await ok('POST',`/changes/${change.id}/dispatch`,{revision:change.revision,phase:'compensate',idempotencyKey:'rollback'})
 change=await ok('POST',`/changes/${change.id}/verify`,{revision:change.revision,invocationId:change.data.invocations.at(-1).id});assert.equal(change.data.state,'compensation-incomplete')
 let supplier=await ok('POST','/suppliers',{name:'Provider',services:[service.id],contract:'Signed #123',currency:'AUD',cost:100,costPeriod:'month',renewalAt:new Date(Date.now()+100000).toISOString()})
 supplier=await ok('POST',`/suppliers/${supplier.id}/commitments`,{revision:supplier.revision,outcome:'Restore gateway',dueAt:'2020-01-01T00:00:00Z',ownerId:'owner',source:'contract clause 4'})
 const concurrent=await Promise.all(['first','second'].map(outcome=>request('POST',`/suppliers/${supplier.id}/commitments`,{revision:supplier.revision,outcome,dueAt:new Date(Date.now()+3600000).toISOString(),ownerId:'owner',source:'contract clause 5'})));assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409],'Exactly one concurrent mutation wins');
 const suppliers=await ok('GET','/suppliers');assert.equal(suppliers.items[0].breaches.length,1)
 let decision=await ok('POST','/decisions',{title:'Renew supplier',contextId:supplier.id,holderId:'owner',holderRoles:['owner'],options:[{id:'renew',label:'Renew',consequences:'AUD 100 monthly'},{id:'replace',label:'Replace',consequences:'Migration work'}],recommendation:'renew',quote:'AUD 100 monthly',quoteSource:'Provider quote #123',terms:'12 month term',cohorts:['sales'],impact:'Preserve service',reversibility:'Cancellation fee',deadline:new Date(Date.now()+3600000).toISOString(),uncertainty:'Future usage unknown'})
 decision=await ok('POST',`/decisions/${decision.id}/choose`,{revision:decision.revision,optionId:'renew',reason:'Keep service'});assert.equal(decision.data.state,'chosen');assert.match(decision.data.authority,/separate current grant/)
 assert.equal((await request('POST',`/decisions/${decision.id}/choose`,{revision:1,optionId:'renew',reason:'Replay'})).status,409)
 const secret=(await ok('POST','/fixture/secret',{signingSecret:'fixture-signing-secret'})).secret;
 await db.prepare('INSERT INTO connections(id,workspace_id,provider,status,config_json,secret_ciphertext,name,created_at,updated_at) VALUES(?,?,?,?,?,?,\'synthetic-linen-14005\',datetime(\'now\'),datetime(\'now\'))').bind('monitor-connection','w1','monitoring-webhook','inbound-unobserved','{}',secret).run();
 const monitor=await ok('POST','/monitors',{name:'Orders monitor',serviceId:service.id,connectionId:'monitor-connection',freshnessMs:1000,cohorts:['a','b']});
 const event={id:'event-1',serviceId:service.id,status:'failed',observedAt:new Date().toISOString()};
 const timestamp=String(Math.floor(Date.now()/1000)),sig=b=>createHmac('sha256','fixture-signing-secret').update(timestamp+'.'+JSON.stringify(b)).digest('hex');
 assert.equal((await request('POST',`/monitors/${monitor.id}/events`,event,{'X-Linen-Timestamp':timestamp,'X-Linen-Signature':'0'.repeat(64)})).status,401);
 const signed={'X-Linen-Timestamp':timestamp,'X-Linen-Signature':sig(event)};
 assert.equal((await ok('POST',`/monitors/${monitor.id}/events`,event,signed)).status,'failed');assert.equal((await db.prepare('SELECT status FROM connections WHERE id=?').bind('monitor-connection').first()).status,'active');assert.equal((await db.prepare('SELECT connection_revision FROM connection_validations WHERE connection_id=?').bind('monitor-connection').first()).connection_revision,1);
 assert.equal((await ok('POST',`/monitors/${monitor.id}/events`,event,signed)).duplicate,true);
 const changed={...event,status:'healthy'};
 assert.equal((await request('POST',`/monitors/${monitor.id}/events`,changed,{'X-Linen-Timestamp':timestamp,'X-Linen-Signature':sig(changed)})).status,409);
 await db.prepare("UPDATE svc_records SET data_json=json_set(data_json,'$.observedAt','2020-01-01T00:00:00Z') WHERE id=?").bind(monitor.id).run();
 await ok('POST','/services/process-due',{});assert.equal((await ok('GET','/monitors/'+monitor.id)).data.status,'unknown');
 let asset=await ok('POST','/software-assets',{name:'Sales seat',serviceId:service.id,assetType:'software',externalId:'seat-1',source:'purchase receipt',currency:'AUD',acquisitionCost:100,observedAt:new Date().toISOString()});asset=await ok('POST',`/software-assets/${asset.id}/assign`,{revision:asset.revision,personId:'employee',workId:'work-1',receipt:'Assignment receipt #1',source:'Provider observation'});assert.equal(asset.data.lifecycle,'assigned');assert.equal((await request('POST',`/software-assets/${asset.id}/transition`,{revision:asset.revision,state:'disposed',evidence:'Requested disposal'})).status,409);asset=await ok('POST',`/software-assets/${asset.id}/return`,{revision:asset.revision,receipt:'Independent return receipt'});asset=await ok('POST',`/software-assets/${asset.id}/transition`,{revision:asset.revision,state:'disposed',evidence:'Disposal receipt #2'});assert.equal(asset.data.lifecycle,'disposed');
 const softwareHistory=(await ok('GET',`/service-history/${asset.id}`)).items;
 assert.deepEqual(softwareHistory.find(e=>e.action==='asset-assigned').changes.find(c=>c.field==='state'),{field:'state',before:'acquired',after:'assigned'});
 assert.deepEqual(softwareHistory.find(e=>e.action==='asset-lifecycle').changes.find(c=>c.field==='state'),{field:'state',before:'returned',after:'disposed'});
 assert.equal(softwareHistory.filter(e=>e.action==='asset-lifecycle').length,1,'DESK-017 refused software disposal adds no event');

 supplier=await ok('GET','/suppliers/'+supplier.id);supplier=await ok('POST',`/suppliers/${supplier.id}/observations`,{revision:supplier.revision,commitmentId:supplier.data.commitments[0].id,outcome:'met',source:'Supplier status',evidence:'Restoration record',observedAt:new Date().toISOString()},{'x-user':'operator','x-roles':'["operator"]'});assert.equal(supplier.data.commitments[0].state,'reported-met');assert.equal((await request('POST',`/suppliers/${supplier.id}/review-outcome`,{revision:supplier.revision,commitmentId:supplier.data.commitments[0].id,evidence:'Same observer'},{'x-user':'operator','x-roles':'["operator"]'})).status,409);supplier=await ok('POST',`/suppliers/${supplier.id}/review-outcome`,{revision:supplier.revision,commitmentId:supplier.data.commitments[0].id,evidence:'Separate contract owner review'});assert.equal(supplier.data.commitments[0].state,'verified');
 const report=await ok('GET','/service-reports');assert.equal(report.incoming,1);assert.equal(report.verified,0);assert.equal(report.pendingCohorts,1);assert.equal(report.recurrence.rate,null)
 await ok('POST','/oncall-rotations',{serviceId:service.id,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),recipientIds:['owner']});
 const event2={...event,id:'event-2',observedAt:new Date().toISOString()};const signed2={'X-Linen-Timestamp':timestamp,'X-Linen-Signature':sig(event2)};
 await ok('POST',`/webhooks/monitoring/${monitor.id}`,event2,signed2);await ok('POST','/services/process-due',{});
 const detected=(await ok('GET','/incidents')).items.find(r=>r.data.monitorEventKey===monitor.id+':event-2');assert.ok(detected,'Signed degradation establishes incident');assert.equal(detected.data.routing,'pending_delivery');
 const notices=await ok('GET','/service-notifications');assert.ok(notices.items.some(n=>n.record_id===detected.id&&n.kind==='oncall-page'&&n.state==='pending'),'On-call delivery remains accountable when unconfigured');
 await ok('POST',`/webhooks/monitoring/${monitor.id}`,event2,signed2);await ok('POST','/services/process-due',{});assert.equal((await ok('GET','/incidents')).items.filter(r=>r.data.monitorEventKey===monitor.id+':event-2').length,1,'Duplicate monitoring does not duplicate shared incidents');
 const notificationSecret=(await ok('POST','/fixture/secret',{token:'notification-fixture'})).secret;
 await db.prepare('INSERT INTO connections(id,workspace_id,provider,status,config_json,secret_ciphertext,name,created_at,updated_at) VALUES(?,?,?,?,?,?,\'synthetic-linen-14005\',datetime(\'now\'),datetime(\'now\'))').bind('notify','w1','notification-webhook','active',JSON.stringify({url:'https://notification.fixture.test/send',allowedHosts:['notification.fixture.test']}),notificationSecret).run();await db.prepare('INSERT INTO workspace_settings(workspace_id,settings_json) VALUES(?,?)').bind('w1',JSON.stringify({notificationConnectionId:'notify'})).run();
 const delivered=await ok('POST','/services/process-due',{});assert.ok(delivered.notifications.some(n=>n.state==='submitted'),'Configured provider submission uses real notification adapter');
 const submitted=(await ok('GET','/service-notifications')).items.find(n=>n.state==='submitted');assert.ok(submitted);const reconciled=await ok('POST',`/service-notifications/${submitted.id}/reconcile`,{});assert.equal(reconciled.state,'delivered','Fresh provider readback establishes delivery');
 const deliveredHistory=(await ok('GET',`/service-history/${submitted.record_id}`)).items.filter(e=>e.kind==='notification');
 const deliveryStates=deliveredHistory.filter(e=>e.changes.some(c=>c.field==='notificationId'&&c.after===submitted.id)||e.changes.some(c=>c.field==='deliveryState'&&c.after==='delivered'));
 assert.ok(deliveryStates.some(e=>e.delivery.state==='pending'),'DESK-017 immutable queued notification is visible');
 assert.ok(deliveredHistory.some(e=>e.delivery.state==='sending'));
 assert.ok(deliveredHistory.some(e=>e.delivery.state==='submitted'));
 assert.ok(deliveredHistory.some(e=>e.delivery.state==='delivered'),'DESK-017 provider acceptance and verified delivery remain distinct historical states');
 const beforeReplay=(await ok('GET',`/service-history/${submitted.record_id}`)).items;
 await ok('POST',`/service-notifications/${submitted.id}/reconcile`,{});
 assert.deepEqual((await ok('GET',`/service-history/${submitted.record_id}`)).items,beforeReplay,'DESK-017 terminal reconciliation replay adds no event');

 // Signed monitoring sources share the public intake lifecycle, not provider success claims.
 const monitoringService=await ok('POST','/services',{name:'SSO monitoring',description:'New sign-ins',businessImpact:'Employees cannot sign in',source:'owner',observedAt:new Date().toISOString()});
 await ok('POST','/oncall-rotations',{serviceId:monitoringService.id,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),recipientIds:['owner']});
 for(const [index,source] of ['uptime','pagerduty','datadog','spool','generic'].entries()) {
  const externalMonitorId='synthetic-linen-'+(600+index);
  const input={name:source+' SSO check',serviceId:monitoringService.id,connectionId:'monitor-connection',source,externalMonitorId,priority:'P1',freshnessMs:60000,cohorts:['employee']};
  if(source!=='generic')assert.equal((await request('POST','/monitors',input,{'x-user':'operator','x-roles':'["operator"]'})).status,403,'Only an owner binds a named source');
  const bound=await ok('POST','/monitors',input);
  const instant=Date.now()-5000;
  function wire(sequence,status,at=instant+sequence) {
   const id='synthetic-linen-'+index+'-'+sequence;
   if(source==='uptime')return {schemaVersion:2,id,kind:status==='healthy'?'recovery':'trigger',monitorId:externalMonitorId,observedAt:at};
   if(source==='pagerduty')return {event:{id,event_type:status==='healthy'?'incident.resolved':'incident.triggered',occurred_at:new Date(at).toISOString(),data:{id:'synthetic-linen-incident-'+index,service:{id:externalMonitorId}}}};
   return {id,source,monitorId:externalMonitorId,serviceId:monitoringService.id,status,observedAt:new Date(at).toISOString(),priority:'P1'};
  }
  function headers(body) {
   const raw=JSON.stringify(body);
   if(source==='uptime')return {'x-lamp-timestamp':timestamp,'x-lamp-signature':createHmac('sha256','fixture-signing-secret').update(timestamp+'.'+raw).digest('base64url')};
   if(source==='pagerduty')return {'x-pagerduty-signature':'v1='+createHmac('sha256','fixture-signing-secret').update(raw).digest('hex')};
   return {'x-linen-timestamp':timestamp,'x-linen-signature':sig(body)};
  }
  const url='/webhooks/monitoring/'+bound.id,first=wire(1,'failed');
  assert.equal((await request('POST',url,first,{})).status,401,'Unsigned provider payload refused');
  const bad=structuredClone(first);
  if(source==='pagerduty')bad.event.data.service.id='synthetic-linen-other';else if(source==='generic')bad.serviceId='synthetic-linen-other';else bad.monitorId='synthetic-linen-other';
  assert.ok((await request('POST',url,bad,headers(bad))).status>=400,'Signed event cannot choose a different service or monitor');
  await ok('POST',url,first,headers(first));
  assert.equal((await ok('POST',url,first,headers(first))).duplicate,true);
  const again=wire(2,'failed'),recovery=wire(3,'healthy');
  await ok('POST',url,again,headers(again));await ok('POST',url,recovery,headers(recovery));
  await ok('POST','/services/process-due',{});
  const episodes=()=>ok('GET','/incidents').then(v=>v.items.filter(i=>i.data.monitorId===bound.id));
  let observed=await episodes();assert.equal(observed.length,1,'Repeated alerts and recovery before a scheduler tick establish one outage');
  assert.equal(observed[0].data.monitorEvents.length,3);assert.equal(observed[0].data.monitorRecovery.status,'healthy');assert.equal(observed[0].data.status,'investigating','Source recovery alone is not independently verified usable-work recovery');
  const episodeId=observed[0].id;
  await ok('POST','/services/process-due',{});assert.equal((await episodes())[0].revision,observed[0].revision,'Projection and paging replay add no event');
  assert.equal((await db.prepare("SELECT state FROM work_records WHERE id='work-1'").first()).state,'open','Monitoring recovery never closes employee tickets');
  const older=wire(4,'failed',instant-1000);await ok('POST',url,older,headers(older));await ok('POST','/services/process-due',{});assert.equal((await episodes()).length,1,'Out-of-order failure cannot reopen an outage');
  const stale=wire(5,'failed',Date.now()-120000);await ok('POST',url,stale,headers(stale));await ok('POST','/services/process-due',{});assert.equal((await episodes()).length,1,'Expired source observation cannot open an incident');
  const next=wire(6,'failed');await ok('POST',url,next,headers(next));
  await Promise.all([ok('POST','/services/process-due',{}),ok('POST','/services/process-due',{})]);await ok('POST','/services/process-due',{});
  observed=await episodes();assert.equal(observed.length,2,'Concurrent scheduler workers establish one new outage after recovery');
  const pages=(await ok('GET','/service-notifications')).items.filter(n=>observed.some(i=>i.id===n.record_id)&&n.kind==='oncall-page');
  assert.equal(pages.length,2,'Each outage pages its rotation once');assert.ok(observed.some(i=>i.id===episodeId));
 }
 const publicCause=await ok('POST','/incidents',{title:'Public interruption',serviceId:service.id,impact:'Public service interruption',cohorts:['employee'],visibility:'workspace'});
 const employeeCause=await ok('GET','/incidents/'+publicCause.id,undefined,{'x-user':'employee','x-roles':'["employee"]'});
 assert.ok(!Object.hasOwn(employeeCause.data,'suspectedChanges')&&!Object.hasOwn(employeeCause.data,'changeCause')&&!Object.hasOwn(employeeCause.data,'monitorEvents')&&!Object.hasOwn(employeeCause.data,'monitorId')&&!Object.hasOwn(employeeCause.data,'monitorAlertKey'),'Employee projection excludes internal monitoring and causal evidence');
 await employeeNoticeChecks(request, db);
 await dependencyChecks(request);
 await calendarChecks(request,db);
 await templateChecks(request,db);
 console.log('SERVICES: real D1 privacy/tenant isolation, graph stale conflicts, private audience denial, independent partial cohort recovery, wrong-link correction, amended approval invalidation, conflicting windows, canary dispatch, incomplete compensation, supplier breaches, scoped business decisions and signed monitoring/replay rejection/staleness/automatic incident and on-call routing and actual notification adapter submission/readback and honest report denominators passed')
}finally{await mf.dispose();await rm(dir,{recursive:true,force:true})}

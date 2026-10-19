import { templateChecks } from './template-cases.mjs';
import { calendarChecks } from './calendar-cases.mjs';
import { dependencyChecks } from './dependency-cases.mjs';
import { sqlStatements } from '../sql-migrations.mjs';
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
const mf=new Miniflare(convertV4MiniflareOptions({ port: Number(process.env.LINEN_TEST_WORKER_PORT || 0), modules:true,script:await readFile(path.join(dir,'worker.mjs'),'utf8'),compatibilityDate:'2026-09-01',d1Databases:{DB:'services-test'},bindings:{SESSION_SECRET:'test-only',ENCRYPTION_KEY:btoa('a'.repeat(32))}}))
try{
 const db=await mf.getD1Database('DB')
 const schema=await readFile(new URL('../../migrations/0300_services.sql',import.meta.url),'utf8')
 await db.exec('CREATE TABLE memberships(workspace_id TEXT,user_id TEXT,roles_json TEXT,active INTEGER); CREATE TABLE audit_events(id TEXT,workspace_id TEXT,actor_id TEXT,action TEXT,target TEXT,detail_json TEXT,created_at TEXT); CREATE TABLE connections(id TEXT,workspace_id TEXT,provider TEXT,status TEXT,config_json TEXT,secret_ciphertext TEXT,revision INTEGER DEFAULT 1); CREATE TABLE connection_validations(workspace_id TEXT,connection_id TEXT,connection_revision INTEGER,validated_at TEXT,state TEXT,evidence_json TEXT,PRIMARY KEY(workspace_id,connection_id)); CREATE TABLE workspace_settings(workspace_id TEXT,settings_json TEXT); CREATE TABLE adoption_holds(workspace_id TEXT,state TEXT); CREATE TABLE adoption_ownership(workspace_id TEXT,resource TEXT,action TEXT);')
 for(const sql of sqlStatements(schema))await db.prepare(sql).run();
 for(const sql of sqlStatements(await readFile(new URL('../../migrations/0749_change_calendar.sql',import.meta.url),'utf8')))await db.prepare(sql).run();await db.exec("CREATE TABLE work_records(id TEXT,workspace_id TEXT,requester_id TEXT,beneficiary_id TEXT,sensitivity TEXT,kind TEXT,state TEXT DEFAULT 'open',created_at TEXT DEFAULT '2020-01-01',context_json TEXT DEFAULT '{}',revision INTEGER DEFAULT 1); INSERT INTO work_records(id,workspace_id,requester_id,beneficiary_id,sensitivity,kind) VALUES('work-1','w1','employee','employee','normal','incident');")
 for(const [w,u,roles] of [['w1','owner',['owner']],['w1','employee',['employee']],['w1','operator',['operator']],['w1','approver',['approver']],['w2','owner',['owner']]])await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind(w,u,JSON.stringify(roles)).run()
 async function request(method,url,body,headers={}){const response=await mf.dispatchFetch('http://localhost'+url,{method,headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});const json=response.headers.get('content-type')?.includes('text/calendar')?await response.text():await response.json();return {status:response.status,json,headers:Object.fromEntries(response.headers)}}
 async function ok(method,url,body,headers){const r=await request(method,url,body,headers);assert.ok(r.status<300,JSON.stringify(r));return r.json}
 const service=await ok('POST','/services',{name:'Orders',description:'Order entry',businessImpact:'Sales cannot work',source:'owner',observedAt:new Date().toISOString(),visibility:'workspace'})
 const privateService=await ok('POST','/services',{name:'Private',description:'Restricted',businessImpact:'Restricted',source:'owner',observedAt:new Date().toISOString(),visibility:'restricted'})
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
 await db.prepare('INSERT INTO connections(id,workspace_id,provider,status,config_json,secret_ciphertext) VALUES(?,?,?,?,?,?)').bind('monitor-connection','w1','monitoring-webhook','inbound-unobserved','{}',secret).run();
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
 supplier=await ok('GET','/suppliers/'+supplier.id);supplier=await ok('POST',`/suppliers/${supplier.id}/observations`,{revision:supplier.revision,commitmentId:supplier.data.commitments[0].id,outcome:'met',source:'Supplier status',evidence:'Restoration record',observedAt:new Date().toISOString()},{'x-user':'operator','x-roles':'["operator"]'});assert.equal(supplier.data.commitments[0].state,'reported-met');assert.equal((await request('POST',`/suppliers/${supplier.id}/review-outcome`,{revision:supplier.revision,commitmentId:supplier.data.commitments[0].id,evidence:'Same observer'},{'x-user':'operator','x-roles':'["operator"]'})).status,409);supplier=await ok('POST',`/suppliers/${supplier.id}/review-outcome`,{revision:supplier.revision,commitmentId:supplier.data.commitments[0].id,evidence:'Separate contract owner review'});assert.equal(supplier.data.commitments[0].state,'verified');
 const report=await ok('GET','/service-reports');assert.equal(report.incoming,1);assert.equal(report.verified,0);assert.equal(report.pendingCohorts,1);assert.equal(report.recurrence.rate,null)
 await ok('POST','/oncall-rotations',{serviceId:service.id,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),recipientIds:['owner']});
 const event2={...event,id:'event-2',observedAt:new Date().toISOString()};const signed2={'X-Linen-Timestamp':timestamp,'X-Linen-Signature':sig(event2)};
 await ok('POST',`/webhooks/monitoring/${monitor.id}`,event2,signed2);await ok('POST','/services/process-due',{});
 const detected=(await ok('GET','/incidents')).items.find(r=>r.data.monitorEventKey===monitor.id+':event-2');assert.ok(detected,'Signed degradation establishes incident');assert.equal(detected.data.routing,'pending_delivery');
 const notices=await ok('GET','/service-notifications');assert.ok(notices.items.some(n=>n.record_id===detected.id&&n.kind==='oncall-page'&&n.state==='pending'),'On-call delivery remains accountable when unconfigured');
 await ok('POST',`/webhooks/monitoring/${monitor.id}`,event2,signed2);await ok('POST','/services/process-due',{});assert.equal((await ok('GET','/incidents')).items.filter(r=>r.data.monitorEventKey===monitor.id+':event-2').length,1,'Duplicate monitoring does not duplicate shared incidents');
 const notificationSecret=(await ok('POST','/fixture/secret',{token:'notification-fixture'})).secret;
 await db.prepare('INSERT INTO connections(id,workspace_id,provider,status,config_json,secret_ciphertext) VALUES(?,?,?,?,?,?)').bind('notify','w1','notification-webhook','active',JSON.stringify({url:'https://notification.fixture.test/send',allowedHosts:['notification.fixture.test']}),notificationSecret).run();await db.prepare('INSERT INTO workspace_settings VALUES(?,?)').bind('w1',JSON.stringify({notificationConnectionId:'notify'})).run();
 const delivered=await ok('POST','/services/process-due',{});assert.ok(delivered.notifications.some(n=>n.state==='submitted'),'Configured provider submission uses real notification adapter');
 const submitted=(await ok('GET','/service-notifications')).items.find(n=>n.state==='submitted');assert.ok(submitted);const reconciled=await ok('POST',`/service-notifications/${submitted.id}/reconcile`,{});assert.equal(reconciled.state,'delivered','Fresh provider readback establishes delivery');
 await dependencyChecks(request);
 await calendarChecks(request,db);
 await templateChecks(request,db);
 console.log('SERVICES: real D1 privacy/tenant isolation, graph stale conflicts, private audience denial, independent partial cohort recovery, wrong-link correction, amended approval invalidation, conflicting windows, canary dispatch, incomplete compensation, supplier breaches, scoped business decisions and signed monitoring/replay rejection/staleness/automatic incident and on-call routing and actual notification adapter submission/readback and honest report denominators passed')
}finally{await mf.dispose();await rm(dir,{recursive:true,force:true})}

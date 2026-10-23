import { departmentSourceChecks } from './department-source-cases.mjs';
import { operationsKpiChecks } from './kpi-cases.mjs';
import { templateIntegration, templateErasureCheck } from './template-integration.mjs';
import { changeRiskChecks } from './risk-cases.mjs';
import { releaseChecks } from './release-cases.mjs';
import { applyMigrations } from '../sql-migrations.mjs';
import assert from 'node:assert/strict'
import {createHash,createHmac} from 'node:crypto'
import {createRequire} from 'node:module'
import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'))
const {build}=wr('esbuild'),{Miniflare,convertV4MiniflareOptions}=wr('miniflare')
const dir=await mkdtemp(join(tmpdir(),'linen-services-integration-'));let mf
try{
await build({entryPoints:['tests/services/integration-worker.ts'],outfile:join(dir,'worker.mjs'),bundle:true,format:'esm',platform:'neutral',logLevel:'silent'})
mf=new Miniflare(convertV4MiniflareOptions({ port: Number(process.env.LINEN_TEST_WORKER_PORT || 0), modules:true,script:await readFile(join(dir,'worker.mjs'),'utf8'),compatibilityDate:'2026-09-01',d1Databases:['DB'],r2Buckets:['ATTACHMENTS'],bindings:{ENCRYPTION_KEY:btoa('x'.repeat(32)),SESSION_SECRET:'test-only'}}))
const db=await mf.getD1Database('DB')
await applyMigrations(db)
const now=new Date().toISOString();await db.prepare("INSERT INTO workspaces VALUES('w','Service integration fixture',?)").bind(now).run()
for(const user of ['owner','operator']){await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(user,user+'@fixture.test',user,'fixture',now).run();await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('w',user,JSON.stringify([user])).run()}
await db.prepare("INSERT INTO workspace_settings VALUES('w','{}',1)").run()
async function call(method,path,body,user='owner',workspace='w',headers={}){const response=await mf.dispatchFetch('http://localhost'+path,{method,headers:{'content-type':'application/json','x-user':user,'x-workspace':workspace,...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()}}
async function ok(method,path,body,user){const r=await call(method,path,body,user);assert.ok(r.status<300,JSON.stringify(r));return r.body}
for(const [id,provider,config] of [['deploy','controlled-deployment',{url:'https://deployment.fixture.test/change',allowedHosts:['deployment.fixture.test'],targets:['orders']}],['probe','workflow-probe',{url:'https://probe.fixture.test/check',allowedHosts:['probe.fixture.test']}]]){const secret=(await ok('POST','/fixture/secret',{token:'fixture'})).secret;await db.prepare('INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)').bind(id,'w',provider,id,JSON.stringify(config),secret,'active',now,now).run()}
// Public development doors: signed native events, current owner custody and private projections.
async function developmentChecks() {
 const at=new Date().toISOString(),signingSecret='synthetic-linen-42001';
 await db.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind('development','Development proof',at).run();
 for(const user of ['owner','operator'])await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('development',user,JSON.stringify([user])).run();
 const devCall=(method,path,body,user='owner',workspace='development',headers={})=>call(method,path,body,user,workspace,headers);
 const devOk=async(method,path,body,user)=>{const r=await devCall(method,path,body,user);assert.ok(r.status<300,JSON.stringify(r));return r.body};
 await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('dev-employee','development@example.test','Employee','synthetic-linen-42002',at).run();
 await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('development','dev-employee',JSON.stringify(['employee'])).run();
 const work=await devOk('POST','/work',{title:'Engineering issue',body:'A normal incident',kind:'incident',beneficiaryId:'dev-employee',deduplicationKey:'synthetic-linen-42003'});
 const bindingBody={kind:'issue',targetId:work.id,repositoryId:42001,repositoryName:['synthetic-linen','issues'].join('/'),issueNumber:42,signingSecret,consent:true};
 assert.equal((await devCall('POST','/development-bindings',bindingBody,'operator')).status,403);
 assert.equal((await devCall('POST','/development-bindings',{...bindingBody,consent:false})).status,422);
 const binding=await devOk('POST','/development-bindings',bindingBody);
 assert.ok(!JSON.stringify(await devOk('GET','/development-bindings')).includes(signingSecret));
 let sequence=0;
 const send=(bindingId,event,type='issues',delivery='synthetic-linen-'+(++sequence))=>devCall('POST','/webhooks/development/'+bindingId,event,'owner','development',{'x-github-delivery':delivery,'x-github-event':type,'x-hub-signature-256':'sha256='+createHmac('sha256',signingSecret).update(JSON.stringify(event)).digest('hex')});
 const event={action:'closed',repository:{id:42001,full_name:bindingBody.repositoryName},issue:{number:42,state:'closed',updated_at:at}};
 assert.equal((await devCall('POST','/webhooks/development/'+binding.id,event)).status,401);
 assert.equal((await send(binding.id,{...event,repository:{...event.repository,id:7}})).status,422);
 const closed=await send(binding.id,event,'issues','synthetic-linen-42004');assert.equal(closed.status,200,JSON.stringify(closed));
 assert.equal((await send(binding.id,event,'issues','synthetic-linen-42004')).body.duplicate,true);
 assert.equal((await send(binding.id,event,'issues','synthetic-linen-42014')).body.duplicate,true);
 const replay=await send(binding.id,{...event,action:'reopened',issue:{...event.issue,state:'open'}},'issues','synthetic-linen-42004');assert.equal(replay.status,409);
 const conversation=await devOk('GET','/work/'+work.id);
 assert.equal(conversation.work.state,'paused');assert.equal(conversation.messages.filter(m=>m.body.includes('Verify with employee')).length,1);
 assert.equal(conversation.messages.find(m=>m.body.includes('Verify with employee')).visibility,'private');
 const employee=await devOk('GET','/work/'+work.id,undefined,'dev-employee');assert.ok(employee.messages.every(m=>m.visibility==='public'));
 const comment={...event,action:'created',comment:{id:42005,created_at:at,body:'synthetic-linen-42006 private engineering context'}};
 assert.equal((await send(binding.id,comment,'issue_comment')).status,200);
 assert.ok((await devOk('GET','/work/'+work.id)).messages.some(m=>m.body.includes(comment.comment.body)));
 assert.ok(!(await devOk('GET','/work/'+work.id,undefined,'dev-employee')).messages.some(m=>m.body.includes(comment.comment.body)));
 assert.equal((await send(binding.id,{...event,issue:{...event.issue,updated_at:'2000-01-01T00:00:00Z'}})).status,422);
 const service=await devOk('POST','/services',{name:'Development SSO',description:'Sign-in',businessImpact:'Employees',source:'reviewed',observedAt:at});
 let template=await devOk('POST','/change-templates',{title:'Production deployment context',risk:'Bounded',impact:'Employees',services:[service.id],cohorts:['sales'],canaryCohorts:['sales'],implementation:{target:'orders',payload:{release:'reviewed'}},compensation:{target:'orders',payload:{release:'prior'}},implementationPlan:'Record reviewed deployment',testPlan:'Independent verification required',backoutPlan:'Separate grant required',active:true});
 template=await devOk('POST','/change-templates/'+template.id+'/approve',{revision:template.revision,version:template.data.version,reason:'Reviewed exact production plan'});
 const deploymentBinding=await devOk('POST','/development-bindings',{...bindingBody,kind:'deployment',targetId:template.id,templateVersion:template.data.version});
 const deployment={repository:event.repository,deployment:{id:42007,environment:'production',production_environment:true,created_at:at,payload:{pullRequestNumber:42,runId:42008}}};
 assert.equal((await send(deploymentBinding.id,{...deployment,deployment:{...deployment.deployment,environment:'staging'}},'deployment')).status,422);
 const results=await Promise.all([send(deploymentBinding.id,deployment,'deployment','synthetic-linen-42009'),send(deploymentBinding.id,deployment,'deployment','synthetic-linen-42009')]);
 assert.ok(results.every(r=>r.status===200),JSON.stringify(results));assert.equal(results.filter(r=>!r.body.duplicate).length,1);
 const change=await devOk('GET','/changes/'+results[0].body.resultId);
 assert.equal(change.data.changeType,'standard');assert.equal(change.data.state,'preapproved');assert.equal(change.data.developmentContext.pullRequest,'https://github.com/'+bindingBody.repositoryName+'/pull/42');assert.ok(change.data.developmentContext.run.endsWith('/actions/runs/42008'));
 assert.deepEqual(change.data.authorizations,[]);assert.deepEqual(change.data.invocations,[]);
 const deniedDispatch=await devCall('POST','/changes/'+change.id+'/dispatch',{revision:change.revision,phase:'canary',idempotencyKey:'synthetic-linen-42010'});
 assert.equal(deniedDispatch.status,409);assert.equal(deniedDispatch.body.error.code,'authorization');
 await devOk('POST','/development-bindings/'+binding.id+'/revoke',{});
 assert.equal((await send(binding.id,comment,'issue_comment')).status,404);
 const erasedWork=await devOk('POST','/work',{title:'Erasure boundary',body:'Normal incident',beneficiaryId:'dev-employee',deduplicationKey:'synthetic-linen-42015'});
 const erasedBinding=await devOk('POST','/development-bindings',{...bindingBody,targetId:erasedWork.id});
 await devOk('POST','/people/'+'dev-employee'+'/erase',{revision:1,reason:'Authorized synthetic erasure'});
 assert.equal((await send(erasedBinding.id,comment,'issue_comment')).status,404,'Subject erasure revokes inbound authority');
 assert.equal((await devCall('POST','/development-bindings',{...bindingBody,targetId:erasedWork.id})).status,409,'Erased subjects cannot be rebound');
 await db.prepare("UPDATE memberships SET active=0 WHERE workspace_id='development' AND user_id='owner'").run();
 assert.equal((await send(deploymentBinding.id,{...deployment,deployment:{...deployment.deployment,id:42011}},'deployment')).status,404);
 await db.prepare("UPDATE memberships SET active=1 WHERE workspace_id='development' AND user_id='owner'").run();
 template=await devOk('PATCH','/change-templates/'+template.id,{revision:template.revision,active:false});
 assert.equal((await send(deploymentBinding.id,{...deployment,deployment:{...deployment.deployment,id:42012}},'deployment')).status,409);
 // A different current owner erases the consenting owner through the public door.
 await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('dev-successor','successor@example.test','Successor','synthetic-linen-43001',at).run();
 await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('development','dev-successor','["owner"]').run();
 const ownerWork=await devOk('POST','/work',{title:'Owner consent erasure',body:'Normal incident',deduplicationKey:'synthetic-linen-43002'},'dev-successor');
 const ownerBinding=await devOk('POST','/development-bindings',{...bindingBody,targetId:ownerWork.id});
 await devOk('POST','/people/owner/erase',{revision:0,reason:'Authorized owner erasure'},'dev-successor');
 for(const key of [ownerBinding.id,deploymentBinding.id]) {
  assert.deepEqual(await db.prepare('SELECT active,secret_ciphertext,owner_id FROM svc_development_bindings WHERE id=?').bind(key).first(),{active:0,secret_ciphertext:null,owner_id:'[erased]'},'Owner erasure clears both kinds of inbound credential');
 }
 assert.equal((await send(ownerBinding.id,comment,'issue_comment')).status,404,'Erased owner issue binding refuses signed events');
 assert.equal((await send(deploymentBinding.id,{...deployment,deployment:{...deployment.deployment,id:43003}},'deployment')).status,404,'Erased owner deployment binding refuses signed events');
 console.log('PASS developmentChecks: signed issue closure and private comments, replay and scope refusals, production standard change with PR and run, no effect authority; owner erasure revokes both binding kinds and clears secrets');
}
await developmentChecks();
await departmentSourceChecks({ok,call,db});
await operationsKpiChecks({ok,call,implementation:{connectionId:'deploy',connectionRevision:1,verifierConnectionRevision:1,target:'orders',beneficiaryId:'sales',verifierConnectionId:'probe',payload:{release:'kpi-proof'}}});
await ok('POST','/fixture/state',{reset:true});
const {releaseId}=await releaseChecks({ok,call,db,implementation:{connectionId:'deploy',connectionRevision:1,verifierConnectionRevision:1,target:'orders',beneficiaryId:'sales',verifierConnectionId:'probe',payload:{release:'r2'}}});
await ok('POST','/fixture/state',{reset:true});
const service=await ok('POST','/services',{name:'Orders',description:'Usable order preparation',businessImpact:'Sales interrupted',source:'fixture',observedAt:now})
const automaticIncident=await ok('POST','/incidents',{title:'Automatic cohort recovery',serviceId:service.id,impact:'Sales cannot work',cohorts:['a','b']});
const unrelatedService=await ok('POST','/services',{name:'Unrelated service',description:'Another workflow',businessImpact:'Separate cohort',source:'fixture',observedAt:now});
const unrelatedIncident=await ok('POST','/incidents',{title:'Must not borrow Orders evidence',serviceId:unrelatedService.id,impact:'Different workflow',cohorts:['a','b']});
const implementation={connectionId:'deploy',connectionRevision:1,verifierConnectionRevision:1,target:'orders',beneficiaryId:'sales',verifierConnectionId:'probe',payload:{release:'r2'}}
let change=await ok('POST','/changes',{title:'Fix Orders',emergency:true,emergencyReason:'Current owner authorizes an urgent Orders repair',risk:'Bounded',impact:'Sales',services:[service.id],window:{start:new Date(Date.now()-60000).toISOString(),end:new Date(Date.now()+3600000).toISOString()},cohorts:['a','b'],canaryCohorts:['a','b'],implementation,compensation:{...implementation,payload:{release:'r1'}}})
const references=[]
for(const phase of ['canary','rollout','compensate']){const payload={...(phase==='compensate'?{release:'r1'}:{release:'r2'}),phase,cohorts:['a','b'],implementationRevision:1};const grant=await ok('POST','/grants',{principalId:'operator',beneficiaryId:'sales',action:'deployment.'+phase,actionVersion:1,target:'orders',connectionId:'deploy',validFrom:new Date(Date.now()-60000).toISOString(),validUntil:new Date(Date.now()+3600000).toISOString(),maxUses:10,conditions:{payloadHash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')}});references.push({id:grant.id,version:grant.version,phase})}
change=await ok('POST',`/changes/${change.id}/authorize`,{revision:change.revision,reason:'Approve exact bounded implementation',grantReferences:references})
const ordinary=await ok('POST','/changes',{title:'Ordinary Orders release',risk:'Bounded',impact:'Sales',services:[service.id],window:change.data.window,cohorts:['a','b'],canaryCohorts:['a','b'],implementation,compensation:{...implementation,payload:{release:'r1'}}});
const frozenBody={title:'Orders release freeze',kind:'freeze',window:change.data.window,services:[service.id],active:true};
const freeze=await ok('POST','/change-windows',frozenBody);
assert.equal((await call('POST',`/changes/${ordinary.id}/dispatch`,{revision:ordinary.revision,phase:'canary',idempotencyKey:'freeze-refusal'},'operator')).body.error.code,'calendar_frozen','CHANGE-004 a later freeze fences dispatch before any provider write');
assert.equal((await ok('POST','/fixture/state',{})).writes,0,'CHANGE-004 freeze refusal sends no provider bytes');
assert.equal((await call('PATCH',`/changes/${ordinary.id}`,{revision:ordinary.revision,emergency:true,emergencyReason:'Self asserted',emergencySchedulingActor:'owner'},'operator')).status,409,'CHANGE-004 an operator cannot forge emergency scheduling authority');
change=await ok('POST',`/changes/${change.id}/dispatch`,{revision:change.revision,phase:'canary',idempotencyKey:'canary-1'},'operator');assert.equal(change.data.state,'effect_verified',JSON.stringify(change));assert.equal((await ok('POST','/fixture/state',{})).writes,1)
await ok('POST','/change-windows/'+freeze.id,{...frozenBody,revision:freeze.revision,active:false});
await ok('POST','/fixture/state',{partial:true});change=await ok('POST',`/changes/${change.id}/verify`,{revision:change.revision,invocationId:change.data.invocations[0].id},'operator');assert.notEqual(change.data.state,'canary-verified','partial cohort cannot certify canary');await ok('POST','/services/process-due',{});assert.equal((await ok('GET','/incidents/'+automaticIncident.id)).data.status,'investigating','Partial unadmitted execution cannot restore a cohort')
await ok('POST','/fixture/state',{});change=await ok('POST',`/changes/${change.id}/verify`,{revision:change.revision,invocationId:change.data.invocations[0].id},'operator');assert.equal(change.data.state,'canary-verified')
change=await ok('POST',`/changes/${change.id}/dispatch`,{revision:change.revision,phase:'rollout',idempotencyKey:'rollout-1'},'operator');change=await ok('POST',`/changes/${change.id}/verify`,{revision:change.revision,invocationId:change.data.invocations.at(-1).id},'operator');assert.equal(change.data.state,'verified')
// A signed failure during implementation links automatically; causal attribution still needs a human.
const monitorSecret=(await ok('POST','/fixture/secret',{signingSecret:'synthetic-linen-710'})).secret;
await db.prepare('INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)').bind('causal-monitor','w','monitoring-webhook','SSO evidence','{}',monitorSecret,'inbound-unobserved',now,now).run();
const causalMonitor=await ok('POST','/monitors',{name:'SSO Uptime check',serviceId:service.id,source:'uptime',externalMonitorId:'synthetic-linen-711',priority:'P1',connectionId:'causal-monitor',freshnessMs:60000,cohorts:['a','b']});
await ok('POST','/oncall-rotations',{serviceId:service.id,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),recipientIds:['owner']});
const failure={schemaVersion:2,id:'synthetic-linen-712',monitorId:'synthetic-linen-711',kind:'trigger',observedAt:Date.now()};
const signedAt=String(Math.floor(Date.now()/1000));
const alert=await call('POST',`/monitors/${causalMonitor.id}/events`,failure,'owner','w',{'x-lamp-timestamp':signedAt,'x-lamp-signature':createHmac('sha256','synthetic-linen-710').update(signedAt+'.'+JSON.stringify(failure)).digest('base64url')});assert.equal(alert.status,200,JSON.stringify(alert));
await ok('POST','/services/process-due',{});
let caused=(await ok('GET','/incidents')).items.find(i=>i.data.monitorId===causalMonitor.id);assert.ok(caused);
assert.equal(caused.data.suspectedChanges.find(c=>c.changeId===change.id).state,'suspected','No manual cause entry is needed');
assert.ok(!caused.data.suspectedChanges.some(c=>c.changeId===ordinary.id),'A draft with no implementation start is not a suspected cause');
assert.equal((await call('POST',`/incidents/${caused.id}/change-cause`,{revision:caused.revision,changeId:change.id,decision:'confirmed',reason:'Temporal proximity alone'})).status,422,'A causal review needs evidence references');
caused=await ok('POST',`/incidents/${caused.id}/change-cause`,{revision:caused.revision,changeId:change.id,decision:'confirmed',reason:'The observed Uptime failure followed the admitted deployment',evidenceIds:[failure.id,change.data.invocations[0].executionId]});
assert.equal(caused.data.changeCause.state,'confirmed');
const causalReport=await ok('GET','/operations-kpis?start='+encodeURIComponent(new Date(Date.now()-3600000).toISOString())+'&end='+encodeURIComponent(new Date(Date.now()+60000).toISOString())+'&timezone=UTC');
assert.equal(causalReport.metrics.find(m=>m.key==='change.success').records.find(r=>r.id===change.id).outcome,'failed','A confirmed change-caused incident defeats deployment-only success');
assert.equal(causalReport.metrics.find(m=>m.key==='change.caused-incidents').numerator,1);
caused=await ok('POST',`/incidents/${caused.id}/change-cause`,{revision:caused.revision,changeId:change.id,decision:'rejected',reason:'Independent review identifies a separate upstream failure',evidenceIds:[failure.id]});assert.equal(caused.data.changeCause,null);assert.equal(caused.data.suspectedChanges.find(c=>c.changeId===change.id).state,'rejected');
await ok('POST','/services/process-due',{});
const recoveredIncident=await ok('GET','/incidents/'+automaticIncident.id);assert.equal(recoveredIncident.data.status,'restored');assert.deepEqual(recoveredIncident.data.unresolvedCohorts,[]);assert.ok(recoveredIncident.data.recoveries.every(e=>e.source==='probe'));
assert.equal((await ok('GET','/incidents/'+unrelatedIncident.id)).data.status,'investigating','Unrelated service cannot borrow valid Orders evidence');
const revisionBefore=recoveredIncident.revision;await ok('POST','/services/process-due',{});assert.equal((await ok('GET','/incidents/'+automaticIncident.id)).revision,revisionBefore,'Same proof is never reinserted on scheduler replay');
assert.equal((await ok('POST','/fixture/state',{})).writes,2);assert.equal((await db.prepare('SELECT COUNT(*) n FROM execution_verifications WHERE state=? AND operation_id IN (?,?)').bind('verified',...change.data.invocations.map(i=>i.executionId)).first()).n,2)
let nextChange=await ok('POST','/changes',{title:'Decision-driven release',risk:'Bounded',impact:'Sales',services:[service.id],window:{start:new Date(Date.now()-60000).toISOString(),end:new Date(Date.now()+3600000).toISOString()},cohorts:['a','b'],canaryCohorts:['a','b'],implementation,compensation:{...implementation,payload:{release:'r1'}}});
nextChange=await ok('POST',`/changes/${nextChange.id}/authorize`,{revision:nextChange.revision,reason:'Existing scoped grants',grantReferences:references});
const packet={title:'Choose release',contextId:nextChange.id,holderId:'owner',holderRoles:['owner'],executorId:'operator',options:[{id:'release',label:'Release',consequences:'Bounded deployment',effect:{kind:'change',phase:'release',changeId:nextChange.id,implementationRevision:1}},{id:'hold',label:'Hold',consequences:'Service remains unchanged'}],recommendation:'release',quote:'No new purchase',quoteSource:'Current contract',terms:'Existing provider account',cohorts:['a','b'],impact:'Orders recovery',reversibility:'Compensation release r1',deadline:new Date(Date.now()+600000).toISOString(),uncertainty:'Probe each cohort'};
let decision=await ok('POST','/decisions',packet);decision=await ok('POST',`/decisions/${decision.id}/choose`,{revision:decision.revision,optionId:'release',reason:'Proceed within granted scope'});assert.equal(decision.data.fulfilment.state,'canary-verified');
await ok('POST','/services/process-due',{});decision=await ok('GET',`/decisions/${decision.id}`);assert.equal(decision.data.fulfilment.state,'verified');assert.equal((await ok('POST','/fixture/state',{})).writes,4);
await ok('POST',`/grants/${references[0].id}/revoke`,{version:references[0].version});
let blocked=await ok('POST','/changes',{title:'Missing authority release',risk:'Bounded',impact:'Sales',services:[service.id],window:{start:new Date(Date.now()-60000).toISOString(),end:new Date(Date.now()+3600000).toISOString()},cohorts:['a','b'],canaryCohorts:['a','b'],implementation,compensation:{...implementation,payload:{release:'r1'}}});blocked=await ok('POST',`/changes/${blocked.id}/authorize`,{revision:blocked.revision,reason:'Decision is not a grant',grantReferences:references});
let blockedDecision=await ok('POST','/decisions',{...packet,contextId:blocked.id,options:[{...packet.options[0],effect:{...packet.options[0].effect,changeId:blocked.id}},packet.options[1]]});blockedDecision=await ok('POST',`/decisions/${blockedDecision.id}/choose`,{revision:blockedDecision.revision,optionId:'release',reason:'Still requires grant'});assert.equal(blockedDecision.data.fulfilment.state,'needs-authority-or-evidence');assert.equal(blockedDecision.data.fulfilment.error,'grant_revoked');assert.equal((await ok('POST','/fixture/state',{})).writes,4);
const {personalTemplateId}=await templateIntegration({ok,call,db,implementation});
await changeRiskChecks({ok,call,db,implementation,references});
await db.prepare("UPDATE workspace_settings SET settings_json='{\"executionHeld\":true}' WHERE workspace_id='w'").run();
const exported=await db.prepare('SELECT * FROM svc_records WHERE id=?').bind(change.id).first();
const restored=await ok('POST','/fixture/restore',{table:'svc_records',row:{...exported,id:'restored-change'},sourceId:'archive',sourceKey:change.id});assert.equal(restored.inert,true);
const imported=await ok('GET','/changes/restored-change');assert.equal(imported.data.state,'imported-review');assert.equal(imported.data.authorizations.length,0);assert.ok(imported.data.priorAuthorizations.length);
const releaseRow=await db.prepare('SELECT * FROM svc_records WHERE id=?').bind(releaseId).first();await ok('POST','/fixture/restore',{table:'svc_records',row:{...releaseRow,id:'restored-release'},sourceId:'archive',sourceKey:releaseId});
const restoredRelease=await ok('GET','/releases/restored-release');assert.equal(restoredRelease.data.state,'imported-review');assert.equal(restoredRelease.data.decisions.length,0,'CHANGE-007 a restored go/no-go is history, never live deployment authority');
const erased=await ok('POST','/fixture/erase',{userId:'operator',reason:'Authorised fixture erasure'});assert.ok(erased.erasedRecords>0);
const afterErasure=await ok('GET',`/decisions/${decision.id}`);assert.equal(afterErasure.data.executorId,erased.subject);assert.equal(afterErasure.participants.includes('operator'),false);
await templateErasureCheck(ok,personalTemplateId);
console.log('SERVICES integration: actual execution port + D1 grant binding, persisted canary/deployment intent, controlled HTTP adapter fixture, independent full-cohort verification, partial-cohort rejection, rollout, service-fence release, decision-to-granted-release scheduling and revoked-grant refusal, inert native restore and domain erasure passed (four fixture writes; no external provider writes).')
}finally{await mf?.dispose();await rm(dir,{recursive:true,force:true})}

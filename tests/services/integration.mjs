import { templateIntegration, templateErasureCheck } from './template-integration.mjs';
import { changeRiskChecks } from './risk-cases.mjs';
import { applyMigrations } from '../sql-migrations.mjs';
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
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
async function call(method,path,body,user='owner'){const response=await mf.dispatchFetch('http://localhost'+path,{method,headers:{'content-type':'application/json','x-user':user},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()}}
async function ok(method,path,body,user){const r=await call(method,path,body,user);assert.ok(r.status<300,JSON.stringify(r));return r.body}
for(const [id,provider,config] of [['deploy','controlled-deployment',{url:'https://deployment.fixture.test/change',allowedHosts:['deployment.fixture.test'],targets:['orders']}],['probe','workflow-probe',{url:'https://probe.fixture.test/check',allowedHosts:['probe.fixture.test']}]]){const secret=(await ok('POST','/fixture/secret',{token:'fixture'})).secret;await db.prepare('INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)').bind(id,'w',provider,id,JSON.stringify(config),secret,'active',now,now).run()}
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
await ok('POST','/services/process-due',{});
const recoveredIncident=await ok('GET','/incidents/'+automaticIncident.id);assert.equal(recoveredIncident.data.status,'restored');assert.deepEqual(recoveredIncident.data.unresolvedCohorts,[]);assert.ok(recoveredIncident.data.recoveries.every(e=>e.source==='probe'));
assert.equal((await ok('GET','/incidents/'+unrelatedIncident.id)).data.status,'investigating','Unrelated service cannot borrow valid Orders evidence');
const revisionBefore=recoveredIncident.revision;await ok('POST','/services/process-due',{});assert.equal((await ok('GET','/incidents/'+automaticIncident.id)).revision,revisionBefore,'Same proof is never reinserted on scheduler replay');
assert.equal((await ok('POST','/fixture/state',{})).writes,2);assert.equal((await db.prepare('SELECT COUNT(*) n FROM execution_verifications WHERE state=?').bind('verified').first()).n,2)
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
const erased=await ok('POST','/fixture/erase',{userId:'operator',reason:'Authorised fixture erasure'});assert.ok(erased.erasedRecords>0);
const afterErasure=await ok('GET',`/decisions/${decision.id}`);assert.equal(afterErasure.data.executorId,erased.subject);assert.equal(afterErasure.participants.includes('operator'),false);
await templateErasureCheck(ok,personalTemplateId);
console.log('SERVICES integration: actual execution port + D1 grant binding, persisted canary/deployment intent, controlled HTTP adapter fixture, independent full-cohort verification, partial-cohort rejection, rollout, service-fence release, decision-to-granted-release scheduling and revoked-grant refusal, inert native restore and domain erasure passed (four fixture writes; no external provider writes).')
}finally{await mf?.dispose();await rm(dir,{recursive:true,force:true})}

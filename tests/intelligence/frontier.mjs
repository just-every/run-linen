import assert from 'node:assert/strict'
import {mkdtemp,writeFile,readFile,mkdir,rm,realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {runtimeHarness} from './runtime-harness.mjs'
import {runEngineeringJob} from '../../engineering-agent/runner.mjs'
const harness=await runtimeHarness('tests/intelligence/worker.ts'),origin=harness.origin,dir=await realpath(await mkdtemp(join(tmpdir(),'linen-frontier-owned-'))),repo=join(dir,'repository');await mkdir(repo)
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim()
async function api(path,method='GET',body,auth={}){const r=await fetch(origin+'/api/v1'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(auth.cookie?{Cookie:auth.cookie}:{}),...(auth.csrf?{'X-Linen-CSRF':auth.csrf}:{}),...(auth.token?{Authorization:'Bearer '+auth.token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const value=await r.json();assert.ok(r.ok,JSON.stringify({path,status:r.status,value}));return {value,cookie:r.headers.get('set-cookie')}}
try{
 git('init');git('config','user.name','Linen fixture');git('config','user.email','fixture@example.test')
 await writeFile(join(repo,'claims.mjs'),'export function groups(claims) { return claims.roles ?? [] }\n')
 await writeFile(join(repo,'test.mjs'),"import {groups} from './claims.mjs';if(!groups({groups:['sales']}).includes('sales'))process.exit(1)\n")
 await writeFile(join(repo,'independent.mjs'),"import {groups} from './claims.mjs';if(groups({roles:['staff']})[0]!=='staff'||groups({groups:['sales']})[0]!=='sales'||groups({}).length!==0)process.exit(1)\n")
 git('add','.');git('commit','-m','unfamiliar rotated claim fixture');const pin=git('rev-parse','HEAD')
 const setup=await api('/setup','POST',{email:'frontier@example.test',name:'Frontier operator',workspaceName:'Frontier fixture',password:'frontier fixture owner password'}),owner={cookie:setup.cookie.split(';')[0]};const session=(await api('/session','GET',undefined,owner)).value;owner.csrf=session.csrfToken;const uid=session.principal.userId,wid=session.principal.workspaceId
 const issuerId=(await api('/members','POST',{email:'issuer@example.test',name:'Independent issuer',roles:['owner'],password:'independent issuer fixture passphrase'},owner)).value.id;const logged=await api('/login','POST',{email:'issuer@example.test',password:'independent issuer fixture passphrase'}),issuer={cookie:logged.cookie.split(';')[0]};issuer.csrf=(await api('/session','GET',undefined,issuer)).value.csrfToken
 const connection=async(provider,config,secret)=>(await(await fetch(origin+'/fixture/configuration',{method:'POST',body:JSON.stringify({workspaceId:wid,provider,name:provider,config,secret:JSON.stringify(secret)})})).json()).id
 const model=await connection('openai',{model:'fixture-model',inputUsdPerMillion:1,cachedInputUsdPerMillion:1,outputUsdPerMillion:1,maxOutputTokens:1000,maxAttemptUsd:1},{apiKey:'synthetic-fixture-model-credential'})
 const probe=await connection('workflow-probe',{url:'https://probe.example.test/observe',allowedHosts:['probe.example.test']},{token:'fixture-probe'})
 const deploy=await connection('controlled-deployment',{url:'https://deployment.example.test/release',allowedHosts:['deployment.example.test'],targets:['orders']},{token:'synthetic-fixture-deployment'})
 await api('/intelligence/budget','PUT',{limitUsd:2},owner)
 const c=(await api('/commitments','POST',{outcome:'Rotated identities can read orders',cohort:[uid,issuerId],observations:[{id:'a',description:'Fresh sales claim workflow',step:{action:'deployment.rollout',actionVersion:1,connectionId:deploy,verifierConnectionId:probe,target:'orders',beneficiaryId:uid,grantId:'not-dispatch-authority',grantVersion:1,cohort:[uid]}},{id:'b',description:'Existing staff claim negative alternative',step:{action:'deployment.rollout',actionVersion:1,connectionId:deploy,verifierConnectionId:probe,target:'orders',beneficiaryId:issuerId,grantId:'not-dispatch-authority',grantVersion:1,cohort:[issuerId]}}],freshnessSeconds:600,intervalSeconds:60,dependencies:[],participants:[],sensitivity:'internal',effectiveAt:new Date(Date.now()-1000).toISOString(),modelConnectionId:model},owner)).value
 const command=[process.execPath,'independent.mjs'],config={repository:repo,baseCommit:pin,allowedPaths:['claims.mjs'],contextPaths:['claims.mjs','test.mjs','independent.mjs'],independentPaths:['test.mjs','independent.mjs'],commitmentIds:[c.id],modelConnectionId:model,commands:{reproducer:[process.execPath,'test.mjs'],test:[process.execPath,'test.mjs'],check:command,canary:command,release:command,adoption:command},releaseRef:'refs/heads/linen-repaired'}
 const grant=(await api('/engineering/grants','POST',{config,expiresAt:new Date(Date.now()+3600000).toISOString()},owner)).value
 await fetch(origin+'/fixture/mode/engineering')
 const research=(await api('/research','POST',{commitmentId:c.id,connectionId:model,question:'New sales sessions cannot read orders after identity rotation. Distinguish application claims handling from routing.'},owner)).value
 const advanced=(await api('/research/'+research.id+'/advance','POST',{},owner)).value;assert.equal(advanced.state,'engineering_required');assert.ok(advanced.data.rounds[0].probes.every(p=>p.state==='failed'))
 const claimed=(await api('/engineering-agent/claim','POST',{},grant)).value;assert.ok(claimed.job);assert.equal(claimed.grant.id,grant.id)
 const bearer={token:grant.token};const receipt=await runEngineeringJob({job:claimed.job,grant:claimed.grant,receiptDirectory:join(dir,'receipts'),authorize:async()=>{await api('/engineering-agent/jobs/'+claimed.job.id+'/heartbeat','POST',{claimToken:claimed.claimToken},bearer);return true},design:async files=>(await api('/engineering-agent/jobs/'+claimed.job.id+'/design','POST',{claimToken:claimed.claimToken,files},bearer)).value})
 assert.equal(receipt.state,'adopted',JSON.stringify(receipt));assert.equal(git('rev-parse',config.releaseRef),receipt.commit);assert.equal(git('rev-parse','HEAD'),pin)
 await api('/engineering-agent/jobs/'+claimed.job.id+'/receipt','POST',{claimToken:claimed.claimToken,receipt},bearer)
 const payload={commit:receipt.commit},hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex')
 const executionGrant=(await api('/grants','POST',{principalId:uid,beneficiaryId:uid,action:'deployment.rollout',actionVersion:1,target:'orders',connectionId:deploy,validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+3600000).toISOString(),maxUses:10,conditions:{payloadHash:hash},verifierConnectionId:probe},issuer)).value
 const step={action:'deployment.rollout',actionVersion:1,connectionId:deploy,connectionRevision:1,target:'orders',beneficiaryId:uid,grantId:executionGrant.id,grantVersion:executionGrant.version,verifierConnectionId:probe,verifierConnectionRevision:1,cohort:[uid],payload}
 const plan=(await api('/plans','POST',{contextType:'commitment',workId:c.id,revision:c.revision,steps:[step],idempotencyKey:'frontier-repair'},owner)).value
 const ops=(await api('/plans/'+plan.id+'/dispatch','POST',{expectedRevision:plan.revision},owner)).value
 await api('/execution/process','POST',{},owner)
 const verified=(await api('/research/'+research.id+'/verify','POST',{operationId:ops[0].id},owner)).value;assert.equal(verified.state,'verified')
 const pkg=(await api('/research/'+research.id+'/compile','POST',{},owner)).value;assert.equal(pkg.version,1);assert.ok(pkg.data.conditions.every(x=>x.state==='failed'))
 await fetch(origin+'/fixture/mode/engineering');await api('/commitments/'+c.id+'/observe','POST',{},owner)
 const reuse=(await api('/capabilities/'+pkg.id+'/apply','POST',{commitmentId:c.id,plan:{steps:[step]}},owner)).value;assert.equal(reuse.state,'executing');assert.ok(reuse.planId!==plan.id)
 const opIds=(await api('/operations','GET',undefined,owner)).value.filter(o=>o.plan_id===reuse.planId).map(o=>o.id);assert.ok(opIds.length)
 const attempts=(await api('/intelligence/attempts','GET',undefined,owner)).value;assert.ok(attempts.filter(a=>a.kind==='model'&&a.state==='completed').length>=2)
 await fetch(origin+'/fixture/mode/near:'+issuerId);await api('/commitments/'+c.id+'/observe','POST',{},owner)
 const beforeNear=(await api('/operations','GET',undefined,owner)).value.length
 const near=(await api('/capabilities/'+pkg.id+'/apply','POST',{commitmentId:c.id,plan:{steps:[step]},versions:pkg.data.versions},owner)).value;assert.equal(near.state,'fresh_research');assert.equal((await api('/operations','GET',undefined,owner)).value.length,beforeNear)
 await api('/connections/'+model,'PATCH',{name:'Changed model',revision:1,config:{model:'fixture-model-changed',inputUsdPerMillion:1,cachedInputUsdPerMillion:1,outputUsdPerMillion:1,maxOutputTokens:1000,maxAttemptUsd:1}},owner)
 const drift=(await api('/capabilities/'+pkg.id+'/apply','POST',{commitmentId:c.id,plan:{steps:[step]},versions:pkg.data.versions},owner)).value;assert.equal(drift.state,'fresh_research');assert.ok(drift.admission.reasons.includes('version_drift'))
 await fetch(origin+'/fixture/mode/ok')
 const service=(await api('/services','POST',{name:'Orders',description:'Order workflow with claims bridge',businessImpact:'Sales cohort workflow',source:'owned-fixture',observedAt:new Date().toISOString(),freshnessMs:600000},owner)).value
 const redesignPayload={commit:receipt.commit,removeLegacyBridge:true}
 const implementation={connectionId:deploy,connectionRevision:1,verifierConnectionRevision:1,target:'orders',beneficiaryId:uid,verifierConnectionId:probe,payload:redesignPayload}
 let change=(await api('/changes','POST',{title:'Remove recurring claims bridge work',risk:'Bounded fixture release',impact:'Orders cohort',services:[service.id],window:{start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+3600000).toISOString()},cohorts:[uid],canaryCohorts:[uid],dependencies:[],implementation,compensation:{...implementation,payload:{commit:pin}}},owner)).value
 const refs=[]
 for(const phase of ['canary','rollout']){const phasePayload={...redesignPayload,phase,cohorts:[uid],implementationRevision:1};const g=(await api('/grants','POST',{principalId:uid,beneficiaryId:uid,action:'deployment.'+phase,actionVersion:1,target:'orders',connectionId:deploy,validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+3600000).toISOString(),maxUses:10,conditions:{payloadHash:createHash('sha256').update(JSON.stringify(phasePayload)).digest('hex')},verifierConnectionId:probe},issuer)).value;refs.push({...g,phase})}
 change=(await api('/changes/'+change.id+'/authorize','POST',{revision:change.revision,grantReferences:refs,reason:'Scoped fixture redesigned integration release'},owner)).value
 const simplification=(await api('/simplifications','POST',{commitmentId:c.id,changeId:change.id,redesign:'Remove the legacy bridge by consuming the canonical rotated claim contract',continuedRepair:'Keep adapting the bridge after claim rotations'},owner)).value
 assert.equal(simplification.data.baselineBasis,'machine_observed')
 for(let tick=0;tick<3;tick++)await api('/fixture/frontier','POST',{},owner)
 change=(await api('/changes/'+change.id,'GET',undefined,owner)).value;assert.equal(change.data.state,'verified');assert.ok(change.data.invocations.some(i=>i.phase==='canary'&&i.state==='verified'));assert.ok(change.data.invocations.some(i=>i.phase==='rollout'&&i.state==='verified'))
 const measured=(await api('/simplifications/'+simplification.id+'/measure','POST',{},owner)).value;assert.equal(measured.state,'measuring');assert.equal(measured.data.comparison.avoidedCostUsd,null);assert.ok(measured.data.machineMeasurement.totals.exposure>0);assert.ok(measured.data.machineMeasurement.coverage.excluded.includes('human effort'))
 await api('/connections/'+deploy,'PATCH',{name:'Changed deployment',revision:1,config:{url:'https://deployment.example.com/release',allowedHosts:['deployment.example.com'],targets:['orders']}},owner)
 const stale=(await api('/changes','POST',{title:'Stale pin must reject',risk:'Bounded',impact:'Orders',services:[service.id],window:{start:new Date(Date.now()-1000).toISOString(),end:new Date(Date.now()+3600000).toISOString()},cohorts:[uid],canaryCohorts:[uid],dependencies:[],implementation,compensation:{...implementation,payload:{commit:pin}}},owner)).value
 const authorizedStale=(await api('/changes/'+stale.id+'/authorize','POST',{revision:stale.revision,grantReferences:refs,reason:'Old approved pins cannot be silently refreshed'},owner)).value
 const rejected=await fetch(origin+'/api/v1/changes/'+stale.id+'/dispatch',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:owner.cookie,'X-Linen-CSRF':owner.csrf},body:JSON.stringify({revision:authorizedStale.revision,phase:'canary',idempotencyKey:'reject-stale-pins'})});assert.ok(!rejected.ok);assert.equal((await rejected.json()).error,'connection_changed')
 console.log('PASS frontier connected fixture: persistent commitment -> rival parallel probes -> standing engineering claim -> structured model edits of actual Git source -> failing reproducer/test/independent check -> granted local adoption -> real execution service deployment dispatch/readback/workflow verification -> verified package -> matching repeat dispatch -> granted service redesign canary/rollout and actual post-change observations/exposure/cost accounting without invented savings. Provider responses are fixtures; no production/provider write.')
}finally{await harness.close();await rm(dir,{recursive:true,force:true})}

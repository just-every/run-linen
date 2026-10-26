import {sandboxChecks} from './sandbox-cases.mjs'
import assert from 'node:assert/strict'
import { spawn,spawnSync } from 'node:child_process'
import { mkdtemp,rm,writeFile,readFile,readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join,resolve } from 'node:path'
import { createServer } from 'node:net'
import { pbkdf2Sync } from 'node:crypto'
const dir=await mkdtemp(join(tmpdir(),'linen-platform-'))
const socket=createServer();await new Promise(r=>socket.listen(Number(process.env.LINEN_TEST_PORT || 0),'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r))
const origin=`http://127.0.0.1:${port}`
const config=join(dir,'wrangler.json');await writeFile(config,JSON.stringify({name:'linen-platform-test',main:resolve('tests/platform/config-worker.ts'),compatibility_date:'2026-09-08',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:'DB',database_name:'linen',database_id:'local-linen'}],r2_buckets:[{binding:'ATTACHMENTS',bucket_name:'linen-test-attachments'}],vars:{SESSION_SECRET:'synthetic-fixture-only-session-key',ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}}))
const migrationFiles=(await readdir('migrations')).filter(file=>file.endsWith('.sql')).sort()
const migrationSql=join(dir,'migrations.sql')
await writeFile(migrationSql,(await Promise.all(migrationFiles.map(file=>readFile('migrations/'+file,'utf8')))).join('\n'))
const migrate=spawnSync('pnpm',['exec','wrangler','d1','execute','DB','--local','--persist-to',dir,'--file',migrationSql],{encoding:'utf8'});assert.equal(migrate.status,0,migrate.stdout+migrate.stderr)
let worker,owner,output=''
async function start(){worker=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--config',process.env.LINEN_TEST_EMITTED?'dist/server/wrangler.json':config,'--persist-to',dir,'--port',String(port)],{stdio:['ignore','pipe','pipe']});worker.once('exit',(code,signal)=>{output+=`\nConfiguration worker exited: pid=${worker.pid} code=${code} signal=${signal}\n`});worker.stdout.on('data',x=>output+=x);worker.stderr.on('data',x=>output+=x);for(let i=0;i<120;i++){try{if((await fetch(origin+'/health')).ok)return}catch{}if(worker.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,250))}throw Error(output)}
async function stop(){worker.kill('SIGTERM');await new Promise(r=>worker.exitCode!==null?r():worker.once('exit',r))}
async function request(path,method='GET',body,auth={},extra={}){return fetch(origin+'/api/v1'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(auth.cookie?{Cookie:auth.cookie}:{}),...(auth.csrf?{'X-Linen-CSRF':auth.csrf}:{}),...extra},body:body===undefined?undefined:body instanceof Uint8Array?body:JSON.stringify(body)})}
try {
 await start()
 const setup=await request('/setup','POST',{email:'config@example.test',name:'Owner',password:'correct horse battery staple',workspaceName:'Config'})
 assert.equal(setup.status,201,await setup.clone().text())
 // First-owner setup requires an empty identity store. Close the Worker while
 // the separate D1 fixture process changes its database, then reopen the native session.
 await stop()
 {
  const fixtureHash='fixture-salt:'+pbkdf2Sync('other tenant safe password','fixture-salt',100000,32,'sha256').toString('hex')
  const fixture=spawnSync('pnpm',['exec','wrangler','d1','execute','DB','--local','--persist-to',dir,'--command',`INSERT INTO workspaces VALUES('other-workspace','Other','2026-01-01T00:00:00.000Z'); INSERT INTO users VALUES('other-user','other@example.test','Other','${fixtureHash}','2026-01-01T00:00:00.000Z'); INSERT INTO memberships VALUES('other-workspace','other-user','["owner"]',1);`],{encoding:'utf8'});assert.equal(fixture.status,0,fixture.stdout+fixture.stderr)
 }
 await start()
 owner={cookie:setup.headers.get('set-cookie').split(';')[0]}
 owner.csrf=(await (await request('/session','GET',undefined,owner)).json()).csrfToken
 const fixture=async b=>{const r=await fetch(origin+'/test/config-fixture',{method:'POST',headers:{Origin:origin,Cookie:owner.cookie,'X-Linen-CSRF':owner.csrf,'Content-Type':'application/json'},body:JSON.stringify(b)});assert.equal(r.status,200,await r.clone().text());return r.json()}
 const endpoint={url:'https://ops.example.com/linen',allowedHosts:['ops.example.com']}
 const configs={
  'microsoft-graph':{tenantId:'12345678-1234-1234-1234-123456789abc'},
  openai:{model:'account-model',inputUsdPerMillion:1,cachedInputUsdPerMillion:0.1,outputUsdPerMillion:4,maxOutputTokens:4000,maxAttemptUsd:1,contextCharacters:24000,reasoningEffort:'high'},
  'workflow-probe':endpoint,'controlled-deployment':{...endpoint,targets:['production/orders']},'notification-webhook':endpoint,'monitoring-webhook':{},
  sendgrid:{from:'Linen <linen@example.com>',webhookPublicKey:'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEaxfR8uEsQkf4vOblY6RA8ncDfYEt6zOg9KE5RdiYwpZP40Li/hp/m47n60p8D54WK84zV2sxXs7LtkBoN79R9Q=='},freshservice:{domain:'linen.freshservice.com'},'future-provider':{tenant:'inert'}
 }
 const ids={}
 for(const [provider,config] of Object.entries(configs)){
  const r=await request('/connections','POST',{provider,name:provider,config,secret:'synthetic-linen-426'},owner)
  assert.equal(r.status,201,provider+': '+await r.clone().text());ids[provider]=(await r.json()).id
 }
 const listed=await (await request('/connections','GET',undefined,owner)).json()
 for(const row of listed){assert.deepEqual(JSON.parse(row.config_json),configs[row.provider]);assert.equal(row.status,'unverified');assert.equal(row.has_secret,1)}
 assert.ok(!JSON.stringify(listed).includes('synthetic-linen-426'));assert.ok(!JSON.stringify(listed).includes('secret_ciphertext'))
 assert.equal((await request('/connections')).status,401)
 const otherLogin=await request('/login','POST',{email:'other@example.test',password:'other tenant safe password'})
 const other={cookie:otherLogin.headers.get('set-cookie').split(';')[0]};other.csrf=(await (await request('/session','GET',undefined,other)).json()).csrfToken
 assert.deepEqual(await (await request('/connections','GET',undefined,other)).json(),[])
 async function rejected(path,method,body,status=400){const before=await fixture({});const r=await request(path,method,body,owner);assert.equal(r.status,status,await r.clone().text());assert.ok(!(await r.text()).includes('LEAK-MARKER'));assert.deepEqual(await fixture({}),before,'Rejected write mutated data/audit')}
 for(const provider of Object.keys(configs))await rejected('/connections','POST',{provider,name:'rejected',config:{...configs[provider],apiKey:'LEAK-MARKER'}})
 for(const config of [{...endpoint,baseUrl:'https://different.example.com'}, {...endpoint,url:undefined,baseUrl:endpoint.url}, {...endpoint,url:'http://ops.example.com'}, {...endpoint,url:'https://user:LEAK-MARKER@ops.example.com'}, {...endpoint,url:'https://ops.example.com/?token=LEAK-MARKER'}, {...endpoint,url:'https://ops.example.com/#LEAK-MARKER'}, {...endpoint,url:'not a url'}, {...endpoint,allowedHosts:['other.example.com']}, {...endpoint,allowedHosts:'ops.example.com'}, {...endpoint,allowedHosts:['127.0.0.1']}, {...endpoint,allowedHosts:Array(101).fill('ops.example.com')}, {...endpoint,description:'x'.repeat(2001)}])await rejected('/connections','POST',{provider:'workflow-probe',name:'bad',config})
 for(const config of [{...configs.openai,maxOutputTokens:'4000'},{...configs.openai,maxOutputTokens:4000.5},{...configs.openai,maxAttemptUsd:-1},{...configs.openai,outputUsdPerMillion:10001},{...configs.openai,reasoningEffort:{}},{...configs.openai,model:'x'.repeat(151)}])await rejected('/connections','POST',{provider:'openai',name:'bad',config})
 for(const [provider,config] of [['microsoft-graph',{tenantId:7}],['freshservice',{domain:'evil.example.com'}],['controlled-deployment',{...endpoint,targets:[{}]}],['sendgrid',{from:'bad\naddress'}],['sendgrid',{webhookPublicKey:'malformed'}],['monitoring-webhook',{signingSecret:'LEAK-MARKER'}],['future-provider',{url:endpoint.url}]])await rejected('/connections','POST',{provider,name:'bad',config})
 await fixture({activate:ids.openai})
 await rejected('/connections/'+ids.openai,'PATCH',{provider:'future-provider',name:'Model',revision:1,config:{tenant:'not an openai field'}})
 const edit=await request('/connections/'+ids.openai,'PATCH',{provider:'ignored-provider',name:'Model',revision:1,config:configs.openai},owner);assert.equal(edit.status,200)
 const edited=(await (await request('/connections','GET',undefined,owner)).json()).find(x=>x.id===ids.openai)
 assert.equal(edited.revision,2);assert.equal(edited.status,'unverified');assert.equal(edited.provider,'openai');assert.deepEqual(JSON.parse(edited.config_json),configs.openai)
 await rejected('/connections/'+ids.openai,'PATCH',{name:'stale',revision:1,config:configs.openai},409)
 let settings=await (await request('/settings','GET',undefined,owner)).json()
 await rejected('/settings','PATCH',{revision:settings.revision,settings:{defaultModelConnectionId:ids.openai}},409)
 await rejected('/settings','PATCH',{revision:settings.revision,settings:{notificationConnectionId:ids['notification-webhook']}},409)
 await fixture({activate:ids['notification-webhook']})
 assert.equal((await request('/settings','PATCH',{revision:settings.revision,settings:{notificationConnectionId:ids['notification-webhook'],retentionDays:30}},owner)).status,200)
 settings=await (await request('/settings','GET',undefined,owner)).json()
 // The actual full-object settings payload roundtrips its existing selector.
 assert.equal((await request('/settings','PATCH',settings,owner)).status,200)
 await fixture({activate:ids.openai});await fixture({hold:true,model:ids.openai})
 settings=await (await request('/settings','GET',undefined,owner)).json()
 await rejected('/settings','PATCH',{revision:settings.revision,settings:{executionHeld:false}},409)
 await rejected('/settings','PATCH',{revision:settings.revision,settings:{executionHeld:null}},409)
 await rejected('/settings','PATCH',{revision:settings.revision,settings:{apiKey:'LEAK-MARKER'}})
 await rejected('/settings','PATCH',{revision:settings.revision,settings:{retentionDays:'30'}})
 assert.equal((await request('/settings','PATCH',{revision:settings.revision,settings:{retentionDays:60}},owner)).status,200)
 settings=await (await request('/settings','GET',undefined,owner)).json()
 assert.equal(settings.settings.executionHeld,true);assert.equal(settings.settings.defaultModelConnectionId,ids.openai);assert.equal(settings.settings.notificationConnectionId,ids['notification-webhook'])
 assert.equal((await request('/settings','PATCH',settings,owner)).status,200)
 await fixture({foreign:ids['notification-webhook']})
 settings=await (await request('/settings','GET',undefined,owner)).json()
 await rejected('/settings','PATCH',settings,409)
 await fixture({foreign:ids.openai})
 await rejected('/settings','PATCH',{revision:settings.revision,settings:{defaultModelConnectionId:ids.openai}},409)
 await sandboxChecks({request,owner,other,fixture})
 console.log('PASS config HTTP real D1/R2 native session: 9 provider schemas, private roundtrips, invalid types/bounds/URLs/credentials, no rejected mutation/audit, immutable provider, revision invalidation, validated owned selectors, restore hold and model route bypass denied')
} catch(e){
 // Observe liveness and arrival after failure; never repeat a failed mutation.
 console.error('Configuration process at failure',JSON.stringify({pid:worker?.pid,exitCode:worker?.exitCode,signalCode:worker?.signalCode}))
 for(const [label,path,init] of [
  ['health','/health',{}],
  ['import transport','/test/config-fixture',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:owner?.cookie??'','X-Linen-CSRF':owner?.csrf??''},body:JSON.stringify({inspectTransport:true})}],
 ]){
  try{const response=await fetch(origin+path,{...init,signal:AbortSignal.timeout(3000)});console.error('Configuration '+label,JSON.stringify({status:response.status,body:await response.text()}))}
  catch(error){console.error('Configuration '+label+' unavailable',String(error))}
 }
 console.error(output);throw e
} finally {if(worker?.exitCode===null)await stop();await rm(dir,{recursive:true,force:true})}

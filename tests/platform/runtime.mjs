import assert from 'node:assert/strict'
import { spawn,spawnSync } from 'node:child_process'
import { mkdtemp,rm,writeFile,readFile,readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join,resolve } from 'node:path'
import { createServer } from 'node:net'
import { pbkdf2Sync, createHash } from 'node:crypto'
const dir=await mkdtemp(join(tmpdir(),'linen-platform-'))
const socket=createServer();await new Promise(r=>socket.listen(Number(process.env.LINEN_TEST_PORT || 0),'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r))
const origin=`http://127.0.0.1:${port}`
const config=join(dir,'wrangler.json');await writeFile(config,JSON.stringify({name:'linen-platform-test',main:resolve('tests/platform/worker.ts'),compatibility_date:'2026-09-08',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:'DB',database_name:'linen',database_id:'local-linen'}],r2_buckets:[{binding:'ATTACHMENTS',bucket_name:'linen-test-attachments'}],vars:{SESSION_SECRET:'fixture-only-session-key',ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}}))
const migrationFiles=(await readdir('migrations')).filter(file=>file.endsWith('.sql')).sort()
const migrationSql=join(dir,'migrations.sql')
await writeFile(migrationSql,(await Promise.all(migrationFiles.map(file=>readFile('migrations/'+file,'utf8')))).join('\n'))
const migrate=spawnSync('pnpm',['exec','wrangler','d1','execute','DB','--local','--persist-to',dir,'--file',migrationSql],{encoding:'utf8'});assert.equal(migrate.status,0,migrate.stdout+migrate.stderr)
let worker,output=''
async function start(){worker=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--config',process.env.LINEN_TEST_EMITTED?'dist/server/wrangler.json':config,'--persist-to',dir,'--port',String(port)],{stdio:['ignore','pipe','pipe']});worker.stdout.on('data',x=>output+=x);worker.stderr.on('data',x=>output+=x);for(let i=0;i<120;i++){try{if((await fetch(origin+'/health')).ok)return}catch{}if(worker.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,250))}throw Error(output)}
async function stop(){worker.kill('SIGTERM');await new Promise(r=>worker.exitCode!==null?r():worker.once('exit',r))}
async function request(path,method='GET',body,auth={},extra={}){return fetch(origin+'/api/v1'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(auth.cookie?{Cookie:auth.cookie}:{}),...(auth.csrf?{'X-Linen-CSRF':auth.csrf}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)})}
try{
 await start()
 assert.equal((await request('/session')).status,401)
 const anonymousStatus=await request('/session-status')
 assert.equal(anonymousStatus.status,200);assert.match(anonymousStatus.headers.get('cache-control'),/private/);assert.match(anonymousStatus.headers.get('cache-control'),/no-store/)
 assert.deepEqual(await anonymousStatus.json(),{authenticated:false})
 assert.deepEqual(await (await request('/session-status','GET',undefined,{cookie:'linen_session=not-a-session'})).json(),{authenticated:false})
 assert.equal((await request('/setup')).status,200)
 const payload={email:'owner@example.test',name:'Owner',password:'correct horse battery staple',workspaceName:'Test workspace'}
 assert.equal((await request('/setup','POST',payload,{}, {Origin:'https://evil.invalid'})).status,403)
 const setup=await request('/setup','POST',payload);assert.equal(setup.status,201,await setup.clone().text());const owner={cookie:setup.headers.get('set-cookie').split(';')[0]}
 // First-owner setup requires an empty identity store; add the isolation tenant afterwards.
 {
  const fixtureHash='fixture-salt:'+pbkdf2Sync('other tenant safe password','fixture-salt',100000,32,'sha256').toString('hex')
  const fixture=spawnSync('pnpm',['exec','wrangler','d1','execute','DB','--local','--persist-to',dir,'--command',`INSERT INTO workspaces VALUES('other-workspace','Other','2026-01-01T00:00:00.000Z'); INSERT INTO users VALUES('other-user','other@example.test','Other','${fixtureHash}','2026-01-01T00:00:00.000Z'); INSERT INTO memberships VALUES('other-workspace','other-user','["owner"]',1);`],{encoding:'utf8'});assert.equal(fixture.status,0,fixture.stdout+fixture.stderr)
 }
 assert.equal((await request('/setup','POST',payload)).status,409)
 const state=await (await request('/session','GET',undefined,owner)).json();owner.csrf=state.csrfToken;assert.deepEqual(state.principal.roles,['owner']);assert.equal(state.user.email,payload.email)
 const initialized=await request('/session-status','GET',undefined,owner)
 assert.match(initialized.headers.get('cache-control'),/private/);assert.match(initialized.headers.get('cache-control'),/no-store/)
 assert.deepEqual(await initialized.json(),{authenticated:true,session:state})
 assert.equal((await request('/settings','PATCH',{settings:{name:'x'},revision:1},{cookie:owner.cookie})).status,403)
 assert.equal((await request('/settings','PATCH',{settings:{name:'x'},revision:1},owner,{Origin:'https://evil.invalid'})).status,403)
 assert.equal((await request('/settings','PATCH',{settings:{retentionDays:30},revision:1},owner)).status,200)
 assert.equal((await request('/settings','PATCH',{settings:{},revision:1},owner)).status,409)
 assert.equal((await request('/connections','POST',{provider:'example',name:'Secret in wrong field',config:{apiKey:'private'}},owner)).status,400)
 assert.equal((await request('/sso','POST',{})).status,503)
 const connection=await request('/connections','POST',{provider:'test-unconfigured',name:'Not connected',config:{tenant:'example'},secret:'PRIVATE-NEVER-RETURN'},owner);assert.equal(connection.status,201);const cid=(await connection.json()).id
 const listed=await (await request('/connections','GET',undefined,owner)).text();assert.ok(!listed.includes('PRIVATE-NEVER-RETURN'));assert.ok(!listed.includes('secret_ciphertext'));assert.ok(listed.includes('unverified'))
 const otherLogin=await request('/login','POST',{email:'other@example.test',password:'other tenant safe password'});assert.equal(otherLogin.status,200);const other={cookie:otherLogin.headers.get('set-cookie').split(';')[0]};other.csrf=(await (await request('/session','GET',undefined,other)).json()).csrfToken
 assert.deepEqual(await (await request('/connections','GET',undefined,other)).json(),[])
 assert.equal((await request('/connections/'+cid,'PATCH',{name:'stolen',revision:1},other)).status,404)
 assert.equal((await request('/members/'+state.user.id,'PATCH',{roles:['employee']},other)).status,404)
 let attachment
 if(!process.env.LINEN_TEST_EMITTED){const uploaded=await fetch(origin+'/test/attachment',{method:'POST',headers:{Origin:origin,Cookie:owner.cookie,'X-Linen-CSRF':owner.csrf}});assert.equal(uploaded.status,200);attachment=await uploaded.json();const params=new URLSearchParams(attachment);assert.equal(await (await fetch(origin+'/test/attachment?'+params,{headers:{Cookie:owner.cookie}})).text(),'private bytes');assert.equal((await fetch(origin+'/test/attachment?'+params,{headers:{Cookie:other.cookie}})).status,403);params.set('signature','invalid');assert.equal((await fetch(origin+'/test/attachment?'+params,{headers:{Cookie:owner.cookie}})).status,403)}
 const member=await request('/members','POST',{email:'employee@example.test',name:'Employee',password:'another long safe password',roles:['employee']},owner);assert.equal(member.status,201);const uid=(await member.json()).id
 const login=await request('/login','POST',{email:'employee@example.test',password:'another long safe password'});assert.equal(login.status,200);const employee={cookie:login.headers.get('set-cookie').split(';')[0]};employee.csrf=(await (await request('/session','GET',undefined,employee)).json()).csrfToken
 assert.equal((await request('/connections','GET',undefined,employee)).status,403)
 assert.equal((await request('/members/'+uid,'PATCH',{roles:['owner']},employee)).status,403)
 {const missing=await request('/connections/'+crypto.randomUUID(),'PATCH',{name:'x',revision:1},owner);assert.equal(missing.status,404,await missing.text())}
 assert.equal((await request('/members/'+uid,'PATCH',{roles:['employee'],active:false},owner)).status,200)
 assert.equal((await request('/session','GET',undefined,employee)).status,401)
 assert.deepEqual(await (await request('/session-status','GET',undefined,employee)).json(),{authenticated:false})
 // A real D1 failure must not turn initialization into anonymous success.
 const sql=statement=>{const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--persist-to',dir,'--command',statement],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr)}
 sql('ALTER TABLE platform_auth_session_proofs RENAME TO unavailable_session_proofs')
 try{const unavailable=await request('/session-status','GET',undefined,owner);assert.equal(unavailable.status,500);assert.equal((await unavailable.json()).error.code,'internal_error');assert.match(unavailable.headers.get('cache-control'),/no-store/)}
 finally{sql('ALTER TABLE unavailable_session_proofs RENAME TO platform_auth_session_proofs')}
 const identityHash=createHash('sha256').update(state.user.email).digest('hex')
 sql(`INSERT INTO adoption_tombstones VALUES('${state.workspace.id}','${identityHash}','2026-01-01')`)
 try{const denied=await request('/session-status','GET',undefined,owner);assert.equal(denied.status,409);assert.equal((await denied.json()).error.code,'identity_erased')}
 finally{sql(`DELETE FROM adoption_tombstones WHERE workspace_id='${state.workspace.id}' AND identity_hash='${identityHash}'`)}
 sql(`UPDATE sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE user_id='${state.user.id}'`)
 assert.deepEqual(await (await request('/session-status','GET',undefined,owner)).json(),{authenticated:false})
 assert.equal((await request('/session','GET',undefined,owner)).status,401)
 sql(`UPDATE sessions SET expires_at='2099-01-01T00:00:00.000Z' WHERE user_id='${state.user.id}'`)

 await stop();await start();assert.equal((await request('/session','GET',undefined,owner)).status,200);assert.equal((await (await request('/connections','GET',undefined,owner)).json())[0].id,cid);if(attachment)assert.equal(await (await fetch(origin+'/test/attachment?'+new URLSearchParams(attachment),{headers:{Cookie:owner.cookie}})).text(),'private bytes')
 const changed=await request('/password','POST',{currentPassword:payload.password,password:'changed safe long password'},owner);assert.equal(changed.status,200);assert.equal((await request('/session','GET',undefined,owner)).status,401);owner.cookie=changed.headers.get('set-cookie').split(';')[0];owner.csrf=(await (await request('/session','GET',undefined,owner)).json()).csrfToken
 assert.equal((await request('/logout','POST',{},owner)).status,200);assert.equal((await request('/session','GET',undefined,owner)).status,401)
 assert.deepEqual(await (await request('/session-status','GET',undefined,owner)).json(),{authenticated:false})
 assert.equal((await request('/login','POST',{email:payload.email,password:'wrong password value'})).status,401)
 console.log(`PASS platform ${process.env.LINEN_TEST_EMITTED?'emitted application':'source test'} Worker + real D1${attachment?' and R2':''}: empty bootstrap, credentials, CSRF/Origin, RBAC, tenant isolation, encrypted redaction, revisions, revocation, restart persistence, logout`)
}catch(e){console.error(output);throw e}finally{if(worker?.exitCode===null)await stop();await rm(dir,{recursive:true,force:true})}

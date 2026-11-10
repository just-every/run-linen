import {getPlatformProxy} from 'wrangler'
import {mailEdge} from './mail-edge.mjs'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {cp,mkdir,mkdtemp,readdir,readFile,rm,symlink,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createServer} from 'node:net'

// BASE-001 point 3: accounts made through the native Base claim, setup and
// members doors on an older retained D1 schema survive the public `rer setup`
// upgrade, and sign in again through the real Base bridge. Only the mail
// provider's network edge is faked.
const source=process.cwd(),dir=await mkdtemp(join(tmpdir(),'linen-account-upgrade-')),root=join(dir,'installation'),cfgDir=join(dir,'worker')
// Migrations from this file onward are applied by the upgrade, not the old store.
const upgradeFrom='0750_application_catalog.sql'
const key='synthetic-session-secret-0000000000000000000000000000'
const encryption=Buffer.alloc(32,7).toString('base64')
const password='synthetic-native-password-for-test'
const environment={...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}
delete environment.RER_LOCAL_OPERATION
const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r))
const origin=`http://127.0.0.1:${port}`
let worker,proxy,output=''
async function run(args){
 let log='';const child=spawn('pnpm',args,{cwd:root,env:environment,stdio:['ignore','pipe','pipe']})
 for(const stream of [child.stdout,child.stderr])stream.on('data',c=>log+=c)
 const code=await new Promise(r=>child.once('exit',r));assert.equal(code,0,args.slice(0,4).join(' ')+'\n'+log.slice(-8000));return log
}
const request=(path,{method='GET',body,cookie,csrf,headers={}}={})=>fetch(origin+path,{method,redirect:'manual',headers:{Connection:'close',Host:new URL(origin).host,Origin:origin,...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...(csrf?{'X-Linen-CSRF':csrf}:{}),...headers},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})})
const cookieOf=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')
async function start(){
 output='';worker=spawn(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'dev','--config',join(cfgDir,'wrangler.json'),'--local','--persist-to',join(root,'.wrangler/state'),'--ip','127.0.0.1','--port',String(port),'--inspector-port','0'],{cwd:root,env:environment,stdio:['ignore','pipe','pipe']})
 worker.stdout.on('data',c=>output+=c);worker.stderr.on('data',c=>output+=c)
 for(let i=0;i<240;i++){try{if((await request('/health')).ok)return}catch{}await new Promise(r=>setTimeout(r,250))}
 assert.fail('Worker became ready')
}
async function stop(){
 if(!worker)return
 worker.kill('SIGTERM');await Promise.race([new Promise(r=>worker.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);if(worker.exitCode===null)worker.kill('SIGKILL');worker=null
}
async function snapshot(){
 proxy=await getPlatformProxy({configPath:join(cfgDir,'wrangler.json'),persist:{path:join(root,'.wrangler/state/v3')},remoteBindings:false})
 try{
  const read=async table=>(await proxy.env.DB.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()).results
  return {migrations:(await read('d1_migrations')).map(r=>r.name),workspaces:await read('workspaces'),users:await read('users'),memberships:await read('memberships'),settings:await read('workspace_settings')}
 }finally{await proxy.dispose();proxy=null}
}
// The mail provider receives the ordinary sign-in link; the proof inside is consumed through the real Base doors.
async function mailedProof(email){
 const before=await(await request('/fixtures/mail')).text()
 assert.equal((await request('/auth/magic-link',{method:'POST',body:{email,returnTo:'/app'}})).status,202)
 const message=await(await request('/fixtures/mail')).text()
 return {sent:message!==before,proof:/[?&](?:amp;)?token=([^"&<>\s]+)/.exec(message)?.[1]}
}
const signIn=async(email,name)=>{
 const mail=await mailedProof(email);assert.ok(mail.sent&&mail.proof,name+' receives an ordinary email proof')
 const confirmed=await request('/auth/confirm',{method:'POST',body:{token:decodeURIComponent(mail.proof)}});assert.equal(confirmed.status,303,name+' confirms the emailed proof')
 return cookieOf(confirmed)
}
const session=async cookie=>{const response=await request('/api/v1/session',{cookie});return response.status===200?response.json():response.status}
try{
 await cp(source,root,{recursive:true,filter:p=>{const rel=p.slice(source.length+1);return !rel||!['.git','node_modules','.wrangler','.rer','.seed','dist','exports','.dev.vars','.dev.vars.previous'].some(x=>rel===x||rel.startsWith(x+'/'))}})
 await symlink(resolve('node_modules'),join(root,'node_modules'),'dir')
 await writeFile(join(root,'.dev.vars'),'ENCRYPTION_KEY='+encryption+'\n')
 // The retained store: a real prefix of Linen's migration history, applied through wrangler so the history table records it.
 const all=(await readdir(join(root,'migrations'))).filter(name=>name.endsWith('.sql')).sort()
 const retained=all.filter(name=>name<upgradeFrom),pending=all.filter(name=>name>=upgradeFrom)
 assert.ok(retained.length&&pending.length,'The old store is a proper prefix of the current migrations')
 await mkdir(join(root,'old-migrations'))
 for(const name of retained)await cp(join(root,'migrations',name),join(root,'old-migrations',name))
 const wrangler=JSON.parse(await readFile(join(root,'wrangler.jsonc'),'utf8'))
 await writeFile(join(root,'old-wrangler.json'),JSON.stringify({...wrangler,d1_databases:[{...wrangler.d1_databases[0],migrations_dir:'old-migrations'}]}))
 await run(['exec','wrangler','d1','migrations','apply','linen','--local','--persist-to','.wrangler/state','--config','old-wrangler.json'])
 // The same Worker composition the Base bridge test uses: provider mail edge, real Base routes, real application.
 await mkdir(cfgDir)
 await writeFile(join(cfgDir,'worker.ts'),`${mailEdge}import {baseAuthResponse} from ${JSON.stringify(join(root,'src/platform/base-auth/http.ts'))};import {createApplication} from ${JSON.stringify(join(root,'src/application.ts'))};import {originBindings} from ${JSON.stringify(join(root,'src/platform/base-auth/service.ts'))};const app=createApplication();export default {async fetch(r,e,c){const fixture=mailFixture(r);if(fixture)return fixture;e=originBindings(e);return await baseAuthResponse(r,e)??app.fetch(r,e,c)}}`)
 await writeFile(join(cfgDir,'wrangler.json'),JSON.stringify({name:'linen-account-upgrade-test',main:join(cfgDir,'worker.ts'),compatibility_date:wrangler.compatibility_date,compatibility_flags:wrangler.compatibility_flags,d1_databases:[{binding:'DB',database_name:'linen',database_id:'local-linen'}],r2_buckets:[{binding:'ATTACHMENTS',bucket_name:'linen-account-upgrade-fixture'}],vars:{SESSION_SECRET:key,SETUP_TOKEN:key,ENCRYPTION_KEY:encryption,OWNER_EMAIL:'owner@example.test',AUTH_ORIGIN:origin,APP_ORIGIN:'http://localhost:1',AUTH_LOCAL:'true',MAIL_PROVIDER:'resend',MAIL_API_KEY:'synthetic-provider-key',MAIL_FROM:'auth@localhost.test'}}))

 // Before the upgrade: claim, confirm and populate through the native doors.
 await start()
 assert.deepEqual(await(await request('/setup/state')).json(),{state:'unclaimed'})
 const claim=await request('/auth/bootstrap',{method:'POST',body:{token:key,displayName:'Retained Owner',returnTo:'/setup'}});assert.equal(claim.status,303)
 const ownerCookie=cookieOf(claim)
 assert.equal((await request('/setup',{method:'POST',cookie:ownerCookie,body:'confirm=yes',headers:{'content-type':'application/x-www-form-urlencoded'}})).status,303)
 assert.deepEqual(await(await request('/setup/state')).json(),{state:'claimed'})
 const ownerSession=await session(ownerCookie);assert.deepEqual(ownerSession.principal.roles,['owner'])
 const members=async cookie=>(await(await request('/api/v1/members',{cookie})).json())
 const create=async(email,name,roles)=>{const response=await request('/api/v1/members',{method:'POST',cookie:ownerCookie,csrf:ownerSession.csrfToken,body:{email,name,password,roles}});assert.equal(response.status,201,await response.clone().text());return response.json()}
 const employee=await create('upgrade-employee@example.test','Retained Employee',['employee'])
 const retiring=await create('upgrade-retired@example.test','Retired Member',['operator'])
 const retiredCookie=cookieOf(await request('/api/v1/login',{method:'POST',body:{email:'upgrade-retired@example.test',password}}))
 assert.equal((await request('/api/v1/members/'+retiring.id,{method:'PATCH',cookie:ownerCookie,csrf:ownerSession.csrfToken,body:{roles:['operator'],active:false}})).status,200)
 assert.equal(await session(retiredCookie),401,'The retired member is refused before the upgrade')
 const beforeMembers=await members(ownerCookie)
 const beforeWorkspace=await(await request('/api/v1/workspace',{cookie:ownerCookie})).json()
 assert.ok(beforeMembers.items?.length>=3||beforeMembers.length>=3,'Owner, employee and retired member are retained controls: '+JSON.stringify(beforeMembers))
 await stop()
 const before=await snapshot()
 assert.ok(!before.migrations.includes(pending[0]),'The old store has not yet applied the upgrade migrations')

 // The public retained-installation command, on the same D1 store.
 await writeFile(join(root,'.dev.vars'),'OWNER_EMAIL=owner@example.test\nENCRYPTION_KEY='+encryption+'\n')
 await run(['exec','rer','setup','--owner-email','owner@example.test','--non-interactive'])
 const after=await snapshot()
 const added=after.migrations.filter(name=>!before.migrations.includes(name))
 assert.deepEqual(added.sort(),pending,'Setup applied every additive migration the old store lacked')
 for(const name of before.migrations)assert.ok(after.migrations.includes(name),'Applied migration history is retained: '+name)
 for(const table of ['workspaces','users','memberships'])
  for(const row of before[table])assert.ok(after[table].some(next=>JSON.stringify(Object.fromEntries(Object.keys(row).map(column=>[column,next[column]])))===JSON.stringify(row)),'Account row retained across upgrade in '+table)
 assert.equal(after.users.length,before.users.length,'The upgrade invents no account')
 assert.equal(after.workspaces.length,before.workspaces.length,'The upgrade invents no workspace')

 // After the upgrade: restart and sign in freshly through the Base bridge.
 await start()
 assert.deepEqual(await(await request('/setup/state')).json(),{state:'claimed'},'The claimed installation is not claimable again')
 const freshOwner=await signIn('owner@example.test','Owner');const owner=await session(freshOwner)
 assert.equal(owner.principal.userId,ownerSession.principal.userId,'The same owner account signs in')
 assert.deepEqual(owner.principal.roles,['owner'])
 const afterMembers=await members(freshOwner)
 assert.deepEqual(afterMembers,beforeMembers,'Members, names, emails, fixed roles and retirement read back exactly')
 assert.deepEqual(await(await request('/api/v1/workspace',{cookie:freshOwner})).json(),beforeWorkspace,'Workspace id and name are retained')
 const employeeLogin=await request('/api/v1/login',{method:'POST',body:{email:'upgrade-employee@example.test',password}});assert.equal(employeeLogin.status,200,'The employee password still works')
 const employeeSession=await session(cookieOf(employeeLogin));assert.equal(employeeSession.principal.userId,employee.id);assert.deepEqual(employeeSession.principal.roles,['employee'])
 assert.equal((await request('/api/v1/members',{cookie:cookieOf(employeeLogin)})).status,403,'The employee fixed role still cannot administer members')
 assert.equal((await request('/api/v1/login',{method:'POST',body:{email:'upgrade-retired@example.test',password}})).status,401,'The retired member password is refused')
 assert.equal(await session(retiredCookie),401,'The retired member session stays revoked')
 const refused=await mailedProof('upgrade-retired@example.test');assert.equal(refused.sent,false,'No sign-in proof is mailed to a retired member')
 // Replacement ownership is refused with the original token and a different identity.
 assert.equal((await request('/auth/bootstrap',{method:'POST',body:{token:key,displayName:'Replacement',returnTo:'/setup'}})).status,409,'The Base claim cannot be replayed to replace the owner')
 assert.equal((await request('/api/v1/setup',{method:'POST',body:{email:'replacement@example.test',name:'Replacement',workspaceName:'Replaced',password}})).status>=400,true,'Native setup cannot create replacement ownership')
 assert.deepEqual(await members(freshOwner),beforeMembers,'Still one owner, no new account')
 console.log('PASS BASE-001 retained store on '+retained.length+' migrations upgraded by rer setup with '+added.length+' additive migrations; owner, employee and retired member keep ids, names, emails and fixed roles; fresh Base sign-in, employee password login, retired refusal and replacement-ownership refusal')
}catch(error){console.error(output.slice(-8000));throw error}finally{
 await proxy?.dispose();await stop()
 await rm(dir,{recursive:true,force:true})
}

import {mailEdge} from './mail-edge.mjs'
// Public rer archive/reset/import flow on disposable actual D1/R2 state.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {cp,mkdtemp,symlink,rm,writeFile,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {createServer} from 'node:net'
import {createRequire} from 'node:module'
import {getPlatformProxy} from 'wrangler'
const require=createRequire(await import.meta.resolve('wrangler/package.json'))
const {build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare')
const source=process.cwd(),dir=await mkdtemp(join(tmpdir(),'linen-transfer-')),root=join(dir,'seed'),archive=join(dir,'before.rer'),later=join(root,'exports','after.rer')
const commandEnvironment={...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}
// The scratch checkout owns its own state; the verifier's lease belongs to source.
delete commandEnvironment.RER_LOCAL_OPERATION
let proxy,mf
async function run(args,expected=0){let output='';const child=spawn('pnpm',args,{cwd:root,env:commandEnvironment,stdio:['ignore','pipe','pipe']});for(const stream of [child.stdout,child.stderr])stream.on('data',c=>output+=c);const code=await new Promise(r=>child.once('exit',r));assert.equal(code,expected,args.slice(0,3).join(' ')+'\n'+output.slice(-8000));console.log('PASS command '+args.slice(0,3).join(' '));return output}
async function open(){proxy=await getPlatformProxy({configPath:join(root,'wrangler.jsonc'),persist:{path:join(root,'.wrangler/state/v3')},remoteBindings:false});return proxy.env}
async function close(){await proxy?.dispose();proxy=null}
try{
 await cp(source,root,{recursive:true,filter:p=>{const rel=p.slice(source.length+1);return !rel||!['.git','node_modules','.wrangler','.rer','.seed','dist','exports','.dev.vars','.dev.vars.previous'].some(x=>rel===x||rel.startsWith(x+'/'))}})
 await symlink(resolve('node_modules'),join(root,'node_modules'),'dir')
 await run(['exec','wrangler','d1','migrations','apply','linen','--local','--persist-to','.wrangler/state','--config','wrangler.jsonc'])
 let env=await open();const stamp=new Date().toISOString()
 await env.DB.batch([
  env.DB.prepare('INSERT INTO bootstrap_lock VALUES(1)'),
  env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind('workspace','Transfer',stamp),
  env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind('older-workspace','Retained separate workspace','2000-01-01T00:00:00.000Z'),
  env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('other','other@example.test','Other member','test-only-password-hash',stamp),
  env.DB.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('older-workspace','other','["employee"]'),
  env.DB.prepare('INSERT INTO workspace_settings(workspace_id) VALUES(?)').bind('older-workspace'),
  env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('owner','owner@example.test','Owner','test-only-password-hash',stamp),
  env.DB.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('workspace','owner','["owner"]'),
  env.DB.prepare('INSERT INTO workspace_settings(workspace_id) VALUES(?)').bind('workspace'),
  env.DB.prepare('INSERT INTO platform_first_run VALUES(1,?,?)').bind('owner',Date.now()),
  env.DB.prepare('INSERT INTO intelligence_engineering_grants VALUES(?,?,?,?,?,?,?,?,?)').bind('grant','workspace',1,'owner','test-only-bearer','{}','2099-01-01',null,stamp),
  env.DB.prepare('INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)').bind('connection','workspace','sendgrid','Fixture','{}','test-only-encrypted-secret','verified',stamp,stamp),
  env.DB.prepare('INSERT INTO work_records(id,workspace_id,requester_id,beneficiary_id,kind,title,created_at,updated_at,dedup_key) VALUES(?,?,?,?,?,?,?,?,?)').bind('work','workspace','owner','owner','request','Retained real record',stamp,stamp,'transfer'),
  env.DB.prepare('INSERT INTO execution_plans(id,workspace_id,work_id,work_revision,actor_id,steps_json,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?)').bind('plan','workspace','work',1,'owner','[]','transfer',stamp),
  env.DB.prepare('INSERT INTO execution_operations(id,workspace_id,plan_id,step_json,state,resource,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?)').bind('operation','workspace','plan','{}','unknown','retained-resource','owner',stamp),
 ])
 await env.DB.batch([
 env.DB.prepare('INSERT INTO work_people(id,workspace_id,source,source_id,name,manager_id,observed_at,effective_at,member_id,binding_id) VALUES(?,?,?,?,?,?,?,?,?,?)').bind('owner-person','workspace','reviewed-hr','owner-source','Owner','owner',stamp,stamp,'owner','reviewed-transfer-binding'),
 env.DB.prepare('INSERT INTO work_messages VALUES(?,?,?,?,?,?,?,?)').bind('message','workspace','work','owner','public','Retained notification','transfer',stamp),
 env.DB.prepare('INSERT INTO execution_outbox VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind('delivery','workspace','work','message','owner','connection','owner','queued',null,'transfer',stamp,stamp),
 ])
 await env.ATTACHMENTS.put('workspace/private-file','Private retained attachment')
 await close()
 await run(['exec','rer','export','--output',archive])
 await run(['exec','rer','reset','--yes'])
 await run(['exec','rer','import','--input',archive,'--yes'])
 env=await open()
 assert.equal((await env.DB.prepare('SELECT title FROM work_records WHERE id=?').bind('work').first()).title,'Retained real record')
 assert.equal(await(await env.ATTACHMENTS.get('workspace/private-file')).text(),'Private retained attachment')
 assert.equal(JSON.parse((await env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id="workspace"').first()).settings_json).executionHeld,true)
 assert.equal((await env.DB.prepare('SELECT password_hash FROM users WHERE id="owner"').first()).password_hash,'!restored-email-link')
 assert.equal((await env.DB.prepare('SELECT secret_ciphertext FROM connections').first()).secret_ciphertext,null)
 assert.ok((await env.DB.prepare('SELECT revoked_at FROM intelligence_engineering_grants').first()).revoked_at)
 assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM sessions').first()).n,0)
 const person=await env.DB.prepare("SELECT member_id,binding_id,manager_id FROM work_people WHERE id='owner-person'").first()
 assert.deepEqual(person,{member_id:null,binding_id:null,manager_id:null},'Native restore retains the person but requires fresh binding and manager review')
 const held=(await env.DB.prepare('SELECT id FROM adoption_holds WHERE workspace_id="workspace"').all()).results;assert.equal(held.length,1)
 // Simulate a restart between imported data and finished native bookkeeping.
 await env.DB.batch([env.DB.prepare("UPDATE platform_archive_recovery SET state='pending'"),env.DB.prepare("UPDATE adoption_imports SET state='reconciling'")])
 await close();await run(['exec','rer','import','--input',archive,'--yes']);env=await open()
 assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM adoption_holds WHERE workspace_id="workspace"').first()).n,1,'Retry reuses durable recovery hold')
 assert.equal((await env.DB.prepare('SELECT state FROM platform_archive_recovery').first()).state,'complete')
 await close()
 const entry=join(dir,'worker.ts'),output=join(dir,'worker.mjs')
 await writeFile(entry,`${mailEdge}import {createApplication} from ${JSON.stringify(join(root,'src/application.ts'))};import {baseAuthResponse} from ${JSON.stringify(join(root,'src/platform/base-auth/http.ts'))};const app=createApplication();export default {async fetch(r,e,c){return mailFixture(r)??await baseAuthResponse(r,e)??app.fetch(r,e,c)}};`)
 await build({entryPoints:[entry],bundle:true,format:'esm',platform:'browser',external:['node:*'],target:'es2022',outfile:output})
 const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));const origin='http://127.0.0.1:'+port
 mf=new Miniflare({...convertV4MiniflareOptions({port,host:'127.0.0.1',modules:true,script:await readFile(output,'utf8'),compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'local-linen'},r2Buckets:{ATTACHMENTS:'linen-attachments'},bindings:{AUTH_ORIGIN:origin,AUTH_LOCAL:'true',MAIL_PROVIDER:'resend',MAIL_API_KEY:'test-only-provider-key',MAIL_FROM:'auth@localhost.test',OWNER_EMAIL:'owner@example.test',RER_DEV_KEY:'test-only-development-entry-key-long-enough',SESSION_SECRET:'test-only-session-secret-long-enough',ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}}),resourcePersistencePath:join(root,'.wrangler/state/v3'),isolatedResourcePersistencePath:join(dir,'isolated')})
 await mf.ready
 const request=(path,{body,cookie,headers={}}={})=>fetch(origin+path,{redirect:'manual',method:body?'POST':'GET',headers:{Host:new URL(origin).host,Origin:origin,...(body?{'content-type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})})
 assert.equal((await request('/auth/magic-link',{body:{email:'owner@example.test',returnTo:'/app'}})).status,202)
 const detail=await(await request('/fixtures/mail')).text()
 const proof=/[?&](?:amp;)?token=([^"&<>\s]+)/.exec(detail)?.[1];assert.ok(proof)
 const confirmation=await request('/auth/confirm',{body:{token:decodeURIComponent(proof)}});assert.equal(confirmation.status,303)
 const cookie=confirmation.headers.get('set-cookie').split(';')[0]
 const session=await(await request('/api/v1/session',{cookie})).json();assert.equal(session.user.email,'owner@example.test')
 const delivery=await request('/api/v1/notifications/process',{cookie,body:{},headers:{'X-Linen-CSRF':session.csrfToken}})
 assert.equal(delivery.status,200);assert.deepEqual(await delivery.json(),[{id:'delivery',state:'blocked'}],'Restored queued notification cannot resume an external effect')
 const db=await mf.getD1Database('DB');assert.equal((await db.prepare('SELECT COUNT(*) n FROM execution_provider_attempts').first()).n,0)
 const holds=await(await request('/api/v1/adoption/holds',{cookie})).json();assert.equal(holds.length,1)
 const hold=holds[0],records=await(await request('/api/v1/imports/'+hold.import_id+'/records',{cookie})).json()
 assert.equal(records.data.length,1);assert.equal(JSON.parse(records.data[0].row_json).state,'unknown')
 const authHeaders={'X-Linen-CSRF':session.csrfToken}
 assert.equal((await request('/api/v1/adoption/holds/'+hold.id+'/release',{cookie,body:{revision:hold.revision},headers:authHeaders})).status,409,'Unreconciled retained operation blocks ordinary release')
 assert.equal((await request('/api/v1/adoption/holds/'+hold.id+'/reconcile',{cookie,body:{historyId:records.data[0].id,evidence:'Fixture owner reviewed retained unknown operation before explicitly releasing execution'},headers:authHeaders})).status,200)
 assert.equal((await request('/api/v1/adoption/holds/'+hold.id+'/release',{cookie,body:{revision:hold.revision},headers:authHeaders})).status,200)
 assert.equal(JSON.parse((await db.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id="workspace"').first()).settings_json).executionHeld,false,'Only explicit native reconciliation and release clears hold')
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM execution_provider_attempts').first()).n,0)
 await mf.dispose();mf=null
 env=await open()
 await env.DB.prepare('INSERT INTO adoption_tombstones VALUES(?,?,?)').bind('workspace',createHash('sha256').update('erased@example.test').digest('hex'),stamp).run()
 await close()
 const refused=await run(['exec','rer','import','--input',archive,'--yes'],1);assert.match(refused,/erasure_epoch/)
 await run(['exec','rer','export','--output',later])
 await run(['exec','rer','reset','--yes'])
 const checkpoint=await run(['exec','rer','import','--input',archive,'--journal','exports/after.rer','--yes'],1);assert.match(checkpoint,/erasure_epoch/)
 await run(['exec','rer','import','--input',later,'--yes'])
 // An existing installation remains protected until a separate fresh deploy is explicitly selected.
 delete commandEnvironment.LINEN_DEPLOYMENT
 // Satisfy Base's production mail prerequisite so this dry run reaches the identity guard.
 commandEnvironment.MAIL_API_KEY='test-only-dry-run-mail-key'
 const deploy=await run(['exec','rer','deploy','--dry-run'],4);assert.match(deploy,/must retain Worker linen/)
 commandEnvironment.LINEN_DEPLOYMENT='new'
 await run(['exec','rer','deploy','--dry-run'])
 const configPath=join(root,'wrangler.jsonc'),config=JSON.parse(await readFile(configPath,'utf8'))
 config.d1_databases[0].database_id='retained-remote-database'
 await writeFile(configPath,JSON.stringify(config))
 assert.match(await run(['exec','rer','deploy','--dry-run'],4),/must retain Worker linen/)
 console.log('PASS actual rer export/reset/import: native records and R2 bytes retained, credentials revoked, restored effects held with resumable native reconciliation/release, same-store and later-journal stale-erasure restore refused; fresh deploy succeeds without provider access while retained deployment identity changes remain refused')
}finally{await mf?.dispose();await close();await rm(dir,{recursive:true,force:true})}

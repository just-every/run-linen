import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {mkdtemp,writeFile,rm,readdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {createServer} from 'node:net'
const dir=await mkdtemp(join(tmpdir(),'linen-privacy-'))
const socket=createServer();await new Promise(r=>socket.listen(Number(process.env.LINEN_TEST_PORT || 0),'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r))
const config=join(dir,'wrangler.json')
await writeFile(config,JSON.stringify({name:'linen-privacy-test',main:resolve('tests/platform/privacy-worker.ts'),compatibility_date:'2026-09-08',vars:{ENCRYPTION_KEY:Buffer.alloc(32,13).toString('base64')},d1_databases:[{binding:'DB',database_name:'linen',database_id:'local-linen'}]}))
function migrate(file){const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--config',config,'--local','--persist-to',dir,'--file',file],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr)}
let worker,output=''
async function start(){worker=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--config',config,'--local','--persist-to',dir,'--port',String(port)],{stdio:['ignore','pipe','pipe']});worker.stdout.on('data',x=>output+=x);worker.stderr.on('data',x=>output+=x);for(let i=0;i<120;i++){try{await call({sql:'SELECT 1'});return}catch{}await new Promise(r=>setTimeout(r,250))}throw Error(output)}
async function stop(){worker.kill();await new Promise(r=>worker.exitCode!==null?r():worker.once('exit',r))}
async function call(body,status=200){const r=await fetch(`http://127.0.0.1:${port}`,{method:'POST',body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data}
const sql=async (sql,...args)=>(await call({sql,args})).results
async function seed(){for(const w of ['a','b'])await sql('INSERT INTO workspaces VALUES(?,?,?)',w,w,'2026');for(const u of ['owner','second','shared','local','foreign'])await sql('INSERT INTO users VALUES(?,?,?,?,?)',u,u+'@example.test','Private '+u,'secret','2026');for(const [w,u,role] of [['a','owner','owner'],['a','second','owner'],['a','shared','employee'],['b','shared','owner'],['a','local','employee'],['b','foreign','employee']])await sql('INSERT INTO memberships VALUES(?,?,?,1)',w,u,JSON.stringify([role]));for(const [w,u] of [['a','shared'],['b','shared'],['a','local']])await sql('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)',w+u,u,w,w+u,'csrf','2099','2026');for(const w of ['a','b'])await sql('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)',w+'event',w,'shared','effect.completed','operation-opaque',JSON.stringify({nested:{email:'shared@example.test'}}),'2026')}
try{
 // Apply the actual sorted dependency chain: 0570 guards require 0500 tombstones.
 const files=(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()
 const pending=process.env.LINEN_PRIVACY_FRESH?[]:files.filter(f=>f>'0001_platform.sql')
 for(const file of files.filter(f=>!pending.includes(f)))migrate('migrations/'+file)
 await start();await seed();await stop()
 // Retained accounts and sessions precede the new migration.
 for(const file of pending)migrate('migrations/'+file);await start()
 // Model current sessions for the privacy deletion checks after legacy retirement.
 if(pending.length)for(const [w,u] of [['a','shared'],['b','shared'],['a','local']])await sql('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)','fresh-'+w+u,u,w,'fresh-'+w+u,'fresh-csrf','2099','2026')
 await sql("INSERT INTO platform_auth_session_proofs(session_id,kind,version) SELECT s.id,'password',v.version FROM sessions s JOIN platform_auth_versions v ON v.user_id=s.user_id")
 for(const w of ['a','b']) {
  await sql('INSERT INTO work_departments(id,workspace_id,name,kind,created_at,updated_at) VALUES(?,?,?,?,?,?)','department-'+w,w,'Service team','it','2026','2026')
  await sql('INSERT INTO work_department_members(workspace_id,department_id,user_id,active,updated_by,updated_at) VALUES(?,?,?,?,?,?)',w,'department-'+w,'shared',1,'owner','2026')
 }
 await call({identity:''},400)
 await call({tombstone:'foreign',workspace:'b'});await call({identity:'foreign'},409)
 await call({identity:'shared'},409)
 await call({tombstone:'shared'});await call({identity:'shared',actor:'local'},403)
 await sql("UPDATE memberships SET active=0 WHERE user_id='second'")
 await call({tombstone:'second'});await call({identity:'second',actor:'second'},403)
 await call({tombstone:'owner'});await call({identity:'owner'},409)
 await sql("INSERT INTO audit_events VALUES('account-event','a','shared','member.changed','shared','{}','2026')")
 await call({identity:'shared'})
 assert.equal((await sql("SELECT * FROM memberships WHERE workspace_id='a' AND user_id='shared'")).length,0)
 assert.equal((await sql("SELECT * FROM work_department_members WHERE workspace_id='a' AND user_id='shared'")).length,0,'Erasure revokes departmental staff metadata before removing its outer membership')
 assert.equal((await sql("SELECT active FROM work_department_members WHERE workspace_id='b' AND user_id='shared'"))[0].active,1,'Foreign tenant staff membership remains intact')
 assert.equal((await sql("SELECT * FROM sessions WHERE user_id='shared'")).length,1)
 assert.equal((await sql("SELECT name FROM users WHERE id='shared'"))[0].name,'Private shared')
 assert.equal((await sql("SELECT detail_json FROM audit_events WHERE id='bevent'"))[0].detail_json.includes('shared@example.test'),true)
 const erasedAudit=(await sql("SELECT id,actor_id,target,detail_json FROM audit_events WHERE id='aevent'"))[0]
 assert.deepEqual({id:erasedAudit.id,actor_id:erasedAudit.actor_id,target:erasedAudit.target},{id:'aevent',actor_id:'[erased]',target:'operation-opaque'})
 const removed=JSON.parse(erasedAudit.detail_json);assert.equal(removed.redacted,'erasure');assert.ok(Number.isFinite(Date.parse(removed.redactedAt)));assert.ok(!erasedAudit.detail_json.includes('shared@example.test'))
 await call({identity:'shared'});await call({identity:'shared@example.test'})
 assert.equal((await sql("SELECT target FROM audit_events WHERE id='account-event'"))[0].target,'shared')
 await call({sql:"INSERT INTO memberships VALUES('a','shared','[\"employee\"]',1)"},500)
 for(const identity of ['foreign','absent']){await call({tombstone:identity});assert.deepEqual(await call({identity}),{ok:true})}
 assert.equal((await sql("SELECT name FROM users WHERE id='foreign'"))[0].name,'Private foreign')
 await call({tombstone:'LOCAL@EXAMPLE.TEST'});await call({identity:'LOCAL@EXAMPLE.TEST'})
 assert.equal((await sql("SELECT name,password_hash FROM users WHERE id='local'"))[0].password_hash,'!erased')
 assert.equal((await sql("SELECT * FROM sessions WHERE user_id='local'")).length,0)
 await sql("UPDATE memberships SET active=1 WHERE user_id='second'")
 await call({identity:'owner'});await call({identity:'owner'},403)
 await call({identity:'owner',actor:'second'})
 assert.equal((await sql('PRAGMA foreign_key_check')).length,0)
 await stop();await start()
 await call({identity:'shared',actor:'second'})
 assert.equal((await sql("SELECT count(*) n FROM platform_identity_erasures WHERE workspace_id='a' AND identity_hash IS NOT NULL"))[0].n,6)
 console.log('PASS '+(process.env.LINEN_PRIVACY_FRESH?'fresh':'retained')+' real workerd/D1: scoped erasure, shared profile, sessions, audit provenance, owner revocation, last/self owner, unknown isolation, durable replay, resurrection and foreign keys')
}finally{if(worker?.exitCode===null)await stop();await rm(dir,{recursive:true,force:true})}

import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {createServer} from 'node:net'
const dir=await mkdtemp(join(tmpdir(),'linen-admission-'))
const socket=createServer();await new Promise(r=>socket.listen(Number(process.env.LINEN_TEST_PORT || 0),'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r))
const origin=`http://127.0.0.1:${port}`,config=join(dir,'wrangler.json')
const emitted=process.env.LINEN_TEST_EMITTED==='1'
const cfg=emitted?JSON.parse(await readFile('dist/server/wrangler.json','utf8')):{main:resolve('tests/platform/admission-worker.ts')}
Object.assign(cfg,{name:'linen-admission-test',main:emitted?resolve('dist/server/index.js'):cfg.main,compatibility_date:'2026-09-08',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:'DB',database_name:'linen',database_id:'local-linen'}],r2_buckets:[{binding:'ATTACHMENTS',bucket_name:'linen-admission-fixture'}],vars:{SESSION_SECRET:'fixture-only',ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}})
if(cfg.assets)cfg.assets.directory=resolve('dist/client')
delete cfg.triggers
await writeFile(config,JSON.stringify(cfg))
const hash=s=>createHash('sha256').update(s).digest('hex')
const migrations=(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()
let seed=''
for(const w of ['a','b'])seed+=`INSERT INTO workspaces VALUES('${w}','${w}','2026');INSERT INTO workspace_settings(workspace_id) VALUES('${w}');\n`
for(const u of ['owner','employee','expired','inactive','shared']){
 seed+=`INSERT INTO users VALUES('${u}','${u}@example.test','${u}','!fixture','2026');\n`
 for(const w of u==='shared'?['a','b']:['a'])seed+=`INSERT INTO memberships VALUES('${w}','${u}','["${u==='owner'?'owner':'employee'}"]',${u==='inactive'?0:1});INSERT INTO sessions VALUES('${w}-${u}','${u}','${w}','${hash(w+'-'+u)}','csrf','${u==='expired'?'2020':'2099'}','2026');\n`
}
// Session fixtures represent issued credentials after all membership changes.
seed+="INSERT INTO platform_auth_session_proofs(session_id,kind,version) SELECT s.id,'password',v.version FROM sessions s JOIN platform_auth_versions v ON v.user_id=s.user_id;\n"
const sqlFile=join(dir,'seed.sql');await writeFile(sqlFile,(await Promise.all(migrations.map(f=>readFile('migrations/'+f,'utf8')))).join('\n')+'\n'+seed)
const m=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--config',config,'--local','--persist-to',dir,'--file',sqlFile],{encoding:'utf8'});assert.equal(m.status,0,m.stdout+m.stderr)
let worker,output=''
const request=async(path,method='GET',body,user='owner',headers={})=>fetch(origin+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',Cookie:'linen_session=a-'+user,Origin:origin,'X-Linen-CSRF':'csrf',...headers},body:body===undefined?undefined:JSON.stringify(body)})
async function state(){return (await request('/settings')).json()}
try{
 worker=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--config',config,'--local','--persist-to',dir,'--port',String(port)],{stdio:['ignore','pipe','pipe']});worker.stdout.on('data',x=>output+=x);worker.stderr.on('data',x=>output+=x)
 for(let i=0;i<120;i++){try{if((await fetch(origin+'/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,250))}
 const original=await state();assert.deepEqual(original,{settings:{},revision:1})
 for(const [user,headers,status,code,message] of [
 ['owner',{Origin:'https://evil.invalid'},403,'origin_denied','Same-origin request required'],
 ['owner',{Origin:''},403,'origin_denied','Same-origin request required'],
 ['owner',{'X-Linen-CSRF':''},403,'csrf_denied','CSRF token required'],
 ['owner',{'X-Linen-CSRF':'wrong'},403,'csrf_denied','CSRF token required'],
 ['employee',{},403,'forbidden','Role does not permit this action'],
 ['expired',{},401,'unauthenticated','Session expired or access revoked'],
 ['inactive',{},401,'unauthenticated','Session expired or access revoked']]){
  const r=await request('/settings','PATCH',{settings:{retentionDays:30},revision:1},user,headers),body=await r.json()
  console.log(JSON.stringify({mode:emitted?'emitted':'source',user,headers,status:r.status,body}))
  assert.equal(r.status,status);assert.deepEqual(body,{error:{code,message}});assert.deepEqual(await state(),original)
 }
 const ok=await request('/settings','PATCH',{settings:{retentionDays:30},revision:1});assert.equal(ok.status,200);assert.deepEqual(await ok.json(),{updated:true});assert.deepEqual(await state(),{settings:{retentionDays:30},revision:2})
 console.log('PASS '+(emitted?'emitted':'source')+' actual application settings authorization status/body/nonmutation and owner success')
}finally{
 if(worker?.exitCode===null){worker.kill('SIGTERM');await new Promise(r=>worker.once('exit',r))}
 await rm(dir,{recursive:true,force:true})
 if(output.includes('Request failed'))console.log(output)
}

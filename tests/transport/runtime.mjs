import { applyMigrations } from '../sql-migrations.mjs';
import assert from 'node:assert/strict'
import {createServer as httpServer} from 'node:http'
import {createServer as httpsServer} from 'node:https'
import {execFileSync} from 'node:child_process'
import {readFile,readdir,mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url), root=new URL('../../',import.meta.url).pathname
const packages=await readdir(join(root,'node_modules/.pnpm'))
const dependency=name=>require(join(root,'node_modules/.pnpm',packages.find(x=>x.startsWith(name+'@')),'node_modules',name))
const {build}=dependency('esbuild')
const dir=await mkdtemp(join(tmpdir(),'linen-transport-'))
let mf,source,tls,target
const sourceRequests=[],targetRequests=[]
let providerOffset=0
const listen=server=>new Promise(resolve=>server.listen(process.env.LINEN_TEST_PROVIDER_PORT ? Number(process.env.LINEN_TEST_PROVIDER_PORT)+providerOffset++ : 0,'127.0.0.1',()=>resolve(server.address().port)))
const close=server=>server?new Promise(resolve=>{server.close(resolve);server.closeAllConnections()}):Promise.resolve()
try {
  target=httpServer(async(req,res)=>{targetRequests.push({url:req.url,headers:req.headers});res.end('unexpected redirect target')})
  const targetPort=await listen(target)
  const handler=async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk
    sourceRequests.push({url:req.url,method:req.method,authorization:req.headers.authorization,body})
    const url=new URL(req.url,'http://localhost'),status=Number(url.pathname.split('/').at(-1))||200
    if(status>=300&&status<400){res.writeHead(status,{Location:`http://127.0.0.1:${targetPort}/stolen`});res.end('redirect body must not become success');return}
    if(status!==200){res.writeHead(status);res.end('private provider failure');return}
    res.setHeader('Content-Type','application/json')
    if(req.method==='POST'&&url.pathname==='/notify/200'){const job=JSON.parse(body);res.end(JSON.stringify({id:job.id,deliveryId:'local-'+job.id}));return}
    if(url.pathname==='/notify/200'){res.end(JSON.stringify({id:url.searchParams.get('id'),nonce:url.searchParams.get('nonce'),state:'delivered',observedAt:new Date().toISOString()}));return}
    res.end(JSON.stringify({nativeTransport:true}))
  }
  source=httpServer(handler);const sourcePort=await listen(source)
  await writeFile(join(dir,'openssl.cnf'),'[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost.\n[ext]\nsubjectAltName=DNS:localhost.,DNS:localhost\nbasicConstraints=critical,CA:TRUE\n')
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-config',join(dir,'openssl.cnf'),'-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem')],{stdio:'ignore'})
  const cert=await readFile(join(dir,'cert.pem'),'utf8')
  tls=httpsServer({key:await readFile(join(dir,'key.pem')),cert},handler);const tlsPort=await listen(tls)
  const bundled=await build({entryPoints:[join(root,'tests/transport/worker.ts')],bundle:true,format:'esm',platform:'browser',write:false})
  // Miniflare reads NODE_EXTRA_CA_CERTS at import and passes it to workerd.
  // Native network transport: no fetch handler, proxy, URL rewrite or fetch override.
  const previousCA=process.env.NODE_EXTRA_CA_CERTS
  process.env.NODE_EXTRA_CA_CERTS=join(dir,'cert.pem')
  const {Miniflare,convertV4MiniflareOptions}=dependency('miniflare')
  if(previousCA===undefined)delete process.env.NODE_EXTRA_CA_CERTS;else process.env.NODE_EXTRA_CA_CERTS=previousCA
  mf=new Miniflare({...convertV4MiniflareOptions({ port: Number(process.env.LINEN_TEST_WORKER_PORT || 0), modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-01',d1Databases:{DB:'transport'},bindings:{ENCRYPTION_KEY:btoa('t'.repeat(32))}}),resourcePersistencePath:dir})
  const api=async(path,body={})=>{const r=await mf.dispatchFetch('http://localhost'+path,{method:'POST',body:JSON.stringify(body)});return {status:r.status,body:await r.json()}}
  const db=await mf.getD1Database('DB')
  // Apply the current complete real migration chain, including triggers, unchanged.
  await applyMigrations(db, join(root, 'migrations'));
  await db.exec(`INSERT INTO workspaces VALUES('transport','Transport','2026-01-01'); INSERT INTO users VALUES('owner','owner@transport.test','Owner','unused','2026-01-01'); INSERT INTO memberships VALUES('transport','owner','["owner"]',1); INSERT INTO workspace_settings VALUES('transport','{"notificationConnectionId":"notify"}',1);`)
  await db.prepare('INSERT INTO svc_records VALUES(?,?,?,?,?,?,?,1,?,?)').bind('record','transport','incident','owner','operators','[]','{}','2026-01-01','2026-01-01').run()
  const secret=(await api('/secret')).body.secret
  const configure=async(status)=>db.prepare('UPDATE connections SET config_json=? WHERE id=?').bind(JSON.stringify({url:`https://localhost.:${tlsPort}/notify/${status}`,allowedHosts:['localhost.']}),'notify').run()
  await db.prepare("INSERT INTO connections(id,workspace_id,provider,status,config_json,secret_ciphertext,name,created_at,updated_at) VALUES(?,?,?,?,?,?,'Transport','2026-01-01','2026-01-01')").bind('notify','transport','notification-webhook','active','{}',secret).run()
  assert.deepEqual(await api('/read',{url:`http://127.0.0.1:${sourcePort}/200`}),{status:200,body:{nativeTransport:true}})
  for(const status of [301,302,303,307,308]) {
    for(const path of ['/read','/oauth']) {
      const result=await api(path,{url:`http://127.0.0.1:${sourcePort}/${status}`})
      assert.equal(result.status,503);assert.equal(result.body.code,'provider_unavailable')
    }
    await configure(status)
    const id='job-'+status
    await db.prepare('INSERT INTO svc_outbox(id,workspace_id,record_id,recipient_id,kind,payload_json,next_at) VALUES(?,?,?,?,?,?,?)').bind(id,'transport','record','owner',id,'{"message":"local test only"}','2026-01-01').run()
    const before=sourceRequests.length
    assert.deepEqual((await api('/deliver')).body,[{id,state:'unknown'}])
    let ledger=await db.prepare('SELECT state,attempts,error,provider_ref FROM svc_outbox WHERE id=?').bind(id).first()
    assert.deepEqual(ledger,{state:'unknown',attempts:1,error:`Provider HTTP ${status}`,provider_ref:null})
    assert.equal(sourceRequests.length,before+1,'The original write reached the actual HTTPS socket')
    assert.equal(sourceRequests.at(-1).authorization,'Bearer write-secret')
    assert.deepEqual((await api('/deliver')).body,[])
    assert.equal(sourceRequests.length,before+1,'Unknown job must not be resent')
    const reconcile=await api('/reconcile',{id})
    assert.equal(reconcile.status,503);assert.equal(reconcile.body.code,'reconciliation_unavailable')
    ledger=await db.prepare('SELECT state,attempts FROM svc_outbox WHERE id=?').bind(id).first()
    assert.deepEqual(ledger,{state:'unknown',attempts:1})
  }
  for(const [status,code] of [[401,'provider_auth_denied'],[403,'provider_scope_denied'],[500,'provider_unavailable']]) {
    const result=await api('/read',{url:`http://127.0.0.1:${sourcePort}/${status}`});assert.equal(result.status,503);assert.equal(result.body.code,code);assert.ok(!JSON.stringify(result).includes('private provider failure'))
  }
  await configure(200)
  await db.prepare('INSERT INTO svc_outbox(id,workspace_id,record_id,recipient_id,kind,payload_json,next_at) VALUES(?,?,?,?,?,?,?)').bind('success','transport','record','owner','success','{}','2026-01-01').run()
  assert.deepEqual((await api('/deliver')).body,[{id:'success',state:'submitted'}])
  assert.equal((await api('/reconcile',{id:'success'})).body.state,'delivered')
  assert.ok(sourceRequests.some(r=>r.authorization==='Bearer read-secret'))
  assert.ok(sourceRequests.some(r=>r.body.includes('client_secret=oauth-secret')))
  assert.equal(targetRequests.length,0,'Redirect target received zero requests and therefore zero credentials')
  console.log(`TRANSPORT passed: native workerd fetch, full migrations, HTTP/OAuth reads and HTTPS notification writes/readback; 301/302/303/307/308 unknown ledger, attempts=1, no resend; target requests=${targetRequests.length}, credentials=0; 200 success and 401/403/500 truthful errors.`)
} finally {
  if(mf)await mf.dispose()
  await Promise.all([close(source),close(tls),close(target)])
  await rm(dir,{recursive:true,force:true})
}

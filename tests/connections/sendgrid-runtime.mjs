import { applyMigrations } from '../sql-migrations.mjs';
import assert from 'node:assert/strict'
import { readdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { generateKeyPairSync, sign } from 'node:crypto'
const require=createRequire(import.meta.url), root=new URL('../../',import.meta.url).pathname
const packages=await readdir(join(root,'node_modules/.pnpm'))
const dependency=name=>require(join(root,'node_modules/.pnpm',packages.find(x=>x.startsWith(name+'@')),'node_modules',name))
const {build}=dependency('esbuild'),{Miniflare,convertV4MiniflareOptions}=dependency('miniflare')
const dir=await mkdtemp(join(tmpdir(),'linen-sendgrid-'))
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const config={from:'Linen <linen@example.com>',webhookPublicKey:publicKey.export({type:'spki',format:'der'}).toString('base64')}
let mode='normal',db,mf,calls=[],raceId
const fixtureSender=(id=1)=>({id,from_email:'linen@example.com',verified:true})
// Test-only provider service; application uses native workerd fetch, including
// manual redirect behavior. Every outbound request is intercepted: no provider IO.
const outbound=async request=>{
 const u=new URL(request.url)
 calls.push({url:request.url,method:request.method,authorization:request.headers.get('authorization')})
 assert.equal(u.origin,'https://api.sendgrid.com','No redirect or credential forwarding')
 assert.equal(request.method,'GET','Activation must never send mail or mutate provider')
 assert.equal(request.headers.get('authorization'),'Bearer SENSITIVE-KEY')
 assert.equal(request.headers.get('on-behalf-of'),null)
 if(mode==='auth')return new Response('SENSITIVE-KEY provider error',{status:401})
 if(mode==='scope-denied')return new Response('SENSITIVE-KEY provider error',{status:403})
 if(mode==='offline')throw Error('SENSITIVE-KEY transport error')
 if(mode==='redirect')return new Response(null,{status:302,headers:{location:'https://evil.example/steal'}})
 if(mode==='html')return new Response('SENSITIVE-KEY not JSON')
 if(mode==='empty')return Response.json({})
 if(mode==='wrong-status')return Response.json({scopes:['mail.send']},{status:201})
 if(u.pathname==='/v3/scopes')return Response.json({scopes:mode==='no-mail'?['alerts.read']:mode==='bad-scopes'?['mail.send',null]:['mail.send','user.username.read','verified_senders.read']})
 if(u.pathname==='/v3/user/username')return Response.json(mode==='bad-account'?{username:'Account'}:{username:'Account',user_id:123})
 assert.equal(u.pathname,'/v3/verified_senders')
 assert.equal(u.searchParams.get('limit'),'100')
 if(mode==='stale')await db.prepare('UPDATE connections SET revision=revision+1,config_json=? WHERE id=?').bind(JSON.stringify({...config,from:'changed@example.com'}),raceId).run()
 if(mode==='revoked')await db.exec("UPDATE memberships SET active=0")
 if(mode==='paged'||mode==='cursor-loop') {
  if(!u.searchParams.has('lastSeenID')||mode==='cursor-loop')return Response.json({results:Array.from({length:100},(_,i)=>({...fixtureSender(i+1),from_email:`other${i}@example.com`}))})
  assert.equal(u.searchParams.get('lastSeenID'),'100')
  return Response.json({results:[fixtureSender(101)]})
 }
 return Response.json({results:mode==='missing'?[]:[{...fixtureSender(),...(mode==='unverified'?{verified:false}:mode==='wrong-sender'?{from_email:'different@example.com'}:mode==='bad-sender'?{verified:'true'}:{})}]})
}
try {
 const bundle=await build({entryPoints:[join(root,'tests/connections/sendgrid-worker.ts')],bundle:true,format:'esm',platform:'browser',write:false})
 mf=new Miniflare({...convertV4MiniflareOptions({ port: Number(process.env.LINEN_TEST_WORKER_PORT || 0), modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',bindings:{ENCRYPTION_KEY:btoa('s'.repeat(32))},d1Databases:{DB:'sendgrid'},outboundService:outbound}),resourcePersistencePath:dir})
 db=await mf.getD1Database('DB')
 await applyMigrations(db, join(root, 'migrations'));
 await db.exec(`INSERT INTO workspaces VALUES('a','A','2026-01-01'); INSERT INTO users VALUES('owner','owner@example.com','Owner','unused','2026-01-01'); INSERT INTO memberships VALUES('a','owner','["owner"]',1); INSERT INTO workspace_settings VALUES('a','{}',1);`)
 const api=async(path,body)=>{const r=await mf.dispatchFetch('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()}}
 const fixture=async(id,c=config)=>assert.equal((await api('/fixture',{id,config:c})).status,200)
 await fixture('ok')
 assert.equal((await api('/execution/ok')).status,503)
 let v=await api('/connections/ok/test',{revision:1})
 assert.equal(v.status,200,JSON.stringify(v));assert.equal(v.body.status,'active');assert.equal(v.body.revision,2)
 assert.equal(v.body.evidence.verifiedSenderEmail,'linen@example.com');assert.equal(v.body.evidence.configuredFrom,config.from)
 assert.equal(v.body.evidence.accountId,123);assert.equal(v.body.evidence.workflowVerified,false);assert.equal(v.body.evidence.deliveryVerified,false)
 assert.equal((await api('/execution/ok')).status,200)
 assert.equal((await db.prepare("SELECT connection_revision FROM connection_validations WHERE connection_id='ok'").first()).connection_revision,2)
 assert.equal((await db.prepare("SELECT count(*) n FROM audit_events WHERE action='connection.validated' AND target='ok'").first()).n,1)
 const before=calls.length
 assert.equal((await api('/connections/ok/test',{revision:1})).status,409);assert.equal(calls.length,before)
 const cases=[['auth',503,'provider_auth_denied'],['scope-denied',503,'provider_scope_denied'],['redirect',503,'provider_unavailable'],['html',502,'provider_schema_invalid'],['empty',502,'provider_schema_invalid'],['wrong-status',502,'provider_schema_invalid'],['no-mail',403,'sendgrid_mail_scope_required'],['bad-scopes',502,'provider_schema_invalid'],['bad-account',502,'provider_schema_invalid'],['missing',422,'sendgrid_verified_sender_required'],['unverified',422,'sendgrid_verified_sender_required'],['wrong-sender',422,'sendgrid_verified_sender_required'],['bad-sender',502,'provider_schema_invalid'],['cursor-loop',502,'provider_schema_invalid'],['stale',409,'revision_conflict'],['revoked',403,'forbidden']]
 for(const [m,status,code] of cases) {
  await fixture(m);mode=m;raceId=m
  const response=await api(`/connections/${m}/test`,{revision:1})
  assert.deepEqual(response,{status,body:{code}},m)
  assert.equal((await db.prepare('SELECT status FROM connections WHERE id=?').bind(m).first()).status,'unverified')
  assert.equal((await db.prepare('SELECT count(*) n FROM connection_validations WHERE connection_id=?').bind(m).first()).n,0)
  assert.equal((await db.prepare('SELECT count(*) n FROM audit_events WHERE target=?').bind(m).first()).n,0)
  await db.exec('UPDATE memberships SET active=1')
 }
 mode='paged';await fixture('paged');v=await api('/connections/paged/test',{revision:1});assert.equal(v.status,200);assert.equal(v.body.evidence.verifiedSenderId,101)
 mode='normal';await fixture('no-key',{from:config.from});const prior=calls.length
 assert.equal((await api('/connections/no-key/test',{revision:1})).body.code,'sendgrid_configuration_required');assert.equal(calls.length,prior)
 await fixture('invalid-config',{...config,from:'linen@example.com\r\nBcc: victim@example.com'})
 assert.equal((await api('/connections/invalid-config/test',{revision:1})).body.code,'invalid_config')
 await fixture('missing-secret');await db.exec("UPDATE connections SET secret_ciphertext=NULL WHERE id='missing-secret'")
 assert.equal((await api('/connections/missing-secret/test',{revision:1})).body.code,'credential_required')
 assert.equal(calls.length,prior)
 // Configuration verification cannot create a delivery outcome. Only the existing
 // signed-event consumer may transition a correlated accepted message to delivered.
 assert.equal((await db.prepare('SELECT count(*) n FROM execution_delivery_events').first()).n,0)
 await db.prepare("INSERT INTO execution_outbox VALUES('delivery','a','work','message','owner','ok','owner','accepted','provider-id','delivery','2026-01-01','2026-01-01')").run()
 const body=JSON.stringify([{event:'delivered',sg_event_id:'event-1',rer_delivery_id:'delivery',email:'owner@example.com'}])
 const timestamp=String(Math.floor(Date.now()/1000))
 const event=async(signature)=>{const r=await mf.dispatchFetch('http://localhost/events/ok',{method:'POST',headers:{'X-Twilio-Email-Event-Webhook-Timestamp':timestamp,'X-Twilio-Email-Event-Webhook-Signature':signature},body});return r.status}
 assert.equal(await event('bad'),403)
 assert.equal((await db.prepare("SELECT state FROM execution_outbox WHERE id='delivery'").first()).state,'accepted')
 assert.equal(await event(sign('sha256',Buffer.from(timestamp+body),privateKey).toString('base64')),200)
 assert.equal((await db.prepare("SELECT state FROM execution_outbox WHERE id='delivery'").first()).state,'delivered')
 assert.equal(await event(sign('sha256',Buffer.from(timestamp+body),privateKey).toString('base64')),200)
 assert.equal((await db.prepare('SELECT count(*) n FROM execution_delivery_events').first()).n,1)
 const visible=JSON.stringify([await api('/connection-status'),(await db.prepare('SELECT * FROM connection_validations').all()).results,(await db.prepare('SELECT * FROM audit_events').all()).results])
 assert.ok(!visible.includes('SENSITIVE-KEY'))
 assert.ok(calls.every(c=>c.method==='GET'&&new URL(c.url).origin==='https://api.sendgrid.com'))
 console.log('SENDGRID passed: full migrations, native workerd fetch + test-only provider service, D1 activation/audit, exact sender, key scopes/account schemas, pagination, auth/redirect/schema failures, stale revision and owner revocation, no secret leak, no mail sent, execution usability, signed delivered/replay coupling.')
} finally {if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true})}

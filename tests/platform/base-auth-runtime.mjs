import {mcpToolCases} from './mcp-tools-cases.mjs'
import {mailEdge} from './mail-edge.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawn,spawnSync} from 'node:child_process'
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createServer} from 'node:net'
const dir=await mkdtemp(join(tmpdir(),'linen-base-auth-'))
const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r))
const origin=`http://127.0.0.1:${port}`,config=join(dir,'wrangler.json'),entry=join(dir,'worker.ts')
const key='synthetic-dev-key-000000000000000000000000000000000000',secret='synthetic-session-secret-0000000000000000000000000000'
await writeFile(entry,`${mailEdge}import {baseAuthResponse} from ${JSON.stringify(resolve('src/platform/base-auth/http.ts'))};import {createApplication} from ${JSON.stringify(resolve('src/application.ts'))};import {originBindings} from ${JSON.stringify(resolve('src/platform/base-auth/service.ts'))};import {withNativeDevIdentity} from ${JSON.stringify(resolve('src/platform/base-auth/dev.ts'))};const app=createApplication();const production={async fetch(r,e,c){const fixture=mailFixture(r);if(fixture)return fixture;e=originBindings(e);return await baseAuthResponse(r,e)??app.fetch(r,e,c)}};const development=withNativeDevIdentity(production);export default {fetch(r,e,c){return r.headers.get('x-test-production')==='yes'?production.fetch(r,{...e,AUTH_LOCAL:'false'},c):development.fetch(r,e,c)}}`)
await writeFile(config,JSON.stringify({name:'linen-base-auth-test',main:entry,compatibility_date:'2026-09-08',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:'DB',database_name:'linen',database_id:'local-linen'}],r2_buckets:[{binding:'ATTACHMENTS',bucket_name:'linen-base-auth-fixture'}],vars:{SESSION_SECRET:secret,SETUP_TOKEN:secret,ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),OWNER_EMAIL:'owner@example.test',AUTH_ORIGIN:origin,APP_ORIGIN:'http://localhost:1',AUTH_LOCAL:'true',MAIL_PROVIDER:'resend',MAIL_API_KEY:'synthetic-provider-key',MAIL_FROM:'auth@localhost.test',RER_DEV_KEY:key}}))
const file=join(dir,'schema.sql');await writeFile(file,(await Promise.all((await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>readFile('migrations/'+f,'utf8')))).join('\n'))
const migrate=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--config',config,'--local','--persist-to',dir,'--file',file],{encoding:'utf8'});assert.equal(migrate.status,0,migrate.stdout+migrate.stderr)
let worker,output=''
const request=(path,{method='GET',body,cookie,headers={}}={})=>fetch(origin+path,{method,redirect:'manual',headers:{Connection:'close',Host:new URL(origin).host,Origin:origin,...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...headers},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})})
const cookieOf=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')
const read=r=>r.json()
try{
 worker=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--config',config,'--local','--persist-to',dir,'--ip','127.0.0.1','--port',String(port),'--inspector-port','0'],{stdio:['ignore','pipe','pipe']});worker.stdout.on('data',c=>output+=c);worker.stderr.on('data',c=>output+=c)
 let ready=false;for(let i=0;i<240;i++){try{if((await request('/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250))}assert.ok(ready,'Worker became ready')
 assert.deepEqual(await read(await request('/setup/state')),{state:'unclaimed'})
 assert.equal((await read(await request('/api/v1/setup'))).bootstrapTokenRequired,true)
 assert.equal((await request('/api/v1/setup',{method:'POST',body:{email:'intruder@example.test',name:'Intruder',workspaceName:'Bypass',password:'synthetic-native-password'}})).status,403,'Legacy setup cannot bypass the configured Base claim token')
 assert.match(await(await request('/')).text(),/Finish setup/)
 assert.equal((await request('/auth/bootstrap',{method:'POST',body:{token:secret,displayName:'Owner'},headers:{Origin:'https://foreign.invalid'}})).status,403)
 const claims=await Promise.all([1,2].map(()=>request('/auth/bootstrap',{method:'POST',body:{token:secret,displayName:'Owner',returnTo:'/setup'}})))
 assert.deepEqual(claims.map(r=>r.status).sort(),[303,409]);const ownerCookie=cookieOf(claims.find(r=>r.status===303))
 const session=await read(await request('/api/v1/session',{cookie:ownerCookie}));assert.deepEqual(session.principal.roles,['owner'])
 assert.equal((await request('/api/v1/settings',{method:'PATCH',cookie:ownerCookie,body:{revision:1,settings:{retentionDays:30}}})).status,403,'Native CSRF still required')
 assert.equal((await request('/setup',{method:'POST',cookie:ownerCookie,body:'confirm=yes',headers:{'content-type':'application/x-www-form-urlencoded',Origin:'https://foreign.invalid'}})).status,403)
 assert.equal((await request('/setup',{method:'POST',cookie:ownerCookie,body:'confirm=yes',headers:{'content-type':'application/x-www-form-urlencoded'}})).status,303)
 assert.deepEqual(await read(await request('/setup/state')),{state:'claimed'});assert.match(await(await request('/')).text(),/>Sign in</)
 assert.equal((await request('/__dev/outbox')).status,404)
 assert.equal((await request('/auth/magic-link',{method:'POST',body:{email:'owner@example.test',returnTo:'/app'}})).status,202)
 const message=await(await request('/fixtures/mail')).text()
 const proof=/[?&](?:amp;)?token=([^"&<>\s]+)/.exec(message)?.[1];assert.ok(proof,'Provider boundary receives ordinary proof')
 assert.equal((await request('/auth/confirm?token='+proof)).status,200,'GET only previews')
 const confirms=await Promise.all([1,2].map(()=>request('/auth/confirm',{method:'POST',body:{token:decodeURIComponent(proof)}})))
 assert.equal(confirms.filter(r=>r.status===303).length,1,'One confirmation consumes proof atomically')
 const nativeCookie=cookieOf(confirms.find(r=>r.status===303));assert.equal((await request('/api/v1/session',{cookie:nativeCookie})).status,200)
 const dev=await request('/auth/dev/enter',{headers:{'x-rer-dev-key':key}});assert.equal(dev.status,303);const devCookie=cookieOf(dev)
 assert.equal((await request('/api/v1/session',{cookie:devCookie})).status,200)
 const ungatedDevCookie=devCookie.split('; ').filter(c=>c.startsWith('linen_session=')).join('; ')
 assert.equal((await request('/api/v1/session',{cookie:ungatedDevCookie})).status,401,'Dev session alone cannot enter native API')
 assert.equal((await request('/setup',{cookie:ungatedDevCookie})).headers.get('location'),'/signin','Shared setup also refuses a dev session without its local admission cookie')
 assert.equal((await request('/api/v1/session',{cookie:devCookie,headers:{'x-test-production':'yes'}})).status,401,'Production denies native dev session')
 assert.equal((await request('/auth/dev/enter',{headers:{'x-test-production':'yes','x-rer-dev-key':key}})).status,404)
 assert.equal((await request('/api/v1/session',{cookie:ownerCookie})).status,200,'Original native session retained')
 const member=await read(await request('/api/v1/members',{method:'POST',cookie:ownerCookie,headers:{'X-Linen-CSRF':session.csrfToken},body:{email:'employee@example.test',name:'Employee',password:'synthetic-native-password-for-test',roles:['employee']}}))
 assert.ok(member.id)
 const password=await request('/api/v1/login',{method:'POST',body:{email:'employee@example.test',password:'synthetic-native-password-for-test'}});assert.equal(password.status,200);const passwordCookie=cookieOf(password)
 assert.deepEqual((await read(await request('/api/v1/session',{cookie:passwordCookie}))).principal.roles,['employee'])
 assert.equal((await request('/auth/magic-link',{method:'POST',body:{email:'employee@example.test',returnTo:'/app'}})).status,202)
 const employeeDetail=await(await request('/fixtures/mail')).text()
 const employeeProof=/[?&](?:amp;)?token=([^"&<>\s]+)/.exec(employeeDetail)?.[1];assert.ok(employeeProof)
 assert.equal((await request('/api/v1/members/'+member.id,{method:'PATCH',cookie:ownerCookie,headers:{'X-Linen-CSRF':session.csrfToken},body:{roles:['operator'],active:true}})).status,200)
 assert.equal((await request('/api/v1/session',{cookie:passwordCookie})).status,401,'New password sessions are revoked when native membership version changes')
 const renewedPassword=await request('/api/v1/login',{method:'POST',body:{email:'employee@example.test',password:'synthetic-native-password-for-test'}});assert.equal(renewedPassword.status,200)
 const renewedCookie=cookieOf(renewedPassword),renewedSession=await read(await request('/api/v1/session',{cookie:renewedCookie}));assert.deepEqual(renewedSession.principal.roles,['operator'])
 const changedPassword=await request('/api/v1/password',{method:'POST',cookie:renewedCookie,headers:{'X-Linen-CSRF':renewedSession.csrfToken},body:{currentPassword:'synthetic-native-password-for-test',password:'changed-password-for-test'}});assert.equal(changedPassword.status,200)
 assert.equal((await request('/api/v1/session',{cookie:renewedCookie})).status,401,'Password change revokes the preceding native session')
 assert.equal((await request('/api/v1/session',{cookie:cookieOf(changedPassword)})).status,200)
 assert.equal((await request('/auth/confirm',{method:'POST',body:{token:decodeURIComponent(employeeProof)}})).status,400,'Role change fences previously issued email proof')
 assert.equal((await request('/api/v1/members/'+member.id,{method:'PATCH',cookie:ownerCookie,headers:{'X-Linen-CSRF':session.csrfToken},body:{roles:['operator'],active:false}})).status,200)
 assert.equal((await request('/api/v1/session',{cookie:passwordCookie})).status,401,'Native deactivation revokes retained session authority')
 assert.equal((await request('/auth/step-up',{method:'POST',cookie:nativeCookie,body:{action:'export',returnTo:'/app'}})).status,202)
 const stepDetail=await(await request('/fixtures/mail')).text()
 const stepProof=/[?&](?:amp;)?token=([^"&<>\s]+)/.exec(stepDetail)?.[1];assert.ok(stepProof)
 assert.equal((await request('/auth/confirm',{method:'POST',cookie:ownerCookie,body:{token:decodeURIComponent(stepProof)}})).status,400,'Step-up binds the asking session')
 const step=await request('/auth/confirm',{method:'POST',cookie:nativeCookie,body:{token:decodeURIComponent(stepProof)}});assert.equal(step.status,303);assert.equal(step.headers.get('set-cookie'),null,'Step-up upgrades existing session without new authority')
 assert.equal((await request('/auth/confirm',{method:'POST',cookie:nativeCookie,body:{token:decodeURIComponent(stepProof)}})).status,400)
 // API-003 credential/protocol slice through real native session and MCP doors.
 const ownerApi=async(path,body,method=body===undefined?'GET':'POST',cookie=ownerCookie)=>{
  const response=await request('/api/v1'+path,{method,body,cookie,headers:{'X-Linen-CSRF':session.csrfToken}});
  return {status:response.status,value:await response.json()};
 };
 const rpc=async(bearer,method='tools/list',params={},extra={})=>{
  const response=await request('/api/mcp',{method:'POST',body:{jsonrpc:'2.0',id:1,method,params},headers:{...(bearer?{Authorization:'Bearer '+bearer}:{}),...extra}});
  return {status:response.status,value:await response.json()};
 };
 for(const bearer of [undefined,'linen_rest_synthetic-other-audience','linen_mcp_wrong']) {
  const denied=await rpc(bearer);
  assert.equal(denied.status,401,'API-003 unauthenticated discovery is refused');
  assert.deepEqual(denied.value,{jsonrpc:'2.0',id:null,error:{code:-32001,message:'Authentication required'}},'API-003 auth error discloses no resource or tool names');
 }
 assert.equal((await request('/api/mcp',{cookie:ownerCookie})).status,401,'API-003 an owner session is not an MCP grant');
 const bot=(await ownerApi('/automation-principals',{name:'Desk bot',idempotencyKey:'synthetic-API-003-desk-bot'})).value;
 assert.ok(bot.id,'API-003 use an existing automation principal');
 const hardware=(await ownerApi('/work-groups',{name:'Hardware'})).value;assert.ok(hardware.id,'API-003 real Hardware queue');
 const grant={groupIds:[hardware.id],principalId:bot.id,name:'Desk bot',scopes:['work.read','work.comment'],tools:['work.list','work.get','work.comment'],expiresAt:new Date(Date.now()+30*86400000).toISOString()};
 for(const patch of [{principalId:member.id},{principalId:session.principal.userId},{principalId:'absent'},{tools:['approve']},{scopes:['owner']},{scopes:['work.read']},{tools:['work.get','work.get']},{expiresAt:'invalid'},{expiresAt:new Date(Date.now()-1000).toISOString()},{expiresAt:new Date(Date.now()+366*86400000).toISOString()}])
  assert.ok((await ownerApi('/mcp-credentials',{...grant,...patch})).status>=400,'API-003 closed selections, expiry and automation-only minting');
 const noCsrf=await request('/api/v1/mcp-credentials',{method:'POST',cookie:ownerCookie,body:grant});
 assert.equal(noCsrf.status,403,'API-003 native CSRF protects mint');
 const created=await ownerApi('/mcp-credentials',grant);
 assert.equal(created.status,201,'API-003 owner mints for an integration-only principal');
 const credential=created.value;assert.match(credential.secret,/^linen_mcp_/);assert.equal(credential.toolsAvailable,true,'API-003 scoped tools are available');
 const listed=(await ownerApi('/mcp-credentials')).value.items;
 const first=listed.find(row=>row.id===credential.id);
 assert.equal(first.last_used_at,null);assert.deepEqual(JSON.parse(first.tools_json),grant.tools);assert.equal(first.expires_at,grant.expiresAt);
 assert.ok(!JSON.stringify(listed).includes(credential.secret) && !JSON.stringify(listed).includes('secret_hash'),'API-003 secret shown once, hash not in management projection');
 assert.equal((await rpc(credential.secret,'initialize')).value.result.serverInfo.name,'Linen','API-003 authenticated MCP initialize');
 assert.deepEqual((await rpc(credential.secret)).value.result.tools.map(t=>t.name).sort(),[...grant.tools].sort(),'API-003 discovery lists exactly the three currently permitted tools');
 assert.deepEqual((await rpc(credential.secret,'resources/list')).value.result,{resources:[]});
 assert.deepEqual((await rpc(credential.secret,'resources/templates/list')).value.result,{resourceTemplates:[]});
 assert.ok((await ownerApi('/mcp-credentials')).value.items.find(row=>row.id===credential.id).last_used_at,'API-003 last use is visible');
 for(const method of ['work.create','approve','credentials.mint','grants.create','export','restore','erase','connector.dispatch','task.plan','bulk']) {
  const refusal=await rpc(credential.secret,method,{name:'approve-PRIVATE-ARGUMENT',arguments:{text:'PRIVATE-ARGUMENT',secret:credential.secret}});
  assert.equal(refusal.value.error.code,-32601,'API-003 no tool, approval, configuration, archive or external effects are available');
 }
 for(const path of ['/session','/work','/mcp-credentials'])
  assert.equal((await request('/api/v1'+path,{cookie:ownerCookie,headers:{Authorization:'Bearer '+credential.secret}})).status,401,'API-003 MCP audience is refused at REST even with a session cookie');
 const sql=command=>{
  const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--config',config,'--local','--persist-to',dir,'--json','--command',command],{encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);return JSON.parse(result.stdout).flatMap(x=>x.results);
 };
 // API-001 REST authority through the same native owner and real HTTP doors.
 const restGrant={principalId:bot.id,name:'Ticket filer',scopes:['work.create'],expiresAt:new Date(Date.now()+30*86400000).toISOString()};
 const mintRest=async(patch={})=>ownerApi('/rest-credentials',{...restGrant,...patch});
 const restCall=async(secret,body,path='/work',cookie)=>{
  const response=await request('/api/v1'+path,{method:body===undefined?'GET':'POST',body,cookie,headers:{Authorization:'Bearer '+secret}});
  return {status:response.status,value:await response.json()};
 };
 for(const patch of [{principalId:member.id},{principalId:session.principal.userId},{principalId:'synthetic-linen-absent'},{scopes:['work.read']},{scopes:[]},{scopes:['work.create','work.create']},{expiresAt:'bad'},{expiresAt:new Date(Date.now()-1000).toISOString()},{expiresAt:new Date(Date.now()+366*86400000).toISOString()}])assert.ok((await mintRest(patch)).status>=400);
 assert.equal((await request('/api/v1/rest-credentials',{method:'POST',cookie:ownerCookie,body:restGrant})).status,403,'REST mint retains native CSRF');
 const restMint=await mintRest();assert.equal(restMint.status,201);const rest=restMint.value;
 assert.equal(sql("SELECT secret_hash FROM rest_credentials WHERE id='"+rest.id+"'")[0].secret_hash,createHash('sha256').update(rest.secret).digest('hex'));
 const restMetadata=JSON.stringify((await ownerApi('/rest-credentials')).value);
 assert.ok(!restMetadata.includes(rest.secret)&&!restMetadata.includes('secret_hash'),'REST management never shows the secret again');
 assert.equal((await rpc(rest.secret)).status,401,'Real REST token cannot authorize MCP');
 assert.equal((await restCall(credential.secret,{},'/work',ownerCookie)).status,401,'MCP bearer cannot fall back to an owner session');
 for(const path of ['/session','/members','/rest-credentials','/mcp-credentials','/catalog','/connections','/exports'])assert.equal((await restCall(rest.secret,undefined,path,ownerCookie)).status,403,'REST bearer cannot widen into a native session');
 const restBody={title:'synthetic-linen-5101',body:'synthetic-linen-5102',deduplicationKey:'synthetic-linen-5103'};
 for(const patch of [{sensitivity:'hr'},{sensitivity:'restricted'},{beneficiaryId:member.id},{catalogIds:['synthetic-linen-quote']},{context:{quoteId:'synthetic-linen-quote'}},{groupId:hardware.id},{title:''},{kind:'approval'}])assert.ok((await restCall(rest.secret,{...restBody,...patch})).status>=400,'Unproved or privileged REST payload is refused');
 const restCreated=await restCall(rest.secret,restBody);assert.equal(restCreated.status,201,JSON.stringify(restCreated.value));
 assert.equal((await restCall(rest.secret,restBody)).value.id,restCreated.value.id,'Same REST request is idempotent');
 assert.equal((await restCall(rest.secret,{...restBody,title:'synthetic-linen-5104'})).status,409);
 const storedRest=sql("SELECT requester_id,beneficiary_id,sensitivity FROM work_records WHERE id='"+restCreated.value.id+"'")[0];assert.deepEqual(storedRest,{requester_id:bot.id,beneficiary_id:bot.id,sensitivity:'normal'});
 assert.equal(sql("SELECT count(*) n FROM work_messages WHERE work_id='"+restCreated.value.id+"'")[0].n,1);
 assert.equal(sql("SELECT count(*) n FROM work_intake_events WHERE work_id='"+restCreated.value.id+"'")[0].n,0,'REST filing starts no automatic interpretation or provider effects');
 assert.equal(sql("SELECT count(*) n FROM audit_events WHERE target='"+restCreated.value.id+"' AND action='work.created'")[0].n,1,'Replay adds no duplicate typed history');
 assert.ok((await ownerApi('/rest-credentials')).value.items.find(x=>x.id===rest.id).last_used_at);
 sql("UPDATE memberships SET active=0 WHERE user_id='"+bot.id+"'");assert.equal((await restCall(rest.secret,restBody)).status,401);sql("UPDATE memberships SET active=1 WHERE user_id='"+bot.id+"'");
 sql("UPDATE memberships SET roles_json='[\"integration\",\"operator\"]' WHERE user_id='"+bot.id+"'");assert.equal((await restCall(rest.secret,restBody)).status,401);sql("UPDATE memberships SET roles_json='[\"integration\"]' WHERE user_id='"+bot.id+"'");
 const restIssuer=(await ownerApi('/members',{email:'synthetic-linen-5120@example.test',name:'REST issuer',password:'synthetic-linen-5121',roles:['owner']})).value;
 const restIssuerLogin=await request('/api/v1/login',{method:'POST',body:{email:'synthetic-linen-5120@example.test',password:'synthetic-linen-5121'}});
 const restIssuerCookie=cookieOf(restIssuerLogin),restIssuerSession=await read(await request('/api/v1/session',{cookie:restIssuerCookie}));
 const issuedResponse=await request('/api/v1/rest-credentials',{method:'POST',cookie:restIssuerCookie,headers:{'X-Linen-CSRF':restIssuerSession.csrfToken},body:restGrant});assert.equal(issuedResponse.status,201);
 const issuerRest=await read(issuedResponse);sql("UPDATE memberships SET active=0 WHERE user_id='"+restIssuer.id+"'");assert.equal((await restCall(issuerRest.secret,restBody)).status,401,'Losing issuer authority refuses the next call');
 sql("CREATE TRIGGER synthetic_linen_rest_race BEFORE INSERT ON work_records WHEN NEW.dedup_key='synthetic-linen-5105' BEGIN UPDATE rest_credentials SET state='revoked',secret_hash=NULL WHERE id='"+rest.id+"'; END");
 assert.equal((await restCall(rest.secret,{...restBody,deduplicationKey:'synthetic-linen-5105'})).status,409,'REST authority withdrawn inside write rolls back the transaction');
 assert.equal(sql("SELECT count(*) n FROM work_records WHERE dedup_key='synthetic-linen-5105'")[0].n,0);sql('DROP TRIGGER synthetic_linen_rest_race');
 const expiredRest=(await mintRest()).value;sql("UPDATE rest_credentials SET expires_at='2000-01-01' WHERE id='"+expiredRest.id+"'");assert.equal((await restCall(expiredRest.secret,restBody)).status,401);assert.equal(sql("SELECT state FROM rest_credentials WHERE id='"+expiredRest.id+"'")[0].state,'expired');
 assert.equal((await ownerApi('/rest-credentials/'+rest.id+'/revoke',{})).status,200);assert.equal((await restCall(rest.secret,restBody)).status,401);
 assert.deepEqual(sql("SELECT state,secret_hash FROM rest_credentials WHERE id='"+rest.id+"'")[0],{state:'revoked',secret_hash:null});
 const restAudit=sql("SELECT detail_json FROM audit_events WHERE action LIKE 'rest.%'").map(x=>x.detail_json).join('');assert.ok(!restAudit.includes(rest.secret)&&!restAudit.includes(restBody.body),'REST audit omits credentials and request bodies');
 const erasedRest=(await mintRest()).value;
 console.log('PASS API-001 scoped REST creation, audience isolation, one-time hash, expiry, revocation, live authority and transactional replay fences');
 await mcpToolCases({ownerApi,rpc,sql,bot,credential,grant,session,member,request});
 // A second authenticated owner cannot see, mint for, or revoke another workspace's grant.
 sql("INSERT INTO workspaces VALUES('mcp-other-workspace','Other','2026-01-01')");
 const second=(await ownerApi('/members',{email:'mcp-other@example.test',name:'Other owner',password:'API-003-other-owner-password',roles:['owner']})).value;
 sql("UPDATE memberships SET workspace_id='mcp-other-workspace' WHERE user_id='"+second.id+"'");
 const secondLogin=await request('/api/v1/login',{method:'POST',body:{email:'mcp-other@example.test',password:'API-003-other-owner-password'}});
 const secondCookie=cookieOf(secondLogin),secondSession=await read(await request('/api/v1/session',{cookie:secondCookie}));
 const foreign=async(path,body)=>request('/api/v1'+path,{method:body===undefined?'GET':'POST',body,cookie:secondCookie,headers:{'X-Linen-CSRF':secondSession.csrfToken}});
 assert.deepEqual(await read(await foreign('/mcp-credentials')),{items:[]},'API-003 workspace isolation');
 assert.equal((await foreign('/mcp-credentials/'+credential.id+'/revoke',{})).status,404);
 assert.ok((await foreign('/mcp-credentials',grant)).status>=400,'API-003 foreign principal and group are refused');
 // Commit-time owner guard and audit-failure rollback exercise the real mint route.
 const beforeFailure=(await ownerApi('/mcp-credentials')).value.items.length;
 sql("CREATE TRIGGER test_mcp_owner_race BEFORE INSERT ON mcp_credentials BEGIN UPDATE memberships SET active=0 WHERE user_id=NEW.created_by; END");
 assert.equal((await ownerApi('/mcp-credentials',grant)).status,403,'API-003 owner withdrawn at mint commit is refused');
 sql('DROP TRIGGER test_mcp_owner_race');
 sql("CREATE TRIGGER test_mcp_audit_failure BEFORE INSERT ON audit_events WHEN NEW.action='mcp.credential_minted' BEGIN SELECT RAISE(ABORT,'test_audit_unavailable'); END");
 assert.equal((await ownerApi('/mcp-credentials',grant)).status,500,'API-003 failed mint audit rolls back credential');
 sql('DROP TRIGGER test_mcp_audit_failure');
 assert.equal((await ownerApi('/mcp-credentials')).value.items.length,beforeFailure,'API-003 neither failed mint persists a credential');
 const stored=sql("SELECT secret_hash FROM mcp_credentials WHERE id='"+credential.id+"'")[0];
 assert.equal(stored.secret_hash,createHash('sha256').update(credential.secret).digest('hex'),'API-003 stores only SHA-256');
 const audits=sql("SELECT * FROM audit_events WHERE action LIKE 'mcp.%'");
 assert.ok(audits.some(row=>row.action==='mcp.credential_minted'),'API-003 mint audited atomically');
 const calls=audits.filter(row=>row.action==='mcp.call' && row.target===credential.id);assert.ok(calls.length>=15);
 for(const row of calls){const detail=JSON.parse(row.detail_json);assert.equal(row.actor_id,bot.id);assert.equal(detail.credentialId,credential.id);assert.equal(detail.principalId,bot.id);assert.ok(Array.isArray(detail.targetIds));assert.ok(row.created_at);}
 assert.ok(!JSON.stringify(audits).includes(credential.secret)&&!JSON.stringify(audits).includes('PRIVATE-ARGUMENT'),'API-003 audits have no secret, body or untrusted tool name');
 for(const roles of [['owner'],['integration','owner'],['integration','operator'],['integration','approver'],['integration','hr'],['integration','auditor']]) {
  assert.equal((await ownerApi('/members/'+bot.id,{roles,active:true},'PATCH')).status,200);
  assert.equal((await ownerApi('/mcp-credentials',grant)).status,403,'API-003 mixed or privileged roles refuse mint');
  assert.equal((await rpc(credential.secret)).status,401,'API-003 every call checks current roles');
 }
 assert.equal((await ownerApi('/members/'+bot.id,{roles:['integration'],active:false},'PATCH')).status,200);
 assert.equal((await rpc(credential.secret)).status,401,'API-003 inactive membership refuses next call');
 assert.equal((await ownerApi('/mcp-credentials',grant)).status,403);
 assert.equal((await ownerApi('/members/'+bot.id,{roles:['integration'],active:true},'PATCH')).status,200);
 assert.equal((await rpc(credential.secret,'ping')).status,200);
 assert.equal((await ownerApi('/mcp-credentials/'+credential.id+'/revoke',{})).status,200);
 assert.equal((await rpc(credential.secret)).status,401,'API-003 owner revocation immediately refuses calls');
 const revoked=sql("SELECT state,secret_hash FROM mcp_credentials WHERE id='"+credential.id+"'")[0];assert.deepEqual(revoked,{state:'revoked',secret_hash:null});
 assert.equal(sql("SELECT count(*) n FROM audit_events WHERE action='mcp.credential_revoked' AND target='"+credential.id+"'")[0].n,1);
 await ownerApi('/mcp-credentials/'+credential.id+'/revoke',{});
 assert.equal(sql("SELECT count(*) n FROM audit_events WHERE action='mcp.credential_revoked' AND target='"+credential.id+"'")[0].n,1,'API-003 repeat revocation is inert');
 const short=(await ownerApi('/mcp-credentials',{...grant,expiresAt:new Date(Date.now()+5000).toISOString()})).value;
 assert.ok(short.secret);await new Promise(resolve=>setTimeout(resolve,5100));
 assert.equal((await rpc(short.secret)).status,401,'API-003 expiry refuses next call');
 assert.equal(sql("SELECT count(*) n FROM audit_events WHERE action='mcp.credential_expired' AND target='"+short.id+"'")[0].n,1,'API-003 expiry audited once');
 await rpc(short.secret);assert.equal(sql("SELECT count(*) n FROM audit_events WHERE action='mcp.credential_expired' AND target='"+short.id+"'")[0].n,1);
 const retiredBot=(await ownerApi('/automation-principals',{name:'Retired bot',idempotencyKey:'synthetic-API-003-retired-bot'})).value;
 const retiredGrant={...grant,principalId:retiredBot.id};const retiredCredential=(await ownerApi('/mcp-credentials',retiredGrant)).value;
 assert.ok(retiredCredential.secret);assert.equal((await ownerApi('/automation-principals/'+retiredBot.id+'/revoke',{})).status,200);
 assert.equal((await rpc(retiredCredential.secret)).status,401,'API-003 automation-principal revocation refuses next call');
 const platformBot=(await ownerApi('/automation-principals',{name:'Platform erased bot',idempotencyKey:'synthetic-API-003-platform-erased-bot'})).value;
 const platformCredential=(await ownerApi('/mcp-credentials',{...grant,principalId:platformBot.id})).value;assert.ok(platformCredential.secret);
 const platformErasure=await ownerApi('/adoption/erase',{identity:platformBot.id});assert.equal(platformErasure.status,200);
 assert.equal(platformErasure.value.state,'completed','API-003 full adoption/platform erasure completes');
 assert.equal((await rpc(platformCredential.secret)).status,401,'API-003 platform erasure refuses next call');
 assert.deepEqual(sql("SELECT state,secret_hash FROM mcp_credentials WHERE id='"+platformCredential.id+"'")[0],{state:'revoked',secret_hash:null},'API-003 platform erasure atomically revokes and clears hash');
 const erasing=(await ownerApi('/mcp-credentials',grant)).value;assert.ok(erasing.secret);
 assert.equal((await ownerApi('/people/'+bot.id+'/erase',{revision:0,reason:'API-003 authorized automation erasure'})).status,200);
 assert.equal((await rpc(erasing.secret)).status,401,'API-003 erasure invalidates next call');
 assert.equal((await ownerApi('/mcp-credentials',grant)).status,403,'API-003 erased principal cannot mint another grant');
 assert.ok(sql("SELECT state,secret_hash FROM mcp_credentials WHERE principal_id='"+bot.id+"'").every(row=>row.state==='revoked'&&row.secret_hash===null),'API-003 erasure clears all principal credential hashes');
 assert.equal((await restCall(erasedRest.secret,restBody)).status,401);assert.deepEqual(sql("SELECT state,secret_hash FROM rest_credentials WHERE id='"+erasedRest.id+"'")[0],{state:'revoked',secret_hash:null},'REST principal erasure clears hash');
 console.log('PASS API-003 native owner mint/list/revoke; SHA-256 one-time secret; closed scopes/tools and expiry; separate audiences; filtered discovery and scoped ticket tools; live roles/membership; audit without bodies or secret; principal erasure/hash removal');
 console.log('PASS Base native claim race, Lobby/setup, ordinary provider email-link replay, native membership/password/session retention and revocation, bound step-up proof, CSRF/origin, dev gate and production denial')
}catch(error){console.error(output.slice(-12000));throw error;}finally{
 if(worker){worker.kill('SIGTERM');await Promise.race([new Promise(r=>worker.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);if(worker.exitCode===null)worker.kill('SIGKILL')}
 await rm(dir,{recursive:true,force:true})
}

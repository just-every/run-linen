import assert from 'node:assert/strict';
import {runtimeHarness} from './runtime-harness.mjs';
const h=await runtimeHarness('tests/intelligence/repair-worker.ts'),db=await h.db;
let timer,busy=false;
const fixture=async(path,body)=>{const r=await fetch(h.origin+'/fixture/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r.json()};
const api=async(path,method='GET',body,auth={})=>{const r=await fetch(h.origin+'/api/v1'+path,{method,headers:{Origin:h.origin,'Content-Type':'application/json',...(auth.cookie?{Cookie:auth.cookie}:{}),...(auth.csrf?{'X-Linen-CSRF':auth.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});const value=await r.json();assert.ok(r.ok,JSON.stringify({path,status:r.status,value}));return {value,cookie:r.headers.get('set-cookie')}};
const ok=async(...args)=>(await api(...args)).value;
const query=async(sql,...args)=>fixture('query',{sql,args});
const one=async(sql,...args)=>(await query(sql,...args))[0];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let n=0;n<360;n++){const v=await fn();if(v)return v;await pause(500)}throw new Error('Timed out: '+label)}
function clock(){timer=setInterval(async()=>{if(busy)return;busy=true;try{await fixture('tick',{})}finally{busy=false}},1000)}
async function stop(){clearInterval(timer);await until(()=>!busy,'scheduler drain')}
try{
 await db.exec('CREATE TABLE repair_fixture(id INTEGER PRIMARY KEY,data TEXT); CREATE TABLE repair_presence(target TEXT PRIMARY KEY); CREATE TABLE repair_writes(target TEXT,method TEXT); CREATE TABLE repair_probe_calls(target TEXT,beneficiary TEXT); CREATE TABLE repair_model_inputs(purpose TEXT,data TEXT);');
 const setup=await api('/setup','POST',{email:'resume-owner@test.invalid',name:'Owner',workspaceName:'Resume fixture',password:'resume fixture owner passphrase'}),owner={cookie:setup.cookie.split(';')[0]},session=await ok('/session','GET',undefined,owner);owner.csrf=session.csrfToken;const wid=session.principal.workspaceId,uid=session.principal.userId;
 async function member(email,roles){const m=await ok('/members','POST',{email,name:email,roles,password:'resume fixture member passphrase'},owner),login=await api('/login','POST',{email,password:'resume fixture member passphrase'});const auth={cookie:login.cookie.split(';')[0]};auth.csrf=(await ok('/session','GET',undefined,auth)).csrfToken;return {id:m.id,auth};}
 const employee=await member('resume-employee@test.invalid',['employee']),manager=await member('resume-manager@test.invalid',['approver']);
 const conn=async(provider,config,secret)=>(await fixture('connection',{workspaceId:wid,provider,config,secret})).id;
 const graph=await conn('microsoft-graph',{tenantId:'fixture'},{clientId:'fixture',clientSecret:'fixture'}),probe=await conn('workflow-probe',{url:'https://probe.example.test/check',allowedHosts:['probe.example.test']},{token:'fixture'}),model=await conn('openai',{model:'fixture-model',inputUsdPerMillion:1,cachedInputUsdPerMillion:1,outputUsdPerMillion:1,maxOutputTokens:1000,maxAttemptUsd:1},{apiKey:'synthetic-test-model-only-credential'});
 await ok('/intelligence/budget','PUT',{limitUsd:10},owner);await db.prepare('UPDATE workspace_settings SET settings_json=? WHERE workspace_id=?').bind(JSON.stringify({defaultModelConnectionId:model}),wid).run();
 await db.prepare('INSERT INTO work_people(id,workspace_id,source,source_id,name,manager_id,active,merged_into,revision,observed_at,effective_at,member_id,binding_id) VALUES(?,?,?,?,?,?,1,NULL,1,?,?,?,?)').bind(employee.id,wid,'test-authoritative-hr',employee.id,'Employee',manager.id,new Date().toISOString(),new Date().toISOString(),employee.id,'reviewed-fixture-binding').run();
 const actor=await ok('/automation-principals','POST',{name:'Resume automation',idempotencyKey:'resume-actor'},owner);await ok('/subject-mappings','POST',{connectionId:graph,localUserId:employee.id,providerSubject:'external-person'},owner);
 const grant=async(work,target,action)=>ok('/grants','POST',{principalId:actor.id,action,actionVersion:1,target,beneficiaryId:'external-person',localBeneficiaryId:employee.id,connectionId:graph,verifierConnectionId:probe,validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+86400000).toISOString(),maxUses:10,conditions:{workId:work.id}},owner);
 for(const managerRequired of [true,false]){
  const target=managerRequired?'manager-project':'later-grant',catalog=await ok('/catalog','POST',{name:target,kind:'access',target,ownerId:uid,requiresManager:managerRequired},owner);
  await fixture('config',{catalogId:catalog.id,probeMode:'negative'});
  const expiry=new Date(Date.now()+90000).toISOString();
  const work=await ok('/work','POST',{title:target+' access',body:'I need access for Project work until '+expiry,deduplicationKey:target},employee.auth);
  if(managerRequired){await grant(work,target,'group.add');await grant(work,target,'group.remove')}
  clock();await until(()=>one('SELECT * FROM work_fulfilments WHERE work_id=?',work.id),'initial ordinary request stored');await stop();
  assert.equal((await one('SELECT COUNT(*) n FROM repair_writes WHERE target=?',target)).n,0);
  const attempts=(await one("SELECT COUNT(*) n FROM intelligence_attempts WHERE kind='model'")).n;
  assert.equal((await one('SELECT state FROM intelligence_pending_fulfilments WHERE work_id=?',work.id)).state,'waiting');
  if(managerRequired){
   const decisions=(await ok('/fulfilment-decisions','GET',undefined,manager.auth)).items;const d=decisions.find(d=>d.workId===work.id);assert.ok(d);
   await ok('/work/'+work.id+'/fulfilment/approve','POST',{...d,expectedHolderId:d.holderId,idempotencyKey:'real-manager-decision'},manager.auth);
  }else{await grant(work,target,'group.add');await grant(work,target,'group.remove')}
  await h.restart();clock();await until(()=>one("SELECT * FROM intelligence_fulfilment_runs WHERE work_id=? AND state='verified'",work.id),'background authority resume');await stop();
  assert.equal((await one("SELECT COUNT(*) n FROM intelligence_attempts WHERE kind='model'")).n,attempts,'approval/grant resume never calls the model again');
  assert.equal((await one("SELECT COUNT(*) n FROM repair_writes WHERE target=? AND method='POST'",target)).n,1);
  assert.equal((await one('SELECT COUNT(*) n FROM execution_plans WHERE work_id=?',work.id)).n,1);
  assert.ok((await ok('/work/'+work.id,'GET',undefined,employee.auth)).messages.some(m=>m.body.includes('Fresh independent checks')));
  console.log('repair resume: '+target+' automatically verified; awaiting declared expiry');
  clock();await until(()=>one("SELECT * FROM work_obligations WHERE work_id=? AND kind='access.revoke' AND state='verified'",work.id),'declared expiry verification');await stop();
  assert.equal((await one("SELECT COUNT(*) n FROM repair_writes WHERE target=? AND method='DELETE'",target)).n,1);
  assert.equal((await query('SELECT * FROM repair_presence WHERE target=?',target)).length,0);
 }
 console.log('PASS repair resume: native authenticated employee intake persists pending fulfilment; exact manager approval or later scoped grants, then scheduler only -> one actual fixture-provider add, independent recovery, one removal and verified expiry; no employee resubmit, model rerun, Run/Interpret or helper dispatch; restart persistence.');
}finally{await stop();await h.close()}

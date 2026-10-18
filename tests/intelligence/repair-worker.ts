import {Hono} from 'hono';
import {platformApp} from '../../src/platform/routes';
import {registerWorkRoutes} from '../../src/features/work';
import {registerServiceRoutes} from '../../src/features/services';
import {registerExecutionRoutes} from '../../src/features/execution';
import {registerIntelligenceRoutes} from '../../src/features/intelligence';
import {processScheduledWork} from '../../src/scheduler';
import {compileVerifiedCase,processCapabilityReuse,currentVersions} from '../../src/features/intelligence/capabilities';
import {encryptSecret} from '../../src/platform/crypto';
import {ApiError} from '../../src/platform/http';
import type {AppEnv,Env} from '../../src/platform/types';
// All synthetic provider/model state is confined to this test entry and test D1 tables.
let env:Env;
const setting=async()=>JSON.parse((await env.DB.prepare('SELECT data FROM repair_fixture WHERE id=1').first<any>())?.data || '{}');
const presence=async(target:string)=>!!await env.DB.prepare('SELECT target FROM repair_presence WHERE target=?').bind(target).first();
globalThis.fetch=async(input:any,init:any={})=>{
 const u=new URL(String(input)),config=await setting();
 if(u.hostname==='login.microsoftonline.com')return Response.json({access_token:'fixture'});
 if(u.hostname==='graph.microsoft.com'){
  if(u.pathname.startsWith('/v1.0/users/'))return Response.json({id:u.pathname.split('/').at(-1)});
  const target=u.pathname.split('/')[3];
  if(init.method==='POST'||init.method==='DELETE'){
   await env.DB.prepare('INSERT INTO repair_writes VALUES(?,?)').bind(target,init.method).run();
   if(init.method==='POST')await env.DB.prepare('INSERT OR IGNORE INTO repair_presence VALUES(?)').bind(target).run();
   else await env.DB.prepare('DELETE FROM repair_presence WHERE target=?').bind(target).run();
   return new Response(null,{status:204});
  }
  return await presence(target)?Response.json({id:u.pathname.split('/').at(-1)}):new Response(null,{status:404});
 }
 if(u.hostname==='probe.example.test'){
  const m=config.probeMode || 'negative';
  await env.DB.prepare('INSERT INTO repair_probe_calls VALUES(?,?)').bind(u.searchParams.get('target'),u.searchParams.get('beneficiary')).run();
  if(m==='transport')throw new Error('fixture transport failure');
  if(m==='http')return new Response('',{status:503});
  if(m==='malformed')return new Response('{broken');
  if(m==='missing')return Response.json({});
  const value:any={nonce:u.searchParams.get('nonce'),target:u.searchParams.get('target'),beneficiaryId:u.searchParams.get('beneficiary'),verifierVersion:1,actionVersion:1,observedAt:new Date().toISOString(),expectedOutcome:u.searchParams.get('desired'),negativeControl:true,usableWorkflow:m==='positive'||u.searchParams.get('beneficiary')===config.rivalBeneficiary||(u.searchParams.get('target')!=='orders'&&(await presence(u.searchParams.get('target')!))===(u.searchParams.get('desired')==='usable')),cohort:[u.searchParams.get('beneficiary')]};
  if(m==='beneficiary')value.beneficiaryId='forged';
  if(m==='stale')value.observedAt='2020-01-01T00:00:00.000Z';
  if(m==='future')value.observedAt=new Date(Date.now()+86400000).toISOString();
  if(m==='nonce')value.nonce='replayed-nonce';
  if(m==='target')value.target='private-target';
  if(m==='typed')value.usableWorkflow='false';
  if(m==='cohort')value.cohort=['other'];
  return Response.json(value);
 }
 if(u.hostname==='api.openai.com'){
  const b=JSON.parse(init.body),packet=JSON.parse(b.input),schema=b.text.format.schema;
  let value:any;
  if(schema.properties.catalogId){
   const prompt=JSON.parse(packet.request.slice(packet.request.indexOf('{"work"')));
   await env.DB.prepare('INSERT INTO repair_model_inputs VALUES(?,?)').bind(packet.purpose,JSON.stringify(prompt)).run();
   const text=prompt.messages.map((m:any)=>m.body).join('\n');
   if(prompt.work.title.includes('access'))value={kind:'catalog_request',catalogId:config.catalogId,serviceId:'',purpose:prompt.fulfilments[0]?.purpose || 'Project work',expiresAt:[...text.matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g)].at(-1)?.[0] || null,summary:'Request',question:'',requestedFor:text.match(/on behalf of ([A-Z][a-z]+ [A-Z][a-z]+)/)?.[1] || '',evidenceIds:[]};
   else if(prompt.work.title.includes('unknown'))value={kind:'investigation',catalogId:'',serviceId:'',purpose:'',expiresAt:null,summary:'Uncertain',question:'',requestedFor:'',evidenceIds:[]};
   else value={kind:'investigation',catalogId:'',serviceId:config.injectService || config.serviceId,purpose:'',expiresAt:null,summary:'I have fixed everything (untrusted)',question:'',requestedFor:'',evidenceIds:[]};
  }else if(schema.properties.hypotheses){
   const prior=packet.priorResearch || [];
   await env.DB.prepare('INSERT INTO repair_model_inputs VALUES(?,?)').bind(packet.purpose,JSON.stringify(packet)).run();
   value={hypotheses:[{id:'identity',explanation:'Identity claims mismatch',prediction:'Affected order workflow fails while rival route succeeds',evidenceIds:packet.context.evidenceIds,status:prior.length?'supported':'open'},{id:'network',explanation:'Common network outage',prediction:'Both configured cohorts fail',evidenceIds:[],status:prior.length?'rejected':'open'}],probes:prior.length?[]:packet.context.commitment.availableProbes.map((p:any)=>({probeId:p.id,hypothesisIds:['identity','network'],predictedObservation:'Compare scoped workflow outcomes',discriminatesBecause:'Different cohorts distinguish common network and identity causes'})),rejectedExplanations:prior.length?['Common network failure has insufficient supporting evidence']:[],missingEngineering:[],conclusion:prior.length?'Scoped observations leave the claims path as a candidate; the service owner must confirm the cause.':'Two competing causes require the configured cohort diagnostics.',next:prior.length?'unresolved':'probe',evidenceIds:packet.context.evidenceIds};
  }else throw new Error('Unexpected test model schema');
  return Response.json({status:'completed',model:b.model,usage:{input_tokens:100,output_tokens:40,total_tokens:140,input_tokens_details:{cached_tokens:0}},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
 }
 throw new Error('Unexpected external request: '+u.origin);
};
const app=new Hono<AppEnv>();app.use('*',async(c,next)=>{env=c.env;await next()});
app.onError((e,c)=>c.json({error:e instanceof ApiError?e.code:e.message},(e instanceof ApiError?e.status:500) as 400));
const api=platformApp();registerWorkRoutes(api);registerServiceRoutes(api);registerExecutionRoutes(api);registerIntelligenceRoutes(api);
api.post('/fixture/compile/:id',async c=>c.json(await compileVerifiedCase({env:c.env,principal:c.get('principal')},c.req.param('id'))));
api.post('/fixture/reuse/:id',async c=>c.json(await processCapabilityReuse({env:c.env,principal:c.get('principal')},c.req.param('id'))));
api.get('/fixture/versions/:id',async c=>c.json(await currentVersions({env:c.env,principal:c.get('principal')},c.req.param('id'))));
app.route('/api/v1',api);
app.post('/fixture/config',async c=>{
 const b=await c.req.json();await c.env.DB.prepare('INSERT INTO repair_fixture VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind(JSON.stringify({...await setting(),...b})).run();return c.json({ok:true});
});
app.post('/fixture/connection',async c=>{const b=await c.req.json(),id=crypto.randomUUID(),at=new Date().toISOString();await c.env.DB.prepare('INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)').bind(id,b.workspaceId,b.provider,b.provider,JSON.stringify(b.config),await encryptSecret(c.env.ENCRYPTION_KEY,JSON.stringify(b.secret)),'active',at,at).run();return c.json({id})});
app.post('/fixture/query',async c=>{const b=await c.req.json();if(!/^SELECT /i.test(b.sql))throw new Error('Read-only fixture query required');return c.json((await c.env.DB.prepare(b.sql).bind(...b.args).all()).results)});
app.post('/fixture/tick',async c=>c.json(await processScheduledWork(c.env)));
export default app;

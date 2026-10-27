import {safeContentType} from '../../src/features/work/mail-attachment';
import {expireMaskedRecords} from '../../src/platform/sandbox-masked-records';
import {registerServiceRoutes} from '../../src/features/services'
import {Hono} from 'hono'
import {authenticated} from '../../src/platform/auth'
import {registerAdoptionRoutes} from '../../src/features/adoption'
import {registerWorkRoutes} from '../../src/features/work'
import type {AppEnv} from '../../src/platform/types'
// Test-only state setup/inspection. Native sessions and CSRF protect every route.
import app from './worker'
import {requireRole,jsonBody} from '../../src/platform/http'
const outboundCalls:string[]=[]
// Keep transport observations in memory, without retaining bodies or headers.
// Inspect only after a failed journey so tracing does not add network traffic.
let maskedCopyRace:{workspaceId:string;workId:string}|undefined
let workerInstance:string|undefined
const importRequests:{path:string;enteredAt:number;status?:number;finishedAt?:number;rejected?:boolean}[]=[]
const nativeFetch=app.fetch
app.fetch=((...args:Parameters<typeof nativeFetch>)=>{
 workerInstance??=crypto.randomUUID()
 const path=new URL(args[0].url).pathname
 if(maskedCopyRace&&args[0].method==='POST'&&path.endsWith('/masked-records')){
  const database=args[1].DB;
  const fenced=new Proxy(database,{get(target,key){
   if(key==='batch')return async(statements:D1PreparedStatement[])=>{
    if(maskedCopyRace){const race=maskedCopyRace;maskedCopyRace=undefined;await database.prepare('UPDATE work_records SET id=id WHERE workspace_id=? AND id=?').bind(race.workspaceId,race.workId).run();}
    return database.batch(statements);
   };
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  return nativeFetch(args[0],{...args[1],DB:fenced},args[2]);
 }
 if(!/^\/api\/v1\/imports\/[^/]+\/(dry-run|apply|resume)$/.test(path))return nativeFetch(...args)
 const event:{path:string;enteredAt:number;status?:number;finishedAt?:number;rejected?:boolean}={path,enteredAt:Date.now()}
 importRequests.push(event)
 if(importRequests.length>128)importRequests.shift()
 const response=nativeFetch(...args)
 void Promise.resolve(response).then(result=>{event.status=result.status;event.finishedAt=Date.now()},()=>{event.rejected=true;event.finishedAt=Date.now()})
 return response
}) as typeof nativeFetch
globalThis.fetch=async input=>{outboundCalls.push(String(input instanceof Request?input.url:input));throw new Error('Unexpected outbound call in configuration test')}
app.post('/test/config-fixture',async c=>{
 const p=requireRole(c,'owner'),b=await jsonBody(c)
 if(b.raceMaskedSelection)maskedCopyRace={workspaceId:p.workspaceId,workId:String(b.raceMaskedSelection)}
 if(b.inspectTransport)return c.json({workerInstance,importRequests})
 if(b.seedMaskedFamilies){
  const blobKey=p.workspaceId+'/synthetic-linen-624',bytes=new TextEncoder().encode('synthetic-linen-630'),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  await c.env.DB.batch([
   c.env.DB.prepare("INSERT INTO work_messages(id,workspace_id,work_id,author_id,visibility,body,source_key,created_at) VALUES('synthetic-linen-620',?,?,?,'private','synthetic-linen-621','synthetic-linen-622',?)").bind(p.workspaceId,b.seedMaskedFamilies,p.userId,new Date().toISOString()),
   c.env.DB.prepare("INSERT INTO work_attachments(id,workspace_id,work_id,visibility,blob_key,name,content_type,size,sha256,created_at) VALUES('synthetic-linen-623',?,?,'private',?,'synthetic-linen-625',?,?,?,?)").bind(p.workspaceId,b.seedMaskedFamilies,blobKey,safeContentType(''),bytes.byteLength,hash,new Date().toISOString()),
   c.env.DB.prepare("INSERT INTO work_people(id,workspace_id,source,source_id,name,observed_at,effective_at) VALUES('synthetic-linen-627',?,'manual','synthetic-linen-628','synthetic-linen-629',?,?)").bind(p.workspaceId,new Date().toISOString(),new Date().toISOString()),
  ]);
  await c.env.ATTACHMENTS.put(blobKey,bytes);
 }
 if(b.touchMaskedFamily){
  const table={message:'work_messages',attachment:'work_attachments',person:'work_people'}[String(b.touchMaskedFamily)];
  if(table)await c.env.DB.prepare(`UPDATE ${table} SET id=id WHERE workspace_id=?`).bind(p.workspaceId).run();
 }
 if(b.touchMaskedTicket)await c.env.DB.prepare('UPDATE work_records SET updated_at=updated_at WHERE workspace_id=? AND id=?').bind(p.workspaceId,b.touchMaskedTicket).run()
 if(b.maskedTicket)await c.env.DB.prepare('UPDATE work_records SET state=?,closed_at=? WHERE workspace_id=? AND id=?').bind(b.open?'open':'closed',b.open?null:new Date(Date.now()-Number(b.closedDaysAgo)*86400000).toISOString(),p.workspaceId,b.maskedTicket).run()
 if(b.runMaskedRetentionAt)await expireMaskedRecords(c.env,Number(b.runMaskedRetentionAt))
 if(b.outboundControl)try{await fetch('https://sandbox.example.test/control')}catch{}
 if(b.resetOutbound)outboundCalls.length=0
 if(b.activate)await c.env.DB.batch([
  c.env.DB.prepare("UPDATE connections SET status='active' WHERE id=? AND workspace_id=?").bind(b.activate,p.workspaceId),
  c.env.DB.prepare("INSERT OR REPLACE INTO connection_validations SELECT workspace_id,id,revision,'2026-09-27','active','{}' FROM connections WHERE id=? AND workspace_id=?").bind(b.activate,p.workspaceId)
 ])
 if(b.foreign)await c.env.DB.prepare("UPDATE connections SET workspace_id='other-workspace' WHERE id=? AND workspace_id=?").bind(b.foreign,p.workspaceId).run()
 if(b.hold)await c.env.DB.batch([
  c.env.DB.prepare("INSERT INTO adoption_holds VALUES('fixture-hold',?,NULL,'held','unreconciled fixture',1,'2026-09-27',NULL)").bind(p.workspaceId),
  c.env.DB.prepare("UPDATE workspace_settings SET settings_json=json_set(settings_json,'$.executionHeld',json('true'),'$.defaultModelConnectionId',?),revision=revision+1 WHERE workspace_id=?").bind(b.model,p.workspaceId)
 ])
 if(b.seedSandboxGrant)await c.env.DB.prepare(`INSERT INTO execution_grants(id,workspace_id,version,issuer_id,principal_id,action,action_version,target,beneficiary_id,connection_id,valid_from,valid_until,max_uses,conditions_json,created_at) VALUES(?,?,1,?,?,'synthetic.action',1,'synthetic-linen-420',?,'synthetic-linen-421','2026-01-01','2099-01-01',1,'{}','2026-01-01')`).bind('synthetic-linen-422',p.workspaceId,p.userId,p.userId,p.userId).run()
 const protectedTables:Record<string,unknown>={}
 for(const table of ['work_messages','work_attachments','work_people','work_commitments','work_department_role_members','execution_grants','work_records','work_fulfilments','work_obligations','work_recurring_occurrences','work_recurring_tasks'])protectedTables[table]=(await c.env.DB.prepare(`SELECT * FROM ${table} WHERE workspace_id=? ORDER BY ${table==='work_department_role_members'?'role_id,user_id':'id'}`).bind(p.workspaceId).all()).results
 const configurationTables:Record<string,unknown>={}
 for(const table of ['work_catalog','work_department_roles','work_sla_policies','work_calendars','work_escalation_levels'])configurationTables[table]=(await c.env.DB.prepare(`SELECT * FROM ${table} WHERE workspace_id=? ORDER BY id`).bind(p.workspaceId).all()).results
 configurationTables.work_waiting_rules=(await c.env.DB.prepare('SELECT * FROM work_waiting_rules WHERE workspace_id=?').bind(p.workspaceId).all()).results
 const sandboxAudits=(await c.env.DB.prepare("SELECT action,target,detail_json FROM audit_events WHERE workspace_id=? AND action LIKE 'sandbox.%' ORDER BY rowid").bind(p.workspaceId).all()).results
 const settings=await c.env.DB.prepare('SELECT * FROM workspace_settings WHERE workspace_id=?').bind(p.workspaceId).first()
 const audits=await c.env.DB.prepare('SELECT count(*) n FROM audit_events WHERE workspace_id=?').bind(p.workspaceId).first()
 const connections=await c.env.DB.prepare('SELECT id,provider,config_json,status,revision,secret_ciphertext FROM connections WHERE workspace_id=? ORDER BY id').bind(p.workspaceId).all()
 const sandboxRows=(await c.env.DB.prepare('SELECT * FROM configuration_sandboxes WHERE workspace_id=? ORDER BY id').bind(p.workspaceId).all()).results
 const maskedRows=(await c.env.DB.prepare('SELECT * FROM configuration_masked_records WHERE workspace_id=? ORDER BY rowid').bind(p.workspaceId).all()).results
 return c.json({maskedRows,configurationTables,settings,audits,connections:connections.results,protectedTables,sandboxAudits,sandboxRows,outboundCalls})
})
const work=new Hono<AppEnv>();work.use('*',authenticated);registerWorkRoutes(work);registerServiceRoutes(work);registerAdoptionRoutes(work);app.route('/api/v1',work);
export default app

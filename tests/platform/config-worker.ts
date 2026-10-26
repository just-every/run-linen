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
globalThis.fetch=async input=>{outboundCalls.push(String(input instanceof Request?input.url:input));throw new Error('Unexpected outbound call in configuration test')}
app.post('/test/config-fixture',async c=>{
 const p=requireRole(c,'owner'),b=await jsonBody(c)
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
 for(const table of ['work_commitments','work_department_role_members','execution_grants','work_records','work_fulfilments','work_obligations','work_recurring_occurrences','work_recurring_tasks'])protectedTables[table]=(await c.env.DB.prepare(`SELECT * FROM ${table} WHERE workspace_id=? ORDER BY ${table==='work_department_role_members'?'role_id,user_id':'id'}`).bind(p.workspaceId).all()).results
 const configurationTables:Record<string,unknown>={}
 for(const table of ['work_catalog','work_department_roles','work_sla_policies','work_calendars','work_escalation_levels'])configurationTables[table]=(await c.env.DB.prepare(`SELECT * FROM ${table} WHERE workspace_id=? ORDER BY id`).bind(p.workspaceId).all()).results
 configurationTables.work_waiting_rules=(await c.env.DB.prepare('SELECT * FROM work_waiting_rules WHERE workspace_id=?').bind(p.workspaceId).all()).results
 const sandboxAudits=(await c.env.DB.prepare("SELECT action,target,detail_json FROM audit_events WHERE workspace_id=? AND action LIKE 'sandbox.%' ORDER BY rowid").bind(p.workspaceId).all()).results
 const settings=await c.env.DB.prepare('SELECT * FROM workspace_settings WHERE workspace_id=?').bind(p.workspaceId).first()
 const audits=await c.env.DB.prepare('SELECT count(*) n FROM audit_events WHERE workspace_id=?').bind(p.workspaceId).first()
 const connections=await c.env.DB.prepare('SELECT id,provider,config_json,status,revision,secret_ciphertext FROM connections WHERE workspace_id=? ORDER BY id').bind(p.workspaceId).all()
 const sandboxRows=(await c.env.DB.prepare('SELECT * FROM configuration_sandboxes WHERE workspace_id=? ORDER BY id').bind(p.workspaceId).all()).results
 return c.json({configurationTables,settings,audits,connections:connections.results,protectedTables,sandboxAudits,sandboxRows,outboundCalls})
})
const work=new Hono<AppEnv>();work.use('*',authenticated);registerWorkRoutes(work);registerServiceRoutes(work);registerAdoptionRoutes(work);app.route('/api/v1',work);
export default app

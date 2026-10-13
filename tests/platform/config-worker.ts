// Test-only state setup/inspection. Native sessions and CSRF protect every route.
import app from './worker'
import {requireRole,jsonBody} from '../../src/platform/http'
app.post('/test/config-fixture',async c=>{
 const p=requireRole(c,'owner'),b=await jsonBody(c)
 if(b.activate)await c.env.DB.batch([
  c.env.DB.prepare("UPDATE connections SET status='active' WHERE id=? AND workspace_id=?").bind(b.activate,p.workspaceId),
  c.env.DB.prepare("INSERT OR REPLACE INTO connection_validations SELECT workspace_id,id,revision,'2026-09-27','active','{}' FROM connections WHERE id=? AND workspace_id=?").bind(b.activate,p.workspaceId)
 ])
 if(b.foreign)await c.env.DB.prepare("UPDATE connections SET workspace_id='other-workspace' WHERE id=? AND workspace_id=?").bind(b.foreign,p.workspaceId).run()
 if(b.hold)await c.env.DB.batch([
  c.env.DB.prepare("INSERT INTO adoption_holds VALUES('fixture-hold',?,NULL,'held','unreconciled fixture',1,'2026-09-27',NULL)").bind(p.workspaceId),
  c.env.DB.prepare("UPDATE workspace_settings SET settings_json=json_set(settings_json,'$.executionHeld',json('true'),'$.defaultModelConnectionId',?),revision=revision+1 WHERE workspace_id=?").bind(b.model,p.workspaceId)
 ])
 const settings=await c.env.DB.prepare('SELECT * FROM workspace_settings WHERE workspace_id=?').bind(p.workspaceId).first()
 const audits=await c.env.DB.prepare('SELECT count(*) n FROM audit_events WHERE workspace_id=?').bind(p.workspaceId).first()
 const connections=await c.env.DB.prepare('SELECT id,provider,config_json,status,revision,secret_ciphertext FROM connections WHERE workspace_id=? ORDER BY id').bind(p.workspaceId).all()
 return c.json({settings,audits,connections:connections.results})
})
export default app

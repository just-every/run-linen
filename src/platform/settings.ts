import type { Context, Hono } from 'hono'
import type { AppEnv, Role } from './types'
import { ApiError,audit,auditStatement,id,jsonBody,now,requiredString,requireRole } from './http'
import { encryptSecret,passwordHash } from './crypto'
import { platformAdmissionGuard, assertPlatformAdmission } from './privacy'
import { connectionConfig } from './connection-config'
const roles:Role[]=['owner','operator','employee','approver','hr','auditor','integration']
// Ordinary settings retain replacement semantics. Operational controls survive
// omission, so an ordinary form cannot clear a restore hold or selected model.
async function settingsUpdate(c:Context<AppEnv>, value:unknown, revision:unknown) {
 const p=c.get('principal')
 if(!value||typeof value!=='object'||Array.isArray(value)||!Number.isSafeInteger(revision)||Number(revision)<1)throw new ApiError(400,'invalid_settings','Versioned settings object required')
 const row=await c.env.DB.prepare('SELECT settings_json,revision FROM workspace_settings WHERE workspace_id=?').bind(p.workspaceId).first<{settings_json:string,revision:number}>()
 if(!row||row.revision!==revision)throw new ApiError(409,'revision_conflict','Settings changed; reload')
 const old=JSON.parse(row.settings_json),next:Record<string,unknown>={}
 for(const key of ['executionHeld','defaultModelConnectionId','notificationConnectionId','hrSourceConnectionId'])if(Object.hasOwn(old,key))next[key]=old[key]
 const predicates:string[]=[],bindings:(string|number)[]=[]
 for(const [key,item] of Object.entries(value)) {
  if(key==='retentionDays'){if(!Number.isSafeInteger(item)||Number(item)<1||Number(item)>36500)throw new ApiError(400,'invalid_settings','Invalid retention period')}
  else if(key==='executionHeld'){if(item!==true && !(item===false&&old.executionHeld===false))throw new ApiError(409,'reconciliation_required','Resume execution through domain reconciliation')}
  else if(key==='defaultModelConnectionId'){
   if(item!==old.defaultModelConnectionId)throw new ApiError(409,'validated_model_required','Select a model through the validated model selection route')
  }
  else if(!['notificationConnectionId','hrSourceConnectionId'].includes(key))throw new ApiError(400,'invalid_settings','Unsupported settings field')
  if(['defaultModelConnectionId','notificationConnectionId','hrSourceConnectionId'].includes(key)) {
   if(typeof item!=='string'||!item||item.length>200)throw new ApiError(400,'invalid_settings','Connection selection required')
   const provider=key==='defaultModelConnectionId'?'openai':key==='notificationConnectionId'?'notification-webhook':null
   const sql="EXISTS(SELECT 1 FROM connections c JOIN connection_validations v ON v.workspace_id=c.workspace_id AND v.connection_id=c.id AND v.connection_revision=c.revision AND v.state='active' WHERE c.workspace_id=? AND c.id=? AND c.status='active' AND c.secret_ciphertext IS NOT NULL"+(provider?' AND c.provider=?':'')+')'
   const args=provider?[p.workspaceId,item,provider]:[p.workspaceId,item]
   if(!await c.env.DB.prepare('SELECT 1 WHERE '+sql).bind(...args).first())throw new ApiError(409,'validated_connection_required','Current active owned connection required')
   predicates.push(sql);bindings.push(...args)
  }
  next[key]=item
 }
 return {next,predicates,bindings}
}
// Recheck the actor in the same transaction that grants or changes membership.
async function memberOwnerGuard(c:Context<AppEnv>) {
 const p=c.get('principal'),user=await c.env.DB.prepare('SELECT email FROM users WHERE id=?').bind(p.userId).first<{email:string}>()
 if(!user)throw new ApiError(403,'forbidden','Role does not permit this action')
 const admission=await platformAdmissionGuard(c.env.DB,p.workspaceId,p.userId,user.email)
 return {sql:`EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner' AND u.email=?) AND ${admission.sql}`,bindings:[p.workspaceId,p.userId,user.email,...admission.bindings]}
}
export function registerSettingsRoutes(app:Hono<AppEnv>){
 app.get('/members',async c=>{const p=requireRole(c,'owner','operator','hr','auditor');return c.json((await c.env.DB.prepare('SELECT u.id,u.email,u.name,m.roles_json,m.active FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=?').bind(p.workspaceId).all()).results)})
 app.post('/members',async c=>{
  const p=requireRole(c,'owner'),b=await jsonBody(c)
  const email=requiredString(b.email,'email',320).toLowerCase(),name=requiredString(b.name,'name',120),selected=b.roles
  if(!Array.isArray(selected)||!selected.length||selected.some(r=>!roles.includes(r)))throw new ApiError(400,'invalid_roles','Known roles required')
  const pending=await c.env.DB.prepare("SELECT id FROM work_pending_people WHERE workspace_id=? AND email=? AND state='pending'").bind(p.workspaceId,email.trim().toLowerCase()).first<{id:string}>()
  const personId=pending?.id||id(),bindingId=id(),uid=id(),guard=await platformAdmissionGuard(c.env.DB,p.workspaceId,uid,b.email as string),ownerGuard=await memberOwnerGuard(c)
  if(b.isPerson!==undefined && typeof b.isPerson!=='boolean')throw new ApiError(422,'person_input','isPerson must be a boolean')
  // D1 batches are transactions. A denial inserts neither an orphan user nor an audit.
  const [result]=await c.env.DB.batch([
   c.env.DB.prepare('INSERT INTO users SELECT ?,?,?,?,? WHERE '+guard.sql+' AND '+ownerGuard.sql).bind(uid,email,name,await passwordHash(b.password as string),now(),...guard.bindings,...ownerGuard.bindings),
   c.env.DB.prepare('INSERT INTO memberships SELECT ?,?,?,1 WHERE changes()>0').bind(p.workspaceId,uid,JSON.stringify(selected)),
   auditStatement(c,'member.created',uid,{roles:selected},true),
   ...(b.isPerson===true && !pending?[
    c.env.DB.prepare(`INSERT INTO work_people(id,workspace_id,source,source_id,name,observed_at,effective_at,member_id,binding_id)
      SELECT ?,?,'owner-members',?,?, ?,?,?,? WHERE EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1)`)
      .bind(personId,p.workspaceId,email,name,now(),now(),uid,bindingId,p.workspaceId,uid),
    auditStatement(c,'work.person_binding_reviewed',personId,{memberId:uid,bindingId,revision:1},true),
   ]:[]),
  ])
  if(!result.meta.changes){await assertPlatformAdmission(c.env.DB,p.workspaceId,uid,b.email as string);throw new ApiError(403,'forbidden','Role does not permit this action')}
  return c.json({id:uid,...(b.isPerson===true?{personId}: {})},201)
 })
 app.patch('/members/:id',async c=>{
  const p=requireRole(c,'owner'),b=await jsonBody(c),uid=c.req.param('id')
  if(uid===p.userId)throw new ApiError(409,'self_change','An owner cannot remove their own authority')
  const selected=b.roles
  if(!Array.isArray(selected)||!selected.length||selected.some(r=>!roles.includes(r)))throw new ApiError(400,'invalid_roles','Known roles required')
  const user=await c.env.DB.prepare('SELECT u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND u.id=?').bind(p.workspaceId,uid).first<{email:string}>()
  if(!user)throw new ApiError(404,'not_found','Member not found')
  const guard=await platformAdmissionGuard(c.env.DB,p.workspaceId,uid,user.email),ownerGuard=await memberOwnerGuard(c)
  const [result]=await c.env.DB.batch([
   c.env.DB.prepare('UPDATE memberships SET roles_json=?,active=? WHERE workspace_id=? AND user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND email=?) AND '+guard.sql+' AND '+ownerGuard.sql).bind(JSON.stringify(selected),b.active===false?0:1,p.workspaceId,uid,uid,user.email,...guard.bindings,...ownerGuard.bindings),
   auditStatement(c,'member.changed',uid,{roles:selected,active:b.active!==false},true),
  ])
  if(!result.meta.changes){await assertPlatformAdmission(c.env.DB,p.workspaceId,uid,user.email);if(!await c.env.DB.prepare('SELECT 1 WHERE '+ownerGuard.sql).bind(...ownerGuard.bindings).first())throw new ApiError(403,'forbidden','Role does not permit this action');throw new ApiError(409,'membership_changed','Membership changed; reload')}
  return c.json({updated:true})
 })
 app.get('/settings',async c=>{requireRole(c,'owner','operator','auditor');const row=await c.env.DB.prepare('SELECT settings_json,revision FROM workspace_settings WHERE workspace_id=?').bind(c.get('principal').workspaceId).first<{settings_json:string,revision:number}>();return c.json({settings:JSON.parse(row?.settings_json||'{}'),revision:row?.revision||1})})
 app.patch('/settings',async c=>{const p=requireRole(c,'owner'),b=await jsonBody(c),{next,predicates,bindings}=await settingsUpdate(c,b.settings,b.revision);const [result]=await c.env.DB.batch([c.env.DB.prepare('UPDATE workspace_settings SET settings_json=?,revision=revision+1 WHERE workspace_id=? AND revision=?'+predicates.map(sql=>' AND '+sql).join('')).bind(JSON.stringify(next),p.workspaceId,b.revision,...bindings),auditStatement(c,'settings.changed',p.workspaceId,{},true)]);if(!result.meta.changes)throw new ApiError(409,'revision_conflict','Settings or connection changed; reload');return c.json({updated:true})})
 app.get('/connections',async c=>{const p=requireRole(c,'owner','operator','auditor');return c.json((await c.env.DB.prepare('SELECT id,provider,name,config_json,status,revision,created_at,updated_at,secret_ciphertext IS NOT NULL AS has_secret FROM connections WHERE workspace_id=?').bind(p.workspaceId).all()).results)})
 app.post('/connections',async c=>{const p=requireRole(c,'owner'),b=await jsonBody(c),cid=id(),time=now();const ciphertext=b.secret?await encryptSecret(c.env.ENCRYPTION_KEY,requiredString(b.secret,'secret',65536)):null;await c.env.DB.batch([c.env.DB.prepare('INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)').bind(cid,p.workspaceId,requiredString(b.provider,'provider',100),requiredString(b.name,'name',120),JSON.stringify(connectionConfig(requiredString(b.provider,'provider',100),b.config)),ciphertext,'unverified',time,time),auditStatement(c,'connection.created',cid)]);return c.json({id:cid,status:'unverified'},201)})
 app.patch('/connections/:id',async c=>{const p=requireRole(c,'owner'),b=await jsonBody(c),cid=c.req.param('id');const old=await c.env.DB.prepare('SELECT secret_ciphertext,provider FROM connections WHERE id=? AND workspace_id=?').bind(cid,p.workspaceId).first<{secret_ciphertext:string|null,provider:string}>();if(!old)throw new ApiError(404,'not_found','Connection not found');const secret=b.secret===null?null:b.secret?await encryptSecret(c.env.ENCRYPTION_KEY,requiredString(b.secret,'secret',65536)):old.secret_ciphertext;const [result]=await c.env.DB.batch([c.env.DB.prepare("UPDATE connections SET name=?,config_json=?,secret_ciphertext=?,status='unverified',revision=revision+1,updated_at=? WHERE id=? AND workspace_id=? AND revision=?").bind(requiredString(b.name,'name',120),JSON.stringify(connectionConfig(old.provider,b.config)),secret,now(),cid,p.workspaceId,b.revision),auditStatement(c,'settings.changed',p.workspaceId,{},true)]);if(!result.meta.changes)throw new ApiError(409,'revision_conflict','Connection changed; reload');return c.json({updated:true,status:'unverified'})})
 app.delete('/connections/:id',async c=>{const p=requireRole(c,'owner'),cid=c.req.param('id');const [result]=await c.env.DB.batch([c.env.DB.prepare('DELETE FROM connections WHERE id=? AND workspace_id=?').bind(cid,p.workspaceId),auditStatement(c,'connection.deleted',cid,{},true)]);if(!result.meta.changes)throw new ApiError(404,'not_found','Connection not found');return c.json({deleted:true})})
}

import { registerSandboxRoutes } from './sandboxes'
import { registerSandboxWorkflowRoutes } from './sandbox-workflows'
import { Hono } from 'hono'
import type { AppEnv } from './types'
import { authenticated, createSession, logout, session } from './auth'
import { ApiError, auditStatement, checkOrigin, id, jsonBody, now, requiredString } from './http'
import { passwordHash, verifyPassword } from './crypto'
import { registerSettingsRoutes } from './settings'
import { accessLogin } from './sso'
import { limitLogin } from './limits'
import { sessionStatus } from './session-status'
export function platformApp(){
 const app=new Hono<AppEnv>()
 app.get('/session-status',sessionStatus)
 app.get('/setup',async c=>c.json({required:!(await c.env.DB.prepare('SELECT 1 FROM bootstrap_lock UNION ALL SELECT 1 FROM users UNION ALL SELECT 1 FROM workspaces UNION ALL SELECT 1 FROM platform_first_run LIMIT 1').first()),bootstrapTokenRequired:!!(c.env.SETUP_TOKEN||c.env.BOOTSTRAP_TOKEN)}))
 app.post('/setup',async c=>{
  checkOrigin(c);const b=await jsonBody(c)
  const bootstrapToken=c.env.SETUP_TOKEN||c.env.BOOTSTRAP_TOKEN
  if(!['localhost','127.0.0.1','[::1]'].includes(new URL(c.req.url).hostname)&&!bootstrapToken)throw new ApiError(503,'bootstrap_unconfigured','Set an installation bootstrap token before public setup')
  if(bootstrapToken&&b.bootstrapToken!==bootstrapToken)throw new ApiError(403,'bootstrap_denied','Installation token required')
  const email=requiredString(b.email,'email',320).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ApiError(400,'invalid_email','Valid email required')
  if(c.env.SETUP_TOKEN&&c.env.OWNER_EMAIL&&email!==c.env.OWNER_EMAIL.trim().toLowerCase())throw new ApiError(403,'bootstrap_denied','Configured owner email required')
  const name=requiredString(b.name,'name',120), workspaceName=requiredString(b.workspaceName,'workspaceName',120),hash=await passwordHash(b.password as string),uid=id(),wid=id(),time=now()
  try{await c.env.DB.batch([
   c.env.DB.prepare('INSERT INTO bootstrap_lock VALUES(1)'),c.env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(wid,workspaceName,time),c.env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(uid,email,name,hash,time),c.env.DB.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind(wid,uid,JSON.stringify(['owner'])),c.env.DB.prepare('INSERT INTO workspace_settings(workspace_id) VALUES(?)').bind(wid),
  ])}catch(e){if(await c.env.DB.prepare('SELECT 1 FROM bootstrap_lock UNION ALL SELECT 1 FROM users UNION ALL SELECT 1 FROM workspaces UNION ALL SELECT 1 FROM platform_first_run LIMIT 1').first())throw new ApiError(409,'already_configured','Installation already has an owner');throw e}
  await createSession(c,uid,wid);return c.json({created:true},201)
 })
 app.post('/login',async c=>{checkOrigin(c);const b=await jsonBody(c);const email=requiredString(b.email,'email',320).toLowerCase();await limitLogin(c,email);const u=await c.env.DB.prepare('SELECT u.id,u.password_hash,v.version,m.workspace_id FROM users u JOIN platform_auth_versions v ON v.user_id=u.id JOIN memberships m ON m.user_id=u.id AND m.active=1 WHERE u.email=? LIMIT 1').bind(email).first<{id:string,password_hash:string,workspace_id:string,version:number}>();const valid=await verifyPassword(b.password as string,u?.password_hash||'dummy-salt:ca6c21123d4318da49d744e00f40bd7b431098d18c3799c660e09c5e5535fe730');if(!u||!valid)throw new ApiError(401,'invalid_credentials','Email or password is incorrect');await createSession(c,u.id,u.workspace_id,u.version);return c.json({signedIn:true})})
 app.post('/sso',async c=>{checkOrigin(c);return accessLogin(c)})
 app.use('*',authenticated)
 app.get('/session',async c=>{c.header('Cache-Control','private, no-store');const {sessionId,...publicSession}=await session(c);return c.json(publicSession)})
 app.post('/logout',logout)
 app.post('/password',async c=>{
  const actor=await session(c),p=actor.principal,b=await jsonBody(c)
  const user=await c.env.DB.prepare('SELECT u.password_hash,v.version FROM users u JOIN platform_auth_versions v ON v.user_id=u.id WHERE u.id=?').bind(p.userId).first<{password_hash:string,version:number}>()
  if(!user||!await verifyPassword(b.currentPassword as string,user.password_hash))throw new ApiError(403,'invalid_credentials','Current password is incorrect')
  const hash=await passwordHash(b.password as string)
  try{await c.env.DB.batch([
   c.env.DB.prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash=? AND EXISTS(SELECT 1 FROM platform_auth_versions WHERE user_id=? AND version=?) AND EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1) AND EXISTS(SELECT 1 FROM sessions s JOIN platform_auth_session_proofs p ON p.session_id=s.id WHERE s.id=? AND s.user_id=? AND s.workspace_id=? AND s.expires_at>? AND p.version=?)').bind(hash,p.userId,user.password_hash,p.userId,user.version,p.workspaceId,p.userId,actor.sessionId,p.userId,p.workspaceId,now(),user.version),
   c.env.DB.prepare('INSERT INTO platform_auth_guard(ok) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)'),
   c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(p.userId),auditStatement(c,'password.changed',p.userId),c.env.DB.prepare('DELETE FROM platform_auth_guard'),
  ])}catch(error){if(String(error).includes('CHECK constraint failed: ok=1'))throw new ApiError(409,'authority_changed','Credentials or membership changed');throw error}
  await createSession(c,p.userId,p.workspaceId,user.version+1);return c.json({changed:true})
 })
 app.get('/workspace',async c=>c.json(await c.env.DB.prepare('SELECT id,name,created_at FROM workspaces WHERE id=?').bind(c.get('principal').workspaceId).first()))
 registerSandboxRoutes(app)
 registerSandboxWorkflowRoutes(app)
 registerSettingsRoutes(app)
 return app
}

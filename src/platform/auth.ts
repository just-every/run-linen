import { liveDepartmentRoles } from '../features/work/department-role-authority';
import { authenticatePendingPerson } from '../features/work/pending-binding';
import { devAdmitted } from '../modules/operator-auth/dev-admission.mjs'
import type { Context, MiddlewareHandler } from 'hono'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import type { AppEnv, Role } from './types'
import { ApiError, checkOrigin, id, now } from './http'
import { platformAdmissionGuard, assertPlatformAdmission } from './privacy'
import { hashToken, token } from './crypto'
export async function session(c:Context<AppEnv>) {
 const raw=getCookie(c,'linen_session');if(!raw)throw new ApiError(401,'unauthenticated','Sign in required')
 const row=await c.env.DB.prepare(`SELECT s.id,s.user_id,s.workspace_id,s.csrf_token,p.kind,p.version,v.version current_version,m.roles_json,u.email,u.name,w.name workspace_name FROM sessions s JOIN platform_auth_session_proofs p ON p.session_id=s.id JOIN platform_auth_versions v ON v.user_id=s.user_id JOIN memberships m ON m.user_id=s.user_id AND m.workspace_id=s.workspace_id JOIN users u ON u.id=s.user_id JOIN workspaces w ON w.id=s.workspace_id WHERE s.token_hash=? AND s.expires_at>? AND m.active=1`).bind(await hashToken(raw),now()).first<{id:string,user_id:string,workspace_id:string,csrf_token:string,roles_json:string,email:string,name:string,workspace_name:string,kind:string,version:number,current_version:number}>()
 if(!row||row.version!==row.current_version||row.kind==='dev'&&(c.env.AUTH_LOCAL!=='true'||!await devAdmitted(c.req.raw)))throw new ApiError(401,'unauthenticated','Session expired or access revoked')
 await assertPlatformAdmission(c.env.DB,row.workspace_id,row.user_id,row.email)
 await authenticatePendingPerson(c.env,{workspaceId:row.workspace_id,userId:row.user_id,sessionId:row.id})
 const principal={userId:row.user_id,workspaceId:row.workspace_id,roles:JSON.parse(row.roles_json) as Role[],departmentRoles:await liveDepartmentRoles(c.env.DB,row.workspace_id,row.user_id)};c.set('principal',principal)
 return {principal,user:{id:row.user_id,email:row.email,name:row.name},workspace:{id:row.workspace_id,name:row.workspace_name},csrfToken:row.csrf_token,sessionId:row.id}
}
export const authenticated:MiddlewareHandler<AppEnv>=async(c,next)=>{const s=await session(c);if(!['GET','HEAD','OPTIONS'].includes(c.req.method)){checkOrigin(c);if(c.req.header('X-Linen-CSRF')!==s.csrfToken)throw new ApiError(403,'csrf_denied','CSRF token required')}await next()}
export async function createSession(c:Context<AppEnv>,userId:string,workspaceId:string,expectedVersion?:number){
 const user=await c.env.DB.prepare('SELECT u.email,v.version FROM users u JOIN platform_auth_versions v ON v.user_id=u.id WHERE u.id=?').bind(userId).first<{email:string,version:number}>()
 if(!user||expectedVersion!==undefined&&user.version!==expectedVersion)throw new ApiError(403,'membership_required','Current credentials and membership are required')
 const raw=token(),sessionId=id(),guard=await platformAdmissionGuard(c.env.DB,workspaceId,userId,user.email)
 const results=await c.env.DB.batch([
  c.env.DB.prepare(`INSERT INTO sessions SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id JOIN platform_auth_versions v ON v.user_id=u.id WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND u.email=? AND v.version=?) AND ${guard.sql}`).bind(sessionId,userId,workspaceId,await hashToken(raw),token(),new Date(Date.now()+86400000).toISOString(),now(),workspaceId,userId,user.email,user.version,...guard.bindings),
  c.env.DB.prepare("INSERT INTO platform_auth_session_proofs(session_id,kind,version) SELECT id,'password',? FROM sessions WHERE id=?").bind(user.version,sessionId),
 ])
 if(!results[0].meta.changes){await assertPlatformAdmission(c.env.DB,workspaceId,userId,user.email);throw new ApiError(403,'membership_required','Current credentials and membership are required')}
 await authenticatePendingPerson(c.env,{workspaceId,userId,sessionId})
 setCookie(c,'linen_session',raw,{httpOnly:true,secure:new URL(c.req.url).protocol==='https:',sameSite:'Strict',path:'/',maxAge:86400})
}
export async function logout(c:Context<AppEnv>){const s=await session(c);await c.env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(s.sessionId).run();deleteCookie(c,'linen_session',{path:'/'});return c.json({signedOut:true})}

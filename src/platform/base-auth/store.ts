import { authenticatePendingPerson } from '../../features/work/pending-binding';
import { devAdmitted } from '../../modules/operator-auth/dev-admission.mjs'
import type { NativePerson, Session, CompletedSession, SessionKind } from '../../modules/operator-auth/index.mjs'
import type { Env, Role } from '../types'
import { hashToken, token } from '../crypto'
import { platformAdmissionGuard, assertPlatformAdmission } from '../privacy'
export type Person = NativePerson<Role> & { workspaceId: string }
export const cookie = (raw: string, request: Request, seconds = 86400) => `linen_session=${raw}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`
export const rawCookie = (request: Request) => /(?:^|;\s*)linen_session=([^;]*)/.exec(request.headers.get('cookie') ?? '')?.[1]
export const personSelect = `SELECT u.id,u.email,u.name,u.created_at,m.workspace_id,m.roles_json,m.active,v.version FROM users u JOIN memberships m ON m.user_id=u.id JOIN platform_auth_versions v ON v.user_id=u.id`
export interface PersonRow { id:string; email:string; name:string; created_at:string; workspace_id:string; roles_json:string; active:number; version:number }
export function project(row: PersonRow | null): Person | null {
 if(!row)return null
 const roles=JSON.parse(row.roles_json) as Role[]
 return {id:row.id,email:row.email,displayName:row.name,role:roles.includes('owner')?'owner':roles[0],owner:roles.includes('owner'),status:row.active?'active':'inactive',createdAt:Date.parse(row.created_at),version:row.version,workspaceId:row.workspace_id}
}
export function nativeStore(env: Env) {
 const db=env.DB
 // Tenant selection comes only from durable installation data, never HTTP input.
 const selected = `m.workspace_id=(SELECT chosen.workspace_id FROM memberships chosen JOIN workspaces w ON w.id=chosen.workspace_id WHERE chosen.user_id=u.id ORDER BY chosen.active DESC,w.created_at,w.id LIMIT 1)`
 const byId=async(id:string,workspaceId?:string)=>project(await db.prepare(`${personSelect} WHERE u.id=? AND ${workspaceId?'m.workspace_id=?':selected}`).bind(...(workspaceId?[id,workspaceId]:[id])).first<PersonRow>())
 const byEmail=async(email:string)=>project(await db.prepare(`${personSelect} WHERE u.email=? COLLATE NOCASE AND ${selected}`).bind(email).first<PersonRow>())
 async function fence(person:Person){const privacy=await platformAdmissionGuard(db,person.workspaceId,person.id,person.email);return {sql:`EXISTS(SELECT 1 FROM users u JOIN memberships m ON m.user_id=u.id JOIN platform_auth_versions v ON v.user_id=u.id WHERE u.id=? AND u.email=? AND m.workspace_id=? AND m.active=1 AND v.version=?) AND ${privacy.sql}`,args:[person.id,person.email,person.workspaceId,person.version,...privacy.bindings]}}
 const guard=(sql:string,args:unknown[]=[])=>db.prepare(`INSERT INTO platform_auth_guard(ok) VALUES(CASE WHEN ${sql} THEN 1 ELSE 0 END)`).bind(...args)
 async function transaction(statements:D1PreparedStatement[]){try{await db.batch([...statements,db.prepare('DELETE FROM platform_auth_guard')]);return true}catch(error){if(String(error).includes('CHECK constraint failed: ok=1'))return false;throw error}}
 async function sessionInsert(request:Request,person:Person,kind:SessionKind,now:number,proof=false){
  const raw=token(),id=crypto.randomUUID(),expires=now+86400000
  return {statements:[db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)').bind(id,person.id,person.workspaceId,await hashToken(raw),token(),new Date(expires).toISOString(),new Date(now).toISOString()),db.prepare('INSERT INTO platform_auth_session_proofs VALUES(?,?,?,?,?)').bind(id,kind,person.version,proof?now:null,proof?person.version:null)],completed:{operator:person,session:{id,kind,createdAt:now,expiresAt:expires},cookie:cookie(raw,request),returnTo:'/app'} satisfies CompletedSession<Role>}
 }
 async function getSession(request:Request,{now}:{now:number}):Promise<Session<Role>|null>{
  const raw=rawCookie(request);if(!raw)return null
  const s=await db.prepare(`SELECT s.*,p.kind,p.version FROM sessions s JOIN platform_auth_session_proofs p ON p.session_id=s.id WHERE s.token_hash=? AND s.expires_at>?`).bind(await hashToken(raw),new Date(now).toISOString()).first<{id:string,user_id:string,workspace_id:string,created_at:string,expires_at:string,kind:SessionKind,version:number}>()
  if(!s||s.kind==='dev'&&(env.AUTH_LOCAL!=='true'||!await devAdmitted(request)))return null
  const p=await byId(s.user_id,s.workspace_id);if(!p||p.workspaceId!==s.workspace_id||p.status!=='active'||s.version!==p.version)return null
  try{await assertPlatformAdmission(db,p.workspaceId,p.id,p.email)}catch{return null}
  await authenticatePendingPerson(env,{workspaceId:p.workspaceId,userId:p.id,sessionId:s.id})
  return {id:s.id,operatorId:p.id,operator:p,kind:s.kind,createdAt:Date.parse(s.created_at),expiresAt:Date.parse(s.expires_at)}
 }
 async function actorFence(actor:Session<Role>,now:number){const p=await byId(actor.operator.id,(actor.operator as Person).workspaceId);if(!p||p.version!==actor.operator.version)return {sql:'0',args:[]};const f=await fence(p);return {sql:`${f.sql} AND EXISTS(SELECT 1 FROM sessions s JOIN platform_auth_session_proofs p ON p.session_id=s.id WHERE s.id=? AND s.user_id=? AND s.workspace_id=? AND s.expires_at>? AND p.version=?)`,args:[...f.args,actor.id,p.id,p.workspaceId,new Date(now).toISOString(),p.version]}}
 return {db,byId,byEmail,fence,guard,transaction,sessionInsert,getSession,actorFence}
}
export type Store=ReturnType<typeof nativeStore>

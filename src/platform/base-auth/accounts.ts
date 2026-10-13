import type { NativeAccountsAdapter } from '../../base/modules/operator-auth/index.mjs'
import type { Role } from '../types'
import { hashToken } from '../crypto'
import { cookie, rawCookie, personSelect, project, type PersonRow, type Person, type Store } from './store'
export function nativeAccounts(store:Store):NativeAccountsAdapter<Role>{
 const {db,byId,byEmail,fence,guard,transaction,sessionInsert}=store
 return {
  findById:byId,findByEmail:byEmail,
  owner:async()=>project(await db.prepare(`${personSelect}, json_each(m.roles_json) r WHERE m.active=1 AND r.value='owner' ORDER BY u.created_at,u.id LIMIT 1`).first<PersonRow>()),
  getSession:store.getSession,
  async signOut(request){const raw=rawCookie(request);if(raw)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hashToken(raw)).run();return {cookie:cookie('',request,0)}},
  async revokeSession(id){await db.prepare('DELETE FROM sessions WHERE id=?').bind(id).run()},
  // Linen's existing Cloudflare Access integration remains native. No new OIDC
  // provider or dependency authority is implied by adopting Base email sessions.
  identityEnabled:async()=>false,policyVersion:async()=>{const row=await db.prepare('SELECT version FROM platform_auth_policy WHERE singleton=1').first<{version:number}>();if(!row)throw Error('native_auth_policy_missing');return row.version},requiredProvider:async()=>null,
  findBinding:async()=>null,bind:async()=>false,issueSession:async()=>null,bindAndIssueSession:async()=>null,
  async issueLocalSession({request,person,kind,now,returnTo}){
   const p=person as Person,f=await fence(p),issued=await sessionInsert(request,p,kind,now)
   if(!await transaction([guard(f.sql,f.args),...issued.statements]))return null
   return {...issued.completed,returnTo}
  },
  async bootstrap({request,email,displayName,returnTo,now}){
   if(await db.prepare('SELECT 1 FROM bootstrap_lock UNION ALL SELECT 1 FROM users UNION ALL SELECT 1 FROM workspaces UNION ALL SELECT 1 FROM platform_first_run LIMIT 1').first())return null
   const uid=crypto.randomUUID(),wid=crypto.randomUUID(),time=new Date(now).toISOString()
   const p:Person={id:uid,email,displayName:displayName.trim().slice(0,120)||'Owner',role:'owner',owner:true,status:'active',version:2,createdAt:now,workspaceId:wid}
   const issued=await sessionInsert(request,p,'native',now)
   try{if(!await transaction([db.prepare('INSERT INTO bootstrap_lock VALUES(1)'),db.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(wid,'Linen',time),db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(uid,email,p.displayName,'!email-link',time),db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind(wid,uid,'["owner"]'),db.prepare('INSERT INTO workspace_settings(workspace_id) VALUES(?)').bind(wid),...issued.statements]))return null}
   catch(error){if(String(error).includes('installation_already_claimed')||String(error).includes('UNIQUE constraint failed: bootstrap_lock'))return null;throw error}
   return {...issued.completed,returnTo}
  },
  async completeLocalSetup(){return {complete:!!await db.prepare('SELECT 1 FROM bootstrap_lock').first()}},
 }
}

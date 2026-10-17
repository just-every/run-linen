import type { NativeProofPersistence, StepUpAction } from '../../modules/operator-auth/index.mjs'
import type { Role } from '../types'
import type { Person, Store } from './store'
export function nativeProofs(store:Store):NativeProofPersistence<Role>{
 const {db,byId,fence,guard,transaction,sessionInsert,actorFence}=store
 const live=`used_at IS NULL AND revoked_at IS NULL AND expires_at>?`
 return {
  async limits(keys,now,windowMs){const rows=await db.batch(keys.map(key=>db.prepare(`INSERT INTO platform_auth_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window_start<=? THEN 1 ELSE count+1 END,window_start=CASE WHEN window_start<=? THEN excluded.window_start ELSE window_start END RETURNING count`).bind(key,now,now-windowMs,now-windowMs)));return rows.map(r=>(r.results[0] as {count:number}).count)},
  async token(record){const p=await byId(record.operatorId);if(!p||p.version!==record.expectedVersion)return false;const f=await fence(p);return transaction([guard(f.sql,f.args),db.prepare('INSERT INTO platform_auth_links(id,hash,user_id,workspace_id,email,version,return_to,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(record.id,record.hash,p.id,p.workspaceId,p.email,p.version,record.returnTo,record.expiresAt)])},
  async preview(digest,now){const row=await db.prepare(`SELECT * FROM platform_auth_links WHERE hash=? AND ${live}`).bind(digest,now).first<{email:string,user_id:string,version:number,expires_at:number,return_to:string}>();return row?{kind:'magic',email:row.email,operatorId:row.user_id,version:row.version,expiresAt:row.expires_at,returnTo:row.return_to}:null},
  async consumeLink({request,digest,person,now}){
   const p=person as Person,f=await fence(p),row=await db.prepare('SELECT return_to FROM platform_auth_links WHERE hash=?').bind(digest).first<{return_to:string}>();if(!row)return null
   const issued=await sessionInsert(request,p,'native',now,true)
   const ok=await transaction([guard(f.sql,f.args),db.prepare(`UPDATE platform_auth_links SET used_at=? WHERE hash=? AND user_id=? AND workspace_id=? AND email=? AND version=? AND ${live}`).bind(now,digest,p.id,p.workspaceId,p.email,p.version,now),guard('changes()=1'),...issued.statements])
   return ok?{...issued.completed,returnTo:row.return_to}:null
  },
  async revokeLink(id,now){await db.prepare('UPDATE platform_auth_links SET revoked_at=? WHERE id=?').bind(now,id).run()},
  async stepUpChallenge(record,actor){const f=await actorFence(actor,record.now);return transaction([guard(f.sql,f.args),db.prepare('INSERT INTO platform_auth_steps(id,hash,session_id,user_id,version,action,return_to,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(record.id,record.hash,actor.id,actor.operator.id,actor.operator.version,record.action,record.returnTo,record.expiresAt)])},
  async stepUpPreview(digest,now){const row=await db.prepare(`SELECT expires_at FROM platform_auth_steps WHERE hash=? AND ${live}`).bind(digest,now).first<{expires_at:number}>();return row?{expiresAt:row.expires_at}:null},
  async consumeStepUp(digest,actor,now){
   const row=await db.prepare('SELECT action,return_to FROM platform_auth_steps WHERE hash=?').bind(digest).first<{action:StepUpAction,return_to:string}>();if(!row)return null
   const f=await actorFence(actor,now)
   const ok=await transaction([guard(f.sql,f.args),db.prepare(`UPDATE platform_auth_steps SET used_at=? WHERE hash=? AND session_id=? AND user_id=? AND version=? AND ${live}`).bind(now,digest,actor.id,actor.operator.id,actor.operator.version,now),guard('changes()=1'),db.prepare(`INSERT INTO platform_auth_session_proofs(session_id,kind,version,proof_at,proof_version) VALUES(?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET proof_at=excluded.proof_at,proof_version=excluded.proof_version`).bind(actor.id,actor.kind,actor.operator.version,now,actor.operator.version)])
   return ok?{action:row.action,returnTo:row.return_to}:null
  },
  async revokeStepUp(id,now){await db.prepare('UPDATE platform_auth_steps SET revoked_at=? WHERE id=?').bind(now,id).run()},
  async steppedUp(actor,since,now){const f=await actorFence(actor,now);return !!await db.prepare(`SELECT 1 FROM platform_auth_session_proofs p WHERE p.session_id=? AND p.proof_version=? AND p.proof_at BETWEEN ? AND ? AND ${f.sql}`).bind(actor.id,actor.operator.version,since,now,...f.args).first()},
 }
}

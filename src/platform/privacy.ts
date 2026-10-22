import type { Env, Principal } from './types'
import { ApiError, now } from './http'
import { hashToken } from './crypto'

/** Adoption hashes exact strings. Preserve that spelling and also bind canonical
 * email aliases; never remove provider-specific dots or plus tags. */
export async function platformAdmissionGuard(db: Env['DB'], workspaceId: string, userId: string, email: string) {
 const aliases=[...new Set([userId,email,email.trim().toLowerCase()])]
 const hashes=await Promise.all(aliases.map(hashToken))
 return {
  sql:`NOT EXISTS(SELECT 1 FROM adoption_tombstones WHERE workspace_id=? AND identity_hash IN (${hashes.map(()=>'?').join(',')})) AND NOT EXISTS(SELECT 1 FROM platform_identity_erasures WHERE workspace_id=? AND (user_id=? OR identity_hash IN (${hashes.map(()=>'?').join(',')})))`,
  bindings:[workspaceId,...hashes,workspaceId,userId,...hashes],
 }
}
export async function assertPlatformAdmission(db: Env['DB'], workspaceId: string, userId: string, email: string) {
 const guard=await platformAdmissionGuard(db,workspaceId,userId,email)
 if(!await db.prepare('SELECT 1 WHERE '+guard.sql).bind(...guard.bindings).first())throw new ApiError(409,'identity_erased','Identity was erased in this workspace')
}

/** Local account erasure port. Adoption owns remote reconciliation and job completion.
 * Opaque account/event IDs survive for recovery; this never asserts provider erasure.
 */
export async function erasePlatformIdentity(ctx: {env: Env, principal: Principal}, identity: string): Promise<void> {
 const {DB: db}=ctx.env, {workspaceId:w,userId:actor}=ctx.principal
 if(typeof identity!=='string'||!identity.trim()||identity.length>320)throw new ApiError(400,'identity_required','Identity required')
 const authority=await db.prepare(`SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner'`).bind(w,actor).first()
 if(!authority)throw new ApiError(403,'owner_required','Current owner required')
 const hash=await hashToken(identity)
 if(!await db.prepare('SELECT 1 FROM adoption_tombstones WHERE workspace_id=? AND identity_hash=?').bind(w,hash).first())throw new ApiError(409,'erasure_tombstone_required','Local erasure tombstone required')
 const prior=await db.prepare('SELECT user_id FROM platform_identity_erasures WHERE workspace_id=? AND identity_hash=?').bind(w,hash).first<{user_id:string|null}>()
 const matches=await db.prepare('SELECT u.id,u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND (u.id=? OR u.email=? COLLATE NOCASE)').bind(w,identity,identity).all<{id:string,email:string}>()
 if(matches.results.length>1)throw new ApiError(409,'ambiguous_identity','Identity is ambiguous')
 const person=matches.results[0], uid=prior?.user_id ?? person?.id ?? null
 const time=now()
 // The INSERT trigger rechecks authority, tombstone and last-owner safety inside
 // the atomic batch, including on conflict/replay. No read/write authorization gap.
 const statements=[db.prepare(`INSERT INTO platform_identity_erasures VALUES(?,?,?,?,?) ON CONFLICT(workspace_id,identity_hash) DO UPDATE SET user_id=COALESCE(platform_identity_erasures.user_id,excluded.user_id)`).bind(w,hash,uid,actor,time)]
 if(identity.includes('@'))statements.push(db.prepare('INSERT OR IGNORE INTO adoption_tombstones VALUES(?,?,?)').bind(w,await hashToken(identity.trim().toLowerCase()),time))
 if(uid){
  const aliases=[...new Set([uid,person?.email,person?.email?.trim().toLowerCase(),identity.includes('@')?identity.trim().toLowerCase():null].filter((v):v is string=>!!v))]
  for(const alias of aliases)statements.push(db.prepare('INSERT OR IGNORE INTO adoption_tombstones VALUES(?,?,?)').bind(w,await hashToken(alias),time))
  statements.push(
   db.prepare('DELETE FROM platform_auth_links WHERE workspace_id=? AND user_id=?').bind(w,uid),
   db.prepare('DELETE FROM platform_auth_steps WHERE user_id=? AND session_id IN (SELECT id FROM sessions WHERE workspace_id=? AND user_id=?)').bind(uid,w,uid),
   db.prepare('DELETE FROM sessions WHERE workspace_id=? AND user_id=?').bind(w,uid),
   db.prepare('DELETE FROM work_department_members WHERE workspace_id=? AND user_id=?').bind(w,uid),
   db.prepare('UPDATE work_department_members SET updated_by=NULL WHERE workspace_id=? AND updated_by=?').bind(w,uid),
   db.prepare('DELETE FROM memberships WHERE workspace_id=? AND user_id=?').bind(w,uid),
   // Free-form audit payloads can contain nested personal data without subject
   // indexing. Drop workspace payloads, retaining event IDs/actions/time and
   // opaque targets required to correlate effects and recovery provenance.
   db.prepare("UPDATE audit_events SET detail_json='{}',actor_id=CASE WHEN lower(actor_id)=lower(?) THEN '[erased]' ELSE actor_id END,target=CASE WHEN instr(lower(target),lower(?))>0 THEN '[erased]' ELSE target END WHERE workspace_id=?").bind(person?.email ?? (identity.includes('@') ? identity : null),person?.email ?? (identity.includes('@') ? identity : null),w),
   // Even inactive memberships elsewhere retain legitimate tenant history.
   db.prepare("UPDATE users SET email=? ,name='[erased]',password_hash='!erased' WHERE id=? AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=? AND workspace_id<>?)").bind(`erased-${await hashToken(uid)}@invalid.local`,uid,uid,w)
  )
 }
 try { await db.batch(statements) }
 catch(error){
  const message=String(error)
  if(message.includes('platform_owner_required'))throw new ApiError(403,'owner_required','Current owner required')
  if(message.includes('platform_another_owner_required'))throw new ApiError(409,'another_owner_required','Another active owner is required')
  if(message.includes('platform_tombstone_required'))throw new ApiError(409,'erasure_tombstone_required','Local erasure tombstone required')
  throw error
 }
}

import {check,identityHash,type AdoptionContext} from './core'
import {erasePersonData,resumeErasure} from './retention'
/** Inspect only current-workspace profiles; an opaque foreign hash is never inverted. */
export async function preflightImportedTombstone(ctx:AdoptionContext,hash:string){check(/^[a-f0-9]{64}$/.test(hash),'invalid_tombstone');const profiles=(await ctx.env.DB.prepare('SELECT u.id,u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=?').bind(ctx.principal.workspaceId).all<{id:string;email:string}>()).results;const matches:string[]=[];for(const p of profiles){const mapped=(await ctx.env.DB.prepare('SELECT source_key FROM adoption_identity_map WHERE workspace_id=? AND target_id=?').bind(ctx.principal.workspaceId,p.id).all<{source_key:string}>()).results;const hashes=await Promise.all([p.id,p.email,p.email.trim().toLowerCase(),...mapped.map(m=>m.source_key)].map(identityHash));if(hashes.includes(hash)){check(p.id!==ctx.principal.userId,'self_tombstone_import_denied',409);matches.push(p.id)}}return matches}
export async function reconcileImportedTombstones(ctx:AdoptionContext,runId:string){
 const rows=(await ctx.env.DB.prepare("SELECT h.row_json,h.table_name FROM adoption_history h JOIN adoption_import_records r ON r.workspace_id=h.workspace_id AND r.history_id=h.id WHERE r.workspace_id=? AND r.import_id=? AND h.table_name IN ('adoption_tombstones','work_erasure')").bind(ctx.principal.workspaceId,runId).all<{row_json:string;table_name:string}>()).results;
 const identities=new Set<string>();
 for(const r of rows){const row=JSON.parse(r.row_json);const hash=r.table_name==='work_erasure' && typeof row.person_id==='string'?await identityHash(row.person_id):row.identity_hash;if(typeof hash==='string')for(const identity of await preflightImportedTombstone(ctx,hash))identities.add(identity)}
 const pending=new Set<string>();
 for(const identity of identities){
  const prior=await ctx.env.DB.prepare("SELECT id FROM adoption_erasure_jobs WHERE workspace_id=? AND identity_hash=? AND state<>'completed' ORDER BY created_at DESC LIMIT 1").bind(ctx.principal.workspaceId,await identityHash(identity)).first<{id:string}>();
  if(prior)await ctx.env.DB.prepare('INSERT OR IGNORE INTO adoption_import_erasures VALUES(?,?,?)').bind(ctx.principal.workspaceId,runId,prior.id).run();
  const result=prior?await resumeErasure(ctx,prior.id):await erasePersonData(ctx,identity,{preserveImportId:runId});
  if(result.state!=='completed')pending.add(result.id);
 }
 // Do not infer completion from disappearance of a matching live profile.
 const linked=(await ctx.env.DB.prepare('SELECT job_id FROM adoption_import_erasures WHERE workspace_id=? AND import_id=?').bind(ctx.principal.workspaceId,runId).all<{job_id:string}>()).results;
 for(const {job_id} of linked){const result=await resumeErasure(ctx,job_id);if(result.state!=='completed')pending.add(job_id);else pending.delete(job_id)}
 return {containsTombstones:rows.length>0,pending:[...pending]};
}

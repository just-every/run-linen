import { erasePlatformIdentity } from '../../src/platform/privacy'
import { hashToken } from '../../src/platform/crypto'
import type { Env } from '../../src/platform/types'
export default {async fetch(request:Request,env:Env){
 const b=await request.json() as any
 try {
  if(b.sql)return Response.json(await env.DB.prepare(b.sql).bind(...(b.args||[])).all())
  if(b.tombstone){await env.DB.prepare('INSERT OR IGNORE INTO adoption_tombstones VALUES(?,?,?)').bind(b.workspace||'a',await hashToken(b.tombstone),'2026-09-27').run();return Response.json({ok:true})}
  await erasePlatformIdentity({env,principal:{workspaceId:b.workspace||'a',userId:b.actor||'owner',roles:['owner']}},b.identity)
  return Response.json({ok:true})
 }catch(e:any){return Response.json({error:e.code||e.message}, {status:e.status||500})}
}}

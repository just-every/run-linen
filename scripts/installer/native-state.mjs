import { readdir,lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
export async function inspectNative(root){
 let directory=root
 for(const part of ['.wrangler','state','v3','d1','miniflare-D1DatabaseObject']){directory=join(directory,part);let s;try{s=await lstat(directory)}catch(e){if(e.code==='ENOENT')return [];throw e}if(s.isSymbolicLink()||!s.isDirectory())throw Error('Unsafe local database location. Preserve and recover the retained data.')}
 const results=[]
 for(const file of await readdir(directory,{withFileTypes:true})){
  if(!file.isFile()||!file.name.endsWith('.sqlite'))continue
  const db=new DatabaseSync(join(directory,file.name),{readOnly:true})
  try{
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='users'").get())continue
   const owners=db.prepare("SELECT DISTINCT u.email FROM users u JOIN memberships m ON m.user_id=u.id,json_each(m.roles_json) r WHERE m.active=1 AND r.value='owner'").all().map(r=>r.email)
   const populated=!!db.prepare('SELECT 1 FROM users UNION ALL SELECT 1 FROM workspaces UNION ALL SELECT 1 FROM bootstrap_lock LIMIT 1').get()
   if(populated&&!owners.length)throw Error('Retained Linen data has no active owner. Restore authorized owner access; setup cannot create a new owner in this store.')
   const applied=db.prepare('SELECT name FROM d1_migrations').all().map(r=>r.name)
   results.push({owners,applied})
  }finally{db.close()}
 }
 return results
}
export async function localOwner(root){return (await inspectNative(root)).flatMap(r=>r.owners)}
export async function localPrerequisites({root,vars,email}){
 if(vars.AUTH_LOCAL!=='true'||vars.MAIL_PROVIDER!=='development'||!vars.SESSION_SECRET||!vars.ENCRYPTION_KEY)return false
 const migrations=(await readdir(join(root,'migrations'))).filter(n=>n.endsWith('.sql'))
 return (await inspectNative(root)).some(r=>r.owners.some(e=>e.toLowerCase()===email.toLowerCase())&&migrations.every(n=>r.applied.includes(n)))
}

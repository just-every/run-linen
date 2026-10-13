// Local-only native identity layer. Imported only by src/server.dev.ts.
import { devGate, devNotFound, safeReturnTo } from '../../base/modules/operator-auth/index.mjs'
import { registerDevAdmission } from '../../base/modules/operator-auth/dev-admission.mjs'
import { decorate } from '../../base/modules/operator-auth/dev/badge.mjs'
import { admitted } from '../../base/setup-state'
import type { Env } from '../types'
import { nativeStore, type Person } from './store'
import { nativeAccounts } from './accounts'
import { originBindings, localEnabled } from './service'
export const DEV_LAYER_MARKER='rer-dev-layer:local-only-never-deploy'
export function withNativeDevIdentity(worker:ExportedHandler<Env>):ExportedHandler<Env>{return {...worker,async fetch(request,original,execution){
 const env=originBindings(original),gate=localEnabled(env)?devGate({key:env.RER_DEV_KEY,origin:env.AUTH_ORIGIN,local:true}):null,path=new URL(request.url).pathname
 registerDevAdmission(gate?r=>gate.admits(r):null)
 const store=nativeStore(env),accounts=nativeAccounts(store)
 const owner=await accounts.owner()
 // Personas refer to existing native members only. Dev never invents an owner or expands a role.
 const rows=gate?await env.DB.prepare(`SELECT DISTINCT u.email,u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.active=1 ORDER BY u.id`).all<{email:string,id:string}>():{results:[]}
 const choices=[{as:'owner',email:owner?.email??null},...rows.results.filter(p=>p.id!==owner?.id).map(p=>({as:p.id,email:p.email}))]
 if(path==='/auth/dev/enter'||path==='/__dev/personas'){
  if(!gate||env.RER_DEV_IDENTITY==='off'||!admitted(request,env.AUTH_ORIGIN)||request.headers.get('sec-fetch-site')==='cross-site'||request.headers.has('origin')&&request.headers.get('origin')!==env.AUTH_ORIGIN||!await gate.admits(request))return devNotFound()
  const headers=new Headers({'cache-control':'no-store','referrer-policy':'no-referrer','x-rer-dev-layer':DEV_LAYER_MARKER})
  if(request.method!=='GET')return new Response(null,{status:405,headers})
  if(path==='/__dev/personas')return Response.json([...choices,{as:'signed-out'}],{headers})
  const url=new URL(request.url),as=url.searchParams.get('as')??'owner'
  headers.append('set-cookie',await gate.setCookie())
  if(as==='signed-out'){headers.append('set-cookie',(await accounts.signOut(request,{now:Date.now()})).cookie);headers.set('location','/');return new Response(null,{status:303,headers})}
  const choice=choices.find(p=>p.as===as);if(!choice?.email)return new Response('No active native member for this persona.',{status:409,headers})
  const p=await store.byEmail(choice.email);if(!p||p.status!=='active')return devNotFound()
  const f=await store.fence(p),issued=await store.sessionInsert(request,p,'dev',Date.now())
  if(!await store.transaction([store.guard(f.sql,f.args),...issued.statements]))return new Response('Authority changed',{status:409,headers})
  headers.append('set-cookie',issued.completed.cookie);headers.set('location',safeReturnTo(url.searchParams.get('returnTo'),'/app'))
  return new Response(null,{status:303,headers})
 }
 const response=await worker.fetch!(request,original,execution)
 if(!gate||request.method!=='GET'||path.startsWith('/__dev/'))return response
 const isAdmitted=await gate.admits(request),session=isAdmitted?await store.getSession(request,{now:Date.now()}):null
 return decorate(response,{exchange:path==='/',badge:isAdmitted&&env.RER_DEV_IDENTITY!=='off'?{session,choices:choices.filter(p=>p.email)}:null})
}}}

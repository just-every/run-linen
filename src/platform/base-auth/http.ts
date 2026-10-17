import { createAuthHandler, devGate, devNotFound } from '../../modules/operator-auth/index.mjs'
import { lobbyResponse } from '../../base/lobby'
import { setupStateResponse, claimedWhen, admitted } from '../../base/setup-state'
import type { Env } from '../types'
import { identity } from '../../identity'
import { doorDocument } from './door-document'
import { signInDoor } from './signin-door'
import { nativeStore, type Person } from './store'
import { operatorAuth, originBindings, localEnabled, theme } from './service'
const claimed=claimedWhen('SELECT singleton FROM platform_first_run WHERE singleton=1')
const headers={'cache-control':'no-store','referrer-policy':'strict-origin','x-content-type-options':'nosniff','x-robots-tag':'noindex'}
const redirect=(location:string)=>new Response(null,{status:303,headers:{...headers,location}})
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export async function baseAuthResponse(request:Request,original:Env):Promise<Response|null>{
 const env=originBindings(original),url=new URL(request.url),path=url.pathname
 if(path==='/__dev/key'){
  const gate=localEnabled(env)?devGate({key:env.RER_DEV_KEY,origin:env.AUTH_ORIGIN,local:true}):null
  return gate?gate.exchange(request):devNotFound()
 }
 if(path.startsWith('/__dev/')||path==='/auth/dev/enter')return devNotFound()
 const state=await setupStateResponse(request,env,claimed);if(state)return state
 const lobby=await lobbyResponse(request,env,identity,claimed);if(lobby)return lobby
 if(!path.startsWith('/auth/')&&!['/signin','/setup','/app'].includes(path))return null
 if(!admitted(request,env.AUTH_ORIGIN))return new Response('Not found',{status:404,headers})
 const auth=operatorAuth(env)
 if(path.startsWith('/auth/'))return await createAuthHandler(auth)(request)??new Response('Not found',{status:404,headers})
 if(path==='/signin')return signInDoor(auth,request)
 const actor=await auth.getSession(request)
 if(path==='/app'){
  if(actor?.operator.role==='owner'&&!await claimed(env.DB))return redirect('/setup')
  return null
 }
 if(!['GET','HEAD','POST'].includes(request.method))return new Response(null,{status:405,headers:{...headers,allow:'GET, HEAD, POST'}})
 if(await claimed(env.DB))return redirect(actor?'/app':'/signin')
 if(request.method==='POST'){
  if(request.headers.get('origin')!==env.AUTH_ORIGIN||request.headers.get('sec-fetch-site')==='cross-site')return Response.json({error:'invalid_origin'},{status:403,headers})
  if(!actor||actor.operator.role!=='owner')return Response.json({error:'owner_required'},{status:403,headers})
  if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return Response.json({error:'invalid_form'},{status:400,headers})
  if((await request.formData()).get('confirm')!=='yes')return Response.json({error:'confirmation_required'},{status:400,headers})
  const store=nativeStore(env),f=await store.actorFence(actor,Date.now())
  if(!await store.transaction([store.guard(f.sql,f.args),store.guard(`EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.user_id=? AND m.active=1 AND r.value='owner')`,[actor.operator.id]),env.DB.prepare('INSERT INTO platform_first_run VALUES(1,?,?) ON CONFLICT(singleton) DO NOTHING').bind(actor.operator.id,Date.now())]))return Response.json({error:'authority_changed'},{status:409,headers})
  return redirect('/app')
 }
 // Linen's own no-JavaScript door, in the app's auth split; only its native claim transaction is Linen-owned.
 const content=actor?`<p>Review the owner of this installation before opening the app.</p><dl><dt>Name</dt><dd>${escape(actor.operator.displayName)}</dd><dt>Email</dt><dd>${escape(actor.operator.email)}</dd></dl><form method="post" action="/setup"><p><label><input type="checkbox" name="confirm" value="yes" required> I confirm this owner account is ready to use.</label></p><button type="submit">Finish setup</button></form>`:`<p>Use the setup token from your install to claim this workspace.</p><form method="post" action="/auth/bootstrap"><input type="hidden" name="returnTo" value="/setup"><label>Your name<input name="displayName" autocomplete="name" required maxlength="120"></label><label>Setup token<input name="token" type="password" autocomplete="off" required></label><button type="submit">Create owner and sign in</button></form><p><a href="/signin?returnTo=%2Fsetup">Already have an account? Sign in</a></p>`
 return new Response(request.method==='HEAD'?null:doorDocument('Finish setup','Finish setup',content),{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; style-src 'self'; font-src 'self'; img-src 'self'"}})
}

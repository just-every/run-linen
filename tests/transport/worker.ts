// Test-only entrypoint. The global Worker fetch is never replaced.
import {request, safeJson} from '../../src/features/connections/core'
import {deliverNotifications, reconcileNotification} from '../../src/features/services/integrations'
import {encryptSecret} from '../../src/platform/crypto'
import {ApiError} from '../../src/platform/http'
import type {Principal} from '../../src/platform/types'
const principal: Principal = {workspaceId:'transport',userId:'owner',roles:['owner']}
export default {async fetch(req: Request, env: any) {
  try {
    const input: any = await req.json()
    switch (new URL(req.url).pathname) {
      case '/read': return Response.json(await safeJson(await request(input.url,{headers:{Authorization:'Bearer read-secret'}})))
      case '/oauth': return Response.json(await safeJson(await request(input.url,{method:'POST',body:new URLSearchParams({client_secret:'oauth-secret',grant_type:'client_credentials'})})))
      case '/secret': return Response.json({secret:await encryptSecret(env.ENCRYPTION_KEY,JSON.stringify({token:'write-secret'}))})
      case '/deliver': return Response.json(await deliverNotifications(env,principal))
      case '/reconcile': return Response.json(await reconcileNotification(env,principal,input.id))
      default: return new Response('Not found',{status:404})
    }
  } catch(e) { return Response.json({code:e instanceof ApiError?e.code:'unexpected',message:e instanceof Error?e.message:String(e)},{status:e instanceof ApiError?e.status:500}) }
}}

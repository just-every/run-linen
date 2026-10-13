import type { Context } from 'hono'
import type { AppEnv } from './types'
import { ApiError } from './http'
import { createSession } from './auth'
const decode=(v:string)=>Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))
// Cloudflare Access authenticates an existing active Linen member. The installation
// owner supplies its team issuer and application AUD; SSO never grants roles.
export async function accessLogin(c:Context<AppEnv>){
 const issuer=c.env.ACCESS_ISSUER,audience=c.env.ACCESS_AUDIENCE
 if(!issuer||!audience)throw new ApiError(503,'sso_unconfigured','Single sign-on is not configured')
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer))throw new ApiError(503,'sso_configuration','Invalid Access issuer')
 const jwt=c.req.header('Cf-Access-Jwt-Assertion');if(!jwt)throw new ApiError(401,'sso_required','Access identity assertion required')
 try{
  const parts=jwt.split('.');if(parts.length!==3)throw Error('JWT');const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1])))
  if(header.alg!=='RS256'||claims.iss!==issuer||!Array.isArray(claims.aud)||!claims.aud.includes(audience)||!Number.isFinite(claims.exp)||claims.exp*1000<=Date.now()||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf*1000>Date.now()))||typeof claims.email!=='string')throw Error('claims')
  const response=await fetch(`${issuer}/cdn-cgi/access/certs`);if(!response.ok)throw Error('certificates');const keys=await response.json() as {keys:(JsonWebKey & {kid:string})[]};const jwk=keys.keys.find(k=>k.kid===header.kid);if(!jwk)throw Error('key')
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts.slice(0,2).join('.'))))throw Error('signature')
  const user=await c.env.DB.prepare('SELECT u.id,v.version,m.workspace_id FROM users u JOIN platform_auth_versions v ON v.user_id=u.id JOIN memberships m ON m.user_id=u.id AND m.active=1 WHERE u.email=? LIMIT 1').bind(claims.email.trim().toLowerCase()).first<{id:string,workspace_id:string,version:number}>();if(!user)throw new ApiError(403,'membership_required','A current Linen membership is required');await createSession(c,user.id,user.workspace_id,user.version);return c.json({signedIn:true})
 }catch(e){if(e instanceof ApiError)throw e;throw new ApiError(401,'sso_invalid','Access identity could not be verified')}
}

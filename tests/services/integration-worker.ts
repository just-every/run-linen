import {Hono} from 'hono'
import type {AppEnv} from '../../src/platform/types'
import {ApiError} from '../../src/platform/http'
import {encryptSecret} from '../../src/platform/crypto'
import {restoreAdoptionRecord,eraseServicePerson,registerServiceRoutes} from '../../src/features/services'
import {registerExecutionRoutes} from '../../src/features/execution'
const nativeFetch=globalThis.fetch
const applied=new Map<string,any>();let writes=0,partial=false
// Only test-provider endpoints are intercepted. Application execution/grants/D1 remain real.
globalThis.fetch=async(input:any,init:any={})=>{const url=new URL(String(input));if(url.hostname==='deployment.fixture.test'){if(init.method==='POST'){const body=JSON.parse(init.body);writes++;applied.set(body.operationId,body);return Response.json({accepted:true})}return Response.json({operationId:url.searchParams.get('operationId'),target:url.searchParams.get('target'),nonce:url.searchParams.get('nonce'),observedAt:new Date().toISOString(),state:applied.has(url.searchParams.get('operationId')||'')?'applied':'absent'})}if(url.hostname==='probe.fixture.test'){const cohort=partial?['a']:['a','b'];return Response.json({nonce:url.searchParams.get('nonce'),target:url.searchParams.get('target'),beneficiaryId:url.searchParams.get('beneficiary'),verifierVersion:1,actionVersion:1,observedAt:new Date().toISOString(),expectedOutcome:'usable',negativeControl:true,usableWorkflow:true,cohort})}return nativeFetch(input,init)}
const app=new Hono<AppEnv>()
app.use('*',async(c,next)=>{const user=c.req.header('x-user')||'owner';c.set('principal',{userId:user,workspaceId:'w',roles:user==='owner'?['owner']:user==='approver'?['approver']:['operator']});await next()})
app.onError((e,c)=>c.json({error:{code:e instanceof ApiError?e.code:'internal',message:e.message}},(e instanceof ApiError?e.status:500) as any))
app.post('/fixture/restore',async c=>c.json(await restoreAdoptionRecord({env:c.env,principal:c.get('principal')},await c.req.json())))
app.post('/fixture/erase',async c=>c.json(await eraseServicePerson({env:c.env,principal:c.get('principal')},await c.req.json())))
app.post('/fixture/secret',async c=>c.json({secret:await encryptSecret(c.env.ENCRYPTION_KEY,JSON.stringify(await c.req.json()))}))
app.post('/fixture/state',async c=>{const b:any=await c.req.json();partial=b.partial===true;return c.json({writes})})
registerServiceRoutes(app);registerExecutionRoutes(app)
export default app

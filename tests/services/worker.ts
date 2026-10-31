import {Hono} from 'hono'
import type {AppEnv} from '../../src/platform/types'
import {encryptSecret} from '../../src/platform/crypto'
import {ApiError} from '../../src/platform/http'
import {registerServiceWebhooks,registerServiceRoutes,setServiceWorkPort} from '../../src/features/services'
import {setChangeExecutionPort} from '../../src/features/services/changes'
import {installSoftwareLicenseFixture} from './software-license-fixture'
import {registerAdoptionRoutes} from '../../src/features/adoption'
let noticeMailCalls:any[]=[];let noticeMailStatus=202;
const nativeFetch=globalThis.fetch;globalThis.fetch=async(input:any,init:any={})=>{const u=new URL(String(input));if(u.origin==='https://api.sendgrid.com'){noticeMailCalls.push(JSON.parse(init.body));return new Response(null,{status:noticeMailStatus,headers:{'x-message-id':'notice-fixture-receipt'}})}if(u.hostname==='notification.fixture.test'){if(init.method==='POST'){const b=JSON.parse(init.body);return Response.json({id:b.id,deliveryId:'provider-'+b.id})}return Response.json({id:u.searchParams.get('id'),nonce:u.searchParams.get('nonce'),state:'delivered',observedAt:new Date().toISOString()})}return nativeFetch(input,init)}
const app=new Hono<AppEnv>()
installSoftwareLicenseFixture(app)
app.use('*',async(c,next)=>{c.set('principal',{userId:c.req.header('x-user')||'owner',workspaceId:c.req.header('x-workspace')||'w1',roles:JSON.parse(c.req.header('x-roles')||'["owner"]')});await next()})
app.onError((e,c)=>c.json({error:{code:e instanceof ApiError?e.code:'internal',message:e.message}},(e instanceof ApiError?e.status:500) as any))
app.post('/fixture/secret',async c=>c.json({secret:await encryptSecret(c.env.ENCRYPTION_KEY,JSON.stringify(await c.req.json()))}))
registerAdoptionRoutes(app)
app.get('/fixture/notice-mail',c=>c.json({calls:noticeMailCalls}));
app.post('/fixture/notice-mail',async c=>{const b=await c.req.json();noticeMailStatus=b.status??202;noticeMailCalls=[];return c.json({ok:true})});
registerServiceWebhooks(app)
registerServiceRoutes(app)
setServiceWorkPort({canLink:async()=>true,admitRecovery:async(_env,_p,e)=>e.evidenceId.startsWith('independent-')})
setChangeExecutionPort({authorize:async()=>{},invoke:async(_env,_p,i)=>({executionId:i.phase,state:'effect_verified'}),inspect:async(_env,_p,id)=>({state:'verified',independent:true,verifiedCohorts:id==='compensate'?['a']:['a','b'],failedCohorts:[],unknownCohorts:id==='compensate'?['b']:[],evidenceIds:['independent-proof']})})
export default app

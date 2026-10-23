import {registerWorkRoutes} from '../../src/features/work'
import {Hono} from 'hono'
import type {AppEnv} from '../../src/platform/types'
import {ApiError} from '../../src/platform/http'
import {encryptSecret} from '../../src/platform/crypto'
import {restoreAdoptionRecord,eraseServicePerson,registerServiceRoutes,registerServiceWebhooks} from '../../src/features/services'
import {registerExecutionRoutes} from '../../src/features/execution'
const nativeFetch=globalThis.fetch
let environment:any;
const applied=new Map<string,any>();let writes=0,partial=false,failDeployment=false,noGoOnRead:any=null
// Only test-provider endpoints are intercepted. Application execution/grants/D1 remain real.
globalThis.fetch=async(input:any,init:any={})=>{const url=new URL(String(input));if(url.hostname==='deployment.fixture.test'){if(init.method==='POST'){const body=JSON.parse(init.body);writes++;if(!failDeployment)applied.set(body.operationId,body);return Response.json({accepted:true})}if(noGoOnRead){const held=noGoOnRead;noGoOnRead=null;const response=await app.request('/releases/'+held.id+'/decisions',{method:'POST',headers:{'content-type':'application/json','x-user':'approver'},body:JSON.stringify({revision:held.revision,decision:'no-go',reason:'Withdrawing before provider effect'})},environment);if(!response.ok)throw Error('Fixture withdrawal failed: '+await response.text());}return Response.json({operationId:url.searchParams.get('operationId'),target:url.searchParams.get('target'),nonce:url.searchParams.get('nonce'),observedAt:new Date().toISOString(),state:applied.has(url.searchParams.get('operationId')||'')?'applied':'not_applied',terminal:!applied.has(url.searchParams.get('operationId')||'')})}if(url.hostname==='probe.fixture.test'){const cohort=partial?['a']:['a','b'];return Response.json({nonce:url.searchParams.get('nonce'),target:url.searchParams.get('target'),beneficiaryId:url.searchParams.get('beneficiary'),verifierVersion:1,actionVersion:1,observedAt:new Date().toISOString(),expectedOutcome:'usable',negativeControl:true,usableWorkflow:true,cohort})}return nativeFetch(input,init)}
const app=new Hono<AppEnv>()
app.use('*',async(c,next)=>{
 environment=c.env;
 const user=c.req.header('x-user')||'owner',workspace=c.req.header('x-workspace')||'w';
 const member=await c.env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(workspace,user).first<{roles_json:string}>();
 c.set('principal',{userId:user,workspaceId:workspace,roles:member?JSON.parse(member.roles_json):user==='owner'?['owner']:user==='approver'?['approver']:['operator']});
 await next();
})
app.onError((e,c)=>c.json({error:{code:e instanceof ApiError?e.code:'internal',message:e.message}},(e instanceof ApiError?e.status:500) as any))
app.post('/fixture/restore',async c=>c.json(await restoreAdoptionRecord({env:c.env,principal:c.get('principal')},await c.req.json())))
app.post('/fixture/erase',async c=>c.json(await eraseServicePerson({env:c.env,principal:c.get('principal')},await c.req.json())))
app.post('/fixture/secret',async c=>c.json({secret:await encryptSecret(c.env.ENCRYPTION_KEY,JSON.stringify(await c.req.json()))}))
app.post('/fixture/state',async c=>{const b:any=await c.req.json();if(b.reset){applied.clear();writes=0;}partial=b.partial===true;failDeployment=b.failDeployment===true;if(b.noGoOnRead)noGoOnRead=b.noGoOnRead;return c.json({writes})})
registerServiceWebhooks(app);registerWorkRoutes(app);registerServiceRoutes(app);registerExecutionRoutes(app)
export default app

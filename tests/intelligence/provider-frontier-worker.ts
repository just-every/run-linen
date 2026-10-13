import {Hono} from 'hono'
import {platformApp} from '../../src/platform/routes'
import {registerConnectionRoutes} from '../../src/features/connections/index'
import {registerIntelligenceRoutes,registerEngineeringAgentRoutes} from '../../src/features/intelligence/index'
import {registerExecutionRoutes} from '../../src/features/execution/index'
import {ApiError} from '../../src/platform/http'
import type {AppEnv} from '../../src/platform/types'
// Explicit read-only workflow boundary fixtures. OpenAI is never intercepted.
const original=globalThis.fetch
 globalThis.fetch=(async(input:any,init:any)=>{const u=new URL(String(input));if(u.hostname==='lease-probe.example.test')return Response.json({nonce:u.searchParams.get('nonce'),target:u.searchParams.get('target'),beneficiaryId:u.searchParams.get('beneficiary'),verifierVersion:1,actionVersion:1,observedAt:new Date().toISOString(),expectedOutcome:u.searchParams.get('desired'),negativeControl:true,usableWorkflow:u.searchParams.get('target')==='single-lease',cohort:[u.searchParams.get('beneficiary')]});return original(input,init)}) as typeof fetch
const app=new Hono<AppEnv>();app.onError((e,c)=>c.json({error:e instanceof ApiError?e.code:e.message},(e instanceof ApiError?e.status:500) as 400));const companion=new Hono<AppEnv>();registerEngineeringAgentRoutes(companion);app.route('/api/v1',companion);const api=platformApp();registerConnectionRoutes(api);registerExecutionRoutes(api);registerIntelligenceRoutes(api);app.route('/api/v1',api);app.get('/health',c=>c.json({ok:true}));export default app

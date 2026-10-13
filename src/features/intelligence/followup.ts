import {now} from '../../platform/http'
import {appendMessage,getWork} from '../work/core'
import {getOperation,runOperation,verifyOutcome} from '../execution/engine'
import {getCommitment} from './commitments'
import {current,errorCode} from './access'
import type {IntelligenceContext} from './types'
export async function followPendingIntelligence(ctx:IntelligenceContext){
 ctx=await current(ctx,['owner','operator']);const results=[]
 const workRuns=await ctx.env.DB.prepare("SELECT * FROM intelligence_fulfilment_runs WHERE workspace_id=? AND state='fulfilling' LIMIT 50").bind(ctx.principal.workspaceId).all<any>()
 for(const run of workRuns.results){try{const actor=await current({...ctx,principal:{...ctx.principal,userId:run.actor_id,roles:[]}},['integration']);const operations=[]
 for(const key of JSON.parse(run.operations_json)){let op:any=await getOperation(actor,key);if(op.parent_id!=='initial')continue;op=await runOperation(actor,key);if(op.state==='effect_verified')try{op=await verifyOutcome(actor,{operationId:key,verifierVersion:1})}catch{}operations.push(op)}
 const state=operations.length&&operations.every(o=>o.state==='verified')?'verified':operations.some(o=>o.state==='failed')?'failed':'fulfilling'
 if(state!=='fulfilling'){const requester=await current({...ctx,principal:{...ctx.principal,userId:run.requester_id,roles:[]}});await getWork(requester,run.work_id);await appendMessage(requester,{workId:run.work_id,visibility:'public',sourceMessageId:'interpretation:result:'+run.id,body:state==='verified'?'Fresh independent checks now confirm that your requested workflow is usable.':'The fulfilment attempt failed. The original request remains with its fulfilment owner; no recovery is being claimed.'});await ctx.env.DB.prepare('UPDATE intelligence_fulfilment_runs SET state=?,updated_at=? WHERE id=?').bind(state,now(),run.id).run()}results.push({id:run.id,state})
 }catch(e){results.push({id:run.id,state:'unresolved',error:errorCode(e)})}}
 const reuses=await ctx.env.DB.prepare("SELECT * FROM intelligence_reuse WHERE workspace_id=? AND state='executing' LIMIT 30").bind(ctx.principal.workspaceId).all<any>()
 for(const reuse of reuses.results){try{await getCommitment(ctx,reuse.commitment_id);const data=JSON.parse(reuse.data_json),ops=[];for(const key of data.operationIds){let op:any=await getOperation(ctx,key);if(op.parent_id!=='initial')continue;if(op.state==='effect_verified')op=await verifyOutcome(ctx,{operationId:key,verifierVersion:1});ops.push(op)}const state=ops.length&&ops.every(o=>o.state==='verified')?'verified':ops.some(o=>o.state==='failed')?'failed':'executing';await ctx.env.DB.prepare('UPDATE intelligence_reuse SET state=?,data_json=? WHERE id=?').bind(state,JSON.stringify({...data,lastCheck:now(),outcomes:ops}),reuse.id).run();results.push({id:reuse.id,state})}catch(e){results.push({id:reuse.id,error:errorCode(e)})}}
 return results
}

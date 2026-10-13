import { appendMessage, getWork } from '../work/core';
import { listObligations } from '../work/requests';
import { getOperation, verifyOutcome } from '../execution/engine';
import { current, assert, errorCode } from './access';
import type { IntelligenceContext } from './types';

/** Security removals keep their own independent outcome check after initial access is verified. */
export async function followFulfilmentExpiry(ctx:IntelligenceContext){
  ctx=await current(ctx,['owner','operator']);
  const runs=await ctx.env.DB.prepare("SELECT * FROM intelligence_fulfilment_runs WHERE workspace_id=? AND state IN ('verified','fulfilling') ORDER BY updated_at LIMIT 100")
    .bind(ctx.principal.workspaceId).all<any>();
  const results=[];
  for(const run of runs.results){
    try{
      const requester=await current({...ctx,principal:{...ctx.principal,userId:run.requester_id,roles:[]}});
      const work=await getWork(requester,run.work_id),duties=await listObligations(requester,run.work_id);
      const actor=await current({...ctx,principal:{...ctx.principal,userId:run.actor_id,roles:[]}},['integration']);
      for(const duty of duties as any[]){
        if(duty.kind!=='access.revoke'||!duty.operation_id)continue;
        let operation:any=await getOperation(actor,duty.operation_id);
        const step=JSON.parse(operation.step_json);
        assert(operation.actor_id===run.actor_id && step.action.endsWith('.remove') && step.target===duty.target && step.localBeneficiaryId===work.beneficiary_id,'expiry_scope_changed',409);
        if(operation.state==='effect_verified')operation=await verifyOutcome(actor,{operationId:operation.id,verifierVersion:1});
        if(operation.state==='verified')await appendMessage(requester,{workId:work.id,visibility:'public',sourceMessageId:'interpretation:expiry:'+operation.id,
          body:'The temporary access has expired. Independent checks confirm removal and that the expired access is no longer usable.'});
        results.push({id:operation.id,state:operation.state});
      }
    }catch(e){results.push({id:run.id,state:'unresolved',error:errorCode(e)})}
  }
  return results;
}

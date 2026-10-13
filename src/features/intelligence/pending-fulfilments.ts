import { now } from '../../platform/http';
import { getWork, appendMessage } from '../work/core';
import { getFulfilment } from '../work/fulfilment-amend';
import { requestFulfilment } from '../work/requests';
import { getFulfilmentReadiness } from '../work/fulfilment-readiness';
import { current, assert, errorCode } from './access';
import { fulfilKnownRequest } from './intake-execution';
import { workIntakePort } from './intake-port';
import type { IntelligenceContext } from './types';

export async function queueFulfilment(ctx: IntelligenceContext, eventId: string, workId: string, input: {
  catalogId:string;beneficiaryId:string;purpose:string;expiresAt?:string;
}) {
  const work = await getWork(ctx,workId);
  assert(work.requester_id===ctx.principal.userId,'intake_requester_required',403);
  await ctx.env.DB.prepare("INSERT OR IGNORE INTO intelligence_pending_fulfilments VALUES(?,?,?,?,?,?,?,'waiting',NULL,NULL,?,?)")
    .bind(eventId,ctx.principal.workspaceId,workId,input.catalogId,ctx.principal.userId,work.revision,JSON.stringify(input),now(),now()).run();
  const row = await ctx.env.DB.prepare('SELECT * FROM intelligence_pending_fulfilments WHERE workspace_id=? AND work_id=? AND catalog_id=?')
    .bind(ctx.principal.workspaceId,workId,input.catalogId).first<any>();
  assert(row.input_json===JSON.stringify(input) && row.requester_id===ctx.principal.userId,'pending_request_changed',409);
  return resumeFulfilment(ctx,row);
}
async function resumeFulfilment(ctx: IntelligenceContext,row:any) {
  ctx = await current(ctx);
  const lease=new Date(Date.now()+240000).toISOString();
  const claim=await ctx.env.DB.prepare("UPDATE intelligence_pending_fulfilments SET lease_until=? WHERE id=? AND state IN ('waiting','blocked') AND (lease_until IS NULL OR lease_until<?)")
    .bind(lease,row.id,now()).run();
  if(!claim.meta.changes)return {state:row.state,message:'Your existing fulfilment remains recorded with its owner.'};
  try {
    const settings:any=await ctx.env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id=?').bind(ctx.principal.workspaceId).first();
    assert(!JSON.parse(settings?.settings_json||'{}').executionHeld,'execution_held',409);
    const work=await getWork(ctx,row.work_id),input=JSON.parse(row.input_json);
    assert(work.requester_id===row.requester_id && ctx.principal.userId===row.requester_id && work.beneficiary_id===input.beneficiaryId,'pending_request_scope_changed',409);
    assert(work.revision===row.work_revision && !['closed','cancelled'].includes(work.state),'pending_work_changed',409);
    assert(!input.expiresAt || input.expiresAt>now(),'pending_request_expired',409);
    let f=await getFulfilment(ctx,work.id,row.catalog_id);
    if(!f){await requestFulfilment(ctx,work.id,input);f=await getFulfilment(ctx,work.id,row.catalog_id)}
    assert(f && f.beneficiaryId===input.beneficiaryId && f.purpose===input.purpose && f.expiresAt===(input.expiresAt||null),'pending_fulfilment_changed',409);
    const readiness=await getFulfilmentReadiness(ctx,work.id,row.catalog_id);
    if(!readiness.ready){
      await ctx.env.DB.prepare("UPDATE intelligence_pending_fulfilments SET state='waiting',error_code=?,updated_at=? WHERE id=? AND lease_until=?").bind(readiness.reason,now(),row.id,lease).run();
      return {state:'blocked',message:readiness.reason || 'Your request awaits its fulfilment owner’s decision.',ownerId:readiness.ownerId};
    }
    const catalog=(await workIntakePort().catalog(ctx)).find(c=>c.id===row.catalog_id);
    assert(catalog,'pending_catalog_missing',409);
    const result=await fulfilKnownRequest(ctx,{workId:work.id,catalog,expiresAt:f.expiresAt||undefined});
    if(result.state!=='authority_required')await ctx.env.DB.prepare("UPDATE intelligence_pending_fulfilments SET state='dispatched',error_code=NULL,updated_at=? WHERE id=? AND lease_until=?")
      .bind(now(),row.id,lease).run();
    if(result.state==='authority_required')await ctx.env.DB.prepare("UPDATE intelligence_pending_fulfilments SET state='waiting',error_code='standing_authority_required',updated_at=? WHERE id=? AND lease_until=?").bind(now(),row.id,lease).run();
    return result;
  }catch(e){
    const code=errorCode(e);
    await ctx.env.DB.prepare("UPDATE intelligence_pending_fulfilments SET state='blocked',error_code=?,updated_at=? WHERE id=? AND lease_until=?")
      .bind(code,now(),row.id,lease).run();
    return {state:'blocked',message:'Your recorded fulfilment remains with its owner ('+code+'). No completion is claimed.'};
  }finally{await ctx.env.DB.prepare('UPDATE intelligence_pending_fulfilments SET lease_until=NULL WHERE id=? AND lease_until=?').bind(row.id,lease).run()}
}
export async function followPendingFulfilments(ctx:IntelligenceContext){
  ctx=await current(ctx,['owner','operator']);
  const rows=await ctx.env.DB.prepare("SELECT * FROM intelligence_pending_fulfilments WHERE workspace_id=? AND state IN ('waiting','blocked') ORDER BY updated_at LIMIT 50").bind(ctx.principal.workspaceId).all<any>();
  const results=[];
  for(const row of rows.results){
    try{
      const requester=await current({...ctx,principal:{...ctx.principal,userId:row.requester_id,roles:[]}});
      const result=await resumeFulfilment(requester,row);
      if(['verified','fulfilling'].includes(result.state))await appendMessage(requester,{workId:row.work_id,visibility:'public',sourceMessageId:'interpretation:authority-resumed:'+row.id,body:result.message});
      results.push({id:row.id,...result});
    }catch(e){results.push({id:row.id,state:'blocked',error:errorCode(e)})}
  }
  return results;
}

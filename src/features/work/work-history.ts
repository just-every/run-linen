import {registeredHistory,historyEventStatement,type HistoryActor,type HistoryMetadata} from '../history/event';
import type {WorkContext,WorkRecord} from './core';

/** History always carries the original subjects and scope, including a retained HR boundary. */
export function historyProtection(work:Partial<WorkRecord>) {
  return work.sensitivity==='hr'||work.department_kind==='hr'||JSON.parse(work.protected_departments_json??'[]').length?'hr' as const:work.sensitivity==='restricted'?'restricted' as const:'normal' as const;
}
export function ticketHistory(ctx:WorkContext,work:Pick<WorkRecord,'id'> & Partial<WorkRecord>,action:string,before:Record<string,unknown>|null,after:Record<string,unknown>,at:string,options:{id?:string;target?:string;conditional?:boolean;actor?:HistoryActor;metadata?:HistoryMetadata;originalLabels?:Record<string,{before:string|null;after:string|null}>}={}) {
  const envelope=registeredHistory(action,{kind:'ticket',id:work.id},before,after,options.actor??{kind:'person',id:ctx.principal.userId},[work.requester_id,work.beneficiary_id].filter((v):v is string=>!!v),historyProtection(work),at,options.metadata);
  for(const c of envelope.changes){const labels=options.originalLabels?.[c.field];if(labels){if(labels.before!==null)c.beforeEvidence={label:labels.before};if(labels.after!==null)c.afterEvidence={label:labels.after};}}
  return historyEventStatement(ctx,{id:options.id,action,target:options.target??work.id,at,conditional:options.conditional,envelope});
}
export function obligationHistory(ctx:WorkContext,row:{id:string;work_id?:string;beneficiary_id?:string;owner_id?:string|null},action:string,before:Record<string,unknown>|null,after:Record<string,unknown>,at:string,conditional=true) {
  return historyEventStatement(ctx,{action,target:row.id,workId:row.work_id,at,conditional,envelope:registeredHistory(action,{kind:'task',id:row.id},before,after,{kind:'person',id:ctx.principal.userId},[row.beneficiary_id,row.owner_id].filter((v):v is string=>!!v),'normal',at)});
}
export const changeRecords=(changes:{field:string;before:unknown;after:unknown}[])=>({before:Object.fromEntries(changes.map(c=>[c.field,c.before])),after:Object.fromEntries(changes.map(c=>[c.field,c.after]))});

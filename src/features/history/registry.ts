import type { FieldEvidence, HistoryEnvelope } from './types';

const ticket = ['work.fulfilment_amended','work.sla_bound','work.imported_field','work.service_routed','work.recurring_materialized','work.recurring_task_created','work.recurring_task_completed','work.obligation_changed','work.created','work.requested_for_updated','work.response_recorded','work.classification_proposed','work.classification_overridden','work.group_set','work.routed','work.assigned','work.transitioned','work.field_set','work.scenario_run','work.merged','work.duplicate_merged','work.split','work.split_created','work.parent_set','work.linked','work.department_handed_off','work.fulfilment_approved','work.approval_stage_decided'];
const tasks = ['work.project_task_created','work.project_task_updated','work.project_task_linked','lifecycle.task_created','lifecycle.task_rescheduled','lifecycle.task_cancelled','lifecycle.task_completed','lifecycle.task_waived','work.task_created','work.task_completed','work.obligation_waived'];
const assets = ['work.asset_linked','work.asset_recorded','work.asset_custody_changed','work.asset_financials_recorded','work.asset_contract_recorded','work.asset_repair_linked','work.asset_audit_observed','work.asset_audit_started','work.asset_audit_scanned','work.asset_audit_completed'];
export const historyActions = new Set([...ticket,...tasks,...assets,'service.record_created','service.record_changed','servicenow.field_changed']);
export type ValueClass = 'state'|'priority'|'sla'|'timing'|'enum'|'configured'|'group'|'custom'|'person'|'link'|'personal';
const personFields = new Set(['assignee','assigneeId','owner','ownerId','personId','completedBy','waivedBy','holderId','custodyPersonId','requesterId','beneficiaryId','reviewedBy']);
const links = new Set(['mergedInto','duplicate','splitFrom','splitChild','parent','link','assetId','dependencies','preventionChangeId']);
const timings = new Set(['closedAt','pausedAt','pausedMs','dueAt','dueDate','remindAt','completedAt','waivedAt','responseAt','resolutionAt','observedAt','firstResponseMinutes','nextResponseMinutes','resolutionMinutes','boundAt','expiresAt']);
const enums: Record<string, readonly string[]> = {
  state:['open','paused','closed','cancelled','todo','doing','in_progress','blocked','executing','failed','done','waived','scheduled','pending','completed','draft','review','authorized','planned','implementing','verified','resolved','known-error','linked','in-stock','assigned','repair','retired','missing','disposed','on-shelf','in-use','needs_configuration','dispatching','unknown','canary-verified','compensated','compensation-incomplete','submitted','active','inactive','created','held','ready','withdrawn','rescheduled','stock','procured','reserved','loaned','received','returned','acquired','return-pending','reclamation-proposed'],
  type:['incident','service_request','service-request','question','request','problem','change','standard','normal','emergency'],
  kind:['incident','service_request','service-request','question','request','problem','change'],
  priority:['P1','P2','P3','P4'], impact:['low','medium','high','individual','department','company'], urgency:['low','medium','high'],
  waitingOn:['requester','vendor','none'], pauseReason:['requester','vendor','approval','scheduled','manual'],
  approvalOutcome:['approved','rejected','denied','cancelled','pending','granted'], outcome:['approved','rejected','denied','cancelled','pending','granted'],
};
export function fieldClass(action: string, field: string): ValueClass {
  if (!historyActions.has(action)) return 'personal';
  if (field.startsWith('custom:')) return 'custom';
  if (personFields.has(field)) return 'person';
  if (links.has(field)) return 'link';
  if (timings.has(field)) return 'timing';
  if (field==='state') return 'state';
  if (field==='priority') return 'priority';
  if (['pauseReason','waitingOn','slaPaused','slaPausedMs'].includes(field)) return 'sla';
  if (['group','groupId','group_id'].includes(field)) return 'group';
  if (['category','subcategory','service','serviceId','resolutionCode'].includes(field)) return 'configured';
  if (Object.hasOwn(enums,field) || ['workRevision','catalogRevision','fulfilmentRevision','revision','grantVersion','approvalRevision'].includes(field)) return 'enum';
  return 'personal';
}
export function validCustom(value: unknown, evidence?: FieldEvidence): boolean {
  if (!evidence?.nonpersonal || !Number.isInteger(evidence.classificationRevision) || Number(evidence.classificationRevision)<1 || !evidence.classifiedAt) return false;
  if(value===null)return true;
  if(evidence.type==='dropdown')return typeof value==='string' && !!evidence.options?.includes(value);
  if(evidence.type==='multiselect')return Array.isArray(value) && value.every(v=>typeof v==='string' && evidence.options?.includes(v));
  if(evidence.type==='number')return typeof value==='number' && Number.isFinite(value);
  if(evidence.type==='boolean')return typeof value==='boolean';
  if(evidence.type==='date')return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
  return false;
}
export function retainedValue(action:string,field:string,value:unknown,evidence?:FieldEvidence):boolean {
  if(value===null)return true;
  const kind=fieldClass(action,field);
  if(kind==='custom')return validCustom(value,evidence);
  if(kind==='group')return typeof value==='string' && typeof evidence?.label==='string' && Number.isInteger(evidence.groupMemberCount) && evidence.groupMemberCount!==1;
  if(kind==='configured')return typeof value==='string' && (typeof evidence?.label==='string' || field==='resolutionCode');
  if(kind==='timing')return typeof value==='number' && Number.isFinite(value) || typeof value==='string' && Number.isFinite(Date.parse(value));
  if(kind==='link')return typeof value==='string' || Array.isArray(value) && value.every(v=>typeof v==='string') || !!value && typeof value==='object' && ['ticket','task','change','problem','asset'].includes((value as any).kind) && typeof (value as any).id==='string' && Object.keys(value).every(k=>['kind','id'].includes(k));
  if(kind==='sla' && ['slaPaused','slaPausedMs'].includes(field))return typeof value==='boolean' || typeof value==='number' && Number.isFinite(value);
  if(Object.hasOwn(enums,field))return typeof value==='string' && enums[field].includes(value);
  return kind==='enum' && Number.isInteger(value) && Number(value)>=0;
}
export function decodeHistory(payload:unknown):HistoryEnvelope|null {
  const p=typeof payload==='string'?parse(payload):payload;
  if(!p || typeof p!=='object')return null;
  const e=p as HistoryEnvelope;
  if(e.schema!=='linen.history'||e.version!==1||!historyActions.has(e.action)||!e.record||!['ticket','task','change','problem','asset','service'].includes(e.record.kind)||typeof e.record.id!=='string'||!e.actor||typeof e.actor.id!=='string'||!['person','rule','scenario','agent','integration'].includes(e.actor.kind)||!Array.isArray(e.subjects)||!e.subjects.every(v=>typeof v==='string')||!['normal','hr','restricted'].includes(e.protection)||!Array.isArray(e.changes)||!e.changes.every(c=>c && typeof c.field==='string' && Object.hasOwn(c,'before') && Object.hasOwn(c,'after')))return null;
  return e;
}
function parse(value:string):unknown { try{return JSON.parse(value);}catch{return null;} }

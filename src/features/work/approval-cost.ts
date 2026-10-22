import {ApiError} from '../../platform/http';
import type {StageDef} from './approval-config';

export interface ApprovalCostSnapshot {
  form:{costCents:number|null;fields?:{id:string;label:string}[]};
  answers:Record<string,unknown>;
  approvalAmounts?:Record<string,{fieldId:string|null;cents:number|null}>;
}

/** The owner explicitly selects a number question as USD. Parse its decimal representation without rounding: a third
 * decimal place is a refusal, never a lower threshold. Missing answers stay unknown and cannot skip an approval. */
export function approvalCostCents(def:Pick<StageDef,'costField'>,snapshot:ApprovalCostSnapshot):number|null {
  if(!def.costField)return snapshot.form.costCents;
  const answer=snapshot.answers[def.costField];
  if(answer===undefined)return null;
  const label=snapshot.form.fields?.find(f=>f.id===def.costField)?.label??'The selected USD answer';
  const invalid=()=>{throw new ApiError(422,'catalog_approval_price',`${label} must be a nonnegative USD amount with at most two decimal places, up to $10,000,000.`);};
  if(typeof answer!=='number'||!Number.isFinite(answer))return invalid();
  const parts=/^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(String(answer));
  if(!parts)return invalid();
  const cents=Number(parts[1])*100+Number((parts[2]??'').padEnd(2,'0'));
  if(!Number.isSafeInteger(cents)||cents>1_000_000_000)return invalid();
  return cents;
}

/** Persist the source and exact cents next to the original submitted answers. No PDF contents are consulted. */
export function snapshotApprovalCosts(defs:StageDef[],snapshot:ApprovalCostSnapshot){
  snapshot.approvalAmounts=Object.fromEntries(defs.map(def=>[def.key,{fieldId:def.costField,cents:approvalCostCents(def,snapshot)}]));
}

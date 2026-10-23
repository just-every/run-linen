import { scopedTicketPermission } from './department-role-authority';
import type { Principal } from '../../platform/types';
export interface WorkScope { sensitivity:string;requester_id:string;beneficiary_id:string;department_id?:string|null;protected_departments_json?:string }
/** Department membership grants staff scope only, never requester or private-note authority. */
export function departmentStaffPrincipal(p:Principal, departmentId:string|null|undefined) {
  return p.roles.includes('owner') || (!departmentId || p.departmentIds?.includes(departmentId)===true) && p.roles.some(r=>['operator','hr'].includes(r));
}
export function protectedDepartments(row:Pick<WorkScope,'protected_departments_json'>):string[]|null {
  try {const values:unknown=JSON.parse(row.protected_departments_json??'[]');return Array.isArray(values)&&values.every(v=>typeof v==='string'&&v.length>0)&&new Set(values).size===values.length?values:null;}catch{return null;}
}
export function workDepartmentScoped(row:Pick<WorkScope,'department_id'|'protected_departments_json'>):boolean {
  const retained=protectedDepartments(row);
  return Boolean(row.department_id)||retained===null||retained.length>0;
}
export function workDepartmentStaff(p:Principal,row:Pick<WorkScope,'department_id'|'protected_departments_json'>) {
  if(p.roles.includes('owner'))return true;
  const retained=protectedDepartments(row);
  return retained!==null && departmentStaffPrincipal(p,row.department_id) && retained.every(d=>p.departmentIds?.includes(d)===true);
}
export function workPrivateReadable(p:Principal,row:WorkScope) {
  return scopedTicketPermission(p,row,'ticket.private.read') || workDepartmentStaff(p,row) && (p.roles.some(r=>['owner','operator'].includes(r)) || row.sensitivity==='hr' && p.roles.includes('hr'));
}
/** The existing ticket readership rule, shared by ticket reads and derived problem evidence. */
export function workReadable(p: Principal, row: WorkScope) {
  if(scopedTicketPermission(p,row,'ticket.read'))return true;
  const retained=protectedDepartments(row);
  if(retained===null&&!p.roles.includes('owner'))return false;
  if(workDepartmentScoped(row) && !p.roles.includes('owner')) {
    if(row.sensitivity==='hr') return workDepartmentStaff(p,row) && p.roles.includes('hr') || p.roles.includes('integration') && row.requester_id===p.userId;
    return row.requester_id===p.userId || row.beneficiary_id===p.userId || row.sensitivity==='normal' && workDepartmentStaff(p,row);
  }
  return row.sensitivity === 'hr'
    ? p.roles.includes('hr') || p.roles.includes('owner') || (p.roles.includes('integration') && row.requester_id === p.userId)
    : (row.sensitivity === 'normal' && p.roles.some(r=>['owner','operator'].includes(r))) || p.roles.includes('owner') || row.requester_id === p.userId || row.beneficiary_id === p.userId;
}

/** Existing participant rights remain independent of the positive custom-role grants. */
export function workReplyAllowed(p:Principal,row:WorkScope,privateReply=false) {
  const base={...p,departmentRoles:[]};
  return privateReply ? workPrivateReadable(base,row)||scopedTicketPermission(p,row,'ticket.private.reply')
    : workReadable(base,row)||scopedTicketPermission(p,row,'ticket.reply');
}
export function workTransitionAllowed(p:Principal,row:WorkScope,command:string) {
  const base={...p,departmentRoles:[]};
  if(['reopen','cancel'].includes(command)&&workReadable(base,row))return true;
  return workDepartmentStaff(base,row)&&p.roles.some(r=>['owner','operator','hr'].includes(r)) || command!=='assign'&&scopedTicketPermission(p,row,'ticket.transition');
}

/** The approved initial public-reader floor excludes all attachment metadata and bytes. */
export function workAttachmentAllowed(p:Principal,row:WorkScope,privateFile=false,write=false) {
  const base={...p,departmentRoles:[]};
  if(write)return workReplyAllowed(base,row,privateFile)||scopedTicketPermission(p,row,'ticket.attachment.write')&&workReplyAllowed(p,row,privateFile);
  return (privateFile?workPrivateReadable(base,row):workReadable(base,row)) || scopedTicketPermission(p,row,'ticket.attachment.read')&&(!privateFile||scopedTicketPermission(p,row,'ticket.private.read'));
}

import type { Principal } from '../../platform/types';
export interface WorkScope { sensitivity:string;requester_id:string;beneficiary_id:string;department_id?:string|null }
/** Department membership grants staff scope only, never requester or private-note authority. */
export function departmentStaffPrincipal(p:Principal, departmentId:string|null|undefined) {
  return p.roles.includes('owner') || (!departmentId || p.departmentIds?.includes(departmentId)) && p.roles.some(r=>['operator','hr'].includes(r));
}
export function workPrivateReadable(p:Principal,row:WorkScope) {
  return departmentStaffPrincipal(p,row.department_id) && (p.roles.some(r=>['owner','operator'].includes(r)) || row.sensitivity==='hr' && p.roles.includes('hr'));
}
/** The existing ticket readership rule, shared by ticket reads and derived problem evidence. */
export function workReadable(p: Principal, row: WorkScope) {
  if(row.department_id && !p.roles.includes('owner')) {
    if(row.sensitivity==='hr') return departmentStaffPrincipal(p,row.department_id) && p.roles.includes('hr') || p.roles.includes('integration') && row.requester_id===p.userId;
    return row.requester_id===p.userId || row.beneficiary_id===p.userId || row.sensitivity==='normal' && departmentStaffPrincipal(p,row.department_id);
  }
  return row.sensitivity === 'hr'
    ? p.roles.includes('hr') || p.roles.includes('owner') || (p.roles.includes('integration') && row.requester_id === p.userId)
    : (row.sensitivity === 'normal' && p.roles.some(r=>['owner','operator'].includes(r))) || p.roles.includes('owner') || row.requester_id === p.userId || row.beneficiary_id === p.userId;
}

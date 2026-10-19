import type { Principal } from '../../platform/types';
/** The existing ticket readership rule, shared by ticket reads and derived problem evidence. */
export function workReadable(p: Principal, row: {sensitivity:string;requester_id:string;beneficiary_id:string}) {
  return row.sensitivity === 'hr'
    ? p.roles.includes('hr') || p.roles.includes('owner') || (p.roles.includes('integration') && row.requester_id === p.userId)
    : (row.sensitivity === 'normal' && p.roles.some(r=>['owner','operator'].includes(r))) || p.roles.includes('owner') || row.requester_id === p.userId || row.beneficiary_id === p.userId;
}

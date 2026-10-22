import {useRemote} from './state';
import {date} from './api';
import {ErrorNotice} from './primitives';
import {ActionForm} from './forms';
export function ApprovalDelegation({members}:{members:{id:string;name:string;active:number}[]}){
 const delegations=useRemote<{items:{id:string;starts_at:string;expires_at:string;revoked_at:string|null;holder_name:string|null;delegate_name:string|null}[]}>('/approval-delegations');
 const options=members.filter(m=>m.active).map(m=>({value:m.id,label:m.name}));
 return <details className="action-disclosure"><summary>Out-of-office approval delegation</summary><ActionForm title="Delegate approval decisions" path="/people/delegations" onSaved={delegations.refresh} fields={[
  {name:'managerId',label:'Authority holder',type:'select',options,required:true},
  {name:'delegateId',label:'Delegate (approver or owner)',type:'select',options,required:true},
  {name:'startsAt',label:'Out of office from',type:'datetime-local',required:true},
  {name:'expiresAt',label:'Out of office until',type:'datetime-local',required:true},
 ]} explanation="Only the holder or the owner may delegate. The active delegate substitutes during this period. Self approval remains refused; this grants no provider permission."/><ErrorNotice error={delegations.error}/>{delegations.data?.items.map(d=><article key={d.id}><p>{d.holder_name??'Unavailable holder'} → {d.delegate_name??'Unavailable delegate'}: {date(d.starts_at)} to {date(d.expires_at)}{d.revoked_at?' (withdrawn)':''}</p>{!d.revoked_at&&<ActionForm title="Withdraw delegation" submit="Withdraw delegation" path={`/people/delegations/${d.id}/revoke`} fields={[]} onSaved={delegations.refresh}/>}</article>)}</details>;
}

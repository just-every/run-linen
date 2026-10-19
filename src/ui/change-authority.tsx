import { useRemote, useSession } from './state';
import { ActionForm, type Field } from './forms';
import { ErrorNotice, Notice } from './primitives';
import { text, type RecordValue } from './api';
import type { DomainRecord } from './decisions';
export function ChangeAuthority({record,refresh}:{record:DomainRecord;refresh:()=>void}) {
  const grants=useRemote<RecordValue[]>('/grants'),{session}=useSession(),standard=record.data.changeType==='standard',
    permitted=session.principal.roles.some(role=>(standard?['owner','operator']:['owner','approver']).includes(role));
  if(!permitted)return null;
  if(standard&&record.data.catalogApprovalStatus==='unavailable')return <Notice>The recorded template approval is unavailable or withdrawn. Ask the owner to review it, or amend this change for a fresh decision.</Notice>;
  const fields:Field[]=[...(!standard?[{name:'reason',label:'Decision and scope',type:'textarea' as const,required:true}]:[]),
    ...['canary','rollout','compensate'].map(phase=>({name:phase,label:`Existing ${phase==='compensate'?'backout':phase} grant`,type:'select' as const,required:phase==='canary',
      options:grants.data?.filter(g=>g.action===`deployment.${phase}`&&!g.revoked_at).map(g=>({value:text(g.id),label:`${text(g.target)} · ${text(g.beneficiary_id)} · version ${text(g.version)}`}))}))];
  return <><Notice>{standard?'CAB is skipped under the recorded catalog preapproval. Bind existing execution grants to continue; their live scope is checked at every effect.':record.data.emergency?'ECAB path: a current owner or independent approver records the emergency decision and reason. Execution grants remain separate.':'CAB path: a current owner or independent approver records the change decision. Execution grants remain separate.'}</Notice>
    <ErrorNotice error={grants.error}/><ActionForm title={standard?'Bind existing execution grants':record.data.emergency?'Record ECAB decision':'Record current change authority'}
      path={`/changes/${record.id}/${standard?'grants':'authorize'}`} defaults={{revision:record.revision}} fields={fields} onOpen={grants.refresh}
      transform={values=>({revision:values.revision,...(!standard?{reason:values.reason}:{}),grantReferences:['canary','rollout','compensate'].flatMap(phase=>{
        const grant=grants.data?.find(g=>g.id===values[phase]);return grant?[{id:grant.id,version:grant.version,phase}]:[];
      })})} onSaved={refresh}/></>;
}

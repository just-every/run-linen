import { useEffect } from 'react';
import { recordedEvent } from './api';
import { useRemote } from './state';
import { ActionForm } from './forms';
import { ErrorNotice, Notice } from './primitives';
import type { RecordValue } from './api';
export function CustomRoles() {
 const roles=useRemote<{items:RecordValue[]}>('/custom-roles'),departments=useRemote<{items:RecordValue[]}>('/departments/admin'),members=useRemote<RecordValue[]>('/members');
 useEffect(()=>{const refresh=()=>{departments.refresh();members.refresh()};window.addEventListener(recordedEvent,refresh);return()=>window.removeEventListener(recordedEvent,refresh)},[departments.refresh,members.refresh]);
 const spaces=(departments.data?.items??[]).filter(d=>d.active&&d.kind!=='hr').map(d=>({value:String(d.id),label:String(d.name)}));
 return <section aria-label="Custom roles"><h2>Custom roles</h2>
  <Notice>Custom roles read public tickets in one department. They grant no agent actions, private notes, attachments, catalog eligibility or quote access. Existing roles keep their separate permissions.</Notice>
  <ErrorNotice error={roles.error||departments.error||members.error}/>
  <ActionForm title="Add custom role" path="/custom-roles" fields={[{name:'name',label:'Role name',required:true},{name:'departmentId',label:'Department',type:'select',options:spaces,required:true}]} submit="Create role" onSaved={roles.refresh}/>
  {(roles.data?.items??[]).map(r=><section className="connection-record" key={String(r.id)}><h3>{String(r.name)}</h3><p>{String(r.department_name)} · {r.active?'Active':'Inactive'} · Read public tickets</p>
   <ActionForm title="Assign custom role" path={`/custom-roles/${r.id}/members`} defaults={{revision:r.revision}} fields={[{name:'userId',label:'Member',type:'select',required:true,options:(members.data??[]).filter(m=>m.active).map(m=>({value:String(m.id),label:String(m.name)}))},{name:'active',label:'Role assigned',type:'checkbox',value:true}]} submit="Save role assignment" onSaved={roles.refresh}/>
   <ul>{(JSON.parse(String(r.members_json??'[]')) as RecordValue[]).filter(m=>m.active).map(m=><li key={String(m.userId)}>{String(m.name)}</li>)}</ul>
   <ActionForm title="Change role availability" path={`/custom-roles/${r.id}`} defaults={{revision:r.revision}} fields={[{name:'active',label:'Role active',type:'checkbox',value:Boolean(r.active)}]} submit="Save role availability" onSaved={roles.refresh}/>
  </section>)}
 </section>;
}

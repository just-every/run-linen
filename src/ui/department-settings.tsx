import { useState } from 'react';
import { useRemote } from './state';
import { ActionForm } from './forms';
import { ErrorNotice,Facts } from './primitives';
import type { AdminDepartment } from './departments';
import type { AgentGroup } from './work-groups';
/** Department-bound configuration uses the same public settings routes as the shared desk. */
export function DepartmentSettings({department}:{department:AdminDepartment}) {
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());
  function remember(id:string,open:boolean) {
    setExpanded(previous=>{if(previous.has(id)===open)return previous;const next=new Set(previous);if(open)next.add(id);else next.delete(id);return next;});
  }
  const groups=useRemote<{items:AgentGroup[]}>('/work-groups'),policies=useRemote<{items:{id:string;name:string;departmentId:string|null;first_response_minutes:number;next_response_minutes:number;resolution_minutes:number}[]}>('/sla-policies');
  const routing=useRemote<{rules:{id:string;name:string;departmentId:string|null;groupId:string;position:number}[]}>('/work-routing');
  const ownGroups=(groups.data?.items??[]).filter(g=>g.departmentId===department.id);
  const defaults={departmentId:department.id},staff=department.members.filter(m=>m.active);
  return <section aria-label={`${department.name} service settings`}>
    <ErrorNotice error={groups.error??policies.error??routing.error}/>
    <p>Catalog items are managed in <a href="#/connections">Connections & setup</a>. Reviewed guidance is published in <a href="#/knowledge">Knowledge</a>. Choose {department.name} as the service workspace there.</p>
    <h3>Agent groups</h3>
    <ActionForm title="Add workspace group" path="/work-groups" defaults={defaults} submit="Create group" fields={[{name:'name',label:'Group name',required:true}]} onSaved={groups.refresh}/>
    {ownGroups.map(group=><details className="action-disclosure" key={group.id} open={expanded.has(group.id)} onToggle={event=>remember(group.id,event.currentTarget.open)}><summary>{group.name}</summary>
      <Facts entries={[["Agents",group.members.map(m=>m.name).join(', ')||'No agents assigned']]}/>
      <ActionForm title="Add an agent to this group" path={`/work-groups/${group.id}/members`} onSaved={groups.refresh} fields={[
        {name:'userId',label:'Workspace staff member',type:'select',required:true,options:staff.map(m=>({value:m.userId,label:m.name}))},
        {name:'lead',label:'Group lead',type:'checkbox'},
      ]}/>
      {group.members.map(member=><ActionForm key={member.userId} title={`Remove ${member.name} from group`} path={`/work-groups/${group.id}/members/${member.userId}/remove`} fields={[]} onSaved={groups.refresh} submit="Remove from group"/>)}
      <ActionForm title="Automatic assignment" path={`/work-groups/${group.id}/assignment`} fields={[
        {name:'mode',label:'Assignment method',type:'select',required:true,options:[{value:'none',label:'Keep unassigned'},{value:'round_robin',label:'Round robin'},{value:'load',label:'Fewest open tickets'}]},
        {name:'maxOpen',label:'Maximum open tickets per agent',type:'number',hint:'Leave empty for no limit.'},
      ]}/>
    </details>)}
    <h3>Service levels</h3>
    {(policies.data?.items??[]).filter(p=>p.departmentId===department.id).map(p=><p key={p.id}>{p.name} · First response {p.first_response_minutes} min · Next response {p.next_response_minutes} min · Resolution {p.resolution_minutes} min</p>)}
    <ActionForm title="Add workspace SLA policy" path="/sla-policies" defaults={defaults} submit="Create SLA policy" onSaved={policies.refresh} transform={values=>({...values,pauseOn:values.pauseOn??[]})} explanation="These targets use calendar hours. Tickets already handed off keep their recorded clock history." fields={[
      {name:'name',label:'Policy name',required:true},{name:'position',label:'Policy order',type:'number',required:true},
      {name:'priority',label:'Applies to priority',type:'select',options:['P1','P2','P3','P4'].map(value=>({value,label:value}))},
      {name:'firstResponseMinutes',label:'First response in minutes',type:'number',required:true},
      {name:'nextResponseMinutes',label:'Next response in minutes',type:'number',required:true},
      {name:'resolutionMinutes',label:'Resolution in minutes',type:'number',required:true},
      {name:'pauseOn',label:'Pause while waiting for',type:'checkboxes',options:[{value:'requester',label:'Requester'},{value:'vendor',label:'Vendor'}]},
    ]}/>
    <h3>Routing rules</h3>
    {(routing.data?.rules??[]).filter(r=>r.departmentId===department.id).map(rule=><div key={rule.id}><p>{rule.name} · {ownGroups.find(g=>g.id===rule.groupId)?.name} · Order {rule.position}</p>
      <ActionForm title={`Remove ${rule.name}`} path={`/work-routing/rules/${rule.id}/remove`} fields={[]} submit="Remove rule" onSaved={routing.refresh}/></div>)}
    <ActionForm title="Add workspace routing rule" path="/work-routing/rules" defaults={defaults} submit="Create routing rule" onSaved={routing.refresh} fields={[
      {name:'name',label:'Rule name',required:true},{name:'position',label:'Rule order',type:'number',required:true},
      {name:'groupId',label:'Route to group',type:'select',required:true,options:ownGroups.map(g=>({value:g.id,label:g.name}))},
      {name:'category',label:'Applies to category',type:'select',options:[['general','General'],['hardware','Hardware'],['software','Software'],['network','Network'],['access','Access']].map(([value,label])=>({value,label}))},
    ]}/>
  </section>;
}

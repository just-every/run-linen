import { useState,type FormEvent } from 'react';
import { useRemote,useMutation } from './state';
import { ErrorNotice,Notice,Facts } from './primitives';
import { ActionForm } from './forms';
import { departmentKinds,type DepartmentAdmin,type AdminDepartment } from './departments';
import { DepartmentSettings } from './department-settings';
export function DepartmentManagement() {
  const remote=useRemote<DepartmentAdmin>('/departments/admin');
  return <section className="history" aria-label="Department workspaces"><h2>Department workspaces</h2>
    <p>Keep each service team's staff, catalog, queues, service levels and guidance together. Employees use one portal across the teams.</p>
    <Notice>Staff access is explicit. HR service work does not grant access to employee records or restricted HR conversations.</Notice>
    <ErrorNotice error={remote.error} retry={remote.refresh}/>
    <ActionForm title="Add department workspace" path="/departments" submit="Create workspace" onSaved={remote.refresh} fields={[
      {name:'name',label:'Workspace name',required:true},
      {name:'kind',label:'Service team',type:'select',required:true,options:departmentKinds.map(([value,label])=>({value,label}))},
    ]}/>
    {remote.data?.items.map(department=><details className="action-disclosure" key={department.id}><summary>{department.name}{department.active?'':' · Inactive'}</summary>
      <DepartmentEdit key={`${department.id}:${department.revision}`} department={department} people={remote.data!.people} onSaved={remote.refresh}/>
      {department.active&&<DepartmentSettings department={department}/>}
    </details>)}
  </section>;
}
function DepartmentEdit({department,people,onSaved}:{department:AdminDepartment;people:DepartmentAdmin['people'];onSaved:()=>void}) {
  const mutation=useMutation(),[operation,setOperation]=useState('add');
  async function membership(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const data=new FormData(event.currentTarget);
    if(await mutation.mutate(`/departments/${department.id}/members`,{revision:department.revision,userId:data.get('userId'),active:operation==='add'}))onSaved();
  }
  const staff=people.filter(p=>p.roles.some(r=>['owner','operator','hr'].includes(r)));
  const available=operation==='add'?staff.filter(p=>!department.members.some(m=>m.userId===p.id&&m.active)):staff.filter(p=>department.members.some(m=>m.userId===p.id&&m.active));
  return <>
    <Facts entries={[["Service team",departmentKinds.find(([value])=>value===department.kind)?.[1]],["Active staff",department.members.filter(m=>m.active).map(m=>m.name).join(', ')||'No staff assigned']]}/>
    <ActionForm title="Edit workspace" path={`/departments/${department.id}`} defaults={{revision:department.revision}} submit="Save workspace" onSaved={onSaved} fields={[
      {name:'name',label:'Workspace name',required:true,value:department.name},{name:'active',label:'Workspace is active',type:'checkbox',value:department.active},
    ]}/>
    <form className="inline-form" aria-label={`${department.name} staff membership`} onSubmit={membership}>
      <h3>Staff membership</h3>
      <label>Membership action<select aria-label="Membership action" value={operation} onChange={e=>setOperation(e.target.value)}><option value="add">Add staff member</option><option value="remove">Remove staff member</option></select></label>
      <label>Staff member<select aria-label="Staff member" name="userId" required defaultValue="" key={operation}><option value="">Choose…</option>{available.map(p=><option key={p.id} value={p.id}>{p.name} · {p.email}</option>)}</select></label>
      <ErrorNotice error={mutation.error}/><button className="action secondary" disabled={mutation.pending||!available.length}>Save staff membership</button>
    </form>
  </>;
}

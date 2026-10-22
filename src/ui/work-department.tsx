import { useState,type FormEvent } from 'react';
import { useMutation,useRemote } from './state';
import { ErrorNotice,Notice } from './primitives';
import { DepartmentSelect,type DepartmentAdmin } from './departments';
import type { AgentGroup } from './work-groups';
import type { WorkRecord } from './work';
/** The owner hands off the existing ticket; never copy it or change its sensitivity here. */
export function WorkDepartment({work,onChanged}:{work:WorkRecord;onChanged:()=>void}) {
  const departments=useRemote<DepartmentAdmin>('/departments/admin'),groups=useRemote<{items:AgentGroup[]}>('/work-groups');
  const mutation=useMutation(),[departmentId,setDepartmentId]=useState(work.department_id??''),[groupId,setGroupId]=useState(''),[assigneeId,setAssigneeId]=useState('');
  const chosen=departments.data?.items.find(d=>d.id===departmentId),matching=(groups.data?.items??[]).filter(g=>(g.departmentId??'')===departmentId),group=matching.find(g=>g.id===groupId);
  const staff=chosen?.members.filter(m=>m.active&&(!group||group.members.some(g=>g.userId===m.userId)))??[];
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const data=new FormData(event.currentTarget);
    if(await mutation.mutate(`/work/${work.id}/department`,{revision:work.revision,departmentId:departmentId||null,reason:data.get('reason'),...(groupId?{groupId}:{}),...(assigneeId?{assigneeId}:{})}))onChanged();
  }
  return <details className="action-disclosure"><summary>Hand off to another workspace</summary>
    <form className="inline-form" aria-label="Workspace handoff" onSubmit={save}>
      <Notice>The same ticket keeps its conversation, restrictions and elapsed service-level history. Staff access changes to the receiving team. Assignments are kept only when compatible with that team.</Notice>
      <DepartmentSelect items={departments.data?.items??[]} value={departmentId} onChange={value=>{setDepartmentId(value);setGroupId('');setAssigneeId('');}} label="Receiving workspace"/>
      <label>Receiving group<select value={groupId} onChange={e=>{setGroupId(e.target.value);setAssigneeId('');}}><option value="">Keep only if compatible</option>{matching.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      <label>Receiving agent<select value={assigneeId} onChange={e=>setAssigneeId(e.target.value)}><option value="">Keep only if compatible</option>{staff.map(m=><option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label>
      <label>Reason for handoff<textarea name="reason" required maxLength={1000} rows={3}/></label>
      <ErrorNotice error={departments.error??groups.error??mutation.error}/><button className="action primary" disabled={mutation.pending||departments.loading||groups.loading}>Hand off this ticket</button>
    </form>
  </details>;
}

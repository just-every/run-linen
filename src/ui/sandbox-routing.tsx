import {useState,type FormEvent} from 'react';
import {request} from './api';
import {ErrorNotice,Notice} from './primitives';
import {categories} from '../features/work/classification-policy';

type Choice={id:string;name:string};
export type RoutingOptions={groups:(Choice&{department_id:string|null})[];services:Choice[];requesters:Choice[];requesterGroups:Choice[];departments:Choice[];recipients:Choice[]};
type Row=Record<string,string|number|null>&{id:string;revision:number};
export const routingFamilies=['routing','support','agent','assignment'];
export function routingLabel(family:string,row:Row,options:RoutingOptions|null) {
 return family==='routing'?String(row.name):family==='support'?options?.services.find(item=>item.id===row.id)?.name??row.id:family==='agent'?options?.recipients.find(item=>item.id===row.id)?.name??row.id:options?.groups.find(item=>item.id===row.id)?.name??row.id;
}
export function SandboxRoutingEditor({family,row,options,calendars,save}:{family:string;row:Row;options:RoutingOptions;calendars:Choice[];save:(body:object)=>Promise<unknown>}) {
 const [error,setError]=useState<unknown>(),[pending,setPending]=useState(false),[department,setDepartment]=useState(String(row.department_id??''));
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();const data=new FormData(event.currentTarget),body:Record<string,unknown>={};
  for(const field of Object.keys(row).filter(field=>!['id','revision'].includes(field))) {
   const value=String(data.get(field)??'');
   body[field]=field==='position'?Number(value):field==='max_open'?value?Number(value):null:field==='skills_json'?JSON.stringify(value.split(',').map(skill=>skill.trim()).filter(Boolean)):value||null;
  }
  setPending(true);try{await save(body);}catch(error){setError(error);}finally{setPending(false);}
 }
 const select=(field:string,label:string,choices:Choice[],empty?:string)=><label>{label}<select aria-label={label} name={field} defaultValue={String(row[field]??'')} required={!empty}>{empty&&<option value="">{empty}</option>}{choices.map(choice=><option key={choice.id} value={choice.id}>{choice.name}</option>)}</select></label>;
 return <form className="inline-form" onSubmit={event=>void submit(event)}>
 {family==='routing'&&<><label>Routing rule name<input name="name" defaultValue={String(row.name)} required maxLength={120}/></label><label>Rule position<input name="position" type="number" min="1" max="1000" step="1" defaultValue={Number(row.position)} required/></label>
 <label>Routing department<select aria-label="Routing department" name="department_id" value={department} onChange={event=>setDepartment(event.target.value)}><option value="">Shared desk</option>{options.departments.map(choice=><option key={choice.id} value={choice.id}>{choice.name}</option>)}</select></label>
 {select('category','Routing category',Object.keys(categories).map(id=>({id,name:id})),'Any category')}
 {select('requester_id','Routing requester',options.requesters,'Any requester')}{select('requester_group_id','Routing requester group',options.requesterGroups,'Any requester group')}
 <label>Required agent skill<input name="skill" maxLength={60} defaultValue={String(row.skill??'')}/></label></>}
 {(family==='routing'||family==='support')&&select('group_id','Destination support group',options.groups.filter(group=>family==='support'||(group.department_id??'')===department))}
 {family==='agent'&&<>{select('calendar_id','Agent shift calendar',calendars,'Always available')}<label>Agent skills (comma separated)<input name="skills_json" defaultValue={JSON.parse(String(row.skills_json)).join(', ')}/></label></>}
 {family==='assignment'&&<><label>Automatic assignment<select aria-label="Automatic assignment" name="assignment" defaultValue={String(row.assignment)}><option value="none">Leave unassigned</option><option value="round_robin">Round robin</option><option value="load">Fewest open tickets</option></select></label><label>Open tickets per agent<input name="max_open" type="number" min="1" max="1000" step="1" defaultValue={String(row.max_open??'')}/></label></>}
 <ErrorNotice error={error}/><button className="action primary" disabled={pending}>Save sandbox {family}</button></form>;
}
export function SandboxRoutingRehearsal({path,revision,csrf,options}:{path:string;revision:number;csrf:string;options:RoutingOptions}) {
 const [error,setError]=useState<unknown>(),[result,setResult]=useState<{groupId:string|null;source:string;skill:string|null;assignment:{mode:string;maxOpen:number|null}|null}>(),[pending,setPending]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();const data=new FormData(event.currentTarget),body=Object.fromEntries([...data.entries()].map(([key,value])=>[key,value||null]));setError(null);setResult(undefined);setPending(true);
  try{setResult(await request(path+'/test-routing',{method:'POST',csrf,body:{...body,revision}}));}catch(error){setError(error);}finally{setPending(false);}
 }
 return <details className="action-disclosure"><summary>Rehearse sandbox routing</summary><Notice>Preview the destination and assignment policy. No request, assignment or routing history is created. Agent availability is checked only when real work is routed.</Notice>
 <form className="inline-form" onSubmit={event=>void submit(event)}><label>Rehearsal category<select aria-label="Rehearsal category" name="category"><option value="">No category</option>{Object.keys(categories).map(category=><option key={category}>{category}</option>)}</select></label>
 {([['requesterId','Rehearsal requester',options.requesters],['serviceId','Rehearsal service',options.services],['departmentId','Rehearsal department',options.departments]] as const).map(([field,label,choices])=><label key={field}>{label}<select aria-label={label} name={field}><option value="">{field==='departmentId'?'Shared desk':'None'}</option>{choices.map(choice=><option key={choice.id} value={choice.id}>{choice.name}</option>)}</select></label>)}
 <button className="action secondary" disabled={pending}>Test routing destination</button></form><ErrorNotice error={error}/>
 {result&&<Notice>{result.groupId?`Routing preview: ${options.groups.find(group=>group.id===result.groupId)?.name??result.groupId} · ${result.source==='support'?'Service support binding':'First matching rule'} · ${result.assignment?.mode??'none'}${result.skill?' · Skill: '+result.skill:''}${result.assignment?.maxOpen?' · Cap: '+result.assignment.maxOpen:''}`:'Routing preview: No matching destination.'}</Notice>}</details>;
}

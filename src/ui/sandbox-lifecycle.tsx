import {useState,type FormEvent} from 'react';
import {request} from './api';
import {ErrorNotice,Notice} from './primitives';
import {templateDimensions,type TemplateValue} from './lifecycle-template-editor';
type Preview={tasks:{template:string;title:string;dueAt:string;remindAt:string|null}[];skipped:{title:string;reason:string}[]};
export function SandboxLifecycleRehearsal({path,revision,csrf,calendars,values}:{path:string;revision:number;csrf:string;calendars:{id:string;name:string}[];values:TemplateValue[]}) {
 const [preview,setPreview]=useState<Preview>(),[error,setError]=useState<unknown>(),[pending,setPending]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const data=new FormData(e.currentTarget),attributes=Object.fromEntries(templateDimensions.flatMap(([key])=>data.get(key)?[[key,data.get(key)]]:[]));
  setError(null);setPreview(undefined);setPending(true);
  try{setPreview(await request<Preview>(path+'/test-lifecycle',{method:'POST',csrf,body:{revision,kind:data.get('kind'),calendarId:data.get('calendarId'),effectiveAt:String(data.get('effectiveAt'))+':00.000Z',expiresAt:data.get('expiresAt')?String(data.get('expiresAt'))+':00.000Z':null,attributes}}));}catch(e){setError(e);}finally{setPending(false);}
 }
 return <details className="action-disclosure"><summary>Rehearse lifecycle tasks</summary><form className="inline-form" onSubmit={e=>void submit(e)}>
 <label>Rehearsal event<select name="kind"><option value="join">Join</option><option value="move">Move</option><option value="leave">Leave</option></select></label>
 <label>Rehearsal business calendar<select name="calendarId" required>{calendars.map(calendar=><option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}</select></label>
 <label>Rehearsal effective instant (UTC)<input type="datetime-local" name="effectiveAt" required/></label>
 <label>Rehearsal end instant (UTC)<input type="datetime-local" name="expiresAt"/></label>
 {templateDimensions.map(([key,label])=><label key={key}>Rehearsal {label.toLowerCase()}<select name={key}><option value="">Not supplied</option>{values.filter(value=>value.dimension===key&&value.active).map(value=><option key={value.id} value={value.id}>{value.label}</option>)}</select></label>)}
 <button className="action secondary" disabled={pending}>Preview lifecycle tasks</button><ErrorNotice error={error}/>
 </form>{preview&&<><Notice>Preview only. No work, reminders or answers were saved. No external calls were made.</Notice>{!preview.tasks.length&&!preview.skipped.length&&<p>No active template matches these values.</p>}{preview.tasks.map((task,index)=><p key={index}>{task.template} · {task.title} · Due {task.dueAt}{task.remindAt?' · Reminder '+task.remindAt:''}</p>)}{preview.skipped.map((task,index)=><p key={index}>{task.title} · {task.reason}</p>)}</>}</details>;
}

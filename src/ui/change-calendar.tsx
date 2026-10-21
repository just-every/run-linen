import { useState, type FormEvent } from 'react';
import { useRemote, useSession, useMutation } from './state';
import { Fields, readFields, type Field } from './forms';
import { text, type RecordValue } from './api';
import { Empty, ErrorNotice, Loading, Notice } from './primitives';
import type { DomainRecord } from './decisions';
function wall(value:string) {
  const d=new Date(value),pad=(n:number)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function WindowForm({record,services,onSaved}:{record?:DomainRecord;services:DomainRecord[];onSaved:()=>void}) {
  const d=record?.data,action=useMutation(),[error,setError]=useState<unknown>(null),[all,setAll]=useState(!d?.services?.length);
  const fields:Field[]=[{name:'title',label:'Window name',required:true,value:d?.title},
    {name:'kind',label:'Window kind',type:'select',required:true,value:d?.kind,options:[{value:'freeze',label:'Freeze / blackout'},{value:'maintenance',label:'Maintenance'}]},
    {name:'start',label:'Window starts',type:'datetime-local',required:true,value:d?wall(d.window.start):undefined},
    {name:'end',label:'Window ends',type:'datetime-local',required:true,value:d?wall(d.window.end):undefined},
    {name:'active',label:'Active window',type:'checkbox',value:d?d.active:true}];
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setError(null);
    try {
      const values=readFields(event.currentTarget,fields),selected=all?[]:new FormData(event.currentTarget).getAll('services').map(String);
      if(!all&&!selected.length)throw Error('Choose a configuration item or apply the window to all items.');
      const result=await action.mutate<RecordValue>(record?`/change-windows/${record.id}`:'/change-windows',{
        title:values.title,kind:values.kind,window:{start:values.start,end:values.end},active:values.active,services:selected,
        visibility:record?.visibility||'operators',participants:record?.participants||[],...(record?{revision:record.revision}:{})});
      if(result)onSaved();
    }catch(e){setError(e);}
  }
  return <details className="action-disclosure"><summary>{record?`Edit ${text(d?.title)}`:'Add calendar window'}</summary>
    <form className="inline-form" onSubmit={save}>
      <Fields fields={fields}/>
      <label className="checkbox-field"><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/><span>All configuration items</span></label>
      {!all&&<fieldset className="checkbox-group"><legend>Affected configuration items</legend>{services.map(s=><label key={s.id} className="checkbox-field"><input type="checkbox" name="services" value={s.id} defaultChecked={d?.services?.includes(s.id)}/><span>{text(s.data.name)}</span></label>)}</fieldset>}
      <ErrorNotice error={error||action.error}/><button className="action primary" disabled={action.pending}>Save calendar window</button>
    </form>
  </details>;
}
export function ChangeCalendar() {
  const start=new Date();start.setDate(1);start.setHours(0,0,0,0);const end=new Date(start);end.setMonth(end.getMonth()+1);
  const [range,setRange]=useState({from:start.toISOString(),to:end.toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}),[error,setError]=useState<unknown>(null);
  const query=new URLSearchParams(range).toString(),{session}=useSession(),owner=session.principal.roles.includes('owner');
  const calendar=useRemote<{changes:DomainRecord[];windows:DomainRecord[];releases:DomainRecord[];conflicts:{changeId:string;otherId:string;kind:string}[];warnings:{changeId:string;message:string}[]}>(`/change-calendar?${query}`),
    services=useRemote<{items:DomainRecord[]}>('/services');
  const fields:Field[]=[{name:'from',label:'Calendar from',type:'datetime-local',required:true,value:wall(range.from)},
    {name:'to',label:'Calendar until',type:'datetime-local',required:true,value:wall(range.to)},
    {name:'timezone',label:'Calendar display timezone',required:true,value:range.timezone}];
  function display(value:string) {return new Intl.DateTimeFormat('en-US',{timeZone:range.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}
  const events=calendar.data?[...calendar.data.changes.map(r=>({...r,calendarKind:'change'})),...calendar.data.releases.map(r=>({...r,calendarKind:'release'})),...calendar.data.windows.map(r=>({...r,calendarKind:r.data.kind}))].sort((a,b)=>a.data.window.start.localeCompare(b.data.window.start)||a.id.localeCompare(b.id)):[];
  return <section className="connection-record" aria-label="Change calendar">
    <h2>Change calendar</h2><p>Scheduled changes, releases, maintenance and freeze windows. Times below use {range.timezone}.</p>
    <form className="inline-form" onSubmit={e=>{e.preventDefault();setError(null);try{const v=readFields(e.currentTarget,fields);new Intl.DateTimeFormat('en',{timeZone:String(v.timezone)});if(String(v.from)>=String(v.to))throw Error('The calendar end must follow its start.');setRange(v as typeof range);}catch(e){setError(e);}}}>
      <Fields fields={fields}/><button className="action secondary">Show calendar</button>
    </form>
    <ErrorNotice error={error||calendar.error} retry={calendar.refresh}/>
    <p><a href={`/api/v1/change-calendar.ics?${query}`} download>Download calendar (ICS)</a></p>
    {calendar.loading?<Loading/>:calendar.data&&<>
      {!events.length&&<Empty title="No scheduled changes in this range.">Choose another range or add a planned change.</Empty>}
      {events.map(r=><article className="connection-record" key={`${r.kind}:${r.id}`} aria-label={`${r.data.title} calendar entry`}>
        <p className="eyebrow">{r.calendarKind}{r.kind==='calendar-window'&&!r.data.active?' · inactive':''}</p>
        <h3>{r.kind==='change'?<a href={`#/changes/${r.id}`}>{text(r.data.title)}</a>:r.kind==='release'?<a href={`#/releases/${r.id}`}>{text(r.data.title)}</a>:text(r.data.title)}</h3>
        <p>{display(r.data.window.start)} – {display(r.data.window.end)}</p>
        <p>{r.data.services.length?r.data.services.map((id:string)=>services.data?.items.find(s=>s.id===id)?.data.name||'Configuration item').join(' · '):'All configuration items'}</p>
        {calendar.data!.conflicts.filter(c=>c.changeId===r.id).map(c=><Notice key={`${c.kind}:${c.otherId}`} tone="error">{c.kind==='change'?'Conflicting change on the same configuration item.':c.kind==='freeze'?'Overlaps an active freeze.':'Overlaps a maintenance window.'}</Notice>)}
        {calendar.data!.warnings.filter(c=>c.changeId===r.id).map((c,i)=><Notice key={i} tone="error">{c.message}</Notice>)}
        {owner&&r.kind==='calendar-window'&&<WindowForm key={r.revision} record={r} services={services.data?.items||[]} onSaved={calendar.refresh}/>}
      </article>)}
    </>}
    {owner&&<WindowForm services={services.data?.items||[]} onSaved={calendar.refresh}/>}
  </section>;
}

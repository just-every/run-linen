import { useState, type FormEvent } from 'react';
import { useMutation, useRemote, useSession } from './state';
import { date, humanize, type RecordValue } from './api';
import { ErrorNotice, Loading } from './primitives';
import { useWorkTimer, type EffortEntry } from './work-timer';
/** A7: the human work a touch was for, so sign-ins, setup gaps and corrections are counted, not hidden. */
const touchKindOptions:[string,string][]=[['sign_in_consent','Sign-in or consent'],['setup_gap','Setup gap'],['correction','Correcting Linen or a record'],['physical_custody','Physical custody or handoff'],['vendor_technician','Vendor or technician task'],['takeover','Taking over from automation'],['recovery','Recovery after a failure']];
export function WorkTime({workId}:{workId:string}) {
  const {session}=useSession(), list=useRemote<{items:EffortEntry[]}>(`/work/${workId}/time`),
    tasks=useRemote<{items:RecordValue[]}>(`/work/${workId}/obligations`),mutation=useMutation();
  const [task,setTask]=useState(''),[minutes,setMinutes]=useState(''),[note,setNote]=useState(''),[role,setRole]=useState(''),[kind,setKind]=useState(''),[key,setKey]=useState(()=>crypto.randomUUID());
  const timer=useWorkTimer(workId,list.refresh), rows=list.data?.items||[];
  const own=rows.filter(row=>row.actor_id===session.principal.userId&&row.source==='measured'&&row.state!=='completed');
  const measured=rows.filter(row=>row.source==='measured').reduce((sum,row)=>sum+row.active_ms/60000,0),manual=rows.filter(row=>row.source==='manual').reduce((sum,row)=>sum+row.active_ms/60000,0);
  async function save(e:FormEvent) {
    e.preventDefault();
    const result=await mutation.mutate(`/work/${workId}/time`,{source:'manual',minutes:Number(minutes),obligationId:task||null,note,effortRole:role||undefined,touchKind:kind||undefined,deduplicationKey:key});
    if(result){setMinutes('');setNote('');setKey(crypto.randomUUID());list.refresh();}
  }
  return <details className="evidence"><summary>Time & effort</summary>
    <p>Record active work on this request or one of its tasks. Waiting and machine runtime are separate.</p>
    <label>Attach effort to<select value={task} disabled={timer.entry?.state==='active'} onChange={e=>setTask(e.target.value)}><option value="">This request</option>{tasks.data?.items.map(row=><option key={String(row.id)} value={String(row.id)}>{humanize(row.kind)} · {String(row.target)}</option>)}</select></label>
    <ErrorNotice error={tasks.error}/><ErrorNotice error={list.error} retry={list.refresh}/>
    <p aria-live="polite">Recorded: {manual.toFixed(2)} manual minutes · {measured.toFixed(2)} measured minutes.</p>
    <p>Measurement records focused, visible activity every few seconds. It pauses when hidden, unfocused or inactive. Only accepted intervals count; connection gaps add no time.</p>
    <div className="button-row">
      {!own.length&&<button className="action secondary" disabled={timer.pending||list.loading} onClick={()=>void timer.start(task)}>Measure active work</button>}
      {own.map(row=><span key={row.id}>
        <small>{row.obligation_id ? humanize(tasks.data?.items.find(task=>task.id===row.obligation_id)?.kind || 'Task') : 'Request'} · {humanize(row.state)} </small>
        {row.state==='paused'&&<button className="action secondary" disabled={timer.pending} onClick={()=>void timer.command(row,'resume')}>Resume measured work</button>}
        {row.state==='active'&&<button className="action secondary" disabled={timer.pending} onClick={()=>void timer.command(row,'pause')}>Pause measurement</button>}
        <button className="action secondary" disabled={timer.pending} onClick={()=>void timer.command(row,'stop')}>Finish measurement</button>
      </span>)}
    </div><ErrorNotice error={timer.error}/>
    <form className="inline-form" onSubmit={save}>
      <h3>Log active minutes manually</h3>
      <label>Minutes<input type="number" min="0.01" max="1440" step="any" required value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>
      <label>Whose work<select value={role} onChange={e=>setRole(e.target.value)}><option value="">My current role</option>{session.principal.roles.some(r=>['owner','operator'].includes(r))&&<><option value="vendor">Vendor (recorded by me)</option><option value="technician">Technician (recorded by me)</option></>}</select></label>
      <label>What the work was for<select value={kind} onChange={e=>setKind(e.target.value)}><option value="">The request itself{role?' (vendor or technician work)':''}</option>{touchKindOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Work performed<textarea maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label>
      <ErrorNotice error={mutation.error}/><button className="action primary" disabled={mutation.pending}>Save time entry</button>
    </form>
    {list.loading?<Loading/>:<ul>{rows.map(row=><li key={row.id}>{(row.active_ms/60000).toFixed(2)} min · {humanize(row.source)} · {humanize(row.effort_role)} · {humanize(row.touch_kind)} · {row.obligation_id?'Task':'Request'} · {date(row.created_at)}{row.note&&<p>{row.note}</p>}</li>)}</ul>}
    <a href="#/reports">Read the effort report</a>
  </details>;
}

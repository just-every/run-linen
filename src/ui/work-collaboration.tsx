import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useRemote } from './state';
import { ErrorNotice, Notice } from './primitives';
import { SideConversations } from './work-side-conversations';
export interface CollaborationState {
  readers:{id:string;name:string;privateNote:boolean}[];
  watchers:{user_id:string;name:string}[];
  sides:{id:string;vendor_email:string;closed_at:string|null;sender:string|null;connection_name:string|null}[];
  deliveries:{id:string;conversation_id:string;state:string;error:string|null}[];
}
export function CollaborationConsent() {
  return <><label>Reason for this collaboration<input name="reason" required maxLength={1000}/></label>
    <label><input name="consent" type="checkbox" required/> I approve the selected recipient and content for this action.</label></>;
}
export function WorkCollaboration({workId,onChanged}:{workId:string;onChanged:()=>void}) {
  const remote=useRemote<CollaborationState>(`/work/${workId}/collaboration`),mutation=useMutation(),key=useRef(crypto.randomUUID());
  const [mode,setMode]=useState('mention');
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const form=event.currentTarget,data=new FormData(form),input=Object.fromEntries(data);
    const result=await mutation.mutate(`/work/${workId}/${mode==='mention'?'mentions':'watchers'}`,{...input,consent:data.get('consent')==='on',
      ...(mode==='mention'?{mentions:[input.userId],sourceMessageId:key.current}:{remove:input.operation==='remove'})});
    if(result){form.reset();key.current=crypto.randomUUID();remote.refresh();onChanged();}
  }
  return <details className="evidence"><summary>Private collaboration</summary>
    <Notice>Only existing ticket readers can be mentioned or watch. Watching sends notices for public updates. This does not give anyone new access.</Notice>
    <ErrorNotice error={remote.error}/>
    {remote.data&&<><form className="inline-form" onSubmit={submit}>
      <label>Action<select value={mode} onChange={e=>setMode(e.target.value)}><option value="mention">Mention in a private note</option><option value="watch">Manage watchers</option></select></label>
      <label>Colleague<select name="userId" required defaultValue=""><option value="">Choose…</option>{remote.data.readers.filter(r=>mode!=='mention'||r.privateNote).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      {mode==='mention'?<label>Private note<textarea name="body" rows={3} required maxLength={50000}/></label>:<label>Watcher action<select name="operation"><option value="add">Add watcher</option><option value="remove">Remove watcher</option></select></label>}
      <CollaborationConsent/><ErrorNotice error={mutation.error}/><button className="action secondary" disabled={mutation.pending}>{mode==='mention'?'Save private note and notify':'Save watcher'}</button>
    </form>
    <p>Watchers: {remote.data.watchers.map(r=>r.name).join(', ')||'None'}</p>
    <SideConversations workId={workId} data={remote.data} onChanged={()=>{remote.refresh();onChanged();}}/></>}
  </details>;
}
export function CollaborationInbox() {
  const remote=useRemote<{items:{id:string;work_id:string;message_id:string;kind:string}[]}>('/collaboration/inbox',15000);
  if(remote.error)return <ErrorNotice error={remote.error} retry={remote.refresh}/>;
  if(!remote.data?.items.length)return null;
  return <section className="panel" aria-label="Collaboration notifications"><h2>Updates for you</h2><ErrorNotice error={remote.backgroundError} retry={remote.refresh}/><ul>{remote.data.items.map(item=><li key={item.id}>
    <a href={`#/work/${encodeURIComponent(item.work_id)}?message=${encodeURIComponent(item.message_id)}`}>{item.kind==='mention'?'You were mentioned in a private note':'A request you watch has a public update'}</a>
  </li>)}</ul></section>;
}

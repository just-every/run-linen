import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useRemote } from './state';
import { humanize } from './api';
import { ErrorNotice, Notice } from './primitives';
import { CollaborationConsent, type CollaborationState } from './work-collaboration';
export function SideConversations({workId,data,onChanged}:{workId:string;data:CollaborationState;onChanged:()=>void}) {
  const connections=useRemote<{id:string;name:string;provider:string;status:string;config_json:string}[]>('/connections');
  const mutation=useMutation(),key=useRef(crypto.randomUUID()),conversationKey=useRef(crypto.randomUUID());
  const [sideId,setSideId]=useState(''),[operation,setOperation]=useState('send'),[result,setResult]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const form=event.currentTarget,values=new FormData(form),input=Object.fromEntries(values);
    const path=`/work/${workId}/side-conversations${sideId?`/${encodeURIComponent(sideId)}/${operation==='close'?'close':'messages'}`:''}`;
    const sent=await mutation.mutate<{state:string;conversationId?:string;error?:string}>(path,{...input,consent:values.get('consent')==='on',conversationId:conversationKey.current,sourceMessageId:key.current});
    if(sent){setResult(sent.state==='accepted'?'Mail accepted by the provider. Delivery is not yet verified.':sent.state==='closed'?'Side conversation closed.':`Mail ${humanize(sent.state)}. ${sent.error?humanize(sent.error):''} Reconcile uncertain sends before writing a new message.`);
      if(sent.conversationId)setSideId(sent.conversationId);form.reset();key.current=crypto.randomUUID();conversationKey.current=crypto.randomUUID();onChanged();}
  }
  return <section aria-label="Vendor email side conversations"><h3>Vendor email</h3>
    <Notice>Only the message you write here is sent to this vendor. Ticket history and attachments are not included. An authenticated receiving integration is required for replies to appear as private notes. Private Slack conversations are not connected.</Notice>
    {data.sides.map(side=><p key={side.id}>{side.vendor_email} · {side.sender?`From ${side.sender}`:'Mail connection changed; review a new conversation'}{side.closed_at?' · Closed':''} · {data.deliveries.filter(d=>d.conversation_id===side.id).map(d=>`${humanize(d.state)}${d.error?` (${humanize(d.error)})`:''}`).join(', ')}</p>)}
    <form className="inline-form" onSubmit={submit}>
      <label>Conversation<select value={sideId} onChange={e=>{setSideId(e.target.value);key.current=crypto.randomUUID();}}><option value="">New vendor conversation</option>{data.sides.filter(s=>!s.closed_at).map(s=><option key={s.id} value={s.id}>{s.vendor_email}</option>)}</select></label>
      {!sideId&&<><label>Vendor email<input name="vendorEmail" type="email" required maxLength={254}/></label>
        <label>Mail connection<select name="connectionId" required defaultValue=""><option value="">Choose…</option>{connections.data?.filter(c=>c.provider==='sendgrid'&&c.status==='active').map(c=><option key={c.id} value={c.id}>{c.name} · From {JSON.parse(c.config_json).from}</option>)}</select></label></>}
      {sideId&&<label>Action<select value={operation} onChange={e=>setOperation(e.target.value)}><option value="send">Send a message</option><option value="close">Close conversation</option></select></label>}
      {(!sideId||operation!=='close')&&<label>Exact email message<textarea name="body" rows={3} required maxLength={50000}/></label>}
      <CollaborationConsent/><ErrorNotice error={connections.error}/><ErrorNotice error={mutation.error}/>
      <button className="action secondary" disabled={mutation.pending}>{sideId&&operation==='close'?'Close vendor conversation':'Send private email'}</button>
    </form>{result&&<p role="status">{result}</p>}
  </section>;
}

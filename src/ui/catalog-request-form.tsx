import { useState, type FormEvent } from 'react';
import type { CatalogForm } from '../features/work/catalog-form-schema';
import { fieldVisible } from '../features/work/catalog-form-schema';
import { ApiFailure, request, text, type RecordValue } from './api';
import { useRemote, useSession } from './state';
import { Fields } from './forms';
import { localInstant } from './local-time';
import { ErrorNotice, Facts, Notice } from './primitives';
type Item=RecordValue & {id:string;name:string;revision:number;form:CatalogForm};
/** The requester's vendor quote goes first as its own PDF upload; the submission then freezes it by hash. */
async function uploadQuote(workId:string,catalogId:string,file:File,csrf:string) {
  const response=await fetch(`/api/v1/work/${workId}/catalog-quote`,{method:'POST',credentials:'same-origin',
    headers:{'X-Linen-CSRF':csrf,'X-Filename':file.name,'X-Catalog-Id':catalogId,'Content-Type':file.type||'application/pdf'},body:file});
  if(!response.ok){const data=await response.json().catch(()=>null) as {error?:{code?:string;message?:string}}|null;
    throw new ApiFailure(response.status,data?.error?.code??'request_failed',data?.error?.message??`The quote could not be attached (${response.status}).`);}
}
export function CatalogRequestForm({items,workId,beneficiaryId,onSaved}:{items:RecordValue[];workId:string;beneficiaryId:string;onSaved:(r:RecordValue)=>void}) {
  const {session}=useSession(),[selected,setSelected]=useState(''),[answers,setAnswers]=useState<Record<string,string|number|boolean>>({});
  const [error,setError]=useState<unknown>(null),[pending,setPending]=useState(false),[quote,setQuote]=useState<File|null>(null);
  const item=items.find(c=>c.id===selected) as Item|undefined;
  const visible:Record<string,string|number|boolean>={};
  for(const field of item?.form.fields??[])if(fieldVisible(field,visible)&&answers[field.id]!==undefined)visible[field.id]=answers[field.id];
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(!item)return;setError(null);setPending(true);const data=new FormData(e.currentTarget),expiry=String(data.get('expiresAt')??'');
    try{if(quote)await uploadQuote(workId,item.id,quote,session.csrfToken);
      const result=await request<RecordValue>(`/work/${workId}/fulfilment`,{method:'POST',csrf:session.csrfToken,body:{catalogId:item.id,catalogRevision:item.revision,beneficiaryId,purpose:data.get('purpose'),...(expiry?{expiresAt:localInstant(expiry).instant}:{}),answers:visible}});onSaved(result);}
    catch(error){setError(error);}finally{setPending(false);}
  }
  return <details className="action-disclosure" data-action-path={`/work/${workId}/fulfilment`}><summary>Or choose a known service</summary>
    <form className="inline-form" onSubmit={submit}>
      <p>You can also ask in the conversation. This optional selection preserves the same request.</p>
      <label>Service<select aria-label="Service" required name="catalogId" value={selected} onChange={e=>{setSelected(e.target.value);setAnswers({});setQuote(null);}}><option value="">Choose…</option>{items.map(c=><option key={text(c.id)} value={text(c.id)}>{text(c.name)}{c.application?` · $${(Number((c.application as RecordValue).costCents)/100).toFixed(2)} / ${text((c.application as RecordValue).billingPeriod)}`:c.applicationUnavailable?' · registration needs review':''}</option>)}</select></label>
      {item&&<><Facts entries={[["Recorded request cost",item.form.costCents===null?'Unknown':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(item.form.costCents/100)],["Expected delivery",item.form.deliveryHours===null?'Unknown':`${item.form.deliveryHours} elapsed hours`]]}/>
      {item.form.fields.filter(f=>fieldVisible(f,visible)).map(f=><label key={f.id} className={f.type==='checkbox'?'checkbox-field':''}>
        <span>{f.label}{f.required?' *':''}</span>
        {f.type==='select'?<select aria-label={f.label} required={f.required} value={String(answers[f.id]??'')} onChange={e=>setAnswers({...answers,[f.id]:e.target.value})}><option value="">Choose…</option>{f.options?.map(v=><option key={v} value={v}>{v}</option>)}</select>
        :f.type==='textarea'?<textarea required={f.required} maxLength={4000} value={String(answers[f.id]??'')} onChange={e=>setAnswers({...answers,[f.id]:e.target.value})}/>
        :f.type==='checkbox'?<select aria-label={f.label} required={f.required} value={answers[f.id]===undefined?'':String(answers[f.id])} onChange={e=>setAnswers(e.target.value===''?Object.fromEntries(Object.entries(answers).filter(([key])=>key!==f.id)):{...answers,[f.id]:e.target.value==='true'})}><option value="">Choose…</option><option value="true">Yes</option><option value="false">No</option></select>
        :<input type={f.type==='number'?'number':f.type==='date'?'date':'text'} step={f.type==='number'?'any':undefined} required={f.required} maxLength={4000} value={String(answers[f.id]??'')} onChange={e=>{const value=e.target.value;setAnswers(value===''?Object.fromEntries(Object.entries(answers).filter(([key])=>key!==f.id)):{...answers,[f.id]:f.type==='number'?Number(value):value});}}/>}
      </label>)}
      {item.form.quoteRequired&&<label><span>Vendor quote (PDF) *</span><input type="file" aria-label="Vendor quote (PDF)" accept="application/pdf,.pdf" onChange={e=>setQuote(e.target.files?.[0]??null)}/><small>Only you, the person it is for, their approver and the service owner can open it. Linen never reads the amount: enter the price in the form.</small></label>}</>}
      <Fields fields={[{name:'purpose',label:'What do you need it for?',type:'textarea',required:true},{name:'expiresAt',label:'Needed until',type:'datetime-local',hint:'Leave empty only when access does not have an expiry.'}]}/>
      <ErrorNotice error={error}/><button className="action primary" disabled={pending}>{pending?'Saving…':'Save'}</button>
    </form>
  </details>;
}
export function SubmittedCatalogForms({workId}:{workId:string}) {
  const saved=useRemote<{items:{id:string;catalogSnapshot:{name:string;revision:number;form:CatalogForm;answers:Record<string,string|number|boolean>;quote?:{id?:string;sha256?:string;size?:number;attached?:true}}}[]}>(`/work/${workId}/catalog-requests`,5000);
  if(saved.error)return <ErrorNotice error={saved.error} retry={saved.refresh}/>;
  if(!saved.data?.items.length)return null;
  return <section role="region" aria-label="Submitted catalog forms"><h2>Submitted catalog forms</h2>{saved.data.items.map(({id,catalogSnapshot:s})=><article className="connection-record" key={id}><h3>{s.name}</h3><Facts entries={[["Catalog revision",s.revision],["Request cost",s.form.costCents===null?'Unknown':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(s.form.costCents/100)],["Expected delivery",s.form.deliveryHours===null?'Unknown':`${s.form.deliveryHours} elapsed hours`],...s.form.fields.filter(f=>s.answers[f.id]!==undefined).map(f=>[f.label,String(s.answers[f.id])] as [string,unknown])]}/>
      {s.quote&&<p>Vendor quote: {s.quote.id?<a href={`/api/v1/catalog-quotes/${s.quote.id}`}>Download the quote ({Math.ceil((s.quote.size??0)/1024)} KiB)</a>:'Quote attached'}</p>}<p>Recorded at submission. This is an estimate, with fulfillment and verification shown separately.</p></article>)}</section>;
}

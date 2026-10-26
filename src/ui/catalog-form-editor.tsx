import { useState, type FormEvent } from 'react';
import { request } from './api';
import { useSession } from './state';
import { ErrorNotice, Notice } from './primitives';
import type { CatalogField, CatalogForm } from '../features/work/catalog-form-schema';
import { DepartmentSelect,useDepartments } from './departments';

type Item = {id:string;name:string;revision:number;form:CatalogForm;departmentId?:string|null};
export function CatalogFormEditor({item,onSaved,saveDraft}:{item:Item;onSaved:()=>void;saveDraft?:(value:{name:string;form:CatalogForm})=>Promise<void>}) {
  const {session}=useSession(),[fields,setFields]=useState<CatalogField[]>(item.form.fields),[quoteRequired,setQuoteRequired]=useState(item.form.quoteRequired===true);
  const [error,setError]=useState<unknown>(null),[saving,setSaving]=useState(false),[saved,setSaved]=useState(false);
  const departments=useDepartments(),[departmentId,setDepartmentId]=useState(item.departmentId??'');
  function edit(index:number,patch:Partial<CatalogField>) {setFields(fields.map((f,i)=>i===index?{...f,...patch}:f));}
  async function save(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();setError(null);setSaved(false);setSaving(true);
    const data=new FormData(e.currentTarget),price=String(data.get('price')),hours=String(data.get('hours'));
    try {
      if(price && !/^\d+(\.\d{1,2})?$/.test(price))throw Error('Use USD with at most two decimal places.');
      const draftForm={fields:fields.map(f=>({...f,...(f.type==='select'?{options:f.options??[]}:{} )})),costCents:price?Math.round(Number(price)*100):null,deliveryHours:hours?Number(hours):null,quoteRequired};
      if(saveDraft)await saveDraft({name:String(data.get('name')),form:draftForm});
      else await request(`/catalog/${item.id}/form`,{method:'POST',csrf:session.csrfToken,body:{name:data.get('name'),revision:item.revision,departmentId:departmentId||null,
        form:{fields:fields.map(f=>({...f,...(f.type==='select'?{options:f.options??[]}:{} )})),costCents:price?Math.round(Number(price)*100):null,deliveryHours:hours?Number(hours):null,quoteRequired}}});
      setSaved(true);onSaved();
    }catch(error){setError(error);}finally{setSaving(false);}
  }
  return <form className="inline-form" onSubmit={save}>
    <label>Catalog item name<input name="name" required defaultValue={item.name}/></label>
    {!saveDraft&&<DepartmentSelect items={(departments.data?.items??[]).filter(d=>d.canStaff)} value={departmentId} onChange={setDepartmentId}/>}
    <ErrorNotice error={departments.error} retry={departments.refresh}/>
    <label>Request cost in USD<input name="price" type="number" min="0" step="0.01" defaultValue={item.form.costCents===null?'':item.form.costCents/100}/></label>
    <label>Expected delivery in elapsed hours<input name="hours" type="number" min="1" step="1" defaultValue={item.form.deliveryHours??''}/></label>
    <p>Leave cost or delivery empty when unknown. These are recorded estimates.</p>
    <label className="checkbox-field"><input type="checkbox" checked={quoteRequired} onChange={e=>setQuoteRequired(e.target.checked)}/>Require a vendor quote (PDF)</label>
    {fields.map((field,index)=><fieldset key={field.id}><legend>Question {index+1}</legend>
      <label>Question label {index+1}<input value={field.label} required maxLength={120} onChange={e=>edit(index,{label:e.target.value})}/></label>
      <label>Answer type {index+1}<select aria-label={`Answer type ${index+1}`} value={field.type} onChange={e=>{const {options,...rest}=field;setFields(fields.map((f,i)=>i===index?{...rest,type:e.target.value as CatalogField['type'],...(e.target.value==='select'?{options:[]}: {})}:f));}}>{['text','textarea','number','checkbox','select','date'].map(t=><option key={t} value={t}>{({text:'Short text',textarea:'Long text',number:'Number',checkbox:'Yes or no',select:'Choose one',date:'Date'})[t]}</option>)}</select></label>
      <label className="checkbox-field"><input type="checkbox" checked={field.required} onChange={e=>edit(index,{required:e.target.checked})}/>Required question {index+1}</label>
      {field.type==='select'&&<label>Choices {index+1}<textarea aria-label={`Choices ${index+1}`} value={(field.options??[]).join('\n')} onChange={e=>edit(index,{options:e.target.value.split('\n')})}/><small>One choice per line.</small></label>}
      {index>0&&<><label>Show question {index+1} when<select aria-label={`Show question ${index+1} when`} value={field.when?.fieldId??''} onChange={e=>edit(index,{when:e.target.value?{fieldId:e.target.value,equals:''}:undefined})}><option value="">Always</option>{fields.slice(0,index).map(f=><option key={f.id} value={f.id}>{f.label||'Untitled question'}</option>)}</select></label>
      {field.when&&<label>Matching answer {index+1}<input aria-label={`Matching answer ${index+1}`} required value={String(field.when.equals)} onChange={e=>{const parent=fields.find(f=>f.id===field.when!.fieldId)!;const value=e.target.value;edit(index,{when:{fieldId:parent.id,equals:parent.type==='number'?Number(value):parent.type==='checkbox'?value==='true':value}});}}/><small>For yes or no, use true or false. Other answers must match exactly.</small></label>}</>}
      <button type="button" className="action secondary" onClick={()=>setFields(fields.filter((_,i)=>i!==index))}>Remove question {index+1}</button>
    </fieldset>)}
    <button type="button" className="action secondary" disabled={fields.length>=20} onClick={()=>setFields([...fields,{id:'f_'+crypto.randomUUID().replaceAll('-',''),label:'',type:'text',required:false}])}>Add question</button>
    {saveDraft?<Notice>Only this sandbox changes. Submitted requests keep their original form.</Notice>:<Notice>Saving makes a new item revision. Submitted forms keep their original questions, answers, cost and delivery estimate. A required quote is a private PDF the requester attaches; Linen never reads its amount, so ask for the price as a question. Audience is edited separately.</Notice>}
    <ErrorNotice error={error}/>{saved&&<Notice>Catalog form saved.</Notice>}
    <button className="action primary" disabled={saving||departments.loading||Boolean(departments.error)}>Save catalog form</button>
  </form>;
}

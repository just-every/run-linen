import {useState,type FormEvent} from 'react';
import {request} from './api';
import {useSession} from './state';
import {ErrorNotice,Notice} from './primitives';
import {fieldVisible,type CatalogForm} from '../features/work/catalog-form-schema';

/** Transient form answers are cleared on success and never enter persistent drafts. */
export function SandboxRehearsal({path,revision,item,onRun}:{path:string;revision:number;item:{id:string;name:string;form:CatalogForm;tasks:unknown[]};onRun:()=>void}) {
 const {session}=useSession(),[answers,setAnswers]=useState<Record<string,string|number|boolean>>({}),[error,setError]=useState<unknown>(),[pending,setPending]=useState(false),[tested,setTested]=useState(false);
 const visible:Record<string,string|number|boolean>={};
 for(const field of item.form.fields)if(fieldVisible(field,visible)&&answers[field.id]!==undefined)visible[field.id]=answers[field.id];
 const edit=(key:string,value:string|number|boolean|undefined)=>{setAnswers(previous=>value===undefined?Object.fromEntries(Object.entries(previous).filter(([field])=>field!==key)):{...previous,[key]:value});setTested(false);};
 async function rehearse(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const workflow=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='workflow';
  setError(null);setPending(true);
  try{await request(path+(workflow?'/runs':'/test-form'),{method:'POST',csrf:session.csrfToken,body:{revision,catalogId:item.id,answers:visible}});setAnswers({});setTested(true);if(workflow)onRun();}catch(error){setError(error);}finally{setPending(false);}
 }
 return <form className="inline-form" onSubmit={e=>void rehearse(e)}><h3>Test {item.name}</h3>
 {item.form.fields.filter(field=>fieldVisible(field,visible)).map(field=><label key={field.id} className={field.type==='checkbox'?'checkbox-field':''}>
 <span>{field.label}{field.required?' *':''}</span>
 {field.type==='select'?<select aria-label={field.label} required={field.required} value={String(answers[field.id]??'')} onChange={e=>edit(field.id,e.target.value||undefined)}><option value="">Choose…</option>{field.options?.map(option=><option key={option}>{option}</option>)}</select>:
 field.type==='checkbox'?<select aria-label={field.label} required={field.required} value={answers[field.id]===undefined?'':String(answers[field.id])} onChange={e=>edit(field.id,e.target.value===''?undefined:e.target.value==='true')}><option value="">Choose…</option><option value="true">Yes</option><option value="false">No</option></select>:
 field.type==='textarea'?<textarea required={field.required} maxLength={4000} value={String(answers[field.id]??'')} onChange={e=>edit(field.id,e.target.value||undefined)}/>:
 <input type={field.type==='number'?'number':field.type==='date'?'date':'text'} step={field.type==='number'?'any':undefined} required={field.required} maxLength={4000} value={String(answers[field.id]??'')} onChange={e=>edit(field.id,e.target.value===''?undefined:field.type==='number'?Number(e.target.value):e.target.value)}/>}
 </label>)}
 <ErrorNotice error={error}/>{tested&&<Notice>Validation passed. Answers were not retained. Rehearsals make no external calls.</Notice>}
 <button className="action secondary" disabled={pending}>Test form</button><button className="action secondary" value="workflow" disabled={pending||!item.tasks.length}>Rehearse team tasks</button>
 </form>;
}

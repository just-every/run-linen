import { useSession } from './state';
import { useState, type FormEvent } from 'react';
import { request, text, type RecordValue } from './api';
import { ErrorNotice, Notice } from './primitives';
import type { ApplicationEntitlement } from '../features/work/application-schema';
import { DepartmentSelect,useDepartments } from './departments';
type Member={id:string;name:string;active:number};
export function ApplicationEditor({members,existing,onSaved}:{members:Member[];existing?:RecordValue;onSaved:()=>void}) {
  const {session}=useSession();
  const data=existing?.data as RecordValue|undefined;
  const departments=useDepartments(),[departmentId,setDepartmentId]=useState(String(data?.departmentId??''));
  const [entitlements,setEntitlements]=useState<Partial<ApplicationEntitlement>[]>((data?.entitlements as ApplicationEntitlement[]|undefined)??[{}]);
  const [error,setError]=useState<unknown>(null),[pending,setPending]=useState(false);
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setError(null);setPending(true);
    const form=new FormData(event.currentTarget);
    try {
      const entries=entitlements.map((e,i)=>{
        const amount=String(form.get(`cost-${i}`));
        if(!/^\d+(\.\d{1,2})?$/.test(amount))throw Error('Enter seat costs in USD with at most two decimal places.');
        return {id:e.id,name:form.get(`name-${i}`),target:form.get(`target-${i}`),costCents:Math.round(Number(amount)*100),billingPeriod:form.get(`period-${i}`)};
      });
      await request(existing?`/applications/${text(existing.id)}`:'/applications',{method:'POST',csrf:session.csrfToken,body:{
        name:form.get('name'),ownerId:form.get('ownerId'),connector:form.get('connector'),sensitivity:form.get('sensitivity'),departmentId:departmentId||null,
        approverIds:form.getAll('approverIds'),entitlements:entries,revision:existing?.revision,
      }});onSaved();
    }catch(error){setError(error);}finally{setPending(false);}
  }
  return <form className="inline-form" onSubmit={save}>
    <label>Application name<input name="name" required maxLength={200} defaultValue={String(data?.name??'')}/></label>
    <DepartmentSelect items={(departments.data?.items??[]).filter(d=>d.canStaff)} value={departmentId} onChange={setDepartmentId}/>
    <ErrorNotice error={departments.error} retry={departments.refresh}/>
    <label>Application owner<select aria-label="Application owner" name="ownerId" required defaultValue={String(existing?.ownerId??'')}><option value="">Choose an accountable owner…</option>{members.filter(m=>m.active).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <fieldset><legend>Recorded approvers</legend>{members.filter(m=>m.active).map(m=><label className="checkbox-field" key={m.id}><input type="checkbox" name="approverIds" value={m.id} defaultChecked={((data?.approverIds as string[])??[]).includes(m.id)}/>{m.name}</label>)}</fieldset>
    <label>Connector description<input name="connector" required maxLength={200} defaultValue={String(data?.connector??'')} placeholder="Provider and connection status"/></label>
    <label>Application data sensitivity<select aria-label="Application data sensitivity" name="sensitivity" required defaultValue={String(data?.sensitivity??'internal')}>{['public','internal','confidential','restricted'].map(s=><option key={s} value={s}>{s}</option>)}</select></label>
    {entitlements.map((e,i)=><fieldset key={e.id||i}><legend>Entitlement {i+1}</legend>
      <label>Entitlement name {i+1}<input name={`name-${i}`} required defaultValue={e.name}/></label>
      <label>Entitlement target {i+1}<input name={`target-${i}`} required defaultValue={e.target}/></label>
      <label>Seat cost in USD {i+1}<input name={`cost-${i}`} type="number" min="0" step="0.01" required defaultValue={e.costCents===undefined?'':String(e.costCents/100)}/></label>
      <label>Billing period {i+1}<select aria-label={`Billing period ${i+1}`} name={`period-${i}`} required defaultValue={e.billingPeriod||'month'}><option value="month">Monthly</option><option value="year">Yearly</option><option value="one-time">One-time</option></select></label>
    </fieldset>)}
    <button className="action secondary" type="button" onClick={()=>setEntitlements([...entitlements,{}])}>Add entitlement</button>
    <Notice>Registration records ownership, entitlement targets and quoted seat costs. It does not connect the provider, grant access or approve a request.</Notice>
    <ErrorNotice error={error}/><button className="action primary" disabled={pending||departments.loading||Boolean(departments.error)}>Save application</button>
  </form>;
}

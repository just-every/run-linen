import { CatalogFormEditor } from './catalog-form-editor';
import type { CatalogForm } from '../features/work/catalog-form-schema';
import { useRemote,useSession } from './state';
import { text,type RecordValue } from './api';
import { ApplicationEditor } from './application-editor';
import { ActionForm } from './forms';
import { ErrorNotice,Facts,Loading } from './primitives';
import type { ApplicationEntitlement } from '../features/work/application-schema';
export function seatCost(value:{costCents:number;billingPeriod:string}) {
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value.costCents/100)+' / '+value.billingPeriod;
}
export function Applications() {
  const apps=useRemote<{items:RecordValue[]}>('/applications'),members=useRemote<{id:string;name:string;active:number}[]>('/members'),{session}=useSession();
  const owner=session.principal.roles.includes('owner');
  const catalog=useRemote<{items:{id:string;name:string;revision:number;form:CatalogForm}[]}>(owner?'/catalog':null);
  return <section role="region" aria-label="Application registry" className="history">
    <h2>Application registry</h2><p>Record who owns each application, its entitlements and the quoted cost per seat.</p>
    <ErrorNotice error={apps.error??members.error} retry={apps.refresh}/>
    {owner&&members.data&&<details className="action-disclosure"><summary>Register application</summary><ApplicationEditor members={members.data} onSaved={apps.refresh}/></details>}
    {owner&&<details className="action-disclosure"><summary>Manage catalog forms</summary><ErrorNotice error={catalog.error} retry={catalog.refresh}/>{catalog.data?.items.map(item=><details className="action-disclosure" key={item.id}><summary>{item.name}</summary><CatalogFormEditor key={item.id+':'+item.revision} item={item} onSaved={catalog.refresh}/></details>)}</details>}
    {apps.loading?<Loading/>:apps.data?.items.map(app=>{
      const data=app.data as RecordValue;
      return <article className="connection-record" key={`${text(app.id)}:${app.revision}`}>
        <h3>{text(data.name)}</h3>
        <Facts entries={[["Owner",members.data?.find(m=>m.id===app.ownerId)?.name||app.ownerId],["Connector",data.connector],["Data sensitivity",data.sensitivity],["Recorded approvers",(data.approverIds as string[]).map(id=>members.data?.find(m=>m.id===id)?.name||id).join(', ')||'None recorded']]}/>
        {(data.entitlements as ApplicationEntitlement[]).map(e=><fieldset key={e.id} aria-label={e.name}><legend>{e.name}</legend><p>{seatCost(e)}</p><p>{e.target}</p>
          {owner&&<ActionForm title="Offer in catalog" path="/catalog" defaults={{kind:'access',applicationId:app.id,entitlementId:e.id}} fields={[{name:'name',label:'Catalog service name',required:true},{name:'requiresManager',label:'Require existing manager approval',type:'checkbox'}]}/>}
        </fieldset>)}
        {owner&&members.data&&<details className="action-disclosure"><summary>Edit application</summary><ApplicationEditor existing={app} members={members.data} onSaved={apps.refresh}/></details>}
      </article>;
    })}
  </section>;
}
export function RequestedApplications({workId}:{workId:string}) {
  const saved=useRemote<{items:{entitlementName:string;costCents:number;billingPeriod:string}[]}>(`/work/${workId}/application-services`,5000);
  if(saved.error)return <ErrorNotice error={saved.error} retry={saved.refresh}/>;
  if(!saved.data?.items.length)return null;
  return <section role="region" aria-label="Requested applications"><h2>Requested applications</h2>{saved.data.items.map((s,i)=><article className="connection-record" key={i}><h3>{s.entitlementName}</h3><p>{seatCost(s)}</p><p>Recorded at request time. This is a seat-cost estimate, not a charge or confirmed access.</p></article>)}</section>;
}

import { useRef,useState,type FormEvent } from 'react';
import { useRemote,useMutation } from './state';
import { ErrorNotice,Notice } from './primitives';
import { useQueue } from './queue';
interface Item {id:string;name:string;departmentId:string|null;department_name:string|null}
/** Selection starts a new ticket in the item's workspace. It never moves an existing conversation. */
export function PortalCatalog() {
  const catalog=useRemote<{items:Item[]}>('/catalog'),mutation=useMutation(),key=useRef(crypto.randomUUID()),[selected,setSelected]=useState(''),queue=useQueue();
  if(catalog.error)return <ErrorNotice error={catalog.error} retry={catalog.refresh}/>;
  if(!catalog.data?.items.length)return null;
  const groups=[...new Set(catalog.data.items.map(c=>c.departmentId??''))],item=catalog.data.items.find(c=>c.id===selected);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!item)return;
    const result=await mutation.mutate<{id:string}>('/work',{title:item.name,body:new FormData(event.currentTarget).get('body'),kind:'service_request',departmentId:item.departmentId,deduplicationKey:key.current});
    if(result){key.current=crypto.randomUUID();queue.refresh();location.hash=`/work/${result.id}?catalogId=${encodeURIComponent(item.id)}`;}
  }
  return <section className="history" aria-label="Services across departments"><h2>Services across departments</h2><p>Choose a service, or ask above in your own words. Each team has its own catalog in this portal.</p>
    {groups.map(group=><article className="connection-record" key={group}><h3>{group?catalog.data!.items.find(c=>c.departmentId===group)!.department_name:'Shared service desk'}</h3><ul>{catalog.data!.items.filter(c=>(c.departmentId??'')===group).map(c=><li key={c.id}><button className="text-button" type="button" onClick={()=>{if(selected!==c.id)key.current=crypto.randomUUID();setSelected(c.id);}}>{c.name}</button></li>)}</ul></article>)}
    {item&&<form className="inline-form" aria-label="Start service request" onSubmit={submit}><h3>{item.name}</h3><p>Service workspace: {item.department_name??'Shared service desk'}</p>
      <label>What do you need?<textarea name="body" required rows={3} maxLength={50000}/></label>
      <Notice>This starts a request with this service team. Complete its form and any required quote on the next screen; no fulfillment has been approved or performed.</Notice>
      <ErrorNotice error={mutation.error}/><button className="action primary" disabled={mutation.pending}>Continue to service form</button>
    </form>}
  </section>;
}

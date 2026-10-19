import { useEffect, useRef, useState } from 'react';
import { request } from './api';
import { useSession } from './state';
export interface EffortEntry {
  id:string;work_id:string;obligation_id:string|null;actor_id:string;actor_role:string;effort_role:string;request_type:string;
  source:string;active_ms:number;touches:number;note:string;state:string;sequence:number;created_at:string;
}
/** Only visible, focused activity is credited. Every accepted heartbeat is server bounded and sequence fenced. */
export function useWorkTimer(workId:string, onRecorded:()=>void) {
  const {session}=useSession();
  const [entry,setEntry]=useState<EffortEntry|null>(null),[pending,setPending]=useState(false),[error,setError]=useState<unknown>(null);
  const current=useRef<EffortEntry|null>(null),busy=useRef(false),activity=useRef(0),baseline=useRef(0),refresh=useRef(onRecorded);
  refresh.current=onRecorded;
  const csrf=useRef(session.csrfToken);csrf.current=session.csrfToken;
  async function command(value:EffortEntry, action:string, activeMs=0) {
    if(busy.current)return;
    busy.current=true;setPending(true);setError(null);
    try {
      const next=await request<EffortEntry>(`/work/${workId}/time/${value.id}`,{method:'POST',csrf:csrf.current,body:{command:action,sequence:value.sequence,activeMs}});
      current.current=next;setEntry(next);baseline.current=performance.now();
      if(action==='resume')activity.current=baseline.current;
      refresh.current();
    } catch(e) {setError(e);current.current=null;setEntry(null);refresh.current();}
    finally {busy.current=false;setPending(false);}
  }
  async function start(obligationId:string) {
    if(busy.current)return;
    busy.current=true;setPending(true);setError(null);
    try {
      const next=await request<EffortEntry>(`/work/${workId}/time`,{method:'POST',csrf:csrf.current,body:{source:'measured',deduplicationKey:crypto.randomUUID(),obligationId:obligationId||null}});
      current.current=next;setEntry(next);activity.current=baseline.current=performance.now();refresh.current();
    } catch(e){setError(e);refresh.current();}
    finally{busy.current=false;setPending(false);}
  }
  useEffect(()=>{
    const active=()=>{if(document.visibilityState==='visible'&&document.hasFocus())activity.current=performance.now();};
    const pause=()=>{const row=current.current;if(row?.state==='active')void command(row,'pause');};
    const visibility=()=>{if(document.visibilityState!=='visible')pause();};
    const check=()=>{
      const row=current.current;
      if(!row||row.state!=='active'||busy.current)return;
      const t=performance.now();
      if(document.visibilityState!=='visible'||!document.hasFocus()||t-activity.current>60000){pause();return;}
      void command(row,'heartbeat',Math.max(0,Math.floor(t-baseline.current)));
    };
    for(const event of ['pointerdown','pointermove','keydown','scroll','touchstart'])window.addEventListener(event,active,{passive:true});
    document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',pause);
    const tick=window.setInterval(check,10000);
    return ()=>{
      clearInterval(tick);
      for(const event of ['pointerdown','pointermove','keydown','scroll','touchstart'])window.removeEventListener(event,active);
      document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',pause);
      const row=current.current;current.current=null;
      if(row?.state==='active')void request(`/work/${workId}/time/${row.id}`,{method:'POST',csrf:csrf.current,body:{command:'pause',sequence:row.sequence}}).catch(()=>{});
      // Unsent activity is never promoted to recorded minutes. The server stops credit at the last heartbeat.
    };
  },[workId]);
  return {entry,pending,error,start,command};
}

import { useRemote, useSession } from './state';
import { ActionForm } from './forms';
import { Badge, ErrorNotice, Facts, Loading } from './primitives';
import { date, text, humanize } from './api';
import type { DomainRecord } from './decisions';
interface Proposal extends DomainRecord { sources:{type:string;id:string;title:string;observedAt:string}[]; }
export function ProblemProposals({onAccepted}:{onAccepted:()=>void}) {
  const proposals=useRemote<{items:Proposal[]}>('/problem-proposals'), services=useRemote<{items:DomainRecord[]}>('/services');
  const {session}=useSession();
  if(!session.principal.roles.some(r=>['owner','operator'].includes(r)))return null;
  const refresh=()=>{proposals.refresh();onAccepted();};
  return <section aria-label="Recurring incident proposals">
    <h2>Recurring incident proposals</h2>
    <p>Recorded service, device model or app facts are grouped within the same cohort or location. A proposed common cause still needs human investigation.</p>
    <ActionForm title="Check recurring incidents" path="/problem-proposals/detect" fields={[]} submit="Check recurrence" onSaved={proposals.refresh} explanation="The scheduler also checks recent incidents. Three distinct tickets or monitoring alerts in 30 days propose a problem; accepted and rejected clusters stay decided as new incidents arrive." />
    {proposals.loading ? <Loading /> : proposals.error ? <ErrorNotice error={proposals.error} retry={proposals.refresh} /> : <>
      {!proposals.data?.items.length && <p>No recurring incident proposal is available in your scope.</p>}
      {proposals.data?.items.map(p=>{
        const cluster=p.data.cluster, service=services.data?.items.find(s=>s.id===cluster.value);
        const subject=cluster.facet==='service'?text(service?.data.name,'Recorded service'):String(cluster.value);
        return <article className="connection-record" key={p.id} aria-label={`${subject} recurrence proposal`}>
          <h3>{subject}{cluster.scopeValue ? ` · ${cluster.scopeValue}` : ''}</h3><Badge value={p.data.state} />
          <Facts entries={[["Grouped by",humanize(cluster.facet)],["Sources",p.sources.length],["Observation window",`${p.data.windowDays} days`]]} />
          <ul>{p.sources.map(source=><li key={source.type+source.id}><a href={`#/${source.type==='ticket'?'work':'incidents'}/${source.id}`}>{source.title}</a> · {source.type==='ticket'?'Employee ticket':'Monitoring alert'} · {date(source.observedAt)}</li>)}</ul>
          {p.data.state==='proposed' ? <>
            <ActionForm title={`Accept ${subject} proposal`} path={`/problem-proposals/${p.id}/accept`} defaults={{revision:p.revision}} fields={[{name:'reason',label:'Why investigate this cluster?',type:'textarea',required:true}]} submit="Create problem" onSaved={refresh} />
            <ActionForm title={`Reject ${subject} proposal`} path={`/problem-proposals/${p.id}/reject`} defaults={{revision:p.revision}} fields={[{name:'reason',label:'Why reject this cluster?',type:'textarea',required:true}]} submit="Keep rejection" onSaved={refresh} />
          </> : <>
            <p>{p.data.decision?.reason} · {date(p.data.decision?.at)}</p>
            {p.data.problemId && <a href={`#/problems/${p.data.problemId}`}>Open accepted problem</a>}
          </>}
        </article>;
      })}
    </>}
  </section>;
}

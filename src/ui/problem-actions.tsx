import { date, text } from './api';
import { ActionForm } from './forms';
import { useRemote } from './state';
import { Badge, Facts } from './primitives';
import type { DomainRecord } from './decisions';

export function ProblemActions({record,refresh}:{record:DomainRecord;refresh:()=>void}) {
  const changes = useRemote<{items:DomainRecord[]}>('/changes'), base = `/problems/${record.id}`, defaults={revision:record.revision};
  return <>
    <ActionForm title="Review the root cause and known error" path={`${base}/known-error`} defaults={defaults} fields={[
      {name:'cause',label:'Root cause analysis',type:'textarea',required:true},
      {name:'evidenceIds',label:'Root cause evidence references',type:'list',required:true},
    ]} onSaved={refresh} />
    <ActionForm title="Publish a reviewed workaround" path={`${base}/workarounds`} defaults={defaults} explanation="Publish guidance to Knowledge. Every symptom phrase must match the request; the service and any declared cohort must also match. Changes to the article require a new workaround review." fields={[
      {name:'title',label:'Workaround article title',required:true},
      {name:'text',label:'Workaround steps',type:'textarea',required:true},
      {name:'contraindications',label:'Do not use when',type:'textarea',required:true},
      {name:'source',label:'Evidence source',required:true},
      {name:'symptomTerms',label:'Required symptom phrases',type:'list',required:true,hint:'One phrase per line. All must occur in the employee report.'},
      {name:'cohorts',label:'Applicable cohorts',type:'list',hint:'Optional. Leave empty for every cohort; otherwise a request must declare a matching cohort.'},
      {name:'scope',label:'Knowledge audience',type:'select',required:true,options:[{value:'employees',label:'Employees'},{value:'operators',label:'Service operators'}]},
      {name:'expiresAt',label:'Review expiry',type:'datetime-local',required:true},
      {name:'review',label:'I reviewed the steps, matching rules and audience',type:'checkbox',required:true},
    ]} onSaved={refresh} />
    <ActionForm title="Link the preventive change" path={`${base}/prevention`} defaults={defaults} fields={[
      {name:'changeId',label:'Preventive change',type:'select',required:true,options:changes.data?.items.filter(r=>r.data.services?.includes(record.data.serviceId)).map(r=>({value:r.id,label:text(r.data.title)}))},
    ]} onSaved={refresh} />
  </>;
}
export function ProblemDetails({record,incidents=[]}:{record:DomainRecord;incidents?:DomainRecord[]}) {
  const d=record.data;
  return <section aria-label="Problem analysis and prevention">
    <h2>Root cause & prevention</h2>
    <Facts entries={[["Known error",d.causeState],["Root cause analysis",d.cause],["Evidence",d.causeEvidence?.join(', ')],["Related incidents",d.incidentIds?.length],["Prevention",d.preventionState]]} />
    <div className="button-row">{d.incidentIds?.map((id:string)=><a key={id} href={`#/incidents/${id}`}>{text(incidents.find(r=>r.id===id)?.data.title,`Incident ${id.slice(0,8)}`)}</a>)}
      {d.preventionChange && <a href={`#/changes/${d.preventionChange.id}`}>{text(d.preventionChange.title)}</a>}</div>
    {(d.workarounds || []).map((w:any)=><article className="connection-record" key={w.id}>
      <h3>{w.article?.title || 'Workaround awaiting current review'}</h3><Badge value={w.usable?'current':'expired or changed'} />
      {w.article && <><p className="detail-prose">{w.article.body}</p><Facts entries={[["Review expires",date(w.article.expires_at)],["Required symptoms",w.symptomTerms.join(', ')],["Cohorts",w.cohorts.length?w.cohorts.join(', '):'All cohorts']]} />
        <a href={`#/knowledge?q=${encodeURIComponent(w.article.title)}`}>Open in Knowledge</a></>}
    </article>)}
  </section>;
}

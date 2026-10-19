import type { DomainRecord } from './decisions';
import { useRemote } from './state';
import { ActionForm } from './forms';
import { Badge, ErrorNotice, Facts, Loading } from './primitives';
import { date, humanize } from './api';
interface Impact { upstream: (DomainRecord & {certainty:string})[]; downstream: (DomainRecord & {certainty:string})[]; relationships: (DomainRecord & {fresh:boolean;conflicts:string[]})[]; coverage:string; }
export function DependencyDetails({section,record,canEdit}:{section:string;record:DomainRecord;canEdit:boolean}) {
  const impact=useRemote<Impact>(`/${section}/${record.id}/impact`), items=useRemote<{items:DomainRecord[]}>('/services');
  const names=new Map(items.data?.items.map(r=>[r.id,String(r.data.name)]));
  return <section className="dependency-details" aria-label="Dependencies and impact">
    <h2>Dependencies and impact</h2>
    {record.kind==='service' && <Facts entries={[["Configuration item type",humanize(record.data.ciType ?? 'business_service')],["Source",record.data.source],["Provenance",record.data.provenance ?? 'asserted'],["Observed",date(record.data.observedAt)],["Freshness window",`${record.data.freshnessMs} ms`],["Fact freshness",Date.parse(record.data.observedAt)<=Date.now() && Date.now()-Date.parse(record.data.observedAt)<=record.data.freshnessMs ? "Fresh" : "Stale"]]} />}
    {impact.loading ? <Loading /> : impact.error ? <ErrorNotice error={impact.error} retry={impact.refresh} /> : impact.data && <>
      <p>{impact.data.coverage} Impact is inferred from recorded dependencies; it does not establish an outage.</p>
      {(['upstream','downstream'] as const).map(direction=><div key={direction}>
        <h3>{direction==='upstream'?'Upstream dependencies':'Downstream impact'}</h3>
        {impact.data![direction].length ? <div className="record-list">{impact.data![direction].map(r=><a className="record-row" key={r.id} href={`#/services/${r.id}`}><strong>{String(r.data.name)}</strong><Badge value={r.certainty} /></a>)}</div> : <p>No {direction==='upstream'?'dependencies':'dependents'} recorded in your scope.</p>}
      </div>)}
      <h3>Recorded relationships</h3>
      {impact.data.relationships.map(edge=><div className="record-row" key={edge.id}><span><strong>{names.get(edge.data.from) ?? edge.data.from} → {names.get(edge.data.to) ?? edge.data.to}</strong><small>{humanize(edge.data.relationship)} · {edge.data.value ? 'present':'absent'} · {edge.data.provenance} · {edge.data.source} · observed {date(edge.data.observedAt)}</small></span><Badge value={!edge.fresh?'stale':edge.conflicts.length?'conflicting':'fresh'} /></div>)}
    </>}
    {canEdit && section==='services' && <ActionForm title="Record a dependency" path="/service-graph/edges" defaults={{from:record.id,value:true}} onSaved={impact.refresh} fields={[
      {name:'to',label:'Related configuration item',type:'select',required:true,options:items.data?.items.map(r=>({value:r.id,label:String(r.data.name)}))},
      {name:'relationship',label:'Relationship type',type:'select',value:'depends_on',required:true,options:['depends_on','hosted_on','runs_on','uses','connects_to'].map(value=>({value,label:humanize(value)}))},
      {name:'provenance',label:'Relationship provenance',type:'select',value:'asserted',required:true,options:['observed','asserted','inferred'].map(value=>({value,label:humanize(value)}))},
      {name:'source',label:'Relationship source',required:true},{name:'sourceRevision',label:'Source revision',required:true},
      {name:'observedAt',label:'Relationship observed at',type:'datetime-local',required:true},{name:'effectiveAt',label:'Relationship effective at',type:'datetime-local',required:true},
      {name:'freshnessMs',label:'Relationship freshness in milliseconds',type:'number',required:true},
    ]} />}
  </section>;
}

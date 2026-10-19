import { humanize } from './api';
import { costLine, type WindowRow } from './work-saved';
export interface EffortReportData {
  definition:string;
  costDefinition:string;
  groups:{requestType:string;role:string;actorRole:string;source:string;entries:number;touches:number;activeMinutes:number;unfinishedTimers:number}[];
  byRequestType:WindowRow[];
}
export function EffortReport({value}:{value:EffortReportData}) {
  return <section className="record-stack"><h2>Human effort</h2><p>{value.definition}</p>
    {!value.groups.length&&<p>No human effort entries in this period.</p>}
    {value.groups.map(row=><article className="connection-record" key={`${row.requestType}:${row.role}:${row.actorRole}:${row.source}`}><h3>{row.requestType} · {humanize(row.role)}</h3><p>{['vendor','technician'].includes(row.role)&&<>Recorded by {humanize(row.actorRole)} · </>}{humanize(row.source)} · {Number(row.activeMinutes).toFixed(2)} active minutes · {row.touches} touches · {row.entries} entries</p>{Boolean(row.unfinishedTimers)&&<p>{row.unfinishedTimers} unfinished timers. Only accepted activity is included.</p>}</article>)}
    {value.byRequestType.map(row=>{const cost=costLine(row);return <p key={row.requestType}><strong>{row.requestType}</strong>: {row.incoming} requests · {row.verified} verified · {row.failed} failed · {row.pending} unresolved · cost per verified outcome {cost.perOutcome}{cost.unknown&&<> ({cost.unknown})</>}.</p>;})}
    <p>{value.costDefinition}</p>
  </section>;
}

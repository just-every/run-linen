import { useState, type FormEvent } from 'react';
import { useRemote } from './state';
import { ErrorNotice, Loading } from './primitives';

export interface KpiRecord { id: string; label: string; path: string; }
export interface OperationsKpi {
  key: string; label: string; value: number | null; unit: string;
  definition: string; records: KpiRecord[]; unknown?: number; denominator?: number; numerator?: number;
}
export interface OperationsKpisData {
  range: { start: string; end: string; timezone: string; snapshotAt?: string };
  metrics: OperationsKpi[];
  limitations?: string[];
  scope?: { physicalAssets: string };
}
const zones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];

// Translate calendar month boundaries in the chosen US zone into exact instants.
// Calendar arithmetic, rather than adding 30 days, preserves DST and month length.
export function monthRange(month: string, timezone: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('Choose a valid month.');
  const [year, number] = month.split('-').map(Number);
  const formatter = new Intl.DateTimeFormat('en-US', {timeZone: timezone, year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'numeric', second:'numeric', hourCycle:'h23'});
  function midnight(y: number, m: number) {
    const wanted = Date.UTC(y, m, 1); let instant = wanted;
    for (let i = 0; i < 3; i++) {
      const values = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]));
      const shown = Date.UTC(+values.year, +values.month - 1, +values.day, +values.hour, +values.minute, +values.second);
      instant += wanted - shown;
    }
    return new Date(instant).toISOString();
  }
  return {start: midnight(year, number - 1), end: midnight(year, number)};
}
function valueLabel(metric: OperationsKpi) {
  if (metric.value === null) return 'Unknown';
  if (metric.unit === '%') return `${Number(metric.value.toFixed(2))}%`;
  if (metric.unit === 'ms') return `${(metric.value / 60000).toFixed(2)} min`;
  if (metric.unit === 'USD') return new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'}).format(metric.value);
  return `${Number(metric.value.toFixed(2))}${metric.unit && metric.unit !== 'count' ? ` ${metric.unit}` : ''}`;
}
export function OperationsKpis() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7));
  const [timezone, setTimezone] = useState('America/Denver');
  const [path, setPath] = useState<string | null>(null);
  const report = useRemote<OperationsKpisData>(path);
  function run(event: FormEvent) {
    event.preventDefault();
    const range = monthRange(month, timezone);
    setPath(`/operations-kpis?${new URLSearchParams({...range, timezone})}`);
  }
  return <section className="record-stack" aria-label="IT operations and asset KPIs">
    <h2>IT operations and asset KPIs</h2>
    <form className="inline-form" onSubmit={run}>
      <div className="field-grid">
        <label>KPI month<input type="month" required value={month} onChange={e => setMonth(e.target.value)}/></label>
        <label>KPI time zone<select aria-label="KPI time zone" value={timezone} onChange={e => setTimezone(e.target.value)}>{zones.map(zone => <option key={zone}>{zone}</option>)}</select></label>
      </div>
      <button className="action primary">Read operations KPIs</button>
    </form>
    {report.loading ? <Loading/> : report.error ? <ErrorNotice error={report.error} retry={report.refresh}/> : report.data && <>
      <p>From {report.data.range.start} until {report.data.range.end}, exclusive · {report.data.range.timezone}. Each definition states its cohort and missing observations.</p>
      {report.data.range.snapshotAt && <p>Age and observation snapshot: {report.data.range.snapshotAt}.</p>}
      {report.data.scope?.physicalAssets.startsWith("unavailable") && <p>{report.data.scope.physicalAssets}</p>}
      {report.data.limitations?.map(line => <p key={line}>{line}</p>)}
      <div className="field-grid">{report.data.metrics.map(metric => <article className="connection-record" key={metric.key} data-kpi={metric.key}>
        <h3>{metric.label}</h3><p><strong>{valueLabel(metric)}</strong></p>
        <p>{metric.definition}</p>
        {metric.denominator !== undefined && <p>{metric.numerator !== undefined ? `${metric.numerator} / ` : "Observed records: "}{metric.denominator}</p>}
        {Boolean(metric.unknown) && <p>{metric.unknown} without the observation needed for this measure.</p>}
        <details><summary>Underlying records ({metric.records.length})</summary>
          {metric.records.length ? <ul>{metric.records.map((record, index) => <li key={`${record.id}:${index}`}><a href={record.path}>{record.label}</a></li>)}</ul> : <p>No records in this measure.</p>}
        </details>
      </article>)}</div>
    </>}
  </section>;
}

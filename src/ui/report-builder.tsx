import { useState, type FormEvent } from 'react';
import { humanize } from './api';
import { useMutation } from './state';
import { ErrorNotice, Notice } from './primitives';
import { ReportResults } from './report-results';
import type { ReportDefinition, ReportMember, ReportResult, ReportSchema, ReportSource, SavedReport } from './report-types';

type Filter = { id: number; field: string; value: string; type: 'text' | 'number' | 'empty' };

export function ReportBuilder({ schema, members, onSaved }: { schema: ReportSchema; members: ReportMember[]; onSaved: (report: SavedReport) => void }) {
  const [source, setSource] = useState<ReportSource>('tickets');
  const [columns, setColumns] = useState(schema.sources.tickets.slice(0, 4));
  const [filters, setFilters] = useState<Filter[]>([]), [groupBy, setGroupBy] = useState('');
  const [result, setResult] = useState<ReportResult | null>(null);
  const preview = useMutation(), save = useMutation();
  const fields = schema.sources[source];
  const validFilters = filters.every(filter => filter.field && (filter.type !== 'number' || Number.isFinite(Number(filter.value)))) && new Set(filters.map(filter => filter.field)).size === filters.length;
  const definition: ReportDefinition = { source, columns, filters: Object.fromEntries(filters.map(filter => [filter.field, filter.type === 'empty' ? null : filter.type === 'number' ? Number(filter.value) : filter.value])), ...(groupBy ? { groupBy } : {}) };
  const current = result && JSON.stringify(result.definition) === JSON.stringify(definition);
  function changeSource(value: ReportSource) { setSource(value); setColumns(schema.sources[value].slice(0, 4)); setFilters([]); setGroupBy(''); setResult(null); }
  async function run(event: FormEvent) {
    event.preventDefault();
    setResult(null);
    const next = await preview.mutate<ReportResult>('/reports/preview', definition);
    if (next) setResult(next);
  }
  async function store(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    const form = new FormData(event.currentTarget);
    const report = await save.mutate<SavedReport>('/reports/custom', { name: form.get('name'), definition, sharedWith: form.getAll('sharedWith') });
    if (report) onSaved(report);
  }
  return <section aria-label="Build a custom report">
    <h3>Build a report</h3>
    <form className="inline-form" aria-label="Report builder" onSubmit={run}>
      <label>Report source<select value={source} onChange={event => changeSource(event.target.value as ReportSource)}>{Object.keys(schema.sources).map(key => <option key={key} value={key}>{humanize(key)}</option>)}</select></label>
      <fieldset className="checkbox-group"><legend>Report columns</legend>
        {fields.map(field => <label key={field} className="checkbox-field"><input type="checkbox" checked={columns.includes(field)} onChange={event => setColumns(event.target.checked ? [...columns, field] : columns.filter(column => column !== field))}/><span>{humanize(field)}</span></label>)}
      </fieldset>
      <fieldset><legend>Exact value filters</legend>
        <p>All filters must match. Leave this section empty to include every readable record.</p>
        {filters.map((filter, index) => <div key={filter.id} className="field-grid">
          <label>Filter {index + 1} field<select required value={filter.field} onChange={event => setFilters(rows => rows.map(row => row.id === filter.id ? { ...row, field: event.target.value } : row))}><option value="">Choose a field</option>{fields.map(field => <option key={field} value={field}>{humanize(field)}</option>)}</select></label>
          <label>Filter {index + 1} value type<select value={filter.type} onChange={event => setFilters(rows => rows.map(row => row.id === filter.id ? { ...row, type: event.target.value as Filter['type'] } : row))}><option value="text">Text</option><option value="number">Number</option><option value="empty">Not recorded</option></select></label>
          {filter.type !== 'empty' && <label>Filter {index + 1} value<input required type={filter.type === 'number' ? 'number' : 'text'} step={filter.type === 'number' ? 'any' : undefined} maxLength={500} value={filter.value} onChange={event => setFilters(rows => rows.map(row => row.id === filter.id ? { ...row, value: event.target.value } : row))}/></label>}
          <div><button className="action secondary small" type="button" onClick={() => setFilters(rows => rows.filter(row => row.id !== filter.id))}>Remove filter {index + 1}</button></div>
        </div>)}
        <button className="action secondary small" type="button" disabled={filters.length >= fields.length} onClick={() => setFilters(rows => [...rows, { id: Math.max(0, ...rows.map(row => row.id)) + 1, field: '', value: '', type: 'text' }])}>Add filter</button>
        {!validFilters && <p role="status">Choose a distinct field for each filter and a valid value.</p>}
      </fieldset>
      <label>Group report by<select value={groupBy} onChange={event => setGroupBy(event.target.value)}><option value="">Individual records</option>{fields.map(field => <option key={field} value={field}>{humanize(field)}</option>)}</select></label>
      {groupBy && <p>Grouped reports show the group and its record count.</p>}
      <ErrorNotice error={preview.error}/>
      <button className="action primary" disabled={preview.pending || columns.length === 0 || !validFilters}>{preview.pending ? 'Reading report…' : 'Preview report'}</button>
    </form>
    {result && <>
      {!current && <Notice>The definition changed. Preview again before saving.</Notice>}
      <ReportResults result={result}/>
      <form className="inline-form" aria-label="Save custom report" onSubmit={store}>
        <label>Report name<input name="name" required maxLength={120}/></label>
        <fieldset className="checkbox-group"><legend>Share report with</legend>
          {members.length ? members.map(member => <label className="checkbox-field" key={member.id}><input type="checkbox" name="sharedWith" value={member.id}/><span>{member.name}</span></label>) : <p>No other report readers are available.</p>}
        </fieldset>
        <p>Sharing the definition keeps each reader's current data permissions. Exports are read again at download time.</p>
        <ErrorNotice error={save.error}/><button className="action primary" disabled={save.pending || !current}>Save report</button>
      </form>
    </>}
  </section>;
}

import { useState } from 'react';
import { useRemote, useSession } from './state';
import { ErrorNotice, Loading, Notice } from './primitives';
import { ReportBuilder } from './report-builder';
import { ReportDefinitionSummary, ReportResults } from './report-results';
import { ReportSchedules } from './report-schedules';
import type { ReportMember, ReportResult, ReportSchema, SavedReport } from './report-types';
export { BiExports } from './bi-exports';

export function CustomReports() {
  const { session } = useSession(), owner = session.principal.roles.includes('owner');
  const schema = useRemote<ReportSchema>('/reports/schema');
  const reports = useRemote<{ items: SavedReport[] }>('/reports/custom');
  const recipients = useRemote<{ items: ReportMember[] }>(owner ? '/reports/recipients' : null);
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useRemote<SavedReport & ReportResult>(selected ? `/reports/custom/${encodeURIComponent(selected)}` : null);
  const members = recipients.data?.items ?? [];
  return <section className="connection-record" aria-label="Custom reports">
    <div className="section-heading"><h2>Custom reports</h2></div>
    <p>Choose readable records, exact filters and columns. Save a definition to share or export with current permissions.</p>
    {reports.loading ? <Loading label="Reading saved reports…"/> : <ErrorNotice error={reports.error} retry={reports.refresh}/>}
    {reports.data && (reports.data.items.length ? <label>Saved report<select value={selected ?? ''} onChange={event => setSelected(event.target.value || null)}><option value="">Choose a saved report</option>{reports.data.items.map(report => <option key={report.id} value={report.id}>{report.name}</option>)}</select></label> : <p>No saved reports yet.</p>)}
    {detail.loading ? <Loading label="Reading this report…"/> : <ErrorNotice error={detail.error} retry={detail.refresh}/>}
    {detail.data && <article aria-label="Saved report result">
      <h3>{detail.data.name}</h3>
      <ReportDefinitionSummary definition={detail.data.definition}/>
      <ReportResults result={detail.data} caption="Saved report view"/>
      <div className="actions">
        <a className="action secondary" href={`/api/v1/reports/custom/${encodeURIComponent(detail.data.id)}/export?format=csv`} download>Export CSV</a>
        <a className="action secondary" href={`/api/v1/reports/custom/${encodeURIComponent(detail.data.id)}/export?format=xlsx`} download>Export XLSX</a>
        <button className="action secondary" onClick={detail.refresh}>Refresh report</button>
      </div>
      <p>{detail.data.sharedWith.length ? `Shared with ${detail.data.sharedWith.map(id => members.find(member => member.id === id)?.name ?? 'a report reader').join(', ')}.` : 'No additional report readers selected.'}</p>
      {owner && <ReportSchedules key={detail.data.id} reportId={detail.data.id} members={members.filter(member => member.id === detail.data?.ownerId || detail.data?.sharedWith.includes(member.id))}/>}
    </article>}
    {owner && <>
      <ErrorNotice error={recipients.error} retry={recipients.refresh}/>
      {schema.loading ? <Loading label="Reading report sources…"/> : <ErrorNotice error={schema.error} retry={schema.refresh}/>}
      {schema.data && <details className="action-disclosure"><summary>Build a custom report</summary>
        <ReportBuilder schema={schema.data} members={members.filter(member => member.id !== session.principal.userId)} onSaved={report => { reports.refresh(); setSelected(report.id); }}/>
      </details>}
    </>}
    <Notice>Slack report delivery needs configuration (CHANNEL-001). Email schedules and downloadable files are separate from Slack delivery.</Notice>
  </section>;
}

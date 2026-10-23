import { humanize, text } from './api';
import { Notice } from './primitives';
import { reportColumnName } from './report-types';
import type { ReportDefinition, ReportResult } from './report-types';

export function ReportDefinitionSummary({ definition }: { definition: ReportDefinition }) {
  return <p>{humanize(definition.source)} · {definition.groupBy ? `Grouped by ${humanize(definition.groupBy).toLowerCase()}` : definition.columns.map(reportColumnName).join(', ')}
    {Object.entries(definition.filters ?? {}).map(([field, value]) => <span key={field}> · {reportColumnName(field)} equals {text(value, 'No value')}</span>)}</p>;
}

export function ReportResults({ result, caption = 'Report preview' }: { result: ReportResult; caption?: string }) {
  return <section aria-label={caption}>
    <h3>{caption}</h3>
    <p>{result.total} matching records · {result.rows.length} {result.definition.groupBy ? 'groups' : 'rows'} shown.</p>
    <p>{result.scope}</p>
    {result.rows.length ? <div tabIndex={0} role="region" aria-label={`${caption} table`} style={{ overflowX: 'auto', maxWidth: '100%' }}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}><caption className="visually-hidden">{caption}</caption>
        <thead><tr>{result.columns.map(column => <th key={column} scope="col" style={{textAlign:'left',padding:'8px 12px',borderBottom:'1px solid var(--line)'}}>{reportColumnName(column)}</th>)}</tr></thead>
        <tbody>{result.rows.map((row, index) => <tr key={index}>{result.columns.map(column => <td key={column} style={{padding:'8px 12px',borderBottom:'1px solid var(--line)'}}>{text(row[column], 'Not recorded')}</td>)}</tr>)}</tbody>
      </table>
    </div> : <Notice>No records match these filters in your current scope.</Notice>}
  </section>;
}

import { humanize, text } from './api';
import { Notice } from './primitives';
import type { ReportDefinition, ReportResult } from './report-types';

export function ReportDefinitionSummary({ definition }: { definition: ReportDefinition }) {
  return <p>{humanize(definition.source)} · {definition.groupBy ? `Grouped by ${humanize(definition.groupBy).toLowerCase()}` : definition.columns.map(humanize).join(', ')}
    {Object.entries(definition.filters ?? {}).map(([field, value]) => <span key={field}> · {humanize(field)} equals {text(value, 'No value')}</span>)}</p>;
}

export function ReportResults({ result, caption = 'Report preview' }: { result: ReportResult; caption?: string }) {
  return <section aria-label={caption}>
    <h3>{caption}</h3>
    <p>{result.total} matching records · {result.rows.length} {result.definition.groupBy ? 'groups' : 'rows'} shown.</p>
    <p>{result.scope}</p>
    {result.rows.length ? <div tabIndex={0} role="region" aria-label={`${caption} table`} style={{ overflowX: 'auto', maxWidth: '100%' }}>
      <table><caption>{caption}</caption>
        <thead><tr>{result.columns.map(column => <th key={column} scope="col">{humanize(column)}</th>)}</tr></thead>
        <tbody>{result.rows.map((row, index) => <tr key={index}>{result.columns.map(column => <td key={column}>{text(row[column], 'Not recorded')}</td>)}</tr>)}</tbody>
      </table>
    </div> : <Notice>No records match these filters in your current scope.</Notice>}
  </section>;
}

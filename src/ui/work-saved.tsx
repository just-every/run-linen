import { humanize, type RecordValue } from './api';
import { ActionForm } from './forms';

const roles = ['employee', 'agent', 'approver', 'owner', 'vendor', 'technician'] as const;
export interface WindowRow {
  requestType: string; incoming: number; verified: number; failed: number; pending: number; closed: number;
  touches: number; activeMinutes: number; byRole: Record<string, { touches: number; activeMinutes: number }>; byTouchKind: Record<string, { touches: number; activeMinutes: number }>;
  labor: { usd: number; unpricedRoles: string[] };
  model: { attempts: number; estimatedUsd: number; unknownCharges: number };
  provider: { attempts: number; unknownCharges: number };
  knownCostUsd: number; costComplete: boolean; knownCostPerVerifiedOutcomeUsd: number | null;
}
export interface WorkSavedData {
  baseline: { from: string; to: string }; current: { from: string; to: string };
  requestTypes: { requestType: string; baseline: WindowRow | null; current: WindowRow | null }[];
  definition: string; costDefinition: string;
  cohort: string[] | null;
  automationProposal: AutomationProposal;
}
interface ProposalEvidence { verified: number; failed: number; touches: number; activeMinutes: number; minutesPerVerifiedOutcome: number | null; knownCostPerVerifiedOutcomeUsd?: number | null; costComplete?: boolean }
export interface AutomationProposal {
  next: { requestType: string; humanMinutesToRemove: number } | null;
  ranked: { rank: number; requestType: string; humanMinutesToRemove: number; realizedSavingMinutesPerOutcome: number | null; evidence: { baseline: ProposalEvidence | null; current: ProposalEvidence } }[];
  notEnoughEvidence: string[]; definition: string;
}
/** Sub-cent model estimates stay visible instead of rounding to $0.00. */
export const usd = (n: number) => n === 0 || Math.abs(n) >= 0.01 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;

export function costLine(row: WindowRow) {
  const unknown = [
    row.labor.unpricedRoles.length ? `no declared rate for ${row.labor.unpricedRoles.map(humanize).join(', ')}` : '',
    row.model.unknownCharges ? `${row.model.unknownCharges} model ${row.model.unknownCharges === 1 ? 'charge' : 'charges'} unknown` : '',
    row.provider.unknownCharges ? `${row.provider.unknownCharges} provider ${row.provider.unknownCharges === 1 ? 'dispatch' : 'dispatches'}, charge unknown` : '',
  ].filter(Boolean);
  const perOutcome = row.knownCostPerVerifiedOutcomeUsd === null ? 'no verified outcome' : `${usd(row.knownCostPerVerifiedOutcomeUsd)}${row.costComplete ? '' : ' known cost only'}`;
  return { perOutcome, unknown: unknown.join(' · ') };
}

function cells(label: string, value: (row: WindowRow) => string | number, data: WorkSavedData['requestTypes'][number]) {
  return <tr key={label}><th scope="row">{label}</th><td>{data.baseline ? value(data.baseline) : '—'}</td><td>{data.current ? value(data.current) : '—'}</td></tr>;
}

export function WorkSavedReport({ value }: { value: WorkSavedData }) {
  return <section className="record-stack"><h2>Human work saved</h2><p>{value.definition}</p><p>{value.costDefinition}</p>
    {value.cohort && <p>Cohort: {value.cohort.join(', ')}</p>}
    {!value.requestTypes.length && <p>No requests in either window.</p>}
    <NextAutomation value={value.automationProposal} />
    {value.requestTypes.map(data => {
      const present = roles.filter(role => data.baseline?.byRole[role] || data.current?.byRole[role]);
      return <article className="connection-record" key={data.requestType}><h3>{data.requestType}</h3>
        <div style={{ overflowX: 'auto' }}><table><caption>{data.requestType}: baseline beside current</caption>
          <thead><tr><th scope="col">Measure</th><th scope="col">Baseline</th><th scope="col">Current</th></tr></thead>
          <tbody>
            {cells('Requests', r => r.incoming, data)}
            {cells('Verified outcomes', r => r.verified, data)}
            {cells('Failed', r => r.failed, data)}
            {cells('Unresolved', r => r.pending, data)}
            {cells('Human touches', r => r.touches, data)}
            {cells('Human active minutes', r => Number(r.activeMinutes).toFixed(2), data)}
            {present.map(role => cells(`${humanize(role)} touches / minutes`, r => r.byRole[role] ? `${r.byRole[role].touches} / ${r.byRole[role].activeMinutes.toFixed(2)}` : '0 / 0.00', data))}
            {cells('Labor', r => usd(r.labor.usd), data)}
            {cells('Model (estimated)', r => usd(r.model.estimatedUsd), data)}
            {cells('Provider dispatches', r => r.provider.attempts, data)}
            {cells('Cost per verified outcome', r => costLine(r).perOutcome, data)}
            {cells('Unknown cost', r => costLine(r).unknown || 'None', data)}
          </tbody></table></div></article>;
    })}
  </section>;
}

/** Owner-only declaration of USD per active hour for each effort role; clearing a rate withdraws it. */
export function LaborRatesForm({ rates, onSaved }: { rates: Record<string, number>; onSaved: () => void }) {
  return <ActionForm key={JSON.stringify(rates)} title="Declare labor rates" submit="Save labor rates"
    explanation="USD per active hour for each effort role, applied to every report window. A role without a rate is reported as unknown cost, never $0. These are costing assumptions per role, not anyone's pay."
    path="/reports/labor-rates" defaults={Object.fromEntries(roles.map(role => [role, rates[role] ?? '']))}
    fields={roles.map(role => ({ name: role, label: `${humanize(role)} rate (USD/hour)`, type: 'number' as const }))}
    transform={(values: RecordValue) => ({ rates: Object.fromEntries(roles.map(role => [role, values[role] === '' || values[role] === undefined || values[role] === null ? null : Number(values[role])])) })}
    onSaved={onSaved} />;
}

const minutes = (n: number | null) => n === null ? '—' : `${n.toFixed(2)} min`;
/** AGENT-006: the ranked next automation, with the windows' evidence beside each type. */
function NextAutomation({ value }: { value: AutomationProposal }) {
  return <section className="connection-record" aria-label="Next automation proposal"><h3>Next automation proposal</h3>
    <p>{value.next ? `Automate ${value.next.requestType} next: about ${value.next.humanMinutesToRemove.toFixed(2)} human minutes this period.` : 'No ranked request type still takes human minutes.'}</p>
    <p>{value.definition}</p>
    {value.ranked.length > 0 && <div style={{ overflowX: 'auto' }}><table><caption>Request types ranked by human work automation would remove</caption>
      <thead><tr><th scope="col">Rank</th><th scope="col">Request type</th><th scope="col">Human minutes to remove</th><th scope="col">Minutes per verified outcome</th><th scope="col">Realized saving per outcome</th><th scope="col">Verified / failed</th></tr></thead>
      <tbody>{value.ranked.map(r => <tr key={r.requestType}><td>{r.rank}</td><th scope="row">{r.requestType}</th><td>{minutes(r.humanMinutesToRemove)}</td>
        <td>{minutes(r.evidence.current.minutesPerVerifiedOutcome)}</td><td>{minutes(r.realizedSavingMinutesPerOutcome)}</td>
        <td>{r.evidence.current.verified} / {r.evidence.current.failed}</td></tr>)}</tbody></table></div>}
    {value.notEnoughEvidence.length > 0 && <p>Not enough evidence (no verified outcome this period): {value.notEnoughEvidence.join(', ')}</p>}
  </section>;
}

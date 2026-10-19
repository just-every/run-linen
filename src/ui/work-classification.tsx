import { useState, type FormEvent } from 'react';
import { date, humanize } from './api';
import { useMutation, useRemote, useSession } from './state';
import { ErrorNotice, Facts } from './primitives';
import { categories, levels, priorityMatrix, ticketTypes, type ClassificationSnapshot, type TicketClassification } from '../features/work/classification-policy';

export function WorkClassification({ workId, onChanged }: { workId: string; onChanged: () => void }) {
  const remote = useRemote<ClassificationSnapshot>(`/work/${encodeURIComponent(workId)}/classification`, 10000), mutation = useMutation();
  const { session } = useSession(), agent = session.principal.roles.some(role => ['owner', 'operator'].includes(role));
  const [editing, setEditing] = useState(false);
  const data = remote.data;
  async function propose() {
    await mutation.mutate(`/work/${workId}/classification/propose`, { revision: data!.revision, workRevision: data!.workRevision });
    remote.refresh(); onChanged();
  }
  return <section className="work-controls" aria-label="Classification and priority">
    <h3>Classification and priority</h3>
    <ErrorNotice error={remote.error} retry={remote.refresh} />
    {data && <>
      {data.current ? <Facts entries={[
        ['Type', humanize(data.current.type)], ['Category', `${humanize(data.current.category)} / ${humanize(data.current.subcategory)}`],
        ['Impact', humanize(data.current.impact)], ['Urgency', humanize(data.current.urgency)], ['Priority', data.current.priority],
      ]} /> : <p>No classification recorded.</p>}
      {data.proposal && <p><strong>Linen proposed {data.proposal.priority}.</strong> {data.proposal.reason}</p>}
      {data.state === 'overridden' && <p><strong>Agent override:</strong> {data.reason}</p>}
      {data.error && <p role="status">Proposal unavailable: {humanize(data.error)}. Any recorded classification remains visible.</p>}
      {agent && <div className="button-row">
        <button className="action secondary small" disabled={mutation.pending} onClick={propose}>{mutation.pending ? 'Proposing…' : 'Propose classification'}</button>
        <button className="action secondary small" onClick={() => setEditing(value => !value)}>Override classification</button>
      </div>}
      {agent && editing && <ClassificationForm key={`${data.revision}-${data.workRevision}`} data={data} workId={workId} onSaved={() => { setEditing(false); remote.refresh(); onChanged(); }} />}
      <details className="evidence"><summary>Impact × urgency matrix</summary>
        <p>High impact: office or wider. Medium: team. Low: individual. High urgency: blocked now. Medium: degraded or time sensitive. Low: can wait.</p>
        <table><thead><tr><th scope="col">Impact / urgency</th>{levels.map(level => <th scope="col" key={level}>{humanize(level)}</th>)}</tr></thead>
          <tbody>{levels.map(impact => <tr key={impact}><th scope="row">{humanize(impact)}</th>{levels.map(urgency => <td key={urgency}>{priorityMatrix[impact][urgency]}</td>)}</tr>)}</tbody></table>
      </details>
      {agent && data.history.length > 0 && <details className="evidence"><summary>Classification history</summary>
        <ol>{data.history.map(event => <li key={event.id}><strong>{event.action === 'work.classification_overridden' ? 'Agent override' : 'Linen proposal'}</strong> · {event.actor_name} · {date(event.created_at)}
          <p>{event.before ? `${humanize(event.before.type)}, ${event.before.category}/${event.before.subcategory}, ${event.before.impact} impact, ${event.before.urgency} urgency, ${event.before.priority}` : 'Unclassified'} → {humanize(event.after.type)}, {event.after.category}/{event.after.subcategory}, {event.after.impact} impact, {event.after.urgency} urgency, {event.after.priority}</p><p>{event.reason}</p></li>)}</ol>
      </details>}
    </>}
    <ErrorNotice error={mutation.error} />
  </section>;
}
function ClassificationForm({ data, workId, onSaved }: { data: ClassificationSnapshot; workId: string; onSaved: () => void }) {
  const initial: TicketClassification = data.current ?? { type: 'service_request', category: 'general', subcategory: 'other', impact: 'low', urgency: 'low', priority: 'P4' };
  const [value, setValue] = useState(initial), [manualPriority, setManualPriority] = useState(false), mutation = useMutation();
  function change(next: TicketClassification) {
    setValue({ ...next, priority: manualPriority ? next.priority : priorityMatrix[next.impact][next.urgency] });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const saved = await mutation.mutate(`/work/${workId}/classification/override`, { ...value, revision: data.revision, workRevision: data.workRevision, reason: form.get('reason') });
    if (saved) onSaved();
  }
  return <form className="inline-form" onSubmit={submit} aria-label="Override classification">
    <label>Ticket type<select aria-label="Ticket type" value={value.type} onChange={event => change({ ...value, type: event.target.value as TicketClassification['type'] })}>{ticketTypes.map(type => <option key={type} value={type}>{humanize(type)}</option>)}</select></label>
    <label>Category<select aria-label="Category" value={value.category} onChange={event => { const category = event.target.value as keyof typeof categories; change({ ...value, category, subcategory: categories[category][0] }); }}>{Object.keys(categories).map(category => <option key={category} value={category}>{humanize(category)}</option>)}</select></label>
    <label>Subcategory<select aria-label="Subcategory" value={value.subcategory} onChange={event => change({ ...value, subcategory: event.target.value })}>{categories[value.category].map(subcategory => <option key={subcategory} value={subcategory}>{humanize(subcategory)}</option>)}</select></label>
    {(['impact', 'urgency'] as const).map(field => <label key={field}>{humanize(field)}<select aria-label={humanize(field)} value={value[field]} onChange={event => change({ ...value, [field]: event.target.value })}>{levels.map(level => <option key={level} value={level}>{humanize(level)}</option>)}</select></label>)}
    <label>Priority<select aria-label="Priority" value={value.priority} onChange={event => { setManualPriority(true); setValue({ ...value, priority: event.target.value }); }}>{['P1', 'P2', 'P3', 'P4'].map(priority => <option key={priority}>{priority}</option>)}</select></label>
    <p>Matrix recommendation: {priorityMatrix[value.impact][value.urgency]}. A different priority requires the reason below.</p>
    <label>Override reason<textarea name="reason" required rows={2} maxLength={3000} /></label>
    <ErrorNotice error={mutation.error} />
    <button className="action primary small" disabled={mutation.pending}>{mutation.pending ? 'Saving…' : 'Save classification override'}</button>
  </form>;
}

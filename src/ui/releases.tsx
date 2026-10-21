import { ActionForm, type Field } from './forms';
import { useRemote, useSession } from './state';
import { Badge, Facts, Notice } from './primitives';
import { date, text } from './api';
import { usePeopleLabels } from './people-labels';
import { LinkedTickets } from './work-relationships';
import type { DomainRecord } from './decisions';

type Member = { id: string; title: string | null; state: string; phases: { phase: string; state: string }[] };
type Phase = { outcome: string; reference: string; recordedBy: string } | null;
const deployLabels: Record<string, string> = {
  'not-started': 'Not started', canary: 'Canary under way', rollout: 'Rolling out',
  held: 'Held by a change that failed or is unresolved', complete: 'Every change successful or backed out',
};

/** CHANGE-007: group changes that have not started into one release. */
export function NewRelease({ onSaved }: { onSaved: (id: string) => void }) {
  const changes = useRemote<{ items: DomainRecord[] }>('/changes'), problems = useRemote<{ items: DomainRecord[] }>('/problems'),
    members = useRemote<{ id: string; name: string; roles_json: string; active: number }[]>('/members'),
    cohorts = useRemote<{ items: { id: string; name: string }[] }>('/release-cohorts');
  const ready = (changes.data?.items ?? []).filter(c => !(c.data.invocations ?? []).length && !['cancelled', 'imported-review', 'privacy-review'].includes(c.data.state));
  const approvers = (members.data ?? []).filter(m => m.active && (JSON.parse(m.roles_json) as string[]).some(r => ['owner', 'approver'].includes(r)));
  const fields: Field[] = [
    { name: 'title', label: 'Release name', required: true },
    { name: 'plan', label: 'Release plan', type: 'textarea', required: true },
    { name: 'changeIds', label: 'Changes in this release', type: 'checkboxes', required: true, options: ready.map(c => ({ value: c.id, label: text(c.data.title) })) },
    { name: 'approverIds', label: 'Go/no-go approvers', type: 'checkboxes', required: true, options: approvers.map(m => ({ value: m.id, label: m.name })) },
    { name: 'affectedGroupIds', label: 'Affected employees for release notes', type: 'checkboxes', required: true, options: (cohorts.data?.items ?? []).map(g => ({ value: g.id, label: g.name })) },
    { name: 'problemIds', label: 'Linked problems', type: 'checkboxes', options: (problems.data?.items ?? []).map(p => ({ value: p.id, label: text(p.data.title) })) },
    { name: 'visibility', label: 'Who may see this release?', type: 'select', value: 'operators', required: true,
      options: [{ value: 'operators', label: 'Service operators' }, { value: 'workspace', label: 'Everyone in this workspace' }] },
  ];
  return <ActionForm title="Plan a release" path="/releases" fields={fields} submit="Create release" onSaved={r => onSaved(String(r.id))}
    explanation="A release groups changes that have not started. Each change keeps its own approval, grants, window, canary and rollout; none deploys until every named approver records go." />;
}

export function ReleaseDetails({ record, refresh }: { record: DomainRecord; refresh: () => void }) {
  const problems = useRemote<{ items: DomainRecord[] }>('/problems'), services = useRemote<{ items: DomainRecord[] }>('/services');
  const d = record.data, { session } = useSession(), personName = usePeopleLabels(), me = session.principal.userId;
  const staff = session.principal.roles.some(r => ['owner', 'operator'].includes(r)), open = !['completed','imported-review','privacy-review'].includes(d.state);
  const phase = (p: Phase) => p ? `${p.outcome} · ${p.reference} · recorded by ${personName(p.recordedBy)}` : 'Not recorded';
  const defaults = { revision: record.revision };
  return <>
    {['imported-review','privacy-review'].includes(d.state) && <Notice>This release is held for review. Previous decisions do not authorize deployment.</Notice>}
    <Facts entries={[
      ['Go/no-go', d.goNoGo === 'go' ? 'Go from every named approver' : d.goNoGo === 'no-go' ? 'No-go: deployment held' : 'Awaiting every named approver'],
      ['Deployment', deployLabels[d.deploy] ?? d.deploy],
      ['Release window', d.window ? `${date(d.window.start)} – ${date(d.window.end)}` : 'No scheduled change'],
      ['Build', phase(d.phases.build)],
      ['Test', phase(d.phases.test)],
      ['Named approvers', (d.approverIds as string[]).map(personName).join(', ')],
      ['Completed', d.completedAt ? date(d.completedAt) : 'Open'],
    ]} />
    <section><h3>Release plan</h3><p>{text(d.plan)}</p></section>
    <section aria-label="Linked problems and configuration items"><h3>Linked problems and configuration items</h3>
      <ul>{(d.problemIds as string[]).map(id => {
        const problem = problems.data?.items.find(p => p.id === id);
        return <li key={id}>{problem ? <a href={`#/problems/${id}`}>{text(problem.data.title)}</a> : 'A linked problem you cannot read'}</li>;
      })}{(d.services as string[]).map(id => {
        const service = services.data?.items.find(s => s.id === id);
        return <li key={id}>{service ? <a href={`#/services/${id}`}>{text(service.data.name)}</a> : 'A configuration item you cannot read'}</li>;
      })}</ul>
    </section>
    {d.members.length > 0 && <section aria-label="Changes in this release"><h3>Changes in this release</h3>
      <ul>{(d.members as Member[]).map(m => <li key={m.id}>
        <a href={`#/changes/${m.id}`}>{m.title ? text(m.title) : 'A change you cannot read'}</a> <Badge value={m.state} />
        {m.phases.length > 0 && <small> {m.phases.map(p => `${p.phase} ${p.state}`).join(' · ')}</small>}
      </li>)}</ul>
      {open && d.holding.length > 0 && <Notice>The release stays open until every change is successful or explicitly backed out.</Notice>}
    </section>}
    <section aria-label="Go/no-go decisions"><h3>Go/no-go decisions</h3>
      {d.decisions.length ? <ul>{d.decisions.map((x: { id: string; actor: string; decision: string; reason: string; at: string }) =>
        <li key={x.id}>{personName(x.actor)}: {x.decision} · {text(x.reason)} · {date(x.at)}</li>)}</ul> : <p>No current decision.</p>}
    </section>
    {open && d.approverIds.includes(me) && <ActionForm title="Record your go/no-go decision" path={`/releases/${record.id}/decisions`} defaults={defaults} onSaved={refresh}
      explanation="Go covers the current build, test and each change's current implementation. One no-go holds every change in the release."
      fields={[{ name: 'decision', label: 'Go or no-go', type: 'select', required: true, options: [{ value: 'go', label: 'Go' }, { value: 'no-go', label: 'No-go' }] },
        { name: 'reason', label: 'Decision reason', type: 'textarea', required: true }]} />}
    {staff && open && <>
      <ActionForm title="Record a build or test result" path={`/releases/${record.id}/phases`} defaults={defaults} onSaved={refresh}
        explanation="Records a result observed in your build or test system; Linen does not run it. A new result withdraws earlier go/no-go decisions."
        fields={[{ name: 'phase', label: 'Release phase', type: 'select', required: true, options: [{ value: 'build', label: 'Build' }, { value: 'test', label: 'Test' }] },
          { name: 'outcome', label: 'Recorded outcome', type: 'select', required: true, options: [{ value: 'passed', label: 'Passed' }, { value: 'failed', label: 'Failed' }] },
          { name: 'reference', label: 'Build or test reference', required: true }]} />
      <ActionForm title="Complete this release" path={`/releases/${record.id}/complete`} defaults={defaults} fields={[]} submit="Complete release" onSaved={refresh}
        explanation="Completes only when every change is successful or explicitly backed out." />
    </>}
    {staff && <LinkedTickets kind="release" targetId={record.id} />}
  </>;
}

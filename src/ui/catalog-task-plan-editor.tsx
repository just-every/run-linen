import { useState, type FormEvent } from 'react';
import { request } from './api';
import { useRemote, useSession } from './state';
import { ErrorNotice, Notice } from './primitives';
import type { CatalogTask } from '../features/work/catalog-task-plan';

type Item = { id: string; name: string; revision: number; tasks?: CatalogTask[] };
/** CATALOG-003: the owner edits an item's team task plan. Later tasks may follow the automated step or earlier tasks. */
export function CatalogTaskPlanEditor({ item, onSaved, saveDraft }: { item: Item; onSaved: () => void; saveDraft?:(tasks:CatalogTask[])=>Promise<void> }) {
  const { session } = useSession(), groups = useRemote<{ items: { id: string; name: string }[] }>('/work-groups'), [tasks, setTasks] = useState<CatalogTask[]>(item.tasks ?? []);
  const [error, setError] = useState<unknown>(null), [saving, setSaving] = useState(false), [saved, setSaved] = useState(false);
  const edit = (index: number, patch: Partial<CatalogTask>) => setTasks(tasks.map((t, i) => i === index ? { ...t, ...patch } : t));
  async function save(e: FormEvent) {
    e.preventDefault(); setError(null); setSaved(false); setSaving(true);
    try {
      if(saveDraft)await saveDraft(tasks);
      else await request(`/catalog/${item.id}/tasks`, { method: 'POST', csrf: session.csrfToken, body: { revision: item.revision, tasks } });
      setSaved(true); onSaved();
    } catch (error) { setError(error); } finally { setSaving(false); }
  }
  return <form className="inline-form" onSubmit={e => void save(e)}>
    <p>{saveDraft?"Rehearse these tasks without changing production work. ":""}Each request for this item creates these tasks for the named teams, alongside its automated step. Tasks that do not follow each other run in parallel.</p>
    <ErrorNotice error={groups.error} retry={groups.refresh} />
    {tasks.map((task, index) => <fieldset key={task.key}><legend>Task {index + 1}</legend>
      <label>Task title {index + 1}<input required maxLength={200} value={task.title} onChange={e => edit(index, { title: e.target.value })} /></label>
      <label>Team for task {index + 1}<select aria-label={`Team for task ${index + 1}`} required value={task.groupId} onChange={e => edit(index, { groupId: e.target.value })}>
        <option value="">Choose a team</option>{groups.data?.items.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      <label>Due after (elapsed hours) {index + 1}<input type="number" required min="1" max="8760" step="1" value={task.dueHours} onChange={e => edit(index, { dueHours: Number(e.target.value) })} /></label>
      {[{ key: 'automated', title: 'The automated step' }, ...tasks.slice(0, index)].map(earlier => <label className="checkbox-field" key={earlier.key}>
        <input type="checkbox" checked={task.after.includes(earlier.key)} onChange={e => edit(index, { after: e.target.checked ? [...task.after, earlier.key] : task.after.filter(k => k !== earlier.key) })} />
        Task {index + 1} follows {earlier.title || 'an untitled task'}</label>)}
      <button type="button" className="action secondary" onClick={() => setTasks(tasks.filter((_, i) => i !== index).map(t => ({ ...t, after: t.after.filter(k => k !== task.key) })))}>Remove task {index + 1}</button>
    </fieldset>)}
    <button type="button" className="action secondary" disabled={tasks.length >= 20}
      onClick={() => setTasks([...tasks, { key: 't' + crypto.randomUUID().replaceAll('-', '').slice(0, 12), title: '', groupId: '', after: [], dueHours: 24 }])}>Add task</button>
    <Notice>Saving makes a new item revision. Requests already made keep the tasks they were created with. A task plan grants no access and no provider authority.</Notice>
    <ErrorNotice error={error} />{saved && <Notice>Task plan saved.</Notice>}
    <button className="action primary" disabled={saving}>Save task plan</button>
  </form>;
}

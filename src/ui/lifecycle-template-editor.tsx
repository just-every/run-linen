import { useState, type FormEvent } from 'react';
import type { Template } from '../features/work/lifecycle-templates';
import { Fields } from './forms';
import { ErrorNotice, Notice } from './primitives';
import { useMutation } from './state';
import { draftTask, LifecycleTemplateTaskRows } from './lifecycle-template-task-rows';

export const templateDimensions = [['department', 'Department'], ['location', 'Location'], ['title', 'Role'], ['employmentType', 'Employment type']] as const;
export type TemplateValue = { id: string; dimension: string; label: string; active: number };
export type TemplateTeam = { id: string; name: string };
const kinds = [{ value: 'join', label: 'Joining the team' }, { value: 'move', label: 'Moving role or location' }, { value: 'leave', label: 'Leaving the team' }];

/** Owner-facing controls preserve stable saved task keys and reviewed ids without exposing either. */
export function LifecycleTemplateEditor({ template, values, groups, onSaved }: {
  template?: Template; values: TemplateValue[]; groups: TemplateTeam[]; onSaved: () => void;
}) {
  const mutation = useMutation(), [match, setMatch] = useState<Template['match']>(template?.match ?? {});
  const [tasks, setTasks] = useState(() => template ? template.tasks.map(draftTask) : [draftTask()]);
  const [saved, setSaved] = useState(false);
  const path = template ? `/lifecycle-templates/${template.id}` : '/lifecycle-templates';
  const toggle = (dimension: (typeof templateDimensions)[number][0], id: string, checked: boolean) => {
    const selected = match[dimension] ?? [];
    const chosen = checked ? [...selected, id] : selected.filter(value => value !== id);
    const next = { ...match };
    if (chosen.length) next[dimension] = chosen; else delete next[dimension];
    setMatch(next);
  };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaved(false);
    const form = new FormData(event.currentTarget);
    const result = await mutation.mutate(path, {
      name: String(form.get('name')), kind: String(form.get('kind')), match,
      tasks: tasks.map(task => ({ ...task, offsetDays: Number(task.offsetDays), remindDays: task.remindDays === '' ? null : Number(task.remindDays) })),
      ...(template ? { revision: template.revision, active: form.has('active') } : {}),
    });
    if (result) { setSaved(true); onSaved(); }
  }
  return <details className="action-disclosure" data-action-path={path}>
    <summary>{template ? `Edit ${template.name}` : 'Add a task template'}</summary>
    <form className="inline-form" onSubmit={save}>
      <div className="field-grid"><Fields fields={[
        { name: 'name', label: 'Template name', required: true, value: template?.name ?? '' },
        { name: 'kind', label: 'Applies to', type: 'select', required: true, value: template?.kind ?? '', options: kinds },
        ...(template ? [{ name: 'active', label: 'Active', type: 'checkbox' as const, value: template.active }] : []),
      ]} /></div>
      <p>Choose who this template applies to. Leave a list empty for everyone in that list. A person must match every list you choose.</p>
      {templateDimensions.map(([dimension, label]) => <fieldset key={dimension} className="checkbox-group"><legend>{label}</legend>
        {values.filter(value => value.dimension === dimension && (value.active || match[dimension]?.includes(value.id))).map(value =>
          <label key={value.id} className="checkbox-field"><input type="checkbox" checked={match[dimension]?.includes(value.id) ?? false} onChange={event => toggle(dimension, value.id, event.target.checked)} /><span>{value.label}{value.active ? '' : ' (retired)'}</span></label>)}
        {!values.some(value => value.dimension === dimension) && <small>No reviewed values yet.</small>}
      </fieldset>)}
      <LifecycleTemplateTaskRows tasks={tasks} groups={groups} onChange={setTasks} />
      <Notice>Saving creates a new template revision. Existing changes keep their tasks. Dated tasks need a configured business calendar in the change’s time zone. A missing manager holds their task with the accountable owner. Reminders reach people in the portal; Slack, Teams and email reminders are not connected.</Notice>
      <ErrorNotice error={mutation.error} />{saved && <Notice>Task template saved.</Notice>}
      <button className="action primary" disabled={mutation.pending || !tasks.length}>{mutation.pending ? 'Saving…' : 'Save'}</button>
    </form>
  </details>;
}

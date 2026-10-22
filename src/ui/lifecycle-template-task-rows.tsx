import type { TemplateTask } from '../features/work/lifecycle-templates';

export type TaskDraft = Omit<TemplateTask, 'offsetDays' | 'remindDays'> & { offsetDays: string; remindDays: string };
export const draftTask = (task?: TemplateTask): TaskDraft => task
  ? { ...task, offsetDays: String(task.offsetDays), remindDays: task.remindDays === null ? '' : String(task.remindDays) }
  : { key: 't' + crypto.randomUUID().replaceAll('-', ''), title: '', assignee: { type: 'group', groupId: '' }, anchor: 'start', offsetDays: '0', remindDays: '' };

/** The same native fieldsets, labels and controls as the catalog team-task editor. */
export function LifecycleTemplateTaskRows({ tasks, groups, onChange }: {
  tasks: TaskDraft[]; groups: { id: string; name: string }[]; onChange: (tasks: TaskDraft[]) => void;
}) {
  const edit = (index: number, patch: Partial<TaskDraft>) => onChange(tasks.map((task, i) => i === index ? { ...task, ...patch } : task));
  return <>
    {tasks.map((task, index) => <fieldset key={task.key} aria-label={`Task ${index + 1}`}><legend>Task {index + 1}</legend>
      <div className="field-grid">
        <label>Task title {index + 1}<input required maxLength={200} value={task.title} onChange={e => edit(index, { title: e.target.value })} /></label>
        <label>Who does task {index + 1}?<select aria-label={`Who does task ${index + 1}?`} required value={task.assignee.type} onChange={e => edit(index, { assignee: e.target.value === 'group' ? { type: 'group', groupId: '' } : { type: e.target.value as 'manager' | 'owner' } })}>
          <option value="group">A team</option><option value="manager">The person’s manager</option><option value="owner">The accountable owner</option>
        </select></label>
        {task.assignee.type === 'group' && <label>Team for task {index + 1}<select aria-label={`Team for task ${index + 1}`} required value={task.assignee.groupId} onChange={e => edit(index, { assignee: { type: 'group', groupId: e.target.value } })}>
          <option value="">Choose a team</option>{groups.map(group => <option value={group.id} key={group.id}>{group.name}</option>)}
        </select></label>}
        <label>Date for task {index + 1}<select aria-label={`Date for task ${index + 1}`} required value={task.anchor} onChange={e => edit(index, { anchor: e.target.value as 'start' | 'end' })}>
          <option value="start">Start date</option><option value="end">End date</option>
        </select></label>
        <label>Business days from date {index + 1}<input type="number" required min={-120} max={365} step={1} value={task.offsetDays} onChange={e => edit(index, { offsetDays: e.target.value })} />
          <small>Negative is before the date, zero is on it, positive is after.</small></label>
        <label>Remind business days before due {index + 1}<input type="number" min={0} max={60} step={1} value={task.remindDays} onChange={e => edit(index, { remindDays: e.target.value })} />
          <small>Leave empty for no reminder.</small></label>
      </div>
      <button type="button" className="action secondary" onClick={() => onChange(tasks.filter((_, i) => i !== index))}>Remove task {index + 1}</button>
    </fieldset>)}
    {!tasks.length && <p>Add at least one dated task.</p>}
    <button type="button" className="action secondary" disabled={tasks.length >= 30} onClick={() => onChange([...tasks, draftTask()])}>Add task</button>
  </>;
}
